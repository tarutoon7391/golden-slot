import type { Counters, LotteryTable, Setting } from '../shared/types.ts';
import { NORMAL_TABLES } from '../config/probability.ts';
import { ALL_SETTINGS } from '../lottery/setting.ts';

/**
 * データからの設定推測
 * 通常時のゲーム数に対する BIG・REG・ベルの回数から、各設定の尤度を二項分布で求めて正規化する。
 * 事前分布は一様（「データだけから見るとどう見えるか」を出すため、SETTING_WEIGHTS は使わない）。
 */

export interface SettingEstimate {
  setting: Setting;
  /** 事後確率（0〜1。全設定で合計 1） */
  probability: number;
}

function bonusWeight(t: LotteryTable, kind: 'BIG' | 'REG'): number {
  return kind === 'BIG'
    ? t.weights.BIG + t.weights.BIG_CHERRY + t.weights.BIG_MELON
    : t.weights.REG + t.weights.REG_CHERRY + t.weights.REG_MELON;
}

/** 二項分布の対数尤度（定数項は省く） */
function logBinom(n: number, k: number, p: number): number {
  if (p <= 0 || p >= 1) return k === 0 ? 0 : -Infinity;
  return k * Math.log(p) + (n - k) * Math.log(1 - p);
}

export function estimateSetting(c: Counters, tables: Record<Setting, LotteryTable> = NORMAL_TABLES): SettingEstimate[] {
  const n = c.normalGames;
  if (n <= 0) return ALL_SETTINGS.map((setting) => ({ setting, probability: 1 / ALL_SETTINGS.length }));

  const logs = ALL_SETTINGS.map((s) => {
    const t = tables[s];
    return (
      logBinom(n, c.bigCount, bonusWeight(t, 'BIG') / t.denom) +
      logBinom(n, c.regCount, bonusWeight(t, 'REG') / t.denom) +
      logBinom(n, c.smallCounts.BELL, t.weights.BELL / t.denom)
    );
  });
  const max = Math.max(...logs);
  const ws = logs.map((l) => Math.exp(l - max));
  const total = ws.reduce((a, b) => a + b, 0);
  return ALL_SETTINGS.map((setting, i) => ({ setting, probability: ws[i] / total }));
}

/** いちばん確率の高い設定 */
export function mostLikelySetting(est: SettingEstimate[]): Setting {
  return est.reduce((a, b) => (b.probability > a.probability ? b : a)).setting;
}

/** 1/x 表記（0 回は '-'） */
export function oneIn(games: number, count: number): string {
  return count === 0 ? '-' : `1/${(games / count).toFixed(1)}`;
}
