import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng.ts';
import { NORMAL_TABLES, BONUS_TABLE, SETTING_WEIGHTS } from '../src/config/probability.ts';
import {
  ROW_KEYS,
  applyCarry,
  canAlignBonus,
  drawLottery,
  rowForRoll,
  rowToResult,
  smallHasPriority,
  toActiveFlags,
} from '../src/lottery/lottery.ts';
import { pickSetting, ALL_SETTINGS } from '../src/lottery/setting.ts';
import type { LotteryRowKey } from '../src/shared/types.ts';

describe('抽選（行の決定）', () => {
  it('乱数値は行の重みを上から積み上げた範囲で判定される', () => {
    const t = NORMAL_TABLES[1];
    let acc = 0;
    for (const key of ROW_KEYS) {
      const w = t.weights[key];
      if (w === 0) continue;
      expect(rowForRoll(t, acc)).toBe(key); // 範囲の先頭
      expect(rowForRoll(t, acc + w - 1)).toBe(key); // 範囲の末尾
      acc += w;
    }
    expect(rowForRoll(t, acc)).toBe('NONE'); // 残りはハズレ
    expect(rowForRoll(t, t.denom - 1)).toBe('NONE');
  });

  it('行キー → 当選内容（重複は小役とボーナスの両方を持つ）', () => {
    expect(rowToResult('BIG')).toEqual({ small: null, bonus: 'BIG' });
    expect(rowToResult('BIG_CHERRY')).toEqual({ small: 'CHERRY', bonus: 'BIG' });
    expect(rowToResult('REG_MELON')).toEqual({ small: 'MELON', bonus: 'REG' });
    expect(rowToResult('BELL')).toEqual({ small: 'BELL', bonus: null });
    expect(rowToResult('NONE')).toEqual({ small: null, bonus: null });
  });

  it('シード固定で同じ結果が再現できる', () => {
    const t = NORMAL_TABLES[3];
    const a = createRng(2024);
    const b = createRng(2024);
    for (let i = 0; i < 1000; i++) {
      expect(drawLottery(t, a)).toEqual(drawLottery(t, b));
    }
  });

  it('出現率がテーブルの重みにおおむね一致する（設定1・100万G）', () => {
    const t = NORMAL_TABLES[1];
    const rng = createRng(5);
    const n = 1_000_000;
    const counts = Object.fromEntries([...ROW_KEYS, 'NONE'].map((k) => [k, 0])) as Record<LotteryRowKey | 'NONE', number>;
    for (let i = 0; i < n; i++) counts[rowForRoll(t, rng.nextInt(t.denom))]++;
    // 頻度の高い行は ±5%、低い行は ±20% を許容
    for (const key of ROW_KEYS) {
      const expected = (t.weights[key] / t.denom) * n;
      const tolerance = expected > 10000 ? 0.05 : 0.2;
      expect(Math.abs(counts[key] - expected) / expected).toBeLessThan(tolerance);
    }
  });

  it('ボーナス中テーブルはボーナス・リプレイを引かない', () => {
    const rng = createRng(9);
    for (let i = 0; i < 100000; i++) {
      const r = drawLottery(BONUS_TABLE, rng);
      expect(r.bonus).toBeNull();
      expect(r.small).not.toBe('REPLAY');
    }
  });
});

describe('持ち越しと小役優先', () => {
  it('新規ボーナス当選は持ち越しに積まれる', () => {
    const { lottery, carriedBonus } = applyCarry({ small: null, bonus: 'BIG' }, null);
    expect(carriedBonus).toBe('BIG');
    expect(lottery.bonus).toBe('BIG');
  });

  it('持ち越し中に新たなボーナスを引いても無視し、重複の小役だけ残る', () => {
    const { lottery, carriedBonus } = applyCarry({ small: 'CHERRY', bonus: 'REG' }, 'BIG');
    expect(carriedBonus).toBe('BIG'); // 先に成立していた BIG を維持
    expect(lottery.bonus).toBeNull(); // 新規 REG は捨てる
    expect(lottery.small).toBe('CHERRY'); // チェリーは有効
  });

  it('持ち越し中に小役を引いたら小役優先（ボーナスは揃えられない）', () => {
    const flags = toActiveFlags({ small: 'BELL', bonus: null }, 'BIG');
    expect(flags).toEqual({ small: 'BELL', bonus: 'BIG' });
    expect(smallHasPriority(flags)).toBe(true);
    expect(canAlignBonus(flags)).toBe(false);
  });

  it('持ち越し中のハズレゲームだけボーナスを揃えられる', () => {
    const flags = toActiveFlags({ small: null, bonus: null }, 'REG');
    expect(canAlignBonus(flags)).toBe(true);
  });

  it('重複当選したゲームも小役優先', () => {
    const { lottery, carriedBonus } = applyCarry({ small: 'MELON', bonus: 'BIG' }, null);
    const flags = toActiveFlags(lottery, carriedBonus);
    expect(flags).toEqual({ small: 'MELON', bonus: 'BIG' });
    expect(canAlignBonus(flags)).toBe(false);
  });

  it('何も成立していなければ揃えるものはない', () => {
    const flags = toActiveFlags({ small: null, bonus: null }, null);
    expect(smallHasPriority(flags)).toBe(false);
    expect(canAlignBonus(flags)).toBe(false);
  });
});

describe('設定選択', () => {
  it('重みに比例して設定が選ばれる', () => {
    const rng = createRng(77);
    const n = 600_000;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (let i = 0; i < n; i++) counts[pickSetting(rng)]++;
    const total = ALL_SETTINGS.reduce((a, s) => a + SETTING_WEIGHTS[s], 0);
    for (const s of ALL_SETTINGS) {
      expect(counts[s] / n).toBeCloseTo(SETTING_WEIGHTS[s] / total, 2);
    }
  });
});
