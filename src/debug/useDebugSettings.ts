import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { FlashId, KomaNo, LampCount, LotteryRowKey, Setting } from '../shared/types.ts';
import { rowToResult } from '../lottery/lottery.ts';
import type { GameOverrides } from '../store/useGame.ts';
import { LOGO_ALL_OFF, type LogoLamps } from '../ui/logoLamps.ts';

/**
 * デバッグパネルの設定を持ち、useGame の差し込み口（GameOverrides）に変換する。
 * ゲームの処理順（内部抽選 → リール制御 → 演出）は変えない。差し替えるのは抽選結果と押下位置だけ。
 */

/** 強制する当選役。抽選テーブルの行キー + ハズレ */
export type ForceKey = LotteryRowKey | 'NONE';

export interface DebugSettings {
  /** 次ゲームの当選役を強制する。null は通常抽選 */
  forceKey: ForceKey | null;
  /** true なら毎ゲーム強制、false なら 1 ゲームで解除 */
  forceEvery: boolean;
  /** 押下コマ番号の指定 [左, 中, 右]。null は時刻から求める */
  pushes: readonly [KomaNo | null, KomaNo | null, KomaNo | null];
  /** 「新しい台で始める」ときの設定。null はランダム */
  fixedSetting: Setting | null;
  /** 回転アニメーションと待ち時間を飛ばす */
  skipAnimation: boolean;
  /** ロゴランプを追加で点ける（GO / LD / EN ごと。ゲームの点灯に OR する。見た目の確認用） */
  logoLamps: LogoLamps;
  /** フラッシュの試し撃ち（押した時刻をキーにして毎回出し直す） */
  testFlash: { id: FlashId; at: number } | null;
  /** 次のレバーのリールフラッシュ。'auto' は通常（8b では発生なし）、'none' は強制的に発生なし */
  nextFlash: FlashId | 'none' | 'auto';
  /** 次のレバーのロゴランプ点灯数。'auto' は通常（8b では 0 個） */
  nextLampCount: LampCount | 'auto';
}

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  forceKey: null,
  forceEvery: false,
  pushes: [null, null, null],
  fixedSetting: null,
  skipAnimation: false,
  logoLamps: LOGO_ALL_OFF,
  testFlash: null,
  nextFlash: 'auto',
  nextLampCount: 'auto',
};

/** 設定 → GameOverrides（純粋関数・テスト用に分離） */
export function buildOverrides(settings: DebugSettings, onForceConsumed: () => void): GameOverrides {
  return {
    nextLottery: () => {
      if (!settings.forceKey) return null;
      if (!settings.forceEvery) onForceConsumed();
      return rowToResult(settings.forceKey);
    },
    pushKoma: (_state, reel) => settings.pushes[reel],
    fixedSetting: () => settings.fixedSetting,
    skipDelays: () => settings.skipAnimation,
    nextFlash: () => (settings.nextFlash === 'auto' ? undefined : settings.nextFlash === 'none' ? null : { id: settings.nextFlash }),
    nextLampPlan: () => (settings.nextLampCount === 'auto' ? undefined : { count: settings.nextLampCount }),
  };
}

export interface DebugControl {
  settings: DebugSettings;
  update(patch: Partial<DebugSettings>): void;
  /** useGame に渡す参照。settings が変わるたびに中身を作り直す */
  overridesRef: RefObject<GameOverrides | undefined>;
}

export function useDebugSettings(): DebugControl {
  const [settings, setSettings] = useState<DebugSettings>(DEFAULT_DEBUG_SETTINGS);
  const update = useCallback((patch: Partial<DebugSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const overridesRef = useRef<GameOverrides | undefined>(undefined);
  useLayoutEffect(() => {
    overridesRef.current = buildOverrides(settings, () => update({ forceKey: null }));
  }, [settings, update]);
  return { settings, update, overridesRef };
}
