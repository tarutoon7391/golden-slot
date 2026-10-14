import type { BgmId, LeverSoundId } from '../shared/types.ts';

/**
 * 音の定義（Web Audio で合成する。音声ファイルは使わない）
 * 音程は Hz、長さは秒。ここを変えれば演出音が変わる。
 */

export interface ToneStep {
  /** 周波数（Hz）。0 は休符 */
  freq: number;
  /** 長さ（秒） */
  dur: number;
}

export interface ToneSpec {
  type: OscillatorType;
  /** 音量（0〜1） */
  gain: number;
  steps: readonly ToneStep[];
}

/** 効果音 */
export const SFX: Record<Exclude<LeverSoundId, 'none'> | 'stop' | 'bet' | 'coin' | 'bonusConfirm', ToneSpec> = {
  /** レバーオン（通常） */
  normal: { type: 'square', gain: 0.08, steps: [{ freq: 880, dur: 0.06 }] },
  /** レバーオン（予告音・2 音上昇） */
  notice: { type: 'square', gain: 0.1, steps: [{ freq: 660, dur: 0.1 }, { freq: 0, dur: 0.03 }, { freq: 990, dur: 0.16 }] },
  /** ストップボタン */
  stop: { type: 'triangle', gain: 0.12, steps: [{ freq: 220, dur: 0.035 }] },
  /** ベット */
  bet: { type: 'square', gain: 0.05, steps: [{ freq: 1320, dur: 0.03 }] },
  /** 払い出し 1 枚 */
  coin: { type: 'square', gain: 0.05, steps: [{ freq: 1760, dur: 0.025 }] },
  /** ボーナス確定フラッシュ（アルペジオ） */
  bonusConfirm: {
    type: 'square',
    gain: 0.1,
    steps: [
      { freq: 523, dur: 0.1 },
      { freq: 659, dur: 0.1 },
      { freq: 784, dur: 0.1 },
      { freq: 1047, dur: 0.1 },
      { freq: 784, dur: 0.1 },
      { freq: 1047, dur: 0.3 },
    ],
  },
};

/** BGM（ループ）。メロディとベースの 2 声 */
export interface BgmSpec {
  melody: ToneSpec;
  bass: ToneSpec;
}

export const BGM: Record<Exclude<BgmId, 'none'>, BgmSpec> = {
  big: {
    melody: {
      type: 'square',
      gain: 0.06,
      steps: [
        { freq: 784, dur: 0.15 }, { freq: 784, dur: 0.15 }, { freq: 1047, dur: 0.3 },
        { freq: 988, dur: 0.15 }, { freq: 880, dur: 0.15 }, { freq: 784, dur: 0.3 },
        { freq: 659, dur: 0.15 }, { freq: 784, dur: 0.15 }, { freq: 880, dur: 0.3 },
        { freq: 784, dur: 0.15 }, { freq: 659, dur: 0.15 }, { freq: 587, dur: 0.3 },
      ],
    },
    bass: {
      type: 'triangle',
      gain: 0.09,
      steps: [
        { freq: 196, dur: 0.3 }, { freq: 196, dur: 0.3 }, { freq: 262, dur: 0.3 }, { freq: 262, dur: 0.3 },
        { freq: 220, dur: 0.3 }, { freq: 220, dur: 0.3 }, { freq: 147, dur: 0.3 }, { freq: 147, dur: 0.3 },
      ],
    },
  },
  reg: {
    melody: {
      type: 'square',
      gain: 0.05,
      steps: [
        { freq: 659, dur: 0.2 }, { freq: 784, dur: 0.2 }, { freq: 659, dur: 0.2 }, { freq: 523, dur: 0.4 },
        { freq: 587, dur: 0.2 }, { freq: 659, dur: 0.2 }, { freq: 587, dur: 0.2 }, { freq: 494, dur: 0.4 },
      ],
    },
    bass: {
      type: 'triangle',
      gain: 0.08,
      steps: [
        { freq: 131, dur: 0.4 }, { freq: 165, dur: 0.4 }, { freq: 147, dur: 0.4 }, { freq: 123, dur: 0.4 },
      ],
    },
  },
};
