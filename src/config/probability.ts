import type { GameMode, LotteryTable, Setting } from '../shared/types.ts';

/**
 * 確率テーブル（設定 1〜6）
 *
 * 分母は 65536 の整数。各行の重みも整数。行に無いぶん（65536 − 合計）がハズレ。
 * 確率 = 重み / 65536。例: BIG 合計 243 → 約 1/270
 *
 * 設定ごとの機械割はフェーズ2のシミュレーターで調整する（設定1 ≈ 97% 〜 設定6 ≈ 110%）。
 * ボーナス合算・ベルが設定差の主な要素。チェリー・スイカ・リプレイは設定共通。
 */
export const LOTTERY_DENOM = 65536;

/** 通常時の抽選テーブル（設定別） */
export const NORMAL_TABLES: Record<Setting, LotteryTable> = {
  1: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 150, BIG_CHERRY: 60, BIG_MELON: 33, REG: 110, REG_CHERRY: 36, REG_MELON: 18, BELL: 9300, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
  2: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 156, BIG_CHERRY: 62, BIG_MELON: 34, REG: 116, REG_CHERRY: 37, REG_MELON: 19, BELL: 9300, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
  3: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 162, BIG_CHERRY: 64, BIG_MELON: 36, REG: 122, REG_CHERRY: 40, REG_MELON: 20, BELL: 9350, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
  4: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 172, BIG_CHERRY: 68, BIG_MELON: 39, REG: 134, REG_CHERRY: 43, REG_MELON: 22, BELL: 9400, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
  5: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 184, BIG_CHERRY: 73, BIG_MELON: 41, REG: 146, REG_CHERRY: 48, REG_MELON: 24, BELL: 9500, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
  6: {
    denom: LOTTERY_DENOM,
    weights: { BIG: 188, BIG_CHERRY: 80, BIG_MELON: 46, REG: 156, REG_CHERRY: 52, REG_MELON: 26, BELL: 9600, MELON: 728, CHERRY: 1456, REPLAY: 8978 },
  },
};

/**
 * ボーナス中の抽選テーブル（設定共通）
 * ほぼ毎ゲームベル（15 枚）。ボーナスとリプレイは抽選しない。
 */
export const BONUS_TABLE: LotteryTable = {
  denom: LOTTERY_DENOM,
  weights: { BIG: 0, BIG_CHERRY: 0, BIG_MELON: 0, REG: 0, REG_CHERRY: 0, REG_MELON: 0, BELL: 61000, MELON: 2500, CHERRY: 1500, REPLAY: 0 },
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

/** テーブルから各行の確率「1/x」表記を作る（デバッグ・README 用） */
export function oneOver(table: LotteryTable, weight: number): string {
  if (weight <= 0) return '-';
  return `1/${(table.denom / weight).toFixed(1)}`;
}
