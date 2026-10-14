import type { ActiveFlags, BonusRole, GameMode, KomaNo, ReelIndex, Setting, SmallRole, StopPositions } from '../shared/types.ts';
import { createRng } from '../shared/rng.ts';
import { MACHINE } from '../config/machine.ts';
import { BONUS_SPECS, patternsOf } from '../config/roles.ts';
import { KOMA_COUNT } from '../config/reels.ts';
import { tableFor } from '../config/probability.ts';
import { applyCarry, drawLottery, toActiveFlags } from '../lottery/lottery.ts';
import { decideStop, targetRoleOf } from '../reel/control.ts';
import { buildPartialWindow, buildWindow, withStop } from '../reel/window.ts';
import { judgeWindow, matchAll, payoutOf } from '../payout/judge.ts';

/**
 * 制御込みシミュレーション
 *
 * 理論値（simulate.ts）と違い、実際のリール制御（decideStop）と払い出し判定（judgeWindow）を通す。
 * - 押下位置は「目押しあり（当選役を狙う）」「ランダム」「固定」のいずれか。順番は順押し
 * - 抽選の乱数列は simulate.ts と同じシードなら同じ（押下位置は別の乱数列を使う）ので、
 *   同じシードで並べれば「制御による差」だけが見える
 * - ブラウザで固まらないよう、step() で少しずつ進められる
 */

/**
 * 押し方
 * - aim    : 目押しあり。当選役（ボーナス・スイカ・チェリー）が揃う位置を狙って押す。理論値と比べるならこれ
 * - random : 毎回ランダムな位置で押す（目押しなし）
 * - fixed  : 毎回同じ位置で押す
 */
export type PushMode = 'aim' | 'random' | 'fixed';

export interface ControlSimOptions {
  setting: Setting;
  /** 通常時のゲーム数（ボーナス中は別カウント） */
  games: number;
  seed: number;
  pushMode: PushMode;
  /** pushMode が 'fixed' のときの押下コマ番号 [左, 中, 右] */
  fixedPushes?: readonly [KomaNo, KomaNo, KomaNo];
  /** 押す順番（既定は順押し） */
  order?: readonly ReelIndex[];
}

export interface ControlSimResult {
  setting: Setting;
  seed: number;
  pushMode: PushMode;
  totalGames: number;
  normalGames: number;
  bigCount: number;
  regCount: number;
  coinsIn: number;
  coinsOut: number;
  /** 通常時の小役当選回数（重複分を含む） */
  drawn: Record<SmallRole, number>;
  /** 通常時の小役入賞回数 */
  won: Record<SmallRole, number>;
  /** 取りこぼし（当選したが入賞しなかった） */
  lost: Record<SmallRole, number>;
  /** 通常時のボーナス新規当選回数（持ち越し中に捨てた分は含まない） */
  bonusDrawn: Record<BonusRole, number>;
  /** ボーナス成立中に消化したゲーム数の合計（入賞ゲームを含む。平均は ÷ 入賞回数） */
  bonusWaitGames: number;
  bonusPayout: Record<BonusRole, number>;
  bonusGames: Record<BonusRole, number>;
}

export interface ControlSim {
  readonly result: ControlSimResult;
  /** 終わったか */
  readonly done: boolean;
  /** 最大 n ゲーム進める。戻り値は done */
  step(n: number): boolean;
}

const zeroSmall = (): Record<SmallRole, number> => ({ BELL: 0, MELON: 0, CHERRY: 0, REPLAY: 0 });

/** どこで押しても揃う役（狙う必要がない） */
const NO_AIM_NEEDED = new Set(['BELL', 'REPLAY']);

/**
 * 目押し: 1〜21 の押下位置を順に試し、当選役がいちばん良い形で残る位置を選ぶ。
 * 成立（hit）> まだ可能性あり（open）> 不可。成立なら払い出しが多い入賞形（角チェリー）を優先。
 * 試し始めの位置はランダムにして、同点のときの偏りをなくす。
 */
export function aimedPush(reel: ReelIndex, stopped: StopPositions, flags: ActiveFlags, mode: GameMode, start: number): KomaNo {
  const target = targetRoleOf(flags);
  if (!target || NO_AIM_NEEDED.has(target)) return start + 1;
  const patterns = patternsOf(target);
  let best = start + 1;
  let bestScore = -1;
  for (let i = 0; i < KOMA_COUNT; i++) {
    const push = ((start + i) % KOMA_COUNT) + 1;
    const r = decideStop({ reel, pushKoma: push, stopped, flags, mode });
    const matches = matchAll(buildPartialWindow(withStop(stopped, reel, r.stopKoma)), patterns);
    const hits = matches.filter((m) => m.state === 'hit');
    const score = hits.length > 0 ? 2 + Math.max(...hits.map((m) => payoutOf(m.pattern, mode))) / 100 : matches.some((m) => m.state === 'open') ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = push;
    }
  }
  return best;
}

