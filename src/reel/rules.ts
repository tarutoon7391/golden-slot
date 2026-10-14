import type { ActiveFlags, BonusRole, KomaNo, ReachmePattern, ReelIndex, RuleEvaluation, StopPositions, StopRequest, StopRuleSetId } from '../shared/types.ts';
import { LINE_LABELS } from '../config/lines.ts';
import { BONUS_SPECS, ROLES, patternsOf } from '../config/roles.ts';
import { matchAll, type Role } from '../payout/judge.ts';
import type { Outcome } from './lookahead.ts';
import { conditionsOk, isExcludedIn, isPreferredIn, matchReachme, type CompiledConditions, type ConditionMasks } from './reachme.ts';
import type { PartialWindow } from './window.ts';

/**
 * 停止制御のルール
 *
 * 候補（押下位置から 0〜4 コマ）を上から順にふるい落とす。
 * 優先順位を変えたい・条件を足したいときは、このファイル末尾の STOP_RULES の配列を編集する。
 * ボーナス成立後に別のルールを使いたいときは STOP_RULE_SETS の該当セットを差し替える。
 *
 * ルールの評価値:
 * - accept : この候補を残したい（1 つでも accept があれば accept 以外は落とす）
 * - reject : この候補を落としたい（accept が無いときだけ効く。全滅するなら落とさない）
 * - neutral: 判断しない
 *
 * 「引き込み」「蹴飛ばし」「リーチ目優先」「リーチ目除外」は先読み（lookahead.ts）を使う。
 * 残りのリールをどの順・どの位置で押されても回避できる候補だけを「蹴飛ばせる／除外できる」とみなし、
 * 当選役（またはリーチ目）を作れる見込みが最大の候補を「引き込める（優先する）」とみなす。
 * これにより変則押しでも非当選役・非成立時のリーチ目が揃わず、ベル・リプレイは順押しなら必ず揃う。
 */

/** 停止候補 1 つ */
export interface Candidate {
  slip: number;
  koma: KomaNo;
  /** この候補で止めたときの停止位置（既停止リール＋この候補） */
  positions: StopPositions;
  window: PartialWindow;
  /** この候補で止めたときの止めた順（既停止＋このリール） */
  order: readonly ReelIndex[];
  /** リーチ目の条件ビット（既停止＋この候補の押下位置・スベリ） */
  masks: ConditionMasks;
}

/** ルールが参照する状況 */
export interface StopContext {
  request: StopRequest;
  /** 使っているルールセット */
  set: StopRuleSet;
  /** 引き込む役（小役優先。小役が無ければボーナス） */
  targetRole: Role | null;
  /** このゲームで揃ってよい役（targetRole と同じ役のすべての入賞形） */
  allowedRoles: readonly Role[];
  /** リーチ目テーブル（空なら何もしない） */
  reachme: readonly ReachmePattern[];
  /** リーチ目の条件（コンパイル済み） */
  conditions: CompiledConditions;
  /** 候補の先読み結果（メモ化済み） */
  look(candidate: Candidate): Outcome;
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
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const VALUE_EPS = 1e-9;

/** 候補の窓で targetRole が成立（hit）／まだ成立可能（open）な入賞形 */
function pullInMatches(candidate: Candidate, ctx: StopContext) {
  if (!ctx.targetRole) return [];
  return matchAll(candidate.window, patternsOf(ctx.targetRole)).filter((m) => m.state !== 'miss');
}

/** 候補の窓で（条件込みで）すでに一致しているリーチ目のうち、pick に合うもの */
function reachmeHit(candidate: Candidate, ctx: StopContext, pick: (p: ReachmePattern) => boolean): ReachmePattern | undefined {
  return ctx.reachme.find((p) => pick(p) && matchReachme(candidate.window, p) === 'hit' && conditionsOk(ctx.conditions, p, candidate.order, candidate.masks));
}

// ---------------------------------------------------------------------------
// a. 引き込み
//    残りリールを「どの順・どの位置で押されても」当選役を揃えられる見込み（lookahead の value）が
//    いちばん高い候補を残す。見込み 1.0 = 必ず揃う。すべて 0 なら判断しない（取りこぼし）。
// ---------------------------------------------------------------------------
export const pullInRule: StopRule = {
  id: 'pullIn',
  label: '引き込み',
  evaluate(candidate, ctx, remaining) {
    if (!ctx.targetRole) return { ruleId: 'pullIn', verdict: 'neutral', reason: '引き込む役なし' };
    const label = ROLES[ctx.targetRole].label;
    const value = ctx.look(candidate).value;
    const best = Math.max(...remaining.map((c) => ctx.look(c).value));
    if (best < VALUE_EPS) return { ruleId: 'pullIn', verdict: 'neutral', reason: `${label} はどの候補でも揃えられない（取りこぼし）` };
    if (value < VALUE_EPS) return { ruleId: 'pullIn', verdict: 'reject', reason: `${label} を引き込めない` };
    const m = pullInMatches(candidate, ctx)[0];
    const where = m ? `${lineName(m.line)}（${m.pattern.id}）` : '';
    if (value >= best - VALUE_EPS) {
      return { ruleId: 'pullIn', verdict: 'accept', reason: `${label} 引き込み見込み ${pct(value)} ${where}`.trim() };
    }
    return { ruleId: 'pullIn', verdict: 'reject', reason: `${label} 引き込み見込み ${pct(value)}（他候補の方が高い）` };
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
    if (!ctx.look(candidate).safe) {
      return { ruleId: 'kick', verdict: 'reject', reason: '残りリールの押し方次第で非当選役が揃ってしまう' };
    }
    return { ruleId: 'kick', verdict: 'neutral', reason: '非当選役は揃わない' };
  },
};

// ---------------------------------------------------------------------------
// リーチ目（reachme.ts が空なら何もしない）
// ---------------------------------------------------------------------------

/**
 * ボーナス成立後、当選役を引き込めない（取りこぼし・狙っていない）とき、
 * この系のリーチ目を作れる見込み（lookahead の reach）が最大の候補を残す
 */
export const reachmePreferRule: StopRule = {
  id: 'reachmePrefer',
  label: 'リーチ目優先',
  evaluate(candidate, ctx, remaining) {
    const bonus = ctx.request.flags.bonus;
    if (ctx.reachme.length === 0 || !bonus) return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: '対象外' };
    // 引き込める候補が 1 つでも残っていれば取りこぼしではない
    if (ctx.targetRole && remaining.some((c) => ctx.look(c).value >= VALUE_EPS)) {
      return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: '引き込み可能なので対象外' };
    }
    const reach = ctx.look(candidate).reach;
    const best = Math.max(...remaining.map((c) => ctx.look(c).reach));
    if (best < VALUE_EPS) return { ruleId: 'reachmePrefer', verdict: 'neutral', reason: 'どの候補でもリーチ目を作れない' };
    if (reach < VALUE_EPS) return { ruleId: 'reachmePrefer', verdict: 'reject', reason: 'リーチ目を作れない' };
    const hit = reachmeHit(candidate, ctx, (p) => isPreferredIn(p, bonus));
    const where = hit ? `「${hit.label}」` : '';
    if (reach >= best - VALUE_EPS) {
      return { ruleId: 'reachmePrefer', verdict: 'accept', reason: `リーチ目見込み ${pct(reach)} ${where}`.trim() };
    }
    return { ruleId: 'reachmePrefer', verdict: 'reject', reason: `リーチ目見込み ${pct(reach)}（他候補の方が高い）` };
  },
};

