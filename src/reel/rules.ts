import type { KomaNo, ReachmePattern, RuleEvaluation, StopPositions, StopRequest } from '../shared/types.ts';
import { LINE_LABELS } from '../config/lines.ts';
import { ROLES, patternsOf } from '../config/roles.ts';
import { matchAll, type Role } from '../payout/judge.ts';
import { lookahead } from './lookahead.ts';
import { isExcludable, isPreferable, matchReachme, reachmeTargets } from './reachme.ts';
import type { PartialWindow } from './window.ts';

/**
 * 停止制御のルール
 *
 * 候補（押下位置から 0〜4 コマ）を上から順にふるい落とす。
 * 優先順位を変えたい・条件を足したいときは、このファイル末尾の STOP_RULES の配列を編集する。
 *
 * ルールの評価値:
 * - accept : この候補を残したい（1 つでも accept があれば accept 以外は落とす）
 * - reject : この候補を落としたい（accept が無いときだけ効く。全滅するなら落とさない）
 * - neutral: 判断しない
 *
 * 「引き込み」「蹴飛ばし」は先読み（lookahead.ts）を使う。
 * 残りのリールをどの順・どの位置で押されても回避できる候補だけを「蹴飛ばせる」とみなし、
 * 当選役を揃えられる見込みが最大の候補を「引き込める」とみなす。
 * これにより変則押しでも非当選役が揃わず、ベル・リプレイは順押しなら必ず揃う。
 */

/** 停止候補 1 つ */
export interface Candidate {
  slip: number;
  koma: KomaNo;
  /** この候補で止めたときの停止位置（既停止リール＋この候補） */
  positions: StopPositions;
  window: PartialWindow;
}

/** ルールが参照する状況 */
export interface StopContext {
  request: StopRequest;
  /** 引き込む役（小役優先。小役が無ければボーナス） */
  targetRole: Role | null;
  /** このゲームで揃ってよい役（targetRole と同じ役のすべての入賞形） */
  allowedRoles: readonly Role[];
  /** リーチ目テーブル（空なら何もしない） */
  reachme: readonly ReachmePattern[];
}

export interface StopRule {
  id: string;
  /** 表示名（デバッグパネル用） */
  label: string;
  /**
   * 候補を評価する。
   * remaining はこのルールに到達した時点で残っている候補（他候補との比較が要るルール用）。
   */
  evaluate(candidate: Candidate, ctx: StopContext, remaining: readonly Candidate[]): RuleEvaluation;
}

const lineName = (line: string | null) => (line ? LINE_LABELS[line as keyof typeof LINE_LABELS] : '左リール');

/** 候補の窓で targetRole が成立（hit）／まだ成立可能（open）な入賞形 */
function pullInMatches(candidate: Candidate, ctx: StopContext) {
  if (!ctx.targetRole) return [];
  return matchAll(candidate.window, patternsOf(ctx.targetRole)).filter((m) => m.state !== 'miss');
}

// ---------------------------------------------------------------------------
// a. 引き込み
//    残りリールを「どの順・どの位置で押されても」当選役を揃えられる見込み（lookahead の value）が
//    いちばん高い候補を残す。見込み 1.0 = 必ず揃う。すべて 0 なら判断しない（取りこぼし）。
// ---------------------------------------------------------------------------
const VALUE_EPS = 1e-9;

export const pullInRule: StopRule = {
  id: 'pullIn',
  label: '引き込み',
  evaluate(candidate, ctx, remaining) {
    if (!ctx.targetRole) return { ruleId: 'pullIn', verdict: 'neutral', reason: '引き込む役なし' };
    const label = ROLES[ctx.targetRole].label;
    const value = lookahead(ctx.targetRole, candidate.positions).value;
    const best = Math.max(...remaining.map((c) => lookahead(ctx.targetRole, c.positions).value));
    const pct = `${(value * 100).toFixed(0)}%`;
    if (best < VALUE_EPS) return { ruleId: 'pullIn', verdict: 'neutral', reason: `${label} はどの候補でも揃えられない（取りこぼし）` };
    if (value < VALUE_EPS) return { ruleId: 'pullIn', verdict: 'reject', reason: `${label} を引き込めない` };
    const m = pullInMatches(candidate, ctx)[0];
    const where = m ? `${lineName(m.line)}（${m.pattern.id}）` : '';
    if (value >= best - VALUE_EPS) {
      return { ruleId: 'pullIn', verdict: 'accept', reason: `${label} 引き込み見込み ${pct} ${where}`.trim() };
    }
    return { ruleId: 'pullIn', verdict: 'reject', reason: `${label} 引き込み見込み ${pct}（他候補の方が高い）` };
  },
};

