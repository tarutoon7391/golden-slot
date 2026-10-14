import { describe, expect, it } from 'vitest';
import { simulate, payoutRate, theoreticalPayout } from '../scripts/sim/simulate.ts';
import { ALL_SETTINGS } from '../src/lottery/setting.ts';

describe('シミュレーター', () => {
  it('同じシードなら同じ結果', () => {
    const a = simulate(1, 20000, 123);
    const b = simulate(1, 20000, 123);
    expect(a).toEqual(b);
  });

  it('理論払い出し: ベルは通常 8 枚・ボーナス中 15 枚、チェリーは角 4 枚', () => {
    expect(theoreticalPayout('BELL', 'normal')).toBe(8);
    expect(theoreticalPayout('BELL', 'big')).toBe(15);
    expect(theoreticalPayout('CHERRY', 'normal')).toBe(4);
    expect(theoreticalPayout('REPLAY', 'normal')).toBe(0);
  });

  it('機械割は設定1 ≈ 97% 〜 設定6 ≈ 110% で単調増加（各 50 万 G）', () => {
    const rates = ALL_SETTINGS.map((s) => payoutRate(simulate(s, 500_000, 10 + s)));
    expect(rates[0]).toBeGreaterThan(95.5);
    expect(rates[0]).toBeLessThan(98.5);
    expect(rates[5]).toBeGreaterThan(108.5);
    expect(rates[5]).toBeLessThan(111.5);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });
});
