import { describe, expect, it } from 'vitest';
import { LINES } from '../src/config/lines.ts';
import { MAX_PAYOUT_PER_GAME, ROLES, WIN_PATTERNS, BONUS_SPECS, patternsOf } from '../src/config/roles.ts';
import { NORMAL_TABLES, BONUS_TABLE, SETTING_WEIGHTS, tableFor } from '../src/config/probability.ts';
import { REACHME } from '../src/config/reachme.ts';
import { EFFECTS } from '../src/config/effects.ts';
import { SYMBOLS, SYMBOL_IDS } from '../src/config/symbols.ts';
import type { LotteryRowKey, LotteryTable, Setting } from '../src/shared/types.ts';

const SETTINGS: Setting[] = [1, 2, 3, 4, 5, 6];

function sumWeights(t: LotteryTable): number {
  return Object.values(t.weights).reduce((a, b) => a + b, 0);
}
function bonusWeight(t: LotteryTable, kind: 'BIG' | 'REG'): number {
  const keys: LotteryRowKey[] = kind === 'BIG' ? ['BIG', 'BIG_CHERRY', 'BIG_MELON'] : ['REG', 'REG_CHERRY', 'REG_MELON'];
  return keys.reduce((a, k) => a + t.weights[k], 0);
}

describe('有効ライン', () => {
  it('5 本あり ID が重複しない', () => {
    expect(LINES).toHaveLength(5);
    expect(new Set(LINES.map((l) => l.id)).size).toBe(5);
  });
});

describe('役・入賞形', () => {
  it('入賞形の図柄はすべて定義済みの図柄ID', () => {
    for (const p of WIN_PATTERNS) {
      for (const cell of p.symbols) {
        if (cell) for (const s of cell) expect(SYMBOL_IDS).toContain(s);
      }
    }
  });

  it('BIG は G 揃いと赤7 揃いの 2 形、REG は 赤7・赤7・BAR の 1 形（BAR 揃いは無い）', () => {
    expect(patternsOf('BIG').map((p) => p.id).sort()).toEqual(['BIG_G', 'BIG_SEVEN']);
    expect(patternsOf('REG').map((p) => p.id)).toEqual(['REG_77BAR']);
    expect(patternsOf('REG')[0].symbols).toEqual([['seven'], ['seven'], ['bar']]);
  });

  it('スイカは 3 つ揃いと代用（左スイカ・中スイカ・右BAR）の 2 形', () => {
    const ids = patternsOf('MELON').map((p) => p.id).sort();
    expect(ids).toEqual(['MELON', 'MELON_BAR']);
    const bar = WIN_PATTERNS.find((p) => p.id === 'MELON_BAR')!;
    expect(bar.symbols).toEqual([['melon'], ['melon'], ['bar']]);
  });

  it('チェリーは左リールだけを見る。角と中段で段が分かれている', () => {
    const cherries = patternsOf('CHERRY');
    expect(cherries.every((p) => p.scope === 'leftReel')).toBe(true);
    const rows = cherries.flatMap((p) => p.leftRows ?? []).sort();
    expect(rows).toEqual([0, 1, 2]);
  });

  it('払い出しは 1 ゲーム上限以下', () => {
    for (const r of Object.values(ROLES)) {
      expect(r.payout).toBeLessThanOrEqual(MAX_PAYOUT_PER_GAME);
      if (r.payoutInBonus !== undefined) expect(r.payoutInBonus).toBeLessThanOrEqual(MAX_PAYOUT_PER_GAME);
    }
    for (const p of WIN_PATTERNS) if (p.payout !== undefined) expect(p.payout).toBeLessThanOrEqual(MAX_PAYOUT_PER_GAME);
  });

  it('リプレイだけが isReplay', () => {
    expect(Object.values(ROLES).filter((r) => r.isReplay).map((r) => r.role)).toEqual(['REPLAY']);
  });

  it('ボーナスの規定枚数は BIG > REG', () => {
    expect(BONUS_SPECS.BIG.maxPayout).toBeGreaterThan(BONUS_SPECS.REG.maxPayout);
  });
});

describe('確率テーブル', () => {
  it('設定 1〜6 がすべて定義されている', () => {
    for (const s of SETTINGS) expect(NORMAL_TABLES[s]).toBeDefined();
  });

  it('重みはすべて非負の整数で、合計が分母を超えない（残りがハズレ）', () => {
    for (const t of [...SETTINGS.map((s) => NORMAL_TABLES[s]), BONUS_TABLE]) {
      expect(Number.isInteger(t.denom)).toBe(true);
      for (const w of Object.values(t.weights)) {
        expect(Number.isInteger(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
      }
      expect(sumWeights(t)).toBeLessThanOrEqual(t.denom);
    }
  });

  it('BIG・REG・ベルの確率は設定が上がるほど高い（単調増加）', () => {
    for (let i = 1; i < SETTINGS.length; i++) {
      const lo = NORMAL_TABLES[SETTINGS[i - 1]];
      const hi = NORMAL_TABLES[SETTINGS[i]];
      expect(bonusWeight(hi, 'BIG')).toBeGreaterThan(bonusWeight(lo, 'BIG'));
      expect(bonusWeight(hi, 'REG')).toBeGreaterThan(bonusWeight(lo, 'REG'));
      expect(hi.weights.BELL).toBeGreaterThanOrEqual(lo.weights.BELL);
    }
  });

  it('ボーナス中はボーナス・リプレイを抽選しない', () => {
    expect(bonusWeight(BONUS_TABLE, 'BIG')).toBe(0);
    expect(bonusWeight(BONUS_TABLE, 'REG')).toBe(0);
    expect(BONUS_TABLE.weights.REPLAY).toBe(0);
    expect(tableFor('big', 1)).toBe(BONUS_TABLE);
    expect(tableFor('normal', 3)).toBe(NORMAL_TABLES[3]);
  });

  it('設定選択の重みは全設定ぶんあり正の値', () => {
    for (const s of SETTINGS) expect(SETTING_WEIGHTS[s]).toBeGreaterThan(0);
  });
});

describe('リーチ目・演出・図柄', () => {
  it('リーチ目テーブルは初期状態で空（器だけ）', () => {
    expect(REACHME).toEqual([]);
  });

  it('演出テーブルは全状況に重みがあり、合計が正', () => {
    for (const w of Object.values(EFFECTS.leverSound)) {
      const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('図柄 7 種すべてに画像パスがある', () => {
    expect(SYMBOL_IDS).toHaveLength(7);
    for (const id of SYMBOL_IDS) expect(SYMBOLS[id].imagePath).toMatch(/^\/symbols\/.+\.(svg|png)$/);
  });
});
