import type { EffectStateKey, FlashId } from '../shared/types.ts';
import { FLASH_IDS, FLASHES } from '../config/flashes.ts';
import type { EffectDecision } from '../effects/decideEffects.ts';
import type { LitCount } from '../config/lampTable.ts';

/**
 * 演出の集計（シミュレーター用・演出仕様 v1.0 §2.5 の実測）
 * 通常時の各ゲームで「どの演出が出たか」と「そのときボーナスフラグが立っていたか」を数え、
 * 出現頻度（1/xG）と「出た時点でボーナスの割合」を出す。
 */

export interface ShownCount {
  /** 出た回数 */
  shown: number;
  /** そのうちボーナスフラグが立っていた回数 */
  bonus: number;
}

export interface EffectStats {
  /** 通常時のゲーム数 */
  games: number;
  /** 行ごとのゲーム数 */
  byKey: Record<EffectStateKey, number>;
  flash: Record<FlashId, ShownCount>;
  /** 第 k 停止でも点灯（点灯数 ≥ k） */
  lampAtLeast: Record<LitCount, ShownCount>;
  /** B/none のゲーム数と、そのうち何か演出（フラッシュか点灯）が出た回数 */
  bNoneGames: number;
  bNoneSignal: number;
  /** ハズレ（N/none）で演出が出た回数（必ず 0） */
  hazureSignal: number;
}

const KEYS: EffectStateKey[] = ['N/none', 'N/REPLAY', 'N/BELL', 'N/MELON', 'N/CHERRY', 'B/none', 'B/REPLAY', 'B/BELL', 'B/MELON', 'B/CHERRY'];

export function newEffectStats(): EffectStats {
  const sc = (): ShownCount => ({ shown: 0, bonus: 0 });
  return {
    games: 0,
    byKey: Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<EffectStateKey, number>,
    flash: Object.fromEntries(FLASH_IDS.map((id) => [id, sc()])) as Record<FlashId, ShownCount>,
    lampAtLeast: { 1: sc(), 2: sc(), 3: sc() },
    bNoneGames: 0,
    bNoneSignal: 0,
    hazureSignal: 0,
  };
}

/** 通常時の 1 ゲームを記録する */
export function recordEffect(stats: EffectStats, d: EffectDecision, bonusFlag: boolean): void {
  if (!d.key) return;
  stats.games++;
  stats.byKey[d.key]++;
  const signal = d.flash !== null || d.lampPlan.count > 0;
  if (d.key === 'N/none' && signal) stats.hazureSignal++;
  if (d.key === 'B/none') {
    stats.bNoneGames++;
    if (signal) stats.bNoneSignal++;
  }
  if (d.flash) {
    const c = stats.flash[d.flash.id];
    c.shown++;
    if (bonusFlag) c.bonus++;
  }
  for (const k of [1, 2, 3] as const) {
    if (d.lampPlan.count >= k) {
      const c = stats.lampAtLeast[k];
      c.shown++;
      if (bonusFlag) c.bonus++;
    }
  }
}

/** 出現頻度 1/xG */
export function oneInGames(games: number, shown: number): string {
  return shown === 0 ? '-' : `1/${(games / shown).toFixed(0)}G`;
}

/** 出た時点でボーナスの割合（%） */
export function bonusRate(c: ShownCount): string {
  return c.shown === 0 ? '-' : `${((c.bonus / c.shown) * 100).toFixed(1)}%`;
}

/** 表示用の行 [演出, 出現頻度, ボーナス率] */
export function effectSummaryRows(s: EffectStats): [string, string, string][] {
  const rows: [string, string, string][] = FLASH_IDS.map((id) => [FLASHES[id].label, oneInGames(s.games, s.flash[id].shown), bonusRate(s.flash[id])]);
  rows.push(
    ['第1停止で点灯', oneInGames(s.games, s.lampAtLeast[1].shown), bonusRate(s.lampAtLeast[1])],
    ['第2停止でも点灯', oneInGames(s.games, s.lampAtLeast[2].shown), bonusRate(s.lampAtLeast[2])],
    ['第3停止でも点灯', oneInGames(s.games, s.lampAtLeast[3].shown), bonusRate(s.lampAtLeast[3])],
    ['成立後・小役なしGで何か出る', s.bNoneGames === 0 ? '-' : `${((s.bNoneSignal / s.bNoneGames) * 100).toFixed(1)}%`, `（${s.bNoneGames} G）`],
    ['ハズレで演出が出た回数', String(s.hazureSignal), '（必ず 0）'],
  );
  return rows;
}
