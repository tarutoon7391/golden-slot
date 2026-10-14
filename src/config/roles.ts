import type { BonusRole, BonusSpec, RoleDef, SmallRole, WinPattern } from '../shared/types.ts';

/**
 * 役・入賞形・配当
 * 数値を変えるときはこのファイルだけを触る。
 */

/** 1 ゲームの払い出し上限（複数ライン入賞しても超えない） */
export const MAX_PAYOUT_PER_GAME = 15;

/** 役の配当 */
export const ROLES: Record<SmallRole | BonusRole, RoleDef> = {
  BIG: { role: 'BIG', label: 'BIG', payout: 0, isReplay: false },
  REG: { role: 'REG', label: 'REG', payout: 0, isReplay: false },
  BELL: { role: 'BELL', label: 'ベル', payout: 8, isReplay: false, payoutInBonus: 15 },
  MELON: { role: 'MELON', label: 'スイカ', payout: 15, isReplay: false },
  // チェリーは入賞形ごとに payout を上書きする（角／中段）
  CHERRY: { role: 'CHERRY', label: 'チェリー', payout: 2, isReplay: false },
  REPLAY: { role: 'REPLAY', label: 'リプレイ', payout: 0, isReplay: true },
};

/** ボーナスの終了条件 */
export const BONUS_SPECS: Record<BonusRole, BonusSpec> = {
  BIG: { kind: 'BIG', label: 'BIG BONUS', maxPayout: 300 },
  REG: { kind: 'REG', label: 'REGULAR BONUS', maxPayout: 100 },
};

/**
 * 入賞形
 * symbols は [左, 中, 右] に許される図柄。null は任意。
 * scope: 'line' は有効ライン上で 3 リールを見る。'leftReel' は左リールの段だけを見る。
 */
export const WIN_PATTERNS: readonly WinPattern[] = [
  // --- ボーナス（配当は共通。分けたいときは BONUS_SPECS を kind ごとに変える） ---
  { id: 'BIG_G', role: 'BIG', scope: 'line', symbols: [['g'], ['g'], ['g']] },
  { id: 'BIG_SEVEN', role: 'BIG', scope: 'line', symbols: [['seven'], ['seven'], ['seven']] },
  // REG は 赤7・赤7・BAR のみ（BAR 揃いは撤廃）
  { id: 'REG_77BAR', role: 'REG', scope: 'line', symbols: [['seven'], ['seven'], ['bar']] },

  // --- 小役 ---
  { id: 'BELL', role: 'BELL', scope: 'line', symbols: [['bell'], ['bell'], ['bell']] },
  { id: 'REPLAY', role: 'REPLAY', scope: 'line', symbols: [['replay'], ['replay'], ['replay']] },
  { id: 'MELON', role: 'MELON', scope: 'line', symbols: [['melon'], ['melon'], ['melon']] },
  // スイカの代用図柄：左スイカ・中スイカ・右BAR
  { id: 'MELON_BAR', role: 'MELON', scope: 'line', symbols: [['melon'], ['melon'], ['bar']] },

  // チェリー：左リールにチェリー停止で入賞。角と中段で扱いを分ける
  // 角（上段・下段）は 2 ラインにかかるので 2 枚 × 2 = 4 枚相当
  { id: 'CHERRY_CORNER', role: 'CHERRY', scope: 'leftReel', leftRows: [0, 2], symbols: [['cherry'], null, null], payout: 4 },
  // 中段は 1 ラインなので 2 枚
  { id: 'CHERRY_MIDDLE', role: 'CHERRY', scope: 'leftReel', leftRows: [1], symbols: [['cherry'], null, null], payout: 2 },
];

/** 役 → その役の入賞形一覧 */
export function patternsOf(role: SmallRole | BonusRole): WinPattern[] {
  return WIN_PATTERNS.filter((p) => p.role === role);
}
