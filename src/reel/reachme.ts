import type { BonusRole, KomaNo, ReachmePattern, ReelIndex, ReelPattern, StopRecord } from '../shared/types.ts';
import { REACHME } from '../config/reachme.ts';
import type { MatchState } from '../payout/judge.ts';
import type { PartialWindow, ReelWindow } from './window.ts';

/**
 * リーチ目の照合
 * config/reachme.ts のパターンと窓（途中停止可）を比べる。
 * デバッグパネル（一致表示・出目コピー）とリール制御のルール・先読みが共用する。
 *
 * 出目（reels）の照合と、条件（when: 押し順・押下位置・スベリ）の照合は分けてある。
 * 条件は「リールを止めた瞬間の押下位置・スベリ」で決まるので、止めた後は
 * リールごとのビットマスク（ConditionMasks）に畳んで持ち回る。先読みのメモ化キーを小さく保つため。
 */

// ---------------------------------------------------------------------------
// 出目の照合
// ---------------------------------------------------------------------------

/** 1 リールぶんの照合 */
function matchReel(pattern: ReelPattern, reel: ReelWindow): boolean {
  return pattern.every((p, row) => p === '*' || p === reel[row]);
}

/** リーチ目 1 件と窓の状態（出目だけを見る。条件は見ない） */
export function matchReachme(window: PartialWindow, pattern: ReachmePattern): MatchState {
  let open = false;
  for (const reel of [0, 1, 2] as const) {
    const p = pattern.reels[reel];
    if (p === null) continue; // そのリールは見ない
    const rw = window[reel];
    if (rw === null) {
      open = true;
      continue;
    }
    if (!matchReel(p, rw)) return 'miss';
  }
  return open ? 'open' : 'hit';
}

// ---------------------------------------------------------------------------
// 条件（押し順・押下位置・スベリ）
// ---------------------------------------------------------------------------

/** リールごとの条件ビット（止まっていないリールは 0） */
export type ConditionMasks = readonly [number, number, number];

export const NO_MASKS: ConditionMasks = [0, 0, 0];

interface ReelConditionBit {
  bit: number;
  push?: readonly KomaNo[];
  slip?: readonly number[];
}

/** テーブル 1 つぶんの条件をビットに割り当てたもの */
export interface CompiledConditions {
  /** リールごとの条件一覧 */
  perReel: readonly [ReelConditionBit[], ReelConditionBit[], ReelConditionBit[]];
  /** パターン → 満たすべき (リール, ビット) */
  bits: Map<ReachmePattern, { reel: ReelIndex; bit: number }[]>;
}

const MAX_CONDITIONS_PER_REEL = 30;

function compile(table: readonly ReachmePattern[]): CompiledConditions {
  const perReel: [ReelConditionBit[], ReelConditionBit[], ReelConditionBit[]] = [[], [], []];
  const bits = new Map<ReachmePattern, { reel: ReelIndex; bit: number }[]>();
  for (const p of table) {
    const reels = p.when?.reels;
    if (!reels) continue;
    const need: { reel: ReelIndex; bit: number }[] = [];
    for (const reel of [0, 1, 2] as const) {
      const cond = reels[reel];
      if (!cond) continue;
      const list = perReel[reel];
      if (list.length >= MAX_CONDITIONS_PER_REEL) {
        throw new Error(`リーチ目の押下位置・スベリ条件が多すぎる（リール ${reel} に ${MAX_CONDITIONS_PER_REEL} 件まで）`);
      }
      const bit = 1 << list.length;
      list.push({ bit, push: cond.push, slip: cond.slip });
      need.push({ reel, bit });
    }
    bits.set(p, need);
  }
  return { perReel, bits };
}

const compiled = new WeakMap<readonly ReachmePattern[], CompiledConditions>();

/** テーブルの条件をコンパイルする（テーブルの配列ごとにキャッシュ） */
export function conditionsOf(table: readonly ReachmePattern[]): CompiledConditions {
  let c = compiled.get(table);
  if (!c) {
    c = compile(table);
    compiled.set(table, c);
  }
  return c;
}

/** リールを (push, slip) で止めたときに満たす条件のビット */
export function conditionMask(conds: CompiledConditions, reel: ReelIndex, push: KomaNo, slip: number): number {
  let mask = 0;
  for (const c of conds.perReel[reel]) {
    if (c.push && !c.push.includes(push)) continue;
    if (c.slip && !c.slip.includes(slip)) continue;
    mask |= c.bit;
  }
  return mask;
}

