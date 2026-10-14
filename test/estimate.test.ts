import { describe, expect, it } from 'vitest';
import { NORMAL_TABLES } from '../src/config/probability.ts';
import { emptyCounters } from '../src/store/gameReducer.ts';
import { estimateSetting, mostLikelySetting, oneIn } from '../src/store/estimate.ts';

describe('設定推測', () => {
  it('データが無ければ全設定が同じ確率', () => {
    const est = estimateSetting(emptyCounters());
    for (const e of est) expect(e.probability).toBeCloseTo(1 / 6, 6);
  });

  it('設定 6 の理論値どおりの回数なら設定 6 がいちばん高い（10 万 G）', () => {
    const t = NORMAL_TABLES[6];
    const n = 100000;
    const c = emptyCounters();
    c.normalGames = n;
    c.bigCount = Math.round((n * (t.weights.BIG + t.weights.BIG_CHERRY + t.weights.BIG_MELON)) / t.denom);
    c.regCount = Math.round((n * (t.weights.REG + t.weights.REG_CHERRY + t.weights.REG_MELON)) / t.denom);
    c.smallCounts.BELL = Math.round((n * t.weights.BELL) / t.denom);
    const est = estimateSetting(c);
    expect(mostLikelySetting(est)).toBe(6);
    expect(est.reduce((a, e) => a + e.probability, 0)).toBeCloseTo(1, 6);
  });

  it('設定 1 の理論値どおりなら設定 1', () => {
    const t = NORMAL_TABLES[1];
    const n = 100000;
    const c = emptyCounters();
    c.normalGames = n;
    c.bigCount = Math.round((n * (t.weights.BIG + t.weights.BIG_CHERRY + t.weights.BIG_MELON)) / t.denom);
    c.regCount = Math.round((n * (t.weights.REG + t.weights.REG_CHERRY + t.weights.REG_MELON)) / t.denom);
    c.smallCounts.BELL = Math.round((n * t.weights.BELL) / t.denom);
    expect(mostLikelySetting(estimateSetting(c))).toBe(1);
  });

  it('oneIn は 1/x 表記。0 回は -', () => {
    expect(oneIn(1000, 4)).toBe('1/250.0');
    expect(oneIn(1000, 0)).toBe('-');
  });
});
