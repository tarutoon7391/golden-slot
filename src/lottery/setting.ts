import type { Setting } from '../shared/types.ts';
import type { Rng } from '../shared/rng.ts';
import { SETTING_WEIGHTS } from '../config/probability.ts';

export const ALL_SETTINGS: readonly Setting[] = [1, 2, 3, 4, 5, 6];

/** ゲーム開始時に設定を重み付きランダムで選ぶ（非公開） */
export function pickSetting(rng: Rng): Setting {
  const weights = ALL_SETTINGS.map((s) => SETTING_WEIGHTS[s]);
  return ALL_SETTINGS[rng.pickWeighted(weights)];
}
