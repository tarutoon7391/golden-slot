import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { GameState, KomaNo } from '../src/shared/types.ts';
import { normalizeKoma } from '../src/config/reels.ts';
import { decideStop } from '../src/reel/control.ts';
import { MS_PER_KOMA, createInitialState, gameReducer } from '../src/store/gameReducer.ts';
import type { GameApi } from '../src/store/useGame.ts';
import { reelPosAt } from '../src/ui/reelMath.ts';
import { isDebugEnabled } from '../src/debug/debugFlag.ts';
import { DEFAULT_DEBUG_SETTINGS, buildOverrides, type DebugControl } from '../src/debug/useDebugSettings.ts';
import { DebugPanel } from '../src/debug/DebugPanel.tsx';
import { controlPayoutRate, createControlSim, simulateWithControl } from '../src/sim/controlSim.ts';
import { payoutRate, simulate } from '../src/sim/simulate.ts';

const NO_EFFECT = { leverSound: 'none', blackout: false, flash: 'none', lamp: 'none', bgm: 'none' } as const;
const NO_LOTTERY = { small: null, bonus: null } as const;

describe('デバッグモードの判定', () => {
  it('?debug=1 のときだけ有効', () => {
    expect(isDebugEnabled('?debug=1')).toBe(true);
    expect(isDebugEnabled('?x=1&debug=1')).toBe(true);
    expect(isDebugEnabled('?debug=0')).toBe(false);
    expect(isDebugEnabled('')).toBe(false);
    expect(isDebugEnabled()).toBe(false); // location が無い環境
  });
});

describe('デバッグ設定 → GameOverrides', () => {
  const state = createInitialState(1, 1, 0);

  it('当選役の強制は 1 ゲームで解除される（forceEvery が false）', () => {
    let consumed = 0;
    const o = buildOverrides({ ...DEFAULT_DEBUG_SETTINGS, forceKey: 'BIG7_CHERRY' }, () => consumed++);
    expect(o.nextLottery!(state)).toEqual({ small: 'CHERRY', bonus: 'BIG7' });
    expect(consumed).toBe(1);
  });

  it('forceEvery なら解除しない。未指定なら通常抽選（null）', () => {
    let consumed = 0;
    const every = buildOverrides({ ...DEFAULT_DEBUG_SETTINGS, forceKey: 'NONE', forceEvery: true }, () => consumed++);
    expect(every.nextLottery!(state)).toEqual({ small: null, bonus: null });
    expect(consumed).toBe(0);
    const none = buildOverrides(DEFAULT_DEBUG_SETTINGS, () => consumed++);
    expect(none.nextLottery!(state)).toBeNull();
  });

  it('押下位置・設定・スキップがそのまま渡る', () => {
    const o = buildOverrides({ ...DEFAULT_DEBUG_SETTINGS, pushes: [5, null, 21], fixedSetting: 6, skipAnimation: true }, () => {});
    expect(o.pushKoma!(state, 0)).toBe(5);
    expect(o.pushKoma!(state, 1)).toBeNull();
    expect(o.pushKoma!(state, 2)).toBe(21);
    expect(o.fixedSetting!()).toBe(6);
    expect(o.skipDelays!()).toBe(true);
  });
});

describe('reducer のデバッグ用アクション', () => {
  it('LEVER の skipWait でウェイトを飛ばす', () => {
    let s: GameState = { ...createInitialState(1, 1, 0), lastLeverAt: 1000 };
    s = gameReducer(s, { type: 'BET' });
    const waited = gameReducer(s, { type: 'LEVER', lottery: NO_LOTTERY, carriedBonus: null, effect: NO_EFFECT, now: 1500 });
    expect(waited.spinStartAt).toBe(5100);
    const skipped = gameReducer(s, { type: 'LEVER', lottery: NO_LOTTERY, carriedBonus: null, effect: NO_EFFECT, now: 1500, skipWait: true });
    expect(skipped.spinStartAt).toBe(1500);
  });

  it('DEBUG_SET は idle / bet のときだけ設定とシードを変える', () => {
    const s = createInitialState(1, 1, 0);
    const changed = gameReducer(s, { type: 'DEBUG_SET', setting: 6, seed: 99 });
    expect(changed.setting).toBe(6);
    expect(changed.seed).toBe(99);
    expect(gameReducer(s, { type: 'DEBUG_SET', seed: 5 }).setting).toBe(1); // 省略した項目はそのまま
    let spinning = gameReducer(s, { type: 'BET' });
    spinning = gameReducer(spinning, { type: 'LEVER', lottery: NO_LOTTERY, carriedBonus: null, effect: NO_EFFECT, now: 0 });
    expect(gameReducer(spinning, { type: 'DEBUG_SET', setting: 6 })).toBe(spinning);
  });
});

