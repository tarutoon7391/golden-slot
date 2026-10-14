import type { BonusRole, GameMode, LotteryRowKey, LotteryTable, Setting } from '../shared/types.ts';

/**
 * 確率テーブル（設定 1〜6）
 *
 * 分母は 65536 の整数。各行の重みも整数。行に無いぶん（65536 − 合計）がハズレ。
 * 確率 = 重み / 65536。例: 128 → 1/512
 *
 * ボーナスは 3 種（BIG7 / BIGG / REG）。
 * - BIG7 は設定差なし、BIGG・REG に設定差（REG が最大）
 * - 各ボーナスの当選は「単独・チェリー重複・スイカ重複・リーチ目役A重複・リーチ目役B重複」に分かれる。
 *   その内訳は BONUS_SPLIT の比率で決める（合計が BONUS_TOTAL の値になるよう単独行で調整）
 * 設定ごとの機械割はシミュレーター（npm run sim）で確認する（設定1 ≈ 97〜98% 〜 設定6 ≈ 108〜110%）。
 */
export const LOTTERY_DENOM = 65536;

/** 各ボーナスの当選重み（単独＋重複の合計）。128 = 1/512 */
export const BONUS_TOTAL: Record<BonusRole, Record<Setting, number>> = {
  BIG7: { 1: 128, 2: 128, 3: 128, 4: 128, 5: 128, 6: 128 },
  BIGG: { 1: 128, 2: 135, 3: 145, 4: 155, 5: 168, 6: 180 },
  REG: { 1: 128, 2: 140, 3: 152, 4: 168, 5: 192, 6: 218 },
};

/** ボーナス当選のうち、重複になる割合（残りが単独） */
export const BONUS_SPLIT = { CHERRY: 0.22, MELON: 0.13, REACH_A: 0.05, REACH_B: 0.05 } as const;

/** 小役の重み（設定差があるのはベルだけ） */
export const SMALL_WEIGHTS: Record<Setting, Record<'BELL' | 'MELON' | 'CHERRY' | 'REPLAY', number>> = {
  1: { BELL: 9300, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  2: { BELL: 9300, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  3: { BELL: 9350, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  4: { BELL: 9400, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  5: { BELL: 9500, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  6: { BELL: 9750, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
};

/** ボーナス 1 種ぶんの行（単独＋重複 4 行）を合計 total になるよう作る */
export function bonusRows(kind: BonusRole, total: number): Partial<Record<LotteryRowKey, number>> {
  const cherry = Math.round(total * BONUS_SPLIT.CHERRY);
  const melon = Math.round(total * BONUS_SPLIT.MELON);
  const reachA = Math.round(total * BONUS_SPLIT.REACH_A);
  const reachB = Math.round(total * BONUS_SPLIT.REACH_B);
  return {
    [kind]: total - cherry - melon - reachA - reachB,
    [`${kind}_CHERRY`]: cherry,
    [`${kind}_MELON`]: melon,
    [`${kind}_REACH_A`]: reachA,
    [`${kind}_REACH_B`]: reachB,
  };
}

function normalTable(setting: Setting): LotteryTable {
  return {
    denom: LOTTERY_DENOM,
    weights: {
      ...bonusRows('BIG7', BONUS_TOTAL.BIG7[setting]),
      ...bonusRows('BIGG', BONUS_TOTAL.BIGG[setting]),
      ...bonusRows('REG', BONUS_TOTAL.REG[setting]),
      ...SMALL_WEIGHTS[setting],
    } as Record<LotteryRowKey, number>,
  };
}

/** 通常時の抽選テーブル（設定別） */
export const NORMAL_TABLES: Record<Setting, LotteryTable> = {
  1: normalTable(1),
  2: normalTable(2),
  3: normalTable(3),
  4: normalTable(4),
  5: normalTable(5),
  6: normalTable(6),
};

/**
 * ボーナス中の抽選テーブル（設定共通）
 * ほぼ毎ゲームベル（15 枚）。ボーナスとリプレイは抽選しない。
 */
export const BONUS_TABLE: LotteryTable = {
  denom: LOTTERY_DENOM,
  weights: {
    ...bonusRows('BIG7', 0),
    ...bonusRows('BIGG', 0),
    ...bonusRows('REG', 0),
    BELL: 61000,
    MELON: 2500,
    CHERRY: 1500,
    REPLAY: 0,
  } as Record<LotteryRowKey, number>,
};

/** モードと設定から使うテーブルを返す */
export function tableFor(mode: GameMode, setting: Setting): LotteryTable {
  return mode === 'normal' ? NORMAL_TABLES[setting] : BONUS_TABLE;
}

/**
 * ゲーム開始時に設定を選ぶ重み（非公開）。
 * 低設定が多め。合計は任意（比率で選ぶ）。
 */
export const SETTING_WEIGHTS: Record<Setting, number> = { 1: 30, 2: 25, 3: 20, 4: 12, 5: 8, 6: 5 };

/** 重みを 1/x 表記にする（表示用） */
export function oneOver(table: LotteryTable, weight: number): string {
  return weight === 0 ? '-' : `1/${(table.denom / weight).toFixed(1)}`;
}
