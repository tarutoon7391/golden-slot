import type { EffectTable } from '../shared/types.ts';

/**
 * 演出期待度テーブル（最小限の初期値）
 *
 * 状況（none / small / bonusNew / bonusCarry）ごとに、各演出IDの重みを書く。
 * 重みは整数で、合計は任意。例: none で { none: 95, notice: 5 } なら 5% で予告音。
 * 演出は抽選結果が決まった後に選ぶだけで、結果を変えることはない。
 */
export const EFFECTS: EffectTable = {
  // レバーオン予告音
  leverSound: {
    none: { none: 97, normal: 3 },
    small: { none: 90, normal: 10 },
    bonusNew: { none: 20, normal: 40, notice: 40 },
    bonusCarry: { none: 60, normal: 25, notice: 15 },
  },
  // ボーナス図柄が揃った瞬間のフラッシュ（1 パターン）
  bonusConfirmFlash: 'bonusConfirm',
  // ボーナス中 BGM
  bgm: { BIG: 'big', REG: 'reg' },
};
