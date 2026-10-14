import { describe, expect, it } from 'vitest';
import type { EffectPlan, GameState, KomaNo, LotteryResult, ReelIndex } from '../src/shared/types.ts';
import { MACHINE } from '../src/config/machine.ts';
import { BONUS_SPECS } from '../src/config/roles.ts';
import { komaListOf } from '../src/config/reels.ts';
import { decideStop } from '../src/reel/control.ts';
import { applyCarry, toActiveFlags } from '../src/lottery/lottery.ts';
import {
  MS_PER_KOMA,
  canBet,
  canStop,
  createInitialState,
  diffOf,
  gameReducer,
  normalizeRestored,
  payoutDelayMs,
  pushKomaAt,
} from '../src/store/gameReducer.ts';

const NO_EFFECT: EffectPlan = { leverSound: 'none', blackout: false, flash: 'none', lamp: 'none', bgm: 'none' };

/** 1 ゲームを回す（BET → LEVER → 3 停止 → SETTLE）。停止は decideStop の結果をそのまま渡す */
function playGame(s: GameState, lottery: LotteryResult, pushes: readonly [KomaNo, KomaNo, KomaNo], now: number): GameState {
  let st = s.phase === 'idle' ? gameReducer(s, { type: 'BET' }) : s;
  expect(st.phase).toBe('bet');
  const { lottery: lot, carriedBonus } = applyCarry(lottery, st.carriedBonus);
  st = gameReducer(st, { type: 'LEVER', lottery: lot, carriedBonus, effect: NO_EFFECT, now });
  expect(st.phase).toBe('spinning');
  const flags = toActiveFlags(lot, carriedBonus);
  for (const reel of [0, 1, 2] as ReelIndex[]) {
    const result = decideStop({ reel, pushKoma: pushes[reel], stopped: st.positions, flags, mode: st.mode });
    st = gameReducer(st, { type: 'STOP', result, now: st.spinStartAt + MACHINE.reelStartupMs + 100 * (reel + 1) });
  }
  expect(st.phase).toBe('payout');
  return gameReducer(st, { type: 'SETTLE' });
}

