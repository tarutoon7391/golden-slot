/**
 * シミュレーターの本体（取りこぼしなし前提の理論値）
 * CLI は scripts/sim/run.ts、制御込みの実走シミュレーションは src/sim/controlSim.ts。
 *
 * 前提:
 * - 小役は必ず入賞する（ベル・スイカ・リプレイは 100% 引き込み）
 * - チェリーは角チェリー（4 枚）で入賞するものとみなす
 * - ボーナスは小役なし（ハズレ）のゲームで揃う。揃えたゲームは払い出し 0
 * - ボーナス中は規定枚数を超える払い出しで終了
 * - リプレイのゲームは投入・払い出しとも 0 として機械割を計算する
 */
import type { BonusRole, GameMode, LotteryRowKey, Setting, SmallRole } from '../shared/types.ts';
import { createRng } from '../shared/rng.ts';
import { MACHINE } from '../config/machine.ts';
import { ROLES, BONUS_SPECS, patternsOf } from '../config/roles.ts';
import { tableFor } from '../config/probability.ts';
import { ROW_KEYS, applyCarry, drawLottery, rowForRoll } from '../lottery/lottery.ts';

export interface SimResult {
  setting: Setting;
  seed: number;
  /** 総ゲーム数（ボーナス中を含む） */
  totalGames: number;
  /** 通常時のゲーム数 */
  normalGames: number;
  /** 通常時の行ごとの出現回数（抽選テーブルの行。持ち越し中に捨てたボーナスも数える） */
  rowCounts: Record<LotteryRowKey | 'NONE', number>;
  bigCount: number;
  regCount: number;
  /** 投入枚数（リプレイ除く） */
  coinsIn: number;
  /** 払い出し枚数 */
  coinsOut: number;
  /** ボーナスでの払い出し合計（平均枚数の算出用） */
  bonusPayout: Record<BonusRole, number>;
  bonusGames: Record<BonusRole, number>;
}

/** 小役の理論払い出し枚数（モード別） */
export function theoreticalPayout(role: SmallRole, mode: GameMode): number {
  const def = ROLES[role];
  if (role === 'CHERRY') {
    // 角チェリーで入賞する前提（パターンの最大値）
    return Math.max(...patternsOf('CHERRY').map((p) => p.payout ?? def.payout));
  }
  if (mode !== 'normal' && def.payoutInBonus !== undefined) return def.payoutInBonus;
  return def.payout;
}

export function simulate(setting: Setting, games: number, seed = 1): SimResult {
  const rng = createRng(seed);
  const rowCounts = Object.fromEntries([...ROW_KEYS, 'NONE'].map((k) => [k, 0])) as SimResult['rowCounts'];
  const res: SimResult = {
    setting,
    seed,
    totalGames: 0,
    normalGames: 0,
    rowCounts,
    bigCount: 0,
    regCount: 0,
    coinsIn: 0,
    coinsOut: 0,
    bonusPayout: { BIG: 0, REG: 0 },
    bonusGames: { BIG: 0, REG: 0 },
  };

  let mode: GameMode = 'normal';
  let carried: BonusRole | null = null;
  let bonusPaid = 0;
  let replayNext = false;
  const bet = MACHINE.betPerGame;

  // games は通常時のゲーム数で数える（ボーナス中は別カウント）
  while (res.normalGames < games) {
    res.totalGames++;
    const table = tableFor(mode, setting);
    const drawn = drawLottery(table, rng);

    // 投入（リプレイの次ゲームは投入なし）
    if (!replayNext) res.coinsIn += bet;
    replayNext = false;

    if (mode === 'normal') {
      res.normalGames++;
      res.rowCounts[rowForRoll(table, drawn.roll!)]++;
      const { lottery, carriedBonus } = applyCarry(drawn, carried);
      carried = carriedBonus;

      if (lottery.small) {
        // 小役優先：必ず入賞
        if (lottery.small === 'REPLAY') replayNext = true;
        else res.coinsOut += theoreticalPayout(lottery.small, 'normal');
      } else if (carried) {
        // ハズレかつボーナス成立中 → 揃える（払い出し 0）
        mode = carried === 'BIG' ? 'big' : 'reg';
        if (carried === 'BIG') res.bigCount++;
        else res.regCount++;
        carried = null;
        bonusPaid = 0;
      }
    } else {
      // ボーナス中
      const kind: BonusRole = mode === 'big' ? 'BIG' : 'REG';
      res.bonusGames[kind]++;
      if (drawn.small && drawn.small !== 'REPLAY') {
        const pay = theoreticalPayout(drawn.small, mode);
        bonusPaid += pay;
        res.coinsOut += pay;
        res.bonusPayout[kind] += pay;
      }
      if (bonusPaid >= BONUS_SPECS[kind].maxPayout) {
        mode = 'normal';
      }
    }
  }
  return res;
}

/** 機械割（%）。リプレイは投入・払い出しに含めない */
export function payoutRate(r: SimResult): number {
  return (r.coinsOut / r.coinsIn) * 100;
}

/** 1/x 表記 */
export function oneIn(games: number, count: number): string {
  return count === 0 ? '-' : `1/${(games / count).toFixed(1)}`;
}
