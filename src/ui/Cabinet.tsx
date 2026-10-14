import { useState, type ReactNode } from 'react';
import type { GameState, LineId } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { BONUS_SPECS } from '../config/roles.ts';
import { isMuted, setMuted } from '../effects/audio.ts';
import type { GameApi } from '../store/useGame.ts';
import { Controls } from './Controls.tsx';
import { DataCounterCompact, DataCounterDetail } from './DataCounter.tsx';
import { ReelWindow } from './ReelWindow.tsx';
import { ResultScreen } from './ResultScreen.tsx';
import { useDeadlinePassed } from './useDeadline.ts';

/**
 * 筐体全体
 * 上から: ヘッダー（機種名） → データカウンター → リール窓 → クレジット表示 → 操作パネル → データ詳細
 */

/** ウェイト中（レバーは叩いたが回転開始前）か。開始時刻に自動で再描画される */
function useWaiting(state: GameState): boolean {
  const started = useDeadlinePassed(state.spinStartAt);
  return state.phase === 'spinning' && !started;
}

/** ボーナス確定フラッシュ。全停止から bonusFlashMs のあいだだけ出す（次のレバーで effect が入れ替わる） */
function useFlash(state: GameState): string {
  const lastStop = Math.max(...state.stopAt.map((t) => t ?? 0));
  const done = useDeadlinePassed(lastStop + MACHINE.bonusFlashMs);
  const flash = state.effect?.flash ?? 'none';
  return flash !== 'none' && !done && state.phase !== 'spinning' ? flash : 'none';
}

export function Cabinet({ api, children }: { api: GameApi; children?: ReactNode }) {
  const { state } = api;
  const waiting = useWaiting(state);
  const flash = useFlash(state);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  if (state.phase === 'ended') {
    return (
      <main className="cabinet">
        <Header muted={muted} onToggleMute={toggleMute} />
        <ResultScreen state={state} onNewGame={api.newGame} />
        {children}
      </main>
    );
  }

  const showPayout = state.phase === 'payout' || state.phase === 'idle' || state.phase === 'bet';
  const payout = showPayout ? (state.payout?.totalPayout ?? 0) : 0;
  const hitLines: LineId[] = state.phase === 'payout' ? (state.payout?.hits.map((h) => h.line).filter((l): l is LineId => l !== null) ?? []) : [];
  const effect = state.effect;
  const windowClass = [
    'window-area',
    flash !== 'none' ? `flash-${flash}` : '',
    effect?.blackout ? 'blackout' : '',
    state.mode !== 'normal' ? `mode-${state.mode}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className="cabinet">
      <Header muted={muted} onToggleMute={toggleMute} />
      <DataCounterCompact counters={state.counters} />

      <section className={windowClass}>
        <div className={`lamp${effect?.lamp === 'on' ? ' on' : ''}`} aria-label="告知ランプ" />
        <ReelWindow state={state} highlightLines={hitLines} />
        <div className="info-row">
          <div className="info-item">
            <span className="info-label">CREDIT</span>
            <span className="info-value">{state.coins}</span>
          </div>
          <div className="info-item bet-lamps" aria-label={`ベット ${state.bet} 枚`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={`bet-lamp${state.bet >= n ? ' on' : ''}`} />
            ))}
            {state.replayBet && <span className="replay-tag">REPLAY</span>}
            {waiting && <span className="wait-tag">WAIT</span>}
          </div>
          <div className="info-item">
            <span className="info-label">PAYOUT</span>
            <span className="info-value">{payout}</span>
          </div>
        </div>
        {state.bonus && (
          <div className={`bonus-bar ${state.bonus.kind.toLowerCase()}`}>
            <span>{BONUS_SPECS[state.bonus.kind].label}</span>
            <span>
              {state.bonus.paidOut} / {BONUS_SPECS[state.bonus.kind].maxPayout} 枚
            </span>
          </div>
        )}
      </section>

      <Controls api={api} />

      <details className="data-detail">
        <summary>データ詳細（履歴・差枚グラフ）</summary>
        <DataCounterDetail counters={state.counters} />
      </details>

      {children}
      <footer className="cab-footer">
        {MACHINE.name} v{MACHINE.version} ・ 仮想コインのみ
      </footer>
    </main>
  );
}

function Header({ muted, onToggleMute }: { muted: boolean; onToggleMute(): void }) {
  return (
    <header className="cab-header">
      <div className="brand">
        <span className="brand-name">{MACHINE.name}</span>
        {MACHINE.subtitle && <span className="brand-sub">{MACHINE.subtitle}</span>}
      </div>
      <button type="button" className="btn-text" onClick={onToggleMute} aria-pressed={muted}>
        {muted ? '🔇 音OFF' : '🔊 音ON'}
      </button>
    </header>
  );
}
