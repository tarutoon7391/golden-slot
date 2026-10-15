import type {
  BonusRole,
  PayoutResult,
  Counters,
  EffectPlan,
  FlashRequest,
  GameState,
  KomaNo,
  LampPlan,
  LampState,
  LotteryResult,
  ReelIndex,
  Setting,
  SmallRole,
  StopResult,
} from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { BONUS_SPECS, isBigBonus, isBonusRole } from '../config/roles.ts';
import { normalizeKoma } from '../config/reels.ts';
import { judgeWindow } from '../payout/judge.ts';
import { buildWindow } from '../reel/window.ts';
import { planResultEffect } from '../effects/plan.ts';

/**
 * ゲーム進行の reducer（純粋関数・乱数は使わない）
 *
 * 1 ゲームの流れ: idle --BET--> bet --LEVER--> spinning --STOP×3--> payout --SETTLE--> idle / bet（リプレイ）
 *
 * 乱数が要る処理（内部抽選・設定選択・演出の抽選・停止制御）は useGame.ts 側で行い、
 * 結果だけをアクションで渡す。React の StrictMode は reducer を 2 回呼ぶことがあるので、
 * reducer の中で乱数を消費してはいけない。
 */

export type GameAction =
  /** 新しく始める（設定・シードは呼び出し側が決める） */
  | { type: 'NEW_GAME'; setting: Setting; seed: number; now: number }
  /** MAXBET */
  | { type: 'BET' }
  /**
   * レバーオン。抽選結果・持ち越し・演出計画は呼び出し側で決めて渡す。
   * flash（リールフラッシュ）と lampPlan（ロゴランプの点灯数）も呼び出し側で決める。省略時は発生なし・0 個
   */
  | {
      type: 'LEVER';
      lottery: LotteryResult;
      carriedBonus: BonusRole | null;
      effect: EffectPlan;
      now: number;
      skipWait?: boolean;
      flash?: FlashRequest | null;
      lampPlan?: LampPlan;
    }
  /** ストップボタン。停止位置は decideStop の結果をそのまま渡す */
  | { type: 'STOP'; result: StopResult; now: number }
  /** 払い出しを反映して次ゲームへ */
  | { type: 'SETTLE' }
  /** やめる（設定発表へ） */
  | { type: 'QUIT' }
  /** 所持コインを追加（仮想） */
  | { type: 'REFILL'; amount: number }
  /** 保存データから復元 */
  | { type: 'RESTORE'; state: GameState }
  /** デバッグ: 設定・シードを差し替える（idle / bet のときだけ） */
  | { type: 'DEBUG_SET'; setting?: Setting; seed?: number };

/** 1 コマが中段を通過する時間（ms）。80rpm・21 コマなら約 35.7ms */
export const MS_PER_KOMA = 60000 / MACHINE.reelRpm / MACHINE.komaCount;

/** ロゴランプの全消灯 */
export function lampOff(count: LampState['count'] = 0): LampState {
  return { count, lit: [false, false, false] };
}

export function emptyCounters(): Counters {
  return {
    totalGames: 0,
    gamesSinceBonus: 0,
    bigCount: 0,
    regCount: 0,
    coinsIn: 0,
    coinsOut: 0,
    history: [],
    diffSeries: [0],
    diffStep: 1,
    normalGames: 0,
    smallCounts: { BELL: 0, MELON: 0, CHERRY: 0, REPLAY: 0, REACH_A: 0, REACH_B: 0 },
  };
}

/** 初期状態 */
export function createInitialState(setting: Setting, seed: number, _now: number): GameState {
  return {
    setting,
    seed,
    phase: 'idle',
    mode: 'normal',
    coins: MACHINE.initialCoins,
    bet: 0,
    replayBet: false,
    carriedBonus: null,
    bonus: null,
    lottery: null,
    positions: [21, 21, 21],
    stops: [null, null, null],
    payout: null,
    effect: null,
    flash: null,
    lamp: lampOff(),
    counters: emptyCounters(),
    lastLeverAt: -Infinity,
    spinStartAt: 0,
    spinFrom: [21, 21, 21],
    stopAt: [null, null, null],
  };
}