describe('押下位置を差し替えても画面の停止位置は decideStop の結果に合う', () => {
  it('時刻から求めた位置と違うコマで止めても、前方に進んで stopKoma で止まる', () => {
    let s: GameState = createInitialState(1, 1, 0);
    s = gameReducer(s, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: NO_LOTTERY, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    const t = 1000 + MS_PER_KOMA * 3.5; // 時刻からなら 21+3 → コマ 3
    const result = decideStop({ reel: 0, pushKoma: 15, stopped: s.positions, flags: NO_LOTTERY, mode: 'normal' });
    s = gameReducer(s, { type: 'STOP', result, now: t });
    const final = reelPosAt(s, 0, t + 10_000);
    expect(normalizeKoma(final)).toBe(result.stopKoma);
    expect(final).toBeGreaterThanOrEqual(21 + 3); // 逆走しない
    expect(final - (21 + 3)).toBeLessThan(21); // 1 周以内で止まる
  });
});

describe('制御込みシミュレーション', () => {
  it('同じシードなら同じ結果。小刻みに進めても一気に回しても同じ', () => {
    const opts = { setting: 4 as const, games: 3000, seed: 7, pushMode: 'random' as const };
    const a = simulateWithControl(opts);
    const sim = createControlSim(opts);
    while (!sim.step(377)) {
      /* 少しずつ進める */
    }
    expect(sim.result).toEqual(a);
    expect(simulateWithControl(opts)).toEqual(a);
  });

  it('ランダム押し（順押し）: ベル・リプレイは取りこぼさない。スイカ・チェリーは目押し役なので取りこぼす', () => {
    const r = simulateWithControl({ setting: 6, games: 5000, seed: 3, pushMode: 'random' });
    expect(r.lost.BELL).toBe(0);
    expect(r.lost.REPLAY).toBe(0);
    expect(r.lost.MELON).toBeGreaterThan(0);
    expect(r.lost.CHERRY).toBeGreaterThan(0);
    expect(r.won.BELL).toBe(r.drawn.BELL);
    expect(r.bigCount + r.regCount).toBeGreaterThan(0);
    expect(r.normalGames).toBe(5000);
  });

  it('目押しあり: すべての小役を取りこぼさず、ボーナスは成立したゲームか次のハズレで揃う', () => {
    const r = simulateWithControl({ setting: 6, games: 5000, seed: 3, pushMode: 'aim' });
    expect(r.lost).toEqual({ BELL: 0, MELON: 0, CHERRY: 0, REPLAY: 0, REACH_A: 0, REACH_B: 0 });
    const bonus = r.bigCount + r.regCount;
    expect(bonus).toBeGreaterThan(0);
    // 成立ゲームを含めた平均消化 G は小役を引かない限り 1〜2 程度
    expect(r.bonusWaitGames / bonus).toBeLessThan(3);
  });

  it('順押し固定でも同じ。ボーナスは成立後いずれ入賞する', () => {
    const fixedPushes: [KomaNo, KomaNo, KomaNo] = [3, 11, 19];
    const r = simulateWithControl({ setting: 6, games: 5000, seed: 3, pushMode: 'fixed', fixedPushes });
    expect(r.lost.BELL + r.lost.MELON + r.lost.REPLAY + r.lost.CHERRY).toBe(0);
    // 当選したボーナスは終了時点で持ち越し中の 1 件を除いてすべて入賞している
    const drawn = r.bonusDrawn.BIG7 + r.bonusDrawn.BIGG + r.bonusDrawn.REG;
    expect(r.bigCount + r.regCount).toBeLessThanOrEqual(drawn);
    expect(r.bigCount + r.regCount).toBeGreaterThanOrEqual(drawn - 1);
    expect(r.bonusWaitGames).toBeGreaterThanOrEqual(r.bigCount + r.regCount);
  });

  it('目押しありの機械割は理論値に近く、ランダム押しはそれより低い（設定 6・2 万 G・同じシード）', () => {
    const theory = payoutRate(simulate(6, 20_000, 11));
    const aim = controlPayoutRate(simulateWithControl({ setting: 6, games: 20_000, seed: 11, pushMode: 'aim' }));
    const random = controlPayoutRate(simulateWithControl({ setting: 6, games: 20_000, seed: 11, pushMode: 'random' }));
    expect(Math.abs(aim - theory)).toBeLessThan(3);
    expect(random).toBeLessThan(aim - 5);
  });
});

describe('デバッグパネルの描画', () => {
  it('ブラウザなしでも落ちずに各セクションが出る', () => {
    const state = createInitialState(3, 42, 0);
    const noop = () => {};
    const api: GameApi = { state, maxBet: noop, lever: noop, stop: noop, quit: noop, newGame: noop, refill: noop, now: () => 0, debugSet: noop };
    const debug: DebugControl = { settings: DEFAULT_DEBUG_SETTINGS, update: noop, overridesRef: { current: undefined } };
    const html = renderToString(createElement(DebugPanel, { api, debug }));
    expect(html).toContain('設定 <!-- -->3');
    expect(html).toContain('次ゲームの当選役を強制');
    expect(html).toContain('押下位置の指定');
    expect(html).toContain('停止制御の候補');
    expect(html).toContain('制御込みシミュレーション');
    expect(html).toContain("id: &#x27;new-pattern&#x27;");
  });
});
