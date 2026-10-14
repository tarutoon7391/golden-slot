import { useEffect } from 'react';
import type { ReelIndex } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { actionForKey, KEY_LABELS } from '../config/keys.ts';
import { canBet, canLever } from '../store/gameReducer.ts';
import type { GameApi } from '../store/useGame.ts';

/**
 * 操作パネル: MAXBET / レバー / 3 ストップ / やめる
 * PC はキー操作（config/keys.ts）、スマホはタップ。
 */

interface Props {
  api: GameApi;
  /** 入力欄にフォーカスがあるときなど、キー操作を止めたいとき true */
  keyboardDisabled?: boolean;
}

export function Controls({ api, keyboardDisabled = false }: Props) {
  const { state } = api;

  // キー操作
  useEffect(() => {
    if (keyboardDisabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const action = actionForKey(e.key);
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case 'maxBet':
          api.maxBet();
          break;
        case 'lever':
          api.lever();
          break;
        case 'stopLeft':
          api.stop(0);
          break;
        case 'stopCenter':
          api.stop(1);
          break;
        case 'stopRight':
          api.stop(2);
          break;
        case 'quit':
          api.quit();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, keyboardDisabled]);

  const spinning = state.phase === 'spinning';
  const stopEnabled = (reel: ReelIndex) => spinning && state.positions[reel] === null;
  const betOk = canBet(state);
  const leverOk = canLever(state);
  const needCoins = state.phase === 'idle' && state.coins < MACHINE.betPerGame;

  return (
    <div className="controls">
      <div className="controls-main">
        <button type="button" className={`btn btn-bet${betOk ? ' lit' : ''}`} onClick={api.maxBet} disabled={!betOk} aria-label="MAXBET">
          MAX<br />BET
        </button>
        <button type="button" className={`btn btn-lever${leverOk ? ' lit' : ''}`} onClick={api.lever} disabled={!leverOk} aria-label="レバー">
          <span className="lever-knob" />
          <span className="lever-label">LEVER</span>
        </button>
        <div className="stop-group">
          {([0, 1, 2] as ReelIndex[]).map((reel) => (
            <button
              key={reel}
              type="button"
              className={`btn btn-stop${stopEnabled(reel) ? ' lit' : ''}`}
              onPointerDown={(e) => {
                // タップの遅延を避けるため pointerdown で止める
                e.preventDefault();
                api.stop(reel);
              }}
              disabled={!stopEnabled(reel)}
              aria-label={`${['左', '中', '右'][reel]}ストップ`}
            >
              {['L', 'C', 'R'][reel]}
            </button>
          ))}
        </div>
      </div>
      <div className="controls-sub">
        {needCoins && (
          <button type="button" className="btn-text" onClick={api.refill}>
            コインを追加 +{MACHINE.coinRefill}（仮想）
          </button>
        )}
        <button type="button" className="btn-text" onClick={api.quit} disabled={!(state.phase === 'idle' || state.phase === 'bet')}>
          やめる（設定発表）
        </button>
      </div>
      <p className="key-help">
        {(Object.keys(KEY_LABELS) as (keyof typeof KEY_LABELS)[]).map((k) => (
          <span key={k}>{KEY_LABELS[k]}</span>
        ))}
      </p>
    </div>
  );
}