/** 差枚数（払い出し − 投入） */
export function diffOf(c: Counters): number {
  return c.coinsOut - c.coinsIn;
}

/** ベットできるか */
export function canBet(s: GameState): boolean {
  return s.phase === 'idle' && s.coins >= MACHINE.betPerGame;
}

/** レバーを叩けるか */
export function canLever(s: GameState): boolean {
  return s.phase === 'bet';
}

/** ストップボタンが効く状態か（回転開始から reelStartupMs 経過後） */
export function canStop(s: GameState, reel: ReelIndex, now: number): boolean {
  return s.phase === 'spinning' && s.positions[reel] === null && now >= s.spinStartAt + MACHINE.reelStartupMs;
}

/** 時刻 now に中段にあるコマ番号（画面の表示と同じ式） */
export function pushKomaAt(s: GameState, reel: ReelIndex, now: number): KomaNo {
  const elapsed = Math.max(0, now - s.spinStartAt);
  return normalizeKoma(s.spinFrom[reel] + Math.floor(elapsed / MS_PER_KOMA));
}

/** 払い出し表示にかける時間（ms） */
export function payoutDelayMs(payout: PayoutResult | null): number {
  const n = payout?.totalPayout ?? 0;
  return MACHINE.payoutBaseMs + n * MACHINE.payoutPerCoinMs;
}

/** 差枚数の推移に 1 点足す。上限を超えたら間引いて記録間隔を倍にする */
function pushDiff(c: Counters): Counters {
  if (c.totalGames % c.diffStep !== 0) return c;
  let series = [...c.diffSeries, diffOf(c)];
  let step = c.diffStep;
  if (series.length > MACHINE.diffSeriesMax) {
    series = series.filter((_, i) => i % 2 === 0);
    step *= 2;
  }
  return { ...c, diffSeries: series, diffStep: step };
}

function bet(s: GameState): GameState {
  if (!canBet(s)) return s;
  const amount = MACHINE.betPerGame;
  return {
    ...s,
    phase: 'bet',
    bet: amount,
    replayBet: false,
    coins: s.coins - amount,
    counters: { ...s.counters, coinsIn: s.counters.coinsIn + amount },
  };
}

function lever(s: GameState, a: Extract<GameAction, { type: 'LEVER' }>): GameState {
  if (!canLever(s)) return s;
  // ウェイト: 前回の回転開始から minGameIntervalMs 経つまで回転を始めない（デバッグの skipWait なら即開始）
  const spinStartAt = a.skipWait ? a.now : Math.max(a.now, s.lastLeverAt + MACHINE.minGameIntervalMs);
  const from = s.positions.map((p) => p ?? 21) as [KomaNo, KomaNo, KomaNo];
  return {
    ...s,
    phase: 'spinning',
    lottery: a.lottery,
    carriedBonus: a.carriedBonus,
    effect: a.effect,
    positions: [null, null, null],
    stops: [null, null, null],
    stopAt: [null, null, null],
    payout: null,
    // リールフラッシュはここで決めて保持し、画面が第 3 停止の直後に出す。ロゴランプはレバーONで全消灯し、停止ごとに点く
    flash: a.flash ?? null,
    lamp: lampOff(a.lampPlan?.count ?? 0),
    lastLeverAt: spinStartAt,
    spinStartAt,
    spinFrom: from,
  };
}

function stop(s: GameState, a: Extract<GameAction, { type: 'STOP' }>): GameState {
  const { reel } = a.result;
  if (s.phase !== 'spinning' || s.positions[reel] !== null) return s;
  const positions = [...s.positions] as [KomaNo | null, KomaNo | null, KomaNo | null];
  positions[reel] = a.result.stopKoma;
  const stops = [...s.stops];
  stops[reel] = a.result;
  const stopAt = [...s.stopAt] as [number | null, number | null, number | null];
  stopAt[reel] = a.now;
  // ロゴランプ: 第 k 停止（k ≤ 点灯数）なら、いま止めたリールのランプを点ける（左=GO, 中=LD, 右=EN）
  const k = positions.filter((p) => p !== null).length;
  const lit = [...s.lamp.lit] as [boolean, boolean, boolean];
  if (k <= s.lamp.count) lit[reel] = true;
  const next: GameState = { ...s, positions, stops, stopAt, lamp: { ...s.lamp, lit } };
  if (positions.some((p) => p === null)) return next;

  // 全停止: 払い出し判定（表示は必ずこの結果に従う）
  const payout = judgeWindow(buildWindow(positions as [KomaNo, KomaNo, KomaNo]), s.mode);
  return {
    ...next,
    phase: 'payout',
    payout,
    effect: planResultEffect(s.effect, payout, s.bonus?.kind ?? null),
  };
}

