import type { BonusRole, EffectRoleKey, EffectStateKey, FlashId, FlashRequest, GameMode, LampCount, LampPlan, SmallRole } from '../shared/types.ts';
import type { Rng } from '../shared/rng.ts';
import { FLASH_TABLE } from '../config/flashTable.ts';
import { LAMP_ALLOWED_BY_FLASH, LAMP_TABLE, type LitCount } from '../config/lampTable.ts';

/**
 * 演出の抽選（フェーズ8c・演出仕様 v1.0 §2）
 *
 * レバーON時、役抽選の直後に 1 回。入力は (成立役, ボーナスフラグ, モード)。
 * - 処理順は 内部抽選 → リール制御 → 演出。演出は抽選結果を読むだけで結果を変えない
 * - ボーナス消化中（BIG・REG 中）は出さない
 * - ハズレ（N/none）は表が空なので何も出ない（§0: ハズレでは絶対に出さない）
 * - B/none はフラッシュを先に引き、点灯数はそのフラッシュと矛盾しない集合から引く（§2.4）
 * 発生率の数字は config/flashTable.ts・config/lampTable.ts。ここは引き方だけ。
 */

export interface EffectInput {
  /** 今ゲームの小役（リーチ目役 A/B は小役なし扱い） */
  small: SmallRole | null;
  /** ボーナスフラグ（今ゲーム当選分＋持ち越し分。applyCarry 後の carriedBonus） */
  bonus: BonusRole | null;
  mode: GameMode;
}

export interface EffectDecision {
  flash: FlashRequest | null;
  lampPlan: LampPlan;
  /** 使った表の行（デバッグ・集計用）。ボーナス中は null */
  key: EffectStateKey | null;
}

const NONE: EffectDecision = { flash: null, lampPlan: { count: 0 }, key: null };

/** 成立役を表の列に丸める（リーチ目役は none） */
export function effectRoleKey(small: SmallRole | null): EffectRoleKey {
  return small === 'REPLAY' || small === 'BELL' || small === 'MELON' || small === 'CHERRY' ? small : 'none';
}

/** 表の行キー */
export function effectStateKey(small: SmallRole | null, bonus: BonusRole | null): EffectStateKey {
  return `${bonus ? 'B' : 'N'}/${effectRoleKey(small)}`;
}

/** % の行から 1 つ引く。roll は 0 以上 1 未満。残り（100 − 合計）は null */
export function pickPercent<K extends string | number>(row: Partial<Record<K, number>>, roll: number): K | null {
  let acc = 0;
  const r = roll * 100;
  for (const [k, v] of Object.entries(row) as [string, number][]) {
    acc += v;
    if (r < acc) return (Number.isNaN(Number(k)) ? k : Number(k)) as K; // 数値キー（点灯数）は Object.entries で文字列になるので戻す
  }
  return null;
}

/** 行の合計（%） */
export function rowTotal(row: Partial<Record<string | number, number>>): number {
  return (Object.values(row) as (number | undefined)[]).reduce<number>((a, b) => a + (b ?? 0), 0);
}

/**
 * 点灯数の行。B/none だけは引いたフラッシュで許される点灯数に絞り、合計が元の行と同じになるよう正規化する（§2.4）
 */
export function lampRowFor(key: EffectStateKey, flash: FlashId | null): Partial<Record<LitCount, number>> {
  const row = LAMP_TABLE[key];
  if (key !== 'B/none') return row;
  const allowed = LAMP_ALLOWED_BY_FLASH[flash ?? 'none'];
  const total = rowTotal(row);
  const sub = allowed.filter((n) => (row[n] ?? 0) > 0);
  const subTotal = sub.reduce((a, n) => a + (row[n] ?? 0), 0);
  if (subTotal === 0) return {};
  const out: Partial<Record<LitCount, number>> = {};
  for (const n of sub) out[n] = ((row[n] ?? 0) * total) / subTotal;
  return out;
}

export interface DecideOptions {
  /** フラッシュを外から決める（デバッグ）。undefined なら表から引く。null は発生なし */
  flash?: FlashRequest | null;
}

/** レバーON時の演出抽選 */
export function decideEffects(input: EffectInput, rng: Rng, options: DecideOptions = {}): EffectDecision {
  if (input.mode !== 'normal') return NONE;
  const key = effectStateKey(input.small, input.bonus);
  if (key === 'N/none') return { ...NONE, key };
  const flashId: FlashId | null = options.flash === undefined ? pickPercent(FLASH_TABLE[key], rng.next()) : (options.flash?.id ?? null);
  const count: LampCount = pickPercent(lampRowFor(key, flashId), rng.next()) ?? 0;
  return { flash: flashId ? { id: flashId } : null, lampPlan: { count }, key };
}
