import type { BonusRole, EffectPlan, EffectSituation, EffectTable, GameMode, LeverSoundId, LotteryResult, PayoutResult } from '../shared/types.ts';
import type { Rng } from '../shared/rng.ts';
import { EFFECTS } from '../config/effects.ts';

/**
 * 演出計画
 * 抽選結果とリール制御の結果から決めるだけで、結果を変えることはない。
 * 中身のバリエーション（消灯・告知ランプ・フラッシュ種別）は型と CSS クラスの枠だけ用意してある。
 */

/** 今ゲームの状況（演出期待度テーブルのキー） */
export function situationOf(lottery: LotteryResult, carriedBefore: BonusRole | null): EffectSituation {
  if (lottery.bonus) return 'bonusNew';
  if (carriedBefore) return 'bonusCarry';
  if (lottery.small) return 'small';
  return 'none';
}

/** 重み表から 1 つ選ぶ */
function pickFromWeights<T extends string>(weights: Partial<Record<T, number>>, rng: Rng): T {
  const keys = Object.keys(weights) as T[];
  const ws = keys.map((k) => weights[k] ?? 0);
  return keys[rng.pickWeighted(ws)];
}

/** レバーオン時点の演出計画 */
export function planLeverEffect(situation: EffectSituation, rng: Rng, table: EffectTable = EFFECTS): EffectPlan {
  const leverSound = pickFromWeights<LeverSoundId>(table.leverSound[situation], rng);
  return { leverSound, blackout: false, flash: 'none', lamp: 'none', bgm: 'none', sourceKey: situation };
}

/** 全停止後の演出計画（ボーナス図柄が揃ったらフラッシュ、ボーナス中は BGM） */
export function planResultEffect(plan: EffectPlan | null, payout: PayoutResult, mode: GameMode, table: EffectTable = EFFECTS): EffectPlan {
  const base: EffectPlan = plan ?? { leverSound: 'none', blackout: false, flash: 'none', lamp: 'none', bgm: 'none' };
  const kind: BonusRole | null = payout.bonusHit ?? (mode === 'big' ? 'BIG' : mode === 'reg' ? 'REG' : null);
  return {
    ...base,
    flash: payout.bonusHit ? table.bonusConfirmFlash : 'none',
    lamp: payout.bonusHit ? 'on' : base.lamp,
    bgm: kind ? table.bgm[kind] : 'none',
  };
}
