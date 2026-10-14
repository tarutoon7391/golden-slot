import type { BonusRole, BonusSpec, RoleDef, SmallRole, WinPattern } from '../shared/types.ts';

/**
 * 役・入賞形・配当
 * 数値を変えるときはこのファイルだけを触る。
 */

/** 1 ゲームの払い出し上限（複数ライン入賞しても超えない） */
export const MAX_PAYOUT_PER_GAME = 15;

/** ボーナスの種類（順序は抽選テーブルの行順・表示順に使う） */
export const BONUS_ROLES: readonly BonusRole[] = ['BIG7', 'BIGG', 'REG'];

/** BIG 扱い（規定枚数が多い方・データカウンターの BIG に数える）のボーナス */
export const BIG_KINDS: readonly BonusRole[] = ['BIG7', 'BIGG'];

export function isBonusRole(role: string): role is BonusRole {
  return (BONUS_ROLES as readonly string[]).includes(role);
}

export function isBigBonus(kind: BonusRole): boolean {
  return BIG_KINDS.includes(kind);
}

/** 役の配当 */
export const ROLES: Record<SmallRole | BonusRole, RoleDef> = {
  BIG7: { role: 'BIG7', label: '7BIG', payout: 0, isReplay: false },
  BIGG: { role: 'BIGG', label: 'GBIG', payout: 0, isReplay: false },
  REG: { role: 'REG', label: 'REG', payout: 0, isReplay: false },
  BELL: { role: 'BELL', label: 'ベル', payout: 8, isReplay: false, payoutInBonus: 15 },
  MELON: { role: 'MELON', label: 'スイカ', payout: 15, isReplay: false },
  // チェリーは角（上段・下段）のみ入賞。中段チェリーは入賞せず、リーチ目役B の専用形
  CHERRY: { role: 'CHERRY', label: 'チェリー', payout: 4, isReplay: false },
  REPLAY: { role: 'REPLAY', label: 'リプレイ', payout: 0, isReplay: true },
  // リーチ目役（配当 0 の小役。ボーナス当選ゲームにだけ重複する）
  REACH_A: { role: 'REACH_A', label: 'リーチ目役A', payout: 0, isReplay: false },
  REACH_B: { role: 'REACH_B', label: 'リーチ目役B', payout: 0, isReplay: false },
};

/** ボーナスの終了条件 */
export const BONUS_SPECS: Record<BonusRole, BonusSpec> = {
  BIG7: { kind: 'BIG7', label: 'BIG BONUS（赤7）', maxPayout: 300 },
  BIGG: { kind: 'BIGG', label: 'BIG BONUS（G）', maxPayout: 300 },
  REG: { kind: 'REG', label: 'REGULAR BONUS', maxPayout: 100 },
};

/**
 * 入賞形
 * symbols は [左, 中, 右] に許される図柄。null は任意。
 * scope: 'line' は有効ライン上で 3 リールを見る（lines で見るラインを絞れる）。
 *        'leftReel' は左リールの段だけを見る。'window' は窓全体（cells・'*' は任意）を見る。
 */
export const WIN_PATTERNS: readonly WinPattern[] = [
  // --- ボーナス ---
  { id: 'BIG7_SEVEN', role: 'BIG7', scope: 'line', symbols: [['seven'], ['seven'], ['seven']] },
  { id: 'BIGG_G', role: 'BIGG', scope: 'line', symbols: [['g'], ['g'], ['g']] },
  // REG は 赤7・赤7・BAR。上段・中段揃いは配列上リプレイが同時に揃うため無効（下段・右上がり・右下がりのみ）
  { id: 'REG_77BAR', role: 'REG', scope: 'line', symbols: [['seven'], ['seven'], ['bar']], lines: ['bottom', 'downRight', 'upRight'] },

  // --- 小役 ---
  { id: 'BELL', role: 'BELL', scope: 'line', symbols: [['bell'], ['bell'], ['bell']] },
  { id: 'REPLAY', role: 'REPLAY', scope: 'line', symbols: [['replay'], ['replay'], ['replay']] },
  { id: 'MELON', role: 'MELON', scope: 'line', symbols: [['melon'], ['melon'], ['melon']] },
  // スイカの代用図柄：左スイカ・中スイカ・右BAR（5 ラインすべて有効）
  { id: 'MELON_BAR', role: 'MELON', scope: 'line', symbols: [['melon'], ['melon'], ['bar']] },

  // チェリー：左リールの角（上段・下段）にチェリー停止で入賞。2 ラインにかかるので 2 枚 × 2 = 4 枚相当
  { id: 'CHERRY_CORNER', role: 'CHERRY', scope: 'leftReel', leftRows: [0, 2], symbols: [['cherry'], null, null], payout: 4 },

  // --- リーチ目役（配当 0） ---
  // A: 上段 BAR 揃い（左 4 番・中 5 番・右 12 番中段）。中段・下段は問わない
  { id: 'REACH_A_BAR_TOP', role: 'REACH_A', scope: 'window', symbols: [null, null, null], cells: [['bar', '*', '*'], ['bar', '*', '*'], ['bar', '*', '*']] },
  // B: 左中段チェリー。中・右は問わない
  { id: 'REACH_B_CHERRY_MID', role: 'REACH_B', scope: 'leftReel', leftRows: [1], symbols: [['cherry'], null, null] },
];

/** 役 → その役の入賞形一覧 */
export function patternsOf(role: SmallRole | BonusRole): WinPattern[] {
  return WIN_PATTERNS.filter((p) => p.role === role);
}
