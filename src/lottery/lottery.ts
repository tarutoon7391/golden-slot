import type { ActiveFlags, BonusDupRole, BonusRole, LotteryResult, LotteryRowKey, LotteryTable, SmallRole } from '../shared/types.ts';
import type { Rng } from '../shared/rng.ts';
import { BONUS_ROLES, ROLES } from '../config/roles.ts';

/**
 * 内部抽選
 *
 * - テーブルの行を上から順に重みぶん積み上げ、乱数（0〜denom-1）がどこに落ちたかで役を決める
 * - 行に無いぶんはハズレ
 * - ボーナスは持ち越す。持ち越し中に新たなボーナスを引いても無視する（小役の重複分は有効）
 * - 持ち越し中は小役優先（ActiveFlags で small が null でない限り、リール制御は小役を引き込む）
 * - リーチ目役（REACH_A / REACH_B）はボーナス当選ゲームの重複行だけにある（持ち越し中は抽選しない）
 */

/** ボーナスに重複しうる役 */
export const BONUS_DUP_ROLES: readonly BonusDupRole[] = ['CHERRY', 'MELON', 'REACH_A', 'REACH_B'];

/** 役名の一覧（表示用） */
export const SMALL_ROLES: readonly SmallRole[] = ['BELL', 'MELON', 'CHERRY', 'REPLAY', 'REACH_A', 'REACH_B'];
export { BONUS_ROLES };

/** ボーナス kind の行（単独＋重複） */
export function bonusRowsOf(kind: BonusRole): LotteryRowKey[] {
  return [kind, ...BONUS_DUP_ROLES.map((d): LotteryRowKey => `${kind}_${d}`)];
}

/** 行の順序。乱数の積み上げ順なので変えるとシード再現が崩れる */
export const ROW_KEYS: readonly LotteryRowKey[] = [...BONUS_ROLES.flatMap(bonusRowsOf), 'BELL', 'MELON', 'CHERRY', 'REPLAY'];

/** 行キー → 当選内容（表） */
const ROW_RESULTS: Record<LotteryRowKey | 'NONE', LotteryResult> = (() => {
  const out = { NONE: { small: null, bonus: null } } as Record<LotteryRowKey | 'NONE', LotteryResult>;
  for (const kind of BONUS_ROLES) {
    out[kind] = { small: null, bonus: kind };
    for (const d of BONUS_DUP_ROLES) out[`${kind}_${d}`] = { small: d, bonus: kind };
  }
  for (const s of ['BELL', 'MELON', 'CHERRY', 'REPLAY'] as const) out[s] = { small: s, bonus: null };
  return out;
})();

/** 行キー → 当選内容 */
export function rowToResult(key: LotteryRowKey | 'NONE'): LotteryResult {
  return { ...ROW_RESULTS[key] };
}

/** 行キーの表示名（例: BIG7+チェリー） */
export const ROW_LABELS: Record<LotteryRowKey | 'NONE', string> = (() => {
  const out = { NONE: 'ハズレ' } as Record<LotteryRowKey | 'NONE', string>;
  for (const key of ROW_KEYS) {
    const r = ROW_RESULTS[key];
    out[key] = r.bonus ? `${ROLES[r.bonus].label}${r.small ? `+${ROLES[r.small].label}` : '単独'}` : ROLES[r.small!].label;
  }
  return out;
})();

/** テーブル内で、そのボーナスが当選する重みの合計（単独＋重複） */
export function bonusWeightOf(table: LotteryTable, kind: BonusRole): number {
  return bonusRowsOf(kind).reduce((a, k) => a + table.weights[k], 0);
}

/** テーブル内で、その小役が当選する重みの合計（単独＋ボーナス重複） */
export function smallWeightOf(table: LotteryTable, role: SmallRole): number {
  return ROW_KEYS.reduce((a, k) => a + (ROW_RESULTS[k].small === role ? table.weights[k] : 0), 0);
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
 * 小役（リプレイ・リーチ目役含む）が当選しているゲームでは、ボーナス成立中でも小役を引き込む。
 * ボーナス図柄を揃えられるのは小役なし（ハズレ）のゲームだけ。
 */
export function smallHasPriority(flags: ActiveFlags): boolean {
  return flags.small !== null;
}

/** このゲームでボーナス図柄を狙えるか */
export function canAlignBonus(flags: ActiveFlags): flags is ActiveFlags & { bonus: BonusRole } {
  return flags.bonus !== null && !smallHasPriority(flags);
}