describe('ゲーム進行（reducer）', () => {
  const base = createInitialState(3, 1, 0);

  it('初期状態: idle・所持コインは config の値・カウンターは 0', () => {
    expect(base.phase).toBe('idle');
    expect(base.coins).toBe(MACHINE.initialCoins);
    expect(base.counters.totalGames).toBe(0);
    expect(base.setting).toBe(3);
  });

  it('BET で 3 枚減って bet フェーズ。bet 中にもう一度 BET しても変わらない', () => {
    const s = gameReducer(base, { type: 'BET' });
    expect(s.phase).toBe('bet');
    expect(s.coins).toBe(MACHINE.initialCoins - 3);
    expect(s.counters.coinsIn).toBe(3);
    expect(gameReducer(s, { type: 'BET' })).toBe(s);
  });

  it('コインが足りなければ BET できない。REFILL で追加できる（idle のときだけ）', () => {
    const poor = { ...base, coins: 2 };
    expect(canBet(poor)).toBe(false);
    expect(gameReducer(poor, { type: 'BET' })).toBe(poor);
    const refilled = gameReducer(poor, { type: 'REFILL', amount: MACHINE.coinRefill });
    expect(refilled.coins).toBe(2 + MACHINE.coinRefill);
    expect(canBet(refilled)).toBe(true);
    const betting = gameReducer(refilled, { type: 'BET' });
    expect(gameReducer(betting, { type: 'REFILL', amount: 100 })).toBe(betting);
  });

  it('LEVER は bet フェーズでしか効かない', () => {
    const s = gameReducer(base, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 0 });
    expect(s).toBe(base);
  });

  it('ウェイト: 前回の回転開始から 4.1 秒経つまで回転開始が遅れる', () => {
    let s = gameReducer(base, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 10000 });
    expect(s.spinStartAt).toBe(10000); // 初回はすぐ回る
    // 1 ゲーム回して次のレバーを 1 秒後に叩く
    const flags = { small: null, bonus: null };
    for (const reel of [0, 1, 2] as ReelIndex[]) {
      const result = decideStop({ reel, pushKoma: 1, stopped: s.positions, flags, mode: 'normal' });
      s = gameReducer(s, { type: 'STOP', result, now: 10500 });
    }
    s = gameReducer(s, { type: 'SETTLE' });
    s = gameReducer(s, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 11000 });
    expect(s.spinStartAt).toBe(10000 + MACHINE.minGameIntervalMs);
    // 回転開始前・開始直後はストップが効かない
    expect(canStop(s, 0, 11000)).toBe(false);
    expect(canStop(s, 0, s.spinStartAt)).toBe(false);
    expect(canStop(s, 0, s.spinStartAt + MACHINE.reelStartupMs)).toBe(true);
  });

  it('押下コマ番号は回転開始位置 + 経過コマ数（21 の次は 1）', () => {
    let s = gameReducer(base, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    expect(s.spinFrom).toEqual([21, 21, 21]);
    expect(pushKomaAt(s, 0, 1000)).toBe(21);
    expect(pushKomaAt(s, 0, 1000 + MS_PER_KOMA * 1.5)).toBe(1);
    expect(pushKomaAt(s, 0, 1000 + MS_PER_KOMA * 21)).toBe(21);
    expect(pushKomaAt(s, 0, 500)).toBe(21); // 開始前は動かない
  });

  it('ハズレ: 払い出し 0・総回転数 +1・ボーナス間 +1・差枚 −3', () => {
    const s = playGame(base, { small: null, bonus: null }, [1, 1, 1], 1000);
    expect(s.phase).toBe('idle');
    expect(s.payout?.totalPayout).toBe(0);
    expect(s.counters.totalGames).toBe(1);
    expect(s.counters.normalGames).toBe(1);
    expect(s.counters.gamesSinceBonus).toBe(1);
    expect(diffOf(s.counters)).toBe(-3);
    expect(s.counters.diffSeries).toEqual([0, -3]);
    expect(s.coins).toBe(MACHINE.initialCoins - 3);
  });

  it('ベル: 順押しなら必ず 8 枚払い出され、小役カウントが増える', () => {
    const s = playGame(base, { small: 'BELL', bonus: null }, [5, 9, 13], 1000);
    expect(s.payout?.totalPayout).toBe(8);
    expect(s.coins).toBe(MACHINE.initialCoins - 3 + 8);
    expect(s.counters.smallCounts.BELL).toBe(1);
    expect(s.counters.coinsOut).toBe(8);
  });

  it('リプレイ: 次ゲームは自動ベット（投入なし）で bet フェーズになる', () => {
    const s = playGame(base, { small: 'REPLAY', bonus: null }, [3, 7, 11], 1000);
    expect(s.payout?.replay).toBe(true);
    expect(s.phase).toBe('bet');
    expect(s.replayBet).toBe(true);
    expect(s.bet).toBe(MACHINE.replayBet);
    expect(s.counters.coinsIn).toBe(3); // 2 ゲーム目の投入は無い
    const next = playGame(s, { small: null, bonus: null }, [1, 1, 1], 20000);
    expect(next.counters.coinsIn).toBe(3);
    expect(next.counters.totalGames).toBe(2);
  });

  it('ボーナス: 当選 → 持ち越し → ハズレゲームで揃えると BIG 開始・履歴に記録・ボーナス間がリセット', () => {
    // 当選ゲームは小役なし。G を狙えば揃う（左 G 群 18〜20 番、中 G 14 番、右 G 11 番）
    const gLeft = komaListOf(0, 'g')[0];
    const gMid = komaListOf(1, 'g')[0];
    const gRight = komaListOf(2, 'g')[0];
    let s = playGame(base, { small: null, bonus: null }, [1, 1, 1], 1000); // 1 G 目: ハズレ
    s = playGame(s, { small: null, bonus: 'BIGG' }, [gLeft - 2, gMid - 2, gRight - 2], 20000); // 2 G 目: BIG 当選・G 狙い
    expect(s.payout?.bonusHit).toBe('BIGG');
    expect(s.mode).toBe('big');
    expect(s.bonus).toEqual({ kind: 'BIGG', paidOut: 0 });
    expect(s.carriedBonus).toBeNull();
    expect(s.counters.bigCount).toBe(1);
    expect(s.counters.gamesSinceBonus).toBe(0);
    expect(s.counters.history).toHaveLength(1);
    expect(s.counters.history[0]).toMatchObject({ kind: 'BIGG', gamesSinceLast: 2, totalGamesAt: 2 });
    expect(s.effect?.bgm).toBe('big');
  });

  it('ボーナスを揃えられないゲームでは持ち越す。小役ゲームは小役優先', () => {
    let s = playGame(base, { small: 'BELL', bonus: 'REG' }, [1, 1, 1], 1000);
    expect(s.payout?.totalPayout).toBe(8);
    expect(s.carriedBonus).toBe('REG');
    expect(s.mode).toBe('normal');
    // 持ち越し中に新たな BIG を引いても捨てる
    s = playGame(s, { small: null, bonus: 'BIGG' }, [1, 1, 1], 20000);
    expect(s.carriedBonus).toBe('REG');
  });

  it('ボーナス中: ベルは 15 枚。規定枚数に達したら通常に戻る', () => {
    const bigStart: GameState = { ...base, mode: 'big', bonus: { kind: 'BIGG', paidOut: 0 }, effect: { ...NO_EFFECT, bgm: 'big' } };
    let s = bigStart;
    let games = 0;
    while (s.mode === 'big') {
      s = playGame(s, { small: 'BELL', bonus: null }, [5, 9, 13], 1000 + games * 10000);
      games++;
      expect(s.payout?.totalPayout).toBe(15);
      if (games > 100) throw new Error('ボーナスが終わらない');
    }
    expect(games).toBe(Math.ceil(BONUS_SPECS.BIGG.maxPayout / 15));
    expect(s.bonus).toBeNull();
    expect(s.effect?.bgm).toBe('none');
    // ボーナス中は通常時ゲーム数・ボーナス間回転数に数えない
    expect(s.counters.normalGames).toBe(0);
    expect(s.counters.gamesSinceBonus).toBe(0);
    expect(s.counters.totalGames).toBe(games);
  });

  it('停止は 1 リール 1 回だけ。spinning 以外では無視', () => {
    let s = gameReducer(base, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    const r = decideStop({ reel: 1, pushKoma: 5, stopped: s.positions, flags: { small: null, bonus: null }, mode: 'normal' });
    const once = gameReducer(s, { type: 'STOP', result: r, now: 1500 });
    expect(once.positions[1]).toBe(r.stopKoma);
    expect(once.stopAt[1]).toBe(1500);
    expect(gameReducer(once, { type: 'STOP', result: r, now: 1600 })).toBe(once);
    expect(gameReducer(base, { type: 'STOP', result: r, now: 1600 })).toBe(base);
  });

  it('QUIT は idle / bet のときだけ ended になる', () => {
    expect(gameReducer(base, { type: 'QUIT' }).phase).toBe('ended');
    let s = gameReducer(base, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    expect(gameReducer(s, { type: 'QUIT' })).toBe(s);
  });

  it('NEW_GAME は設定・シードを入れ替えて初期化する', () => {
    const played = playGame(base, { small: 'BELL', bonus: null }, [5, 9, 13], 1000);
    const fresh = gameReducer(played, { type: 'NEW_GAME', setting: 6, seed: 99, now: 0 });
    expect(fresh.setting).toBe(6);
    expect(fresh.seed).toBe(99);
    expect(fresh.counters.totalGames).toBe(0);
    expect(fresh.coins).toBe(MACHINE.initialCoins);
  });

  it('払い出し表示時間は枚数に比例する', () => {
    const s = playGame(base, { small: 'BELL', bonus: null }, [5, 9, 13], 1000);
    expect(payoutDelayMs(s.payout)).toBe(MACHINE.payoutBaseMs + 8 * MACHINE.payoutPerCoinMs);
    expect(payoutDelayMs(null)).toBe(MACHINE.payoutBaseMs);
  });

  it('差枚数の推移は上限を超えると間引かれて記録間隔が倍になる', () => {
    let s: GameState = { ...base, coins: 1_000_000 }; // コイン切れでベットできなくならないよう多めに持たせる
    const games = MACHINE.diffSeriesMax + 5;
    for (let i = 0; i < games; i++) s = playGame(s, { small: null, bonus: null }, [1, 1, 1], 1000 + i * 10000);
    expect(s.counters.diffSeries.length).toBeLessThanOrEqual(MACHINE.diffSeriesMax);
    expect(s.counters.diffStep).toBe(2);
    expect(s.counters.totalGames).toBe(games);
  });

  it('復元: 回転中なら回転をやり直し、未停止リールの stopAt は消える', () => {
    let s = gameReducer(base, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    const r = decideStop({ reel: 0, pushKoma: 5, stopped: s.positions, flags: { small: null, bonus: null }, mode: 'normal' });
    s = gameReducer(s, { type: 'STOP', result: r, now: 1500 });
    const restored = normalizeRestored(s, 99999);
    expect(restored.spinStartAt).toBe(99999);
    expect(restored.positions[0]).toBe(r.stopKoma);
    expect(restored.stopAt).toEqual([1500, null, null]);
    const idle = normalizeRestored({ ...base, lastLeverAt: 5 }, 99999);
    expect(idle.lastLeverAt).toBe(-Infinity);
  });
});
