import type { EffectStateKey, FlashId, LampCount } from '../shared/types.ts';

/** 点灯数 1〜3（0 個は行の残り） */
export type LitCount = Exclude<LampCount, 0>;

/**
 * ロゴランプの点灯数の確率表（演出仕様 v1.0 §2.3）
 *
 * 行のキーは flashTable.ts と同じ「状態/成立役」。値は %、行の残りが 0 個。
 * レバーON時点で点灯数 N を決め、第 k 停止（k ≤ N）で止めたリールのランプが点く。
 */
export const LAMP_TABLE: Record<EffectStateKey, Partial<Record<LitCount, number>>> = {
  'N/none': {},
  'N/REPLAY': { 1: 16.5, 2: 7, 3: 1.5 },
  'N/BELL': { 1: 25 },
  'N/MELON': { 2: 38, 3: 12 },
  'N/CHERRY': { 1: 50 },
  'B/none': { 1: 9, 2: 10, 3: 14 },
  'B/REPLAY': { 1: 13, 2: 10, 3: 10 },
  'B/BELL': { 1: 33 },
  'B/MELON': { 1: 27, 3: 6 },
  'B/CHERRY': { 1: 11, 3: 22 },
};

/**
 * B/none のときのフラッシュと点灯数の整合（§2.4）
 * フラッシュを先に引き、点灯数は引いたフラッシュと矛盾しない集合から引く
 * （LAMP_TABLE の B/none 行を、許される点灯数だけに正規化して使う。合計の 33% は変えない）。
 * キー 'none' はフラッシュなし。
 */
export const LAMP_ALLOWED_BY_FLASH: Record<FlashId | 'none', readonly LitCount[]> = {
  none: [1, 2, 3],
  REP: [1, 2, 3],
  BELL: [1],
  MEL: [1, 2, 3], // リプレイの可能性があるため
  CHER: [1, 3],
  CMEL: [1, 2, 3],
  CCHER: [1, 3],
};