// ---------------------------------------------------------------------------
// b. 蹴飛ばし（非当選役の入賞形を作らない）
//    いま揃ってしまう候補はもちろん、残りリールをどう押されても回避できない候補も落とす
// ---------------------------------------------------------------------------
export const kickRule: StopRule = {
  id: 'kick',
  label: '蹴飛ばし',
  evaluate(candidate, ctx) {
    const bad = matchAll(candidate.window).find((m) => m.state === 'hit' && !ctx.allowedRoles.includes(m.pattern.role));
    if (bad) {
      return {
        ruleId: 'kick',
        verdict: 'reject',
        reason: `非当選の ${ROLES[bad.pattern.role].label} が ${lineName(bad.line)} に揃う（${bad.pattern.id}）`,
      };
    }
    if (!lookahead(ctx.targetRole, candidate.positions).safe) {
      return { ruleId: 'kick', verdict: 'reject', reason: '残りリールの押し方次第で非当選役が揃ってしまう' };
    }
    return { ruleId: 'kick', verdict: 'neutral', reason: '非当選役は揃わない' };
  },
};

// ---------------------------------------------------------------------------
// リーチ目（reachme.ts が空なら何もしない）
// ---------------------------------------------------------------------------

/** ボーナス内部中に取りこぼしたとき、リーチ目になる候補を優先する */
export const reachmePreferRule: StopRule = {
  id: 'reachmePrefer',
  label: 'リーチ目優先',
  evaluate(candidate, ctx, remaining) {
    const bonus = ctx.request.flags.bonus;
    if (ctx.reachme.length === 0 || !bonus) return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: '対象外' };
    // 引き込める候補が 1 つでも残っていれば取りこぼしではない
    if (ctx.targetRole && remaining.some((c) => pullInMatches(c, ctx).length > 0)) {
      return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: '引き込み可能なので対象外' };
    }
    const hit = ctx.reachme.find(
      (p) => isPreferable(p) && reachmeTargets(p, bonus) && matchReachme(candidate.window, p) === 'hit',
    );
    if (hit) return { ruleId: 'reachmePrefer', verdict: 'accept', reason: `リーチ目「${hit.label}」に一致` };
    return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: 'リーチ目に一致せず' };
  },
};

/** ボーナス非成立時、リーチ目になる候補を除外する */
export const reachmeExcludeRule: StopRule = {
  id: 'reachmeExclude',
  label: 'リーチ目除外',
  evaluate(candidate, ctx) {
    if (ctx.reachme.length === 0 || ctx.request.flags.bonus) {
      return { ruleId: 'reachmeExclude', verdict: 'neutral', reason: '対象外' };
    }
    const hit = ctx.reachme.find((p) => isExcludable(p) && matchReachme(candidate.window, p) === 'hit');
    if (hit) return { ruleId: 'reachmeExclude', verdict: 'reject', reason: `非成立なのにリーチ目「${hit.label}」になる` };
    return { ruleId: 'reachmeExclude', verdict: 'neutral', reason: 'リーチ目にならない' };
  },
};

// ---------------------------------------------------------------------------
// c. スベリ最小
// ---------------------------------------------------------------------------
export const minSlipRule: StopRule = {
  id: 'minSlip',
  label: 'スベリ最小',
  evaluate(candidate, _ctx, remaining) {
    const min = Math.min(...remaining.map((c) => c.slip));
    return candidate.slip === min
      ? { ruleId: 'minSlip', verdict: 'accept', reason: `スベリ ${candidate.slip} コマ（最小）` }
      : { ruleId: 'minSlip', verdict: 'reject', reason: `スベリ ${candidate.slip} コマ` };
  },
};

/**
 * ★ 停止制御の優先順位（上から順に適用）
 * 1. 引き込み      … 当選役を（残りをどう押されても）揃えられる見込みが最大の位置を残す
 * 2. 蹴飛ばし      … 非当選役の入賞形を作る位置・作らされる位置を落とす
 * 3. リーチ目優先  … 内部中に取りこぼしたらリーチ目を優先（reachme.ts が空なら無効）
 * 4. リーチ目除外  … 非成立時はリーチ目を出さない（同上）
 * 5. スベリ最小    … それでも複数残ればスベリが小さい方
 *
 * 引き込みの accept は lookahead が safe な候補にしか付かないので、引き込み→蹴飛ばしの順でも
 * 蹴飛ばしが引き込みに負けることはない。
 */
export const STOP_RULES: readonly StopRule[] = [pullInRule, kickRule, reachmePreferRule, reachmeExcludeRule, minSlipRule];
