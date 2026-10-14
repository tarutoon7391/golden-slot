import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';
import type { GameState, KomaNo, LotteryResult, ReelIndex, Setting } from '../shared/types.ts';
import { createRng, getRng, setGlobalRng } from '../shared/rng.ts';
import { MACHINE } from '../config/machine.ts';
import { tableFor } from '../config/probability.ts';
import { applyCarry, drawLottery, toActiveFlags } from '../lottery/lottery.ts';
import { pickSetting } from '../lottery/setting.ts';
import { decideStop } from '../reel/control.ts';
import { planLeverEffect, situationOf } from '../effects/plan.ts';
import { playBetSound, playBonusConfirm, playLeverSound, playPayout, playStopSound, startBgm, stopBgm, unlockAudio } from '../effects/audio.ts';
import { canBet, canLever, canStop, createInitialState, gameReducer, normalizeRestored, payoutDelayMs, pushKomaAt } from './gameReducer.ts';
import { loadGame, saveGame } from './storage.ts';

/**
 * 画面とゲームロジックをつなぐ hook
 *
 * 処理順は必ず「内部抽選 → リール制御 → 演出」。
 * - レバー: 抽選（乱数）→ 演出計画（乱数）→ reducer へ
 * - ストップ: 押下コマ番号を時刻から求める → decideStop → reducer へ
 * - 払い出し: reducer が判定した結果を一定時間表示してから SETTLE
 *
 * 乱数はアプリ全体で共有する getRng() を使う（デバッグモードは setGlobalRng でシードを固定する）。
 */

/** デバッグモード（フェーズ5）から差し込むためのフック */
export interface GameOverrides {
  /** 次ゲームの当選役を強制する。null を返せば通常抽選 */
  nextLottery?: (state: GameState) => LotteryResult | null;
  /** 押下コマ番号を数値で指定する。null を返せば時刻から求める */
  pushKoma?: (state: GameState, reel: ReelIndex) => KomaNo | null;
  /** 新しく始めるときの設定を固定する */
  fixedSetting?: () => GameState['setting'] | null;
  /** 待ち時間（ウェイト・回転開始・払い出し表示）をすべて飛ばす（回転スキップ用） */
  skipDelays?: () => boolean;
}

export interface GameApi {
  state: GameState;
  maxBet(): void;
  lever(): void;
  stop(reel: ReelIndex): void;
  quit(): void;
  newGame(): void;
  refill(): void;
  /** 画面側のアニメーションが使う現在時刻（reducer と同じ時計） */
  now(): number;
  /** デバッグ: 設定・乱数シードを差し替える（idle / bet のときだけ効く） */
  debugSet(patch: { setting?: Setting; seed?: number }): void;
}

const now = () => Date.now();

/** 初回の状態: 保存データがあれば復元、無ければ新しい台 */
function initialState(): GameState {
  const saved = loadGame();
  if (saved) {
    // 保存前と同じ乱数列を繰り返さないよう、シードに時刻を混ぜて作り直す
    setGlobalRng(createRng(saved.seed ^ (now() & 0xffff)));
    return normalizeRestored(saved, now());
  }
  const rng = getRng();
  return createInitialState(pickSetting(rng), rng.seed, now());
}

export function useGame(overridesRef?: RefObject<GameOverrides | undefined>): GameApi {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState);

  // 最新の state をイベントハンドラから読むための参照（描画後に更新）
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 保存（変更のたび）
  useEffect(() => {
    saveGame(state);
  }, [state]);

  // 払い出し表示 → SETTLE
  const phase = state.phase;
  const payout = state.payout;
  useEffect(() => {
    if (phase !== 'payout') return;
    const skip = overridesRef?.current?.skipDelays?.() ?? false;
    if (!skip) {
      if (payout?.bonusHit) playBonusConfirm();
      playPayout(payout?.totalPayout ?? 0, MACHINE.payoutPerCoinMs);
    }
    const t = setTimeout(() => dispatch({ type: 'SETTLE' }), skip ? 0 : payoutDelayMs(payout));
    return () => clearTimeout(t);
  }, [phase, payout, overridesRef]);

  // BGM（ボーナス中だけ）
  const bgm = state.effect?.bgm ?? 'none';
  useEffect(() => {
    if (phase === 'ended') {
      stopBgm();
      return;
    }
    startBgm(bgm);
  }, [bgm, phase]);

  const maxBet = useCallback(() => {
    unlockAudio();
    if (!canBet(stateRef.current)) return;
    playBetSound();
    dispatch({ type: 'BET' });
  }, []);

  const lever = useCallback(() => {
    unlockAudio();
    const s = stateRef.current;
    if (!canLever(s)) return;
    const rng = getRng();
    // 1. 内部抽選（デバッグの強制があればそれを使う）
    const forced = overridesRef?.current?.nextLottery?.(s) ?? null;
    const drawn = forced ? { ...forced, forced: true } : drawLottery(tableFor(s.mode, s.setting), rng);
    const { lottery, carriedBonus } = applyCarry(drawn, s.carriedBonus);
    // 2. 演出計画（結果を変えない）
    const effect = planLeverEffect(situationOf(lottery, s.carriedBonus), rng);
    playLeverSound(effect.leverSound);
    const skipWait = overridesRef?.current?.skipDelays?.() ?? false;
    dispatch({ type: 'LEVER', lottery, carriedBonus, effect, now: now(), skipWait });
  }, [overridesRef]);

  const stop = useCallback(
    (reel: ReelIndex) => {
      unlockAudio();
      const s = stateRef.current;
      const t = now();
      // 回転スキップ中は回転開始待ちを見ない
      const skip = overridesRef?.current?.skipDelays?.() ?? false;
      if (!canStop(s, reel, skip ? Number.POSITIVE_INFINITY : t) || !s.lottery) return;
      // 押下コマ番号は時刻から（デバッグの指定があればそれを使う）
      const pushKoma = overridesRef?.current?.pushKoma?.(s, reel) ?? pushKomaAt(s, reel, t);
      const flags = toActiveFlags(s.lottery, s.carriedBonus);
      const result = decideStop({ reel, pushKoma, stopped: s.positions, flags, mode: s.mode });
      playStopSound();
      dispatch({ type: 'STOP', result, now: t });
    },
    [overridesRef],
  );

  const quit = useCallback(() => dispatch({ type: 'QUIT' }), []);

  const newGame = useCallback(() => {
    const rng = createRng();
    setGlobalRng(rng);
    const setting = overridesRef?.current?.fixedSetting?.() ?? pickSetting(rng);
    dispatch({ type: 'NEW_GAME', setting, seed: rng.seed, now: now() });
  }, [overridesRef]);

  const refill = useCallback(() => dispatch({ type: 'REFILL', amount: MACHINE.coinRefill }), []);

  const debugSet = useCallback((patch: { setting?: Setting; seed?: number }) => {
    if (patch.seed !== undefined) setGlobalRng(createRng(patch.seed));
    dispatch({ type: 'DEBUG_SET', ...patch });
  }, []);

  return { state, maxBet, lever, stop, quit, newGame, refill, now, debugSet };
}