/** 押下位置用の乱数シード（抽選の乱数列と分けるため少しずらす） */
export function pushSeedOf(seed: number): number {
  return ((seed ^ 0x5bd1e995) >>> 0) || 1;
}

export function createControlSim(opts: ControlSimOptions): ControlSim {
  const rng = createRng(opts.seed);
  const pushRng = createRng(pushSeedOf(opts.seed));
  const order = opts.order ?? [0, 1, 2];
  const fixed = opts.fixedPushes ?? [1, 1, 1];
  const result: ControlSimResult = {
    setting: opts.setting,
    seed: opts.seed,
    pushMode: opts.pushMode,
    totalGames: 0,
    normalGames: 0,
    bigCount: 0,
    regCount: 0,
    coinsIn: 0,
    coinsOut: 0,
    drawn: zeroSmall(),
    won: zeroSmall(),
    lost: zeroSmall(),
    bonusDrawn: { BIG: 0, REG: 0 },
    bonusWaitGames: 0,
    bonusPayout: { BIG: 0, REG: 0 },
    bonusGames: { BIG: 0, REG: 0 },
  };

  let mode: GameMode = 'normal';
  let carried: BonusRole | null = null;
  let bonusPaid = 0;
  let replayNext = false;
  const bet = MACHINE.betPerGame;

  /** 1 リールぶんの押下位置を決める */
  const pushFor = (reel: ReelIndex, stopped: StopPositions, flags: ActiveFlags): KomaNo => {
    if (opts.pushMode === 'fixed') return fixed[reel];
    const start = pushRng.nextInt(KOMA_COUNT);
    return opts.pushMode === 'aim' ? aimedPush(reel, stopped, flags, mode, start) : start + 1;
  };

  const playOne = () => {
    result.totalGames++;
    const drawnResult = drawLottery(tableFor(mode, opts.setting), rng);
    if (!replayNext) result.coinsIn += bet;
    replayNext = false;

    // 1. 内部抽選（持ち越し反映。useGame の lever と同じ手順）
    const { lottery, carriedBonus } = applyCarry(drawnResult, carried);
    const flags = toActiveFlags(lottery, carriedBonus);
    const newBonus = !carried && lottery.bonus ? lottery.bonus : null;
    carried = carriedBonus;
    // 2. リール制御（1 リールずつ。押下位置は止まっているリールを見て決める）→ 3. 払い出し判定
    let stopped: StopPositions = [null, null, null];
    for (const reel of order) {
      const r = decideStop({ reel, pushKoma: pushFor(reel, stopped, flags), stopped, flags, mode });
      stopped = withStop(stopped, reel, r.stopKoma);
    }
    const payout = judgeWindow(buildWindow(stopped as readonly [KomaNo, KomaNo, KomaNo]), mode);
    result.coinsOut += payout.totalPayout;
    if (payout.replay) replayNext = true;

    if (mode === 'normal') {
      result.normalGames++;
      if (newBonus) result.bonusDrawn[newBonus]++;
      if (lottery.small) {
        result.drawn[lottery.small]++;
        if (payout.hits.some((h) => h.role === lottery.small)) result.won[lottery.small]++;
        else result.lost[lottery.small]++;
      }
      if (carried) result.bonusWaitGames++;
      if (payout.bonusHit) {
        if (payout.bonusHit === 'BIG') result.bigCount++;
        else result.regCount++;
        mode = payout.bonusHit === 'BIG' ? 'big' : 'reg';
        carried = null;
        bonusPaid = 0;
      }
    } else {
      const kind: BonusRole = mode === 'big' ? 'BIG' : 'REG';
      result.bonusGames[kind]++;
      result.bonusPayout[kind] += payout.totalPayout;
      bonusPaid += payout.totalPayout;
      if (bonusPaid >= BONUS_SPECS[kind].maxPayout) mode = 'normal';
    }
  };

  const sim: ControlSim = {
    result,
    get done() {
      return result.normalGames >= opts.games;
    },
    step(n: number) {
      for (let i = 0; i < n && result.normalGames < opts.games; i++) playOne();
      return result.normalGames >= opts.games;
    },
  };
  return sim;
}

/** 最後まで一気に回す（テスト・CLI 用） */
export function simulateWithControl(opts: ControlSimOptions): ControlSimResult {
  const sim = createControlSim(opts);
  sim.step(Number.POSITIVE_INFINITY);
  return sim.result;
}

/** 機械割（%） */
export function controlPayoutRate(r: ControlSimResult): number {
  return r.coinsIn === 0 ? 0 : (r.coinsOut / r.coinsIn) * 100;
}
