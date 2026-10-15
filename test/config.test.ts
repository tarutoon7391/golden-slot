import { describe, expect, it } from 'vitest';
import { LINES } from '../src/config/lines.ts';
import { MAX_PAYOUT_PER_GAME, ROLES, WIN_PATTERNS, BONUS_SPECS, patternsOf } from '../src/config/roles.ts';
import { NORMAL_TABLES, BONUS_TABLE, BONUS_TOTAL, SETTING_WEIGHTS, tableFor } from '../src/config/probability.ts';
import { REACHME } from '../src/config/reachme.ts';
import { EFFECTS } from '../src/config/effects.ts';
import { FLASHES, FLASH_IDS, flashCellDelays, flashTotalMs } from '../src/config/flashes.ts';
import { SYMBOLS, SYMBOL_IDS } from '../src/config/symbols.ts';
import type { LotteryTable, Setting } from '../src/shared/types.ts';
import { ROW_KEYS, bonusWeightOf } from '../src/lottery/lottery.ts';

const SETTINGS: Setting[] = [1, 2, 3, 4, 5, 6];

function sumWeights(t: LotteryTable): number {
  return Object.values(t.weights).reduce((a, b) => a + b, 0);
}
function bonusWeight(t: LotteryTable, kind: 'BIG' | 'REG'): number {
  return kind === 'BIG' ? bonusWeightOf(t, 'BIG7') + bonusWeightOf(t, 'BIGG') : bonusWeightOf(t, 'REG');
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

  it('BIG7 は赤7 揃い、BIGG は G 揃い、REG は 赤7・赤7・BAR（下段・右上がり・右下がりのみ）', () => {
    expect(patternsOf('BIG7').map((p) => p.id)).toEqual(['BIG7_SEVEN']);
    expect(patternsOf('BIGG').map((p) => p.id)).toEqual(['BIGG_G']);
    expect(patternsOf('REG').map((p) => p.id)).toEqual(['REG_77BAR']);
    expect(patternsOf('REG')[0].symbols).toEqual([['seven'], ['seven'], ['bar']]);
    expect([...patternsOf('REG')[0].lines!]).toEqual(['downRight']);
  });

  it('リーチ目役は配当 0 の小役。A は上段 BAR 揃い（窓全体）、B は左中段チェリー', () => {
    expect(ROLES.REACH_A.payout).toBe(0);
    expect(ROLES.REACH_B.payout).toBe(0);
    const a = patternsOf('REACH_A')[0];
    expect(a.scope).toBe('window');
    expect(a.cells!.map((c) => c[0])).toEqual(['bar', 'bar', 'bar']);
    const b = patternsOf('REACH_B')[0];
    expect(b.scope).toBe('leftReel');
    expect(b.leftRows).toEqual([1]);
  });

  it('スイカは 3 つ揃いと代用（左スイカ・中スイカ・右BAR）の 2 形', () => {
    const ids = patternsOf('MELON').map((p) => p.id).sort();
    expect(ids).toEqual(['MELON', 'MELON_BAR']);
    const bar = WIN_PATTERNS.find((p) => p.id === 'MELON_BAR')!;
    expect(bar.symbols).toEqual([['melon'], ['melon'], ['bar']]);
  });

  it('チェリーは左リールの角（上段・下段）だけ。中段は入賞しない', () => {
    const cherries = patternsOf('CHERRY');
    expect(cherries.every((p) => p.scope === 'leftReel')).toBe(true);
    const rows = cherries.flatMap((p) => p.leftRows ?? []).sort();
    expect(rows).toEqual([0, 2]);
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

  it('ボーナスの規定枚数は BIG7 = BIGG > REG', () => {
    expect(BONUS_SPECS.BIG7.maxPayout).toBe(BONUS_SPECS.BIGG.maxPayout);
    expect(BONUS_SPECS.BIG7.maxPayout).toBeGreaterThan(BONUS_SPECS.REG.maxPayout);
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

  it('BIG7 は設定差なし。BIGG・REG・ベルは設定が上がるほど高い', () => {
    for (let i = 1; i < SETTINGS.length; i++) {
      const lo = NORMAL_TABLES[SETTINGS[i - 1]];
      const hi = NORMAL_TABLES[SETTINGS[i]];
      expect(bonusWeightOf(hi, 'BIG7')).toBe(bonusWeightOf(lo, 'BIG7'));
      expect(bonusWeightOf(hi, 'BIGG')).toBeGreaterThan(bonusWeightOf(lo, 'BIGG'));
      expect(bonusWeightOf(hi, 'REG')).toBeGreaterThan(bonusWeightOf(lo, 'REG'));
      expect(hi.weights.BELL).toBeGreaterThanOrEqual(lo.weights.BELL);
    }
  });

  it('各ボーナスの行の合計は BONUS_TOTAL どおり。リーチ目役はボーナス重複行にだけある', () => {
    for (const s of SETTINGS) {
      const t = NORMAL_TABLES[s];
      for (const k of ['BIG7', 'BIGG', 'REG'] as const) {
        expect(bonusWeightOf(t, k)).toBe(BONUS_TOTAL[k][s]);
        expect(t.weights[`${k}_REACH_A`]).toBeGreaterThan(0);
        expect(t.weights[`${k}_REACH_B`]).toBeGreaterThan(0);
      }
      expect(Object.keys(t.weights).sort()).toEqual([...ROW_KEYS].sort());
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
  it('リーチ目テーブル: id が一意で、各パターンは少なくとも 1 リールを見る。bonus は BIG7/BIGG/REG のみ', () => {
    expect(REACHME.length).toBeGreaterThan(100);
    const ids = REACHME.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of REACHME) {
      expect(p.reels.some((r) => r !== null), p.id).toBe(true);
      for (const b of p.bonus ?? []) expect(['BIG7', 'BIGG', 'REG']).toContain(b);
      for (const s of p.when?.reels?.[0]?.slip ?? []) expect(s).toBeGreaterThanOrEqual(0);
    }
    // 仕様書 §3 の番号がそろっている
    for (const id of ['R01', 'R02', 'R03', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R12', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07']) {
      expect(ids, id).toContain(id);
    }
    expect(ids.filter((i) => i.startsWith('R04-')).length).toBeGreaterThan(0);
    expect(ids.filter((i) => i.startsWith('R11-'))).toHaveLength(74);
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

describe('リールフラッシュ（config/flashes.ts）', () => {
  it('6 種すべてに定義があり、時間は正、コマは窓の範囲内で 1 回ずつ', () => {
    expect(FLASH_IDS).toHaveLength(6);
    for (const id of FLASH_IDS) {
      const def = FLASHES[id];
      expect(def.id).toBe(id);
      expect(def.durationMs).toBeGreaterThan(0);
      expect(def.cellMs).toBeGreaterThan(0);
      expect(def.steps.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const step of def.steps) {
        expect(step.length).toBeGreaterThan(0);
        for (const [reel, row] of step) {
          expect([0, 1, 2]).toContain(reel);
          expect([0, 1, 2]).toContain(row);
          expect(seen.has(`${reel}-${row}`)).toBe(false);
          seen.add(`${reel}-${row}`);
        }
      }
      expect(flashTotalMs(def)).toBeGreaterThanOrEqual(def.cellMs);
    }
  });

  it('コマごとの光り始めは行優先 9 個。ベルF は中央だけ光らず、チェリーF は左リールの 3 コマだけ', () => {
    const bell = flashCellDelays(FLASHES.BELL);
    expect(bell).toHaveLength(9);
    expect(bell[4]).toBeNull();
    expect(bell.filter((d) => d !== null)).toHaveLength(8);
    expect(bell[0]).toBe(0);
    const cher = flashCellDelays(FLASHES.CHER);
    expect(cher.map((d) => d !== null)).toEqual([true, false, false, true, false, false, true, false, false]);
    expect(cher[0]! < cher[3]! && cher[3]! < cher[6]!).toBe(true);
    // リプレイF は下段 → 上段なので下段が先
    const rep = flashCellDelays(FLASHES.REP);
    expect(rep[6]! < rep[3]! && rep[3]! < rep[0]!).toBe(true);
  });
});
