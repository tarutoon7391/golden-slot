import type { ActiveFlags, CandidateEvaluation, GameMode, KomaNo, ReachmePattern, ReelIndex, StopPositions, StopRecord, StopRequest, StopResult } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { REACHME } from '../config/reachme.ts';
import { slipKoma, windowAt } from '../config/reels.ts';
import type { Role } from '../payout/judge.ts';
import { lookaheadFor } from './lookahead.ts';
import { NO_MASKS, conditionsOf, masksOf, withMask, type ConditionMasks } from './reachme.ts';
import { ruleSetFor, type Candidate, type StopContext, type StopRule } from './rules.ts';
import { buildPartialWindow, withStop } from './window.ts';

/**
 * リール制御の本体
 * 1. flags.bonus でルールセット（STOP_RULE_SETS）を選ぶ
 * 2. 押下位置から 0〜maxSlip コマの候補を列挙
 * 3. セットのルールを上から順に適用して候補をふるい落とす
 * 4. 最後に残った候補で停止
 *
 * ルールの中身・順序は rules.ts にある。ここは適用の仕組みだけ。
 */

export interface StopOptions {
  /** 差し替え用（テスト・デバッグ）。rules を渡すとルールセットの選択より優先する */
  rules?: readonly StopRule[];
  reachme?: readonly ReachmePattern[];
  /** stopSequence 用: 各リールの StopRequest.roll に渡す振り分け乱数 */
  roll?: number;
}

/** このゲームで引き込む役。小役優先、小役が無ければボーナス */
export function targetRoleOf(flags: ActiveFlags): Role | null {
  return flags.small ?? flags.bonus ?? null;
}

/** このゲームで揃ってよい役（引き込む役だけ） */
export function allowedRolesOf(flags: ActiveFlags): Role[] {
  const t = targetRoleOf(flags);
  return t ? [t] : [];
}

/**
 * 既停止リールの記録。request.history があればそれ、無ければ stopped から
 * 「左→中→右の順・スベリ条件は不成立」として補う（押下位置は停止位置と同じ扱い）
 */
export function historyOf(request: StopRequest): readonly StopRecord[] {
  if (request.history) return request.history;
  const list: StopRecord[] = [];
  for (const reel of [0, 1, 2] as const) {
    const koma = request.stopped[reel];
    if (koma !== null) list.push({ reel, pushKoma: koma, stopKoma: koma, slip: 0 });
  }
  return list;
}

/** 停止結果（リール番号順）と停止時刻から、止めた順の記録を作る（useGame 用） */
export function historyFromStops(stops: readonly (StopRecord | null)[], stopAt: readonly (number | null)[]): StopRecord[] {
  return stops
    .filter((s): s is StopRecord => s !== null)
    .sort((a, b) => (stopAt[a.reel] ?? 0) - (stopAt[b.reel] ?? 0))
    .map(({ reel, pushKoma, stopKoma, slip }) => ({ reel, pushKoma, stopKoma, slip }));
}

/** 押下位置から候補を列挙する */
export function enumerateCandidates(request: StopRequest, prevOrder: readonly ReelIndex[], prevMasks: ConditionMasks, mask: (reel: ReelIndex, push: KomaNo, slip: number) => number): Candidate[] {
  const list: Candidate[] = [];
  const order = [...prevOrder, request.reel];
  for (let slip = 0; slip <= MACHINE.maxSlip; slip++) {
    const koma = slipKoma(request.pushKoma, slip);
    const positions = withStop(request.stopped, request.reel, koma);
    list.push({
      slip,
      koma,
      positions,
      window: buildPartialWindow(positions),
      order,
      masks: withMask(prevMasks, request.reel, mask(request.reel, request.pushKoma, slip)),
    });
  }
  return list;
}

/** 1 リールの停止位置を決める */
export function decideStop(request: StopRequest, options: StopOptions = {}): StopResult {
  const set = ruleSetFor(request.flags);
  const rules = options.rules ?? set.rules;
  const table = options.reachme ?? REACHME;
  const la = lookaheadFor(table);
  const conditions = conditionsOf(table);
  const history = historyOf(request);
  const prevOrder = history.map((h) => h.reel);
  const prevMasks = request.history ? masksOf(conditions, history) : NO_MASKS;
  const targetRole = targetRoleOf(request.flags);
  const bonus = request.flags.bonus;

  const ctx: StopContext = {
    request,
    set,
    targetRole,
    allowedRoles: allowedRolesOf(request.flags),
    reachme: table,
    conditions,
    look: (c) => la.query({ target: targetRole, bonus, positions: c.positions, order: c.order, masks: c.masks }),
  };

  const all = enumerateCandidates(request, prevOrder, prevMasks, la.mask);
  const evaluations = new Map<Candidate, CandidateEvaluation>(
    all.map((c) => [
      c,
      { slip: c.slip, koma: c.koma, symbols: windowAt(request.reel, c.koma), evaluations: [], chosen: false, excludedBy: null },
    ]),
  );

  let remaining = all;
  for (const rule of rules) {
    const verdicts = remaining.map((c) => {
      const ev = rule.evaluate(c, ctx, remaining);
      evaluations.get(c)!.evaluations.push(ev);
      return { c, ev };
    });
    const accepted = verdicts.filter((v) => v.ev.verdict === 'accept').map((v) => v.c);
    const notRejected = verdicts.filter((v) => v.ev.verdict !== 'reject').map((v) => v.c);

    let next: Candidate[];
    if (accepted.length > 0) next = accepted; // accept があれば accept だけ残す
    else if (notRejected.length > 0) next = notRejected; // reject を落とす（全滅はさせない）
    else next = remaining;

    for (const c of remaining) {
      if (!next.includes(c)) evaluations.get(c)!.excludedBy = rule.id;
    }
    remaining = next;
    // 候補が 1 つになっても最後のルールまで評価する（デバッグパネルで全ルールの結果を見せるため）
  }

  // 念のため：複数残ったらスベリ最小
  const chosen = remaining.reduce((a, b) => (b.slip < a.slip ? b : a));
  evaluations.get(chosen)!.chosen = true;

  return {
    reel: request.reel,
    pushKoma: request.pushKoma,
    stopKoma: chosen.koma,
    slip: chosen.slip,
    ruleSet: set.id,
    candidates: all.map((c) => evaluations.get(c)!),
  };
}

/**
 * 3 リールを指定した順番・押下位置で止める（テスト・シミュレーター・デバッグ用）
 * pushes[reel] は各リールの押下コマ番号、order は押す順番
 */
export function stopSequence(
  flags: ActiveFlags,
  mode: GameMode,
  pushes: readonly [KomaNo, KomaNo, KomaNo],
  order: readonly ReelIndex[] = [0, 1, 2],
  options: StopOptions = {},
): { positions: readonly [KomaNo, KomaNo, KomaNo]; stops: StopResult[] } {
  let stopped: StopPositions = [null, null, null];
  const stops: StopResult[] = [];
  const history: StopRecord[] = [];
  for (const reel of order) {
    const result = decideStop({ reel, pushKoma: pushes[reel], stopped, flags, mode, history, roll: options.roll }, options);
    stops.push(result);
    history.push({ reel, pushKoma: result.pushKoma, stopKoma: result.stopKoma, slip: result.slip });
    stopped = withStop(stopped, reel, result.stopKoma);
  }
  return { positions: stopped as readonly [KomaNo, KomaNo, KomaNo], stops };
}
