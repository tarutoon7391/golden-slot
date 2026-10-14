import type { ActiveFlags, BonusRole, LotteryResult, LotteryRowKey, LotteryTable, SmallRole } from '../shared/types.ts';
import type { Rng } from '../shared/rng.ts';

/**
 * 内部抽選
 *
 * - テーブルの行を上から順に重みぶん積み上げ、乱数（0〜denom-1）がどこに落ちたかで役を決める
 * - 行に無いぶんはハズレ
 * - ボーナスは持ち越す。持ち越し中に新たなボーナスを引いても無視する（小役の重複分は有効）
 * - 持ち越し中は小役優先（ActiveFlags で small が null でない限り、リール制御は小役を引き込む）
 */

/** 行の順序。乱数の積み上げ順なので変えるとシード再現が崩れる */
export const ROW_KEYS: readonly LotteryRowKey[] = [
  'BIG',
  'BIG_CHERRY',
  'BIG_MELON',
  'REG',
  'REG_CHERRY',
  'REG_MELON',
  'BELL',
  'MELON',
  'CHERRY',
  'REPLAY',
];

/** 行キー → 当選内容 */
export function rowToResult(key: LotteryRowKey | 'NONE'): LotteryResult {
  switch (key) {
    case 'BIG':
      return { small: null, bonus: 'BIG' };
    case 'BIG_CHERRY':
      return { small: 'CHERRY', bonus: 'BIG' };
    case 'BIG_MELON':
      return { small: 'MELON', bonus: 'BIG' };
    case 'REG':
      return { small: null, bonus: 'REG' };
    case 'REG_CHERRY':
      return { small: 'CHERRY', bonus: 'REG' };
    case 'REG_MELON':
      return { small: 'MELON', bonus: 'REG' };
    case 'BELL':
      return { small: 'BELL', bonus: null };
    case 'MELON':
      return { small: 'MELON', bonus: null };
    case 'CHERRY':
      return { small: 'CHERRY', bonus: null };
    case 'REPLAY':
      return { small: 'REPLAY', bonus: null };
    case 'NONE':
      return { small: null, bonus: null };
  }
}

/** 乱数値（0〜denom-1）から行を決める（純粋関数・テストしやすい） */
export function rowForRoll(table: LotteryTable, roll: number): LotteryRowKey | 'NONE' {
  let acc = 0;
  for (const key of ROW_KEYS) {
    acc += table.weights[key];
    if (roll < acc) return key;
  }
  return 'NONE';
}

/** 1 ゲームぶんの抽選 */
export function drawLottery(table: LotteryTable, rng: Rng): LotteryResult {
  const roll = rng.nextInt(table.denom);
  const key = rowForRoll(table, roll);
  return { ...rowToResult(key), roll };
}

/**
 * 持ち越しを反映する。
 * - 持ち越し中に新たなボーナスを引いた場合は無視（小役の重複分は残す）
 * - 新規当選なら持ち越しに積む
 * 戻り値の carriedBonus が「このゲームで成立しているボーナス」
 */
export function applyCarry(
  result: LotteryResult,
  carriedBonus: BonusRole | null,
): { lottery: LotteryResult; carriedBonus: BonusRole | null } {
  if (carriedBonus) {
    // すでに持ち越し中：新規ボーナスは捨てる
    return { lottery: { ...result, bonus: null }, carriedBonus };
  }
  return { lottery: result, carriedBonus: result.bonus };
}

/** リール制御が参照する「引き込むべき役」 */
export function toActiveFlags(lottery: LotteryResult, carriedBonus: BonusRole | null): ActiveFlags {
  return { small: lottery.small, bonus: carriedBonus ?? lottery.bonus };
}

/**
 * 小役優先かどうか。
 * 小役（リプレイ含む）が当選しているゲームでは、ボーナス成立中でも小役を引き込む。
 * ボーナス図柄を揃えられるのは小役なし（ハズレ）のゲームだけ。
 */
export function smallHasPriority(flags: ActiveFlags): boolean {
  return flags.small !== null;
}

/** このゲームでボーナス図柄を狙えるか */
export function canAlignBonus(flags: ActiveFlags): flags is ActiveFlags & { bonus: BonusRole } {
  return flags.bonus !== null && !smallHasPriority(flags);
}

/** 役名の一覧（表示用） */
export const SMALL_ROLES: readonly SmallRole[] = ['BELL', 'MELON', 'CHERRY', 'REPLAY'];
export const BONUS_ROLES: readonly BonusRole[] = ['BIG', 'REG'];