function settle(s: GameState): GameState {
  if (s.phase !== 'payout' || !s.payout) return s;
  const p = s.payout;
  let c: Counters = { ...s.counters, smallCounts: { ...s.counters.smallCounts }, history: [...s.counters.history] };
  let mode = s.mode;
  let bonus = s.bonus;
  let carried = s.carriedBonus;
  const coins = s.coins + p.totalPayout;

  c.totalGames += 1;
  c.coinsOut += p.totalPayout;

  if (mode === 'normal') {
    c.normalGames += 1;
    c.gamesSinceBonus += 1;
    for (const role of new Set(p.hits.map((h) => h.role))) {
      if (!isBonusRole(role)) c.smallCounts[role as SmallRole] += 1;
    }
    if (p.bonusHit) {
      // ボーナス図柄が揃った: 持ち越し解除・ボーナス開始・履歴に記録
      const kind = p.bonusHit;
      if (isBigBonus(kind)) c.bigCount += 1;
      else c.regCount += 1;
      c.history.push({ kind, gamesSinceLast: c.gamesSinceBonus, totalGamesAt: c.totalGames, diffAt: diffOf(c) });
      if (c.history.length > MACHINE.historyMax) c.history = c.history.slice(-MACHINE.historyMax);
      c.gamesSinceBonus = 0;
      mode = isBigBonus(kind) ? 'big' : 'reg';
      bonus = { kind, paidOut: 0 };
      carried = null;
    }
  } else {
    // ボーナス中: 規定枚数を超えたら終了
    const kind = bonus!.kind;
    const paidOut = (bonus?.paidOut ?? 0) + p.totalPayout;
    bonus = { kind, paidOut };
    if (paidOut >= BONUS_SPECS[kind].maxPayout) {
      mode = 'normal';
      bonus = null;
    }
  }
  c = pushDiff(c);

  // リプレイなら次ゲームは自動ベット（投入なし）
  const replay = p.replay;
  return {
    ...s,
    phase: replay ? 'bet' : 'idle',
    bet: replay ? MACHINE.replayBet : 0,
    replayBet: replay,
    coins,
    mode,
    bonus,
    carriedBonus: carried,
    counters: c,
    // フラッシュは画面側が bonusFlashMs で消す。BGM はボーナスが終わったら止める
    effect: s.effect ? { ...s.effect, bgm: mode === 'normal' ? 'none' : s.effect.bgm } : null,
  };
}

/** 復元した状態を今の時刻に合わせて整える（回転中なら回転をやり直す） */
export function normalizeRestored(s: GameState, now: number): GameState {
  if (s.phase === 'spinning') {
    const stopAt: GameState['stopAt'] = [0, 1, 2].map((i) => (s.positions[i] === null ? null : s.stopAt[i])) as [number | null, number | null, number | null];
    return { ...s, spinStartAt: now, lastLeverAt: now, stopAt };
  }
  return { ...s, lastLeverAt: -Infinity };
}

export function gameReducer(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case 'NEW_GAME':
      return createInitialState(a.setting, a.seed, a.now);
    case 'BET':
      return bet(s);
    case 'LEVER':
      return lever(s, a);
    case 'STOP':
      return stop(s, a);
    case 'SETTLE':
      return settle(s);
    case 'QUIT':
      return s.phase === 'idle' || s.phase === 'bet' ? { ...s, phase: 'ended' } : s;
    case 'REFILL':
      return s.phase === 'idle' ? { ...s, coins: s.coins + a.amount } : s;
    case 'RESTORE':
      return a.state;
    case 'DEBUG_SET':
      if (s.phase !== 'idle' && s.phase !== 'bet') return s;
      return { ...s, setting: a.setting ?? s.setting, seed: a.seed ?? s.seed };
  }
}
