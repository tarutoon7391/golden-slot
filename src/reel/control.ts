import type { ActiveFlags, CandidateEvaluation, GameMode, KomaNo, ReachmePattern, ReelIndex, StopPositions, StopRequest, StopResult } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { REACHME } from '../config/reachme.ts';
import { slipKoma, windowAt } from '../config/reels.ts';
import type { Role } from '../payout/judge.ts';
import { STOP_RULES, type Candidate, type StopContext, type StopRule } from './rules.ts';
import { buildPartialWindow, withStop } from './window.ts';

/**
 * リール制御の本体
 * 1. 押下位置から 0〜maxSlip コマの候補を列挙
 * 2. STOP_RULES を上から順に適用して候補をふるい落とす
 * 3. 最後に残った候補で停止
 *
 * ルールの中身・順序は rules.ts にある。ここは適用の仕組みだけ。
 */

export interface StopOptions {
  /** 差し替え用（テスト・デバッグ） */
  rules?: readonly StopRule[];
  reachme?: readonly ReachmePattern[];
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

/** 押下位置から候補を列挙する */
export function enumerateCandidates(request: StopRequest): Candidate[] {
  const list: Candidate[] = [];
  for (let slip = 0; slip <= MACHINE.maxSlip; slip++) {
    const koma = slipKoma(request.pushKoma, slip);
    const positions = withStop(request.stopped, request.reel, koma);
    list.push({ slip, koma, positions, window: buildPartialWindow(positions) });
  }
  return list;
}

/** 1 リールの停止位置を決める */
export function decideStop(request: StopRequest, options: StopOptions = {}): StopResult {
  const rules = options.rules ?? STOP_RULES;
  const ctx: StopContext = {
    request,
    targetRole: targetRoleOf(request.flags),
    allowedRoles: allowedRolesOf(request.flags),
    reachme: options.reachme ?? REACHME,
  };

  const all = enumerateCandidates(request);
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
  for (const reel of order) {
    const result = decideStop({ reel, pushKoma: pushes[reel], stopped, flags, mode }, options);
    stops.push(result);
    stopped = withStop(stopped, reel, result.stopKoma);
  }
  return { positions: stopped as readonly [KomaNo, KomaNo, KomaNo], stops };
}
