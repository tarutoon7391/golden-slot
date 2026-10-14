import { describe, expect, it } from 'vitest';
import type { PayoutResult } from '../src/shared/types.ts';
import { createRng } from '../src/shared/rng.ts';
import { EFFECTS } from '../src/config/effects.ts';
import { planLeverEffect, planResultEffect, situationOf } from '../src/effects/plan.ts';
import { actionForKey, KEYS } from '../src/config/keys.ts';

const NO_PAYOUT: PayoutResult = { hits: [], totalPayout: 0, replay: false, bonusHit: null };

describe('演出計画', () => {
  it('状況の判定: 新規ボーナス > 持ち越し > 小役 > ハズレ', () => {
    expect(situationOf({ small: 'CHERRY', bonus: 'BIG' }, null)).toBe('bonusNew');
    expect(situationOf({ small: 'BELL', bonus: null }, 'REG')).toBe('bonusCarry');
    expect(situationOf({ small: 'BELL', bonus: null }, null)).toBe('small');
    expect(situationOf({ small: null, bonus: null }, null)).toBe('none');
  });

  it('レバー予告音は effects.ts の重みに従って選ばれる', () => {
    const rng = createRng(11);
    const n = 20000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const p = planLeverEffect('bonusNew', rng);
      counts[p.leverSound] = (counts[p.leverSound] ?? 0) + 1;
      expect(p.sourceKey).toBe('bonusNew');
      expect(p.flash).toBe('none');
    }
    const w = EFFECTS.leverSound.bonusNew;
    const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0);
    for (const [k, v] of Object.entries(w)) {
      expect((counts[k] ?? 0) / n).toBeCloseTo((v ?? 0) / total, 1);
    }
  });

  it('ボーナス図柄が揃ったらフラッシュと告知ランプ、BGM はそのボーナスのもの', () => {
    const p = planResultEffect(null, { ...NO_PAYOUT, bonusHit: 'REG' }, 'normal');
    expect(p.flash).toBe(EFFECTS.bonusConfirmFlash);
    expect(p.lamp).toBe('on');
    expect(p.bgm).toBe(EFFECTS.bgm.REG);
  });

  it('ボーナス中は BGM が鳴り続け、通常時のハズレは何も無い', () => {
    expect(planResultEffect(null, NO_PAYOUT, 'big').bgm).toBe('big');
    const none = planResultEffect(null, NO_PAYOUT, 'normal');
    expect(none.flash).toBe('none');
    expect(none.bgm).toBe('none');
    expect(none.blackout).toBe(false);
  });
});

describe('キー割り当て', () => {
  it('同じキーが 2 つのアクションに割り当てられていない', () => {
    const all = Object.values(KEYS).flat().map((k) => k.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it('大文字小文字を区別せずに引ける。未割り当ては null', () => {
    expect(actionForKey('Z')).toBe('stopLeft');
    expect(actionForKey('z')).toBe('stopLeft');
    expect(actionForKey('Enter')).toBe('lever');
    expect(actionForKey('F12')).toBeNull();
  });
});