/**
 * 止めてはいけないリーチ目（default は登録分すべて、ボーナス成立後は他系）になる候補を除外する。
 * いま一致している候補だけでなく、残りリールをどう押されても避けられない候補も落とす。
 */
export const reachmeExcludeRule: StopRule = {
  id: 'reachmeExclude',
  label: 'リーチ目除外',
  evaluate(candidate, ctx) {
    if (ctx.reachme.length === 0) return { ruleId: 'reachmeExclude', verdict: 'neutral', reason: '対象外' };
    const bonus = ctx.request.flags.bonus;
    if (ctx.look(candidate).clean) return { ruleId: 'reachmeExclude', verdict: 'neutral', reason: 'リーチ目にならない' };
    const hit = reachmeHit(candidate, ctx, (p) => isExcludedIn(p, bonus));
    const what = bonus ? `${BONUS_SPECS[bonus].label} 中に他系のリーチ目` : '非成立なのにリーチ目';
    if (hit) return { ruleId: 'reachmeExclude', verdict: 'reject', reason: `${what}「${hit.label}」になる` };
    return { ruleId: 'reachmeExclude', verdict: 'reject', reason: `残りリールの押し方次第で${what}の形を避けられない` };
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
 * 3. リーチ目優先  … ボーナス成立後に取りこぼしたら、この系のリーチ目を作れる見込みが最大の位置を残す
 * 4. リーチ目除外  … 非成立時は登録リーチ目を、成立後は他系のリーチ目を出さない（避けられない位置も落とす）
 * 5. スベリ最小    … それでも複数残ればスベリが小さい方
 *
 * 引き込みの accept は lookahead が clean（非当選役もリーチ目も避けられる）な候補にしか付かないので、
 * 引き込み→蹴飛ばし→除外 の順でも、蹴飛ばし・除外が引き込みに負けることはない。
 */
export const STOP_RULES: readonly StopRule[] = [pullInRule, kickRule, reachmePreferRule, reachmeExcludeRule, minSlipRule];

// ---------------------------------------------------------------------------
// ルールセット（通常時／ボーナス種別ごと）
// ---------------------------------------------------------------------------

export interface StopRuleSet {
  id: StopRuleSetId;
  /** 表示名（デバッグパネル用） */
  label: string;
  rules: readonly StopRule[];
}

/**
 * ★ ルールセット。flags.bonus（当選ゲーム・持ち越し中とも）で選ぶ。
 * いまは 4 セットとも同じルール列で、違いは「どのリーチ目を止めてよいか」
 * （reachme.ts の bonus フィールド）だけ。種別ごとに挙動を変えたくなったら、ここの rules を差し替える。
 */
export const STOP_RULE_SETS: Record<StopRuleSetId, StopRuleSet> = {
  default: { id: 'default', label: '通常（ボーナス非成立）', rules: STOP_RULES },
  BIG7: { id: 'BIG7', label: `${BONUS_SPECS.BIG7.label} 成立中`, rules: STOP_RULES },
  BIGG: { id: 'BIGG', label: `${BONUS_SPECS.BIGG.label} 成立中`, rules: STOP_RULES },
  REG: { id: 'REG', label: `${BONUS_SPECS.REG.label} 成立中`, rules: STOP_RULES },
};

/** このゲームで使うルールセット（成立中のボーナスがあればその種別、なければ default） */
export function ruleSetFor(flags: ActiveFlags): StopRuleSet {
  const bonus: BonusRole | null = flags.bonus;
  return STOP_RULE_SETS[bonus ?? 'default'];
}
