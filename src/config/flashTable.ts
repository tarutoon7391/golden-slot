import type { EffectStateKey, FlashId } from '../shared/types.ts';

/**
 * リールフラッシュの発生率表（演出仕様 v1.0 §2.2）
 *
 * 行のキーは「状態/成立役」。
 * - N/役  : ボーナス非成立でその小役が成立
 * - B/none: ボーナス成立後（当選G・持ち越しG）で小役なし（単独当選・リーチ目役・ハズレ）
 * - B/役  : ボーナス成立後にその小役が成立
 * 値は % で、行の合計の残りが「なし」。N/none（ハズレ）は空 = フラッシュもランプも絶対に出さない（§0）。
 * 設定差は付けない（§2.6）。数字の調整はここだけ。
 */
export const FLASH_TABLE: Record<EffectStateKey, Partial<Record<FlashId, number>>> = {
  'N/none': {},
  'N/REPLAY': { REP: 50, MEL: 2 },
  'N/BELL': { BELL: 50 },
  'N/MELON': { MEL: 60, CMEL: 6.7 },
  'N/CHERRY': { CHER: 50, CCHER: 5.8 },
  'B/none': { REP: 7.5, BELL: 6, MEL: 12, CHER: 10, CMEL: 3, CCHER: 3 },
  'B/REPLAY': { REP: 15, MEL: 85 },
  'B/BELL': { BELL: 30 },
  'B/MELON': { MEL: 5, CMEL: 90, CCHER: 5 },
  'B/CHERRY': { CHER: 5, CMEL: 5, CCHER: 90 },
};