/** マスクにリール 1 本ぶんを差し込む */
export function withMask(masks: ConditionMasks, reel: ReelIndex, mask: number): ConditionMasks {
  const next: [number, number, number] = [masks[0], masks[1], masks[2]];
  next[reel] = mask;
  return next;
}

/** 止めた順の記録からマスクを作る */
export function masksOf(conds: CompiledConditions, history: readonly StopRecord[]): ConditionMasks {
  let masks = NO_MASKS;
  for (const h of history) masks = withMask(masks, h.reel, conditionMask(conds, h.reel, h.pushKoma, h.slip));
  return masks;
}

/** パターンの条件（押し順・押下位置・スベリ）を満たしているか。条件が無ければ true */
export function conditionsOk(conds: CompiledConditions, pattern: ReachmePattern, order: readonly ReelIndex[], masks: ConditionMasks): boolean {
  const when = pattern.when;
  if (!when) return true;
  if (when.order && !when.order.every((r, i) => order[i] === r)) return false;
  const need = conds.bits.get(pattern);
  if (need) for (const { reel, bit } of need) if ((masks[reel] & bit) === 0) return false;
  return true;
}

/** 照合に使う状況（止めた順とマスク） */
export interface ReachmeContext {
  order: readonly ReelIndex[];
  masks: ConditionMasks;
}

/**
 * 窓に一致（確定）しているリーチ目の一覧。
 * ctx を渡すと条件（押し順・押下位置・スベリ）も見る。省略時は出目だけで照合する。
 */
export function findReachme(window: PartialWindow, table: readonly ReachmePattern[] = REACHME, ctx?: ReachmeContext): ReachmePattern[] {
  const conds = ctx ? conditionsOf(table) : null;
  return table.filter((p) => matchReachme(window, p) === 'hit' && (!conds || conditionsOk(conds, p, ctx!.order, ctx!.masks)));
}

// ---------------------------------------------------------------------------
// 扱い（usage / bonus）
// ---------------------------------------------------------------------------

/** そのボーナスを対象にしているか */
export function reachmeTargets(pattern: ReachmePattern, bonus: BonusRole): boolean {
  return !pattern.bonus || pattern.bonus.includes(bonus);
}

/** 内部中に優先する対象か */
export function isPreferable(pattern: ReachmePattern): boolean {
  const u = pattern.usage ?? 'both';
  return u === 'both' || u === 'preferOnly';
}

/** 非成立時に除外する対象か */
export function isExcludable(pattern: ReachmePattern): boolean {
  const u = pattern.usage ?? 'both';
  return u === 'both' || u === 'excludeOnly';
}

/**
 * このルールセット（bonus = 成立中のボーナス。null なら default）で止めてはいけないリーチ目か。
 * default では除外対象すべて、ボーナス成立後は「他系（そのボーナスを対象にしない）」のリーチ目。
 */
export function isExcludedIn(pattern: ReachmePattern, bonus: BonusRole | null): boolean {
  if (!isExcludable(pattern)) return false;
  return bonus === null || !reachmeTargets(pattern, bonus);
}

/** このルールセットで優先して止めたいリーチ目か（ボーナス成立後だけ） */
export function isPreferredIn(pattern: ReachmePattern, bonus: BonusRole | null): boolean {
  return bonus !== null && isPreferable(pattern) && reachmeTargets(pattern, bonus);
}

// ---------------------------------------------------------------------------
// 書式
// ---------------------------------------------------------------------------

/** 全停止の窓を reachme.ts の書式の文字列にする（デバッグの「出目をコピー」用） */
export function formatAsReachme(window: PartialWindow, id = 'new-pattern', label = ''): string {
  const reel = (rw: ReelWindow | null) => (rw === null ? 'null' : `['${rw[0]}', '${rw[1]}', '${rw[2]}']`);
  return [
    '{',
    `  id: '${id}',`,
    `  label: '${label}',`,
    '  reels: [',
    `    ${reel(window[0])}, // 左 [上段, 中段, 下段]`,
    `    ${reel(window[1])}, // 中`,
    `    ${reel(window[2])}, // 右`,
    '  ],',
    '},',
  ].join('\n');
}
