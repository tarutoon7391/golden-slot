import { describe, expect, it } from 'vitest';
import type { PayoutResult } from '../src/shared/types.ts';
import { createRng } from '../src/shared/rng.ts';
import { EFFECTS } from '../src/config/effects.ts';
import { planLeverEffect, planResultEffect, situationOf } from '../src/effects/plan.ts';
import { actionForKey, KEYS } from '../src/config/keys.ts';
import { FLASH_TABLE } from '../src/config/flashTable.ts';
import { LAMP_ALLOWED_BY_FLASH, LAMP_TABLE } from '../src/config/lampTable.ts';
import { FLASH_IDS } from '../src/config/flashes.ts';
import { decideEffects, effectStateKey, lampRowFor, pickPercent, rowTotal } from '../src/effects/decideEffects.ts';
import { simulate } from '../src/sim/simulate.ts';
import { bonusRate, effectSummaryRows } from '../src/sim/effectStats.ts';
import type { EffectStateKey } from '../src/shared/types.ts';

const NO_PAYOUT: PayoutResult = { hits: [], totalPayout: 0, replay: false, bonusHit: null };

describe('演出計画', () => {
  it('状況の判定: 新規ボーナス > 持ち越し > 小役 > ハズレ', () => {
    expect(situationOf({ small: 'CHERRY', bonus: 'BIG7' }, null)).toBe('bonusNew');
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
    const p = planResultEffect(null, { ...NO_PAYOUT, bonusHit: 'REG' }, null);
    expect(p.flash).toBe(EFFECTS.bonusConfirmFlash);
    expect(p.lamp).toBe('on');
    expect(p.bgm).toBe(EFFECTS.bgm.REG);
  });

  it('ボーナス中は BGM が鳴り続け、通常時のハズレは何も無い', () => {
    expect(planResultEffect(null, NO_PAYOUT, 'BIG7').bgm).toBe('big');
    expect(planResultEffect(null, NO_PAYOUT, 'BIGG').bgm).toBe('big');
    expect(planResultEffect(null, NO_PAYOUT, 'REG').bgm).toBe('reg');
    const none = planResultEffect(null, NO_PAYOUT, null);
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

describe('演出の抽選（フェーズ8c・演出仕様 §2）', () => {
  const KEYS10: EffectStateKey[] = ['N/none', 'N/REPLAY', 'N/BELL', 'N/MELON', 'N/CHERRY', 'B/none', 'B/REPLAY', 'B/BELL', 'B/MELON', 'B/CHERRY'];

  it('表は 10 行そろっていて、各行の合計は 100% 以下。ハズレ（N/none）は空', () => {
    for (const k of KEYS10) {
      expect(rowTotal(FLASH_TABLE[k]), k).toBeLessThanOrEqual(100);
      expect(rowTotal(LAMP_TABLE[k]), k).toBeLessThanOrEqual(100);
      for (const v of [...Object.values(FLASH_TABLE[k]), ...Object.values(LAMP_TABLE[k])]) expect(v).toBeGreaterThan(0);
    }
    expect(FLASH_TABLE['N/none']).toEqual({});
    expect(LAMP_TABLE['N/none']).toEqual({});
    for (const id of FLASH_IDS) expect(LAMP_ALLOWED_BY_FLASH[id].length).toBeGreaterThan(0);
    // 仕様の代表値
    expect(FLASH_TABLE['N/MELON'].CMEL).toBe(6.7);
    expect(LAMP_TABLE['B/MELON'][3]).toBe(6);
    expect(rowTotal(FLASH_TABLE['B/none'])).toBeCloseTo(41.5);
  });

  it('行キー: ボーナスフラグで N/B、リーチ目役は none 扱い', () => {
    expect(effectStateKey('MELON', null)).toBe('N/MELON');
    expect(effectStateKey('MELON', 'BIG7')).toBe('B/MELON');
    expect(effectStateKey(null, 'REG')).toBe('B/none');
    expect(effectStateKey('REACH_A', 'BIGG')).toBe('B/none');
    expect(effectStateKey(null, null)).toBe('N/none');
  });

  it('pickPercent: 累積で引く。残りは null', () => {
    const row = { A: 10, B: 20 };
    expect(pickPercent(row, 0)).toBe('A');
    expect(pickPercent(row, 0.0999)).toBe('A');
    expect(pickPercent(row, 0.1)).toBe('B');
    expect(pickPercent(row, 0.2999)).toBe('B');
    expect(pickPercent(row, 0.3)).toBeNull();
    expect(pickPercent({ 1: 50, 3: 10 }, 0.55)).toBe(3);
    expect(pickPercent({}, 0)).toBeNull();
  });

  it('B/none の整合（§2.4）: フラッシュで許される点灯数に絞り、合計 33% は変えない', () => {
    expect(lampRowFor('B/none', null)).toEqual(LAMP_TABLE['B/none']);
    expect(lampRowFor('B/none', 'BELL')).toEqual({ 1: 33 });
    const cher = lampRowFor('B/none', 'CHER');
    expect(Object.keys(cher).map(Number).sort()).toEqual([1, 3]);
    expect(rowTotal(cher)).toBeCloseTo(33);
    expect(cher[1]! / cher[3]!).toBeCloseTo(9 / 14);
    expect(lampRowFor('B/none', 'MEL')).toEqual(LAMP_TABLE['B/none']);
    // 他の行はそのまま
    expect(lampRowFor('N/MELON', 'BELL')).toEqual(LAMP_TABLE['N/MELON']);
  });

  it('ボーナス中とハズレでは何も出ない。N/スイカ は表のとおりの割合で出る', () => {
    const rng = createRng(5);
    for (let i = 0; i < 2000; i++) {
      expect(decideEffects({ small: 'BELL', bonus: null, mode: 'big' }, rng)).toEqual({ flash: null, lampPlan: { count: 0 }, key: null });
      const h = decideEffects({ small: null, bonus: null, mode: 'normal' }, rng);
      expect(h.flash).toBeNull();
      expect(h.lampPlan.count).toBe(0);
      expect(h.key).toBe('N/none');
    }
    const n = 40000;
    const flash: Record<string, number> = {};
    const lamp: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < n; i++) {
      const d = decideEffects({ small: 'MELON', bonus: null, mode: 'normal' }, rng);
      expect(d.key).toBe('N/MELON');
      flash[d.flash?.id ?? 'none'] = (flash[d.flash?.id ?? 'none'] ?? 0) + 1;
      lamp[d.lampPlan.count]++;
    }
    expect(flash.MEL / n).toBeCloseTo(0.6, 1);
    expect(flash.CMEL / n).toBeCloseTo(0.067, 1);
    expect(flash.REP ?? 0).toBe(0);
    expect(lamp[2] / n).toBeCloseTo(0.38, 1);
    expect(lamp[3] / n).toBeCloseTo(0.12, 1);
    expect(lamp[1]).toBe(0);
  });

  it('デバッグでフラッシュを指定したときは、点灯数をそのフラッシュに合わせて引く（B/none・BELL なら 1 個か 0 個）', () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const d = decideEffects({ small: null, bonus: 'REG', mode: 'normal' }, rng, { flash: { id: 'BELL' } });
      expect(d.flash).toEqual({ id: 'BELL' });
      expect([0, 1]).toContain(d.lampPlan.count);
      const none = decideEffects({ small: null, bonus: 'REG', mode: 'normal' }, rng, { flash: null });
      expect(none.flash).toBeNull();
    }
  });

  it('理論値シミュレーターで仕様 §2.5 の目安に近い（設定 1・40 万 G）: ハズレで演出 0、スイカF 約 15%、チャンス系 5〜6 割', () => {
    const r = simulate(1, 400_000, 7);
    const e = r.effects;
    expect(e.hazureSignal).toBe(0);
    expect(e.games).toBe(r.normalGames);
    const share = (id: 'REP' | 'BELL' | 'MEL' | 'CHER' | 'CMEL' | 'CCHER') => e.flash[id].bonus / e.flash[id].shown;
    expect(e.games / e.flash.REP.shown).toBeGreaterThan(12);
    expect(e.games / e.flash.REP.shown).toBeLessThan(18);
    expect(share('REP')).toBeLessThan(0.03);
    expect(share('BELL')).toBeLessThan(0.03);
    expect(share('MEL')).toBeGreaterThan(0.1);
    expect(share('MEL')).toBeLessThan(0.22);
    expect(share('CMEL')).toBeGreaterThan(0.45);
    expect(share('CCHER')).toBeGreaterThan(0.4);
    const lamp = (k: 1 | 2 | 3) => e.lampAtLeast[k].bonus / e.lampAtLeast[k].shown;
    expect(lamp(1)).toBeGreaterThan(0.025);
    expect(lamp(1)).toBeLessThan(0.07);
    expect(lamp(3)).toBeGreaterThan(lamp(2));
    expect(lamp(2)).toBeGreaterThan(lamp(1));
    expect(e.bNoneSignal / e.bNoneGames).toBeGreaterThan(0.5);
    expect(bonusRate({ shown: 0, bonus: 0 })).toBe('-');
    expect(effectSummaryRows(e)).toHaveLength(11);
  });
});
