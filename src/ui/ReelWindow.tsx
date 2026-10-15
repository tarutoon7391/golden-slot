import { useEffect, useRef, type CSSProperties } from 'react';
import type { FlashRequest, GameState, ReelIndex } from '../shared/types.ts';
import { REELS } from '../config/reels.ts';
import { SYMBOLS } from '../config/symbols.ts';
import { FLASHES, flashCellDelays, flashTotalMs } from '../config/flashes.ts';
import { STRIP_COPIES, glowAt, reelPosAt, translatePercent } from './reelMath.ts';
import { useDeadlinePassed } from './useDeadline.ts';

/**
 * 3 リール窓
 *
 * 各リールは配列 21 コマを 3 回つなげた帯（63 コマ）を縦に動かして表示する。
 * 位置の計算は reelMath.ts（reducer の pushKomaAt と同じ式）。
 * 描画は requestAnimationFrame で transform を直接書き換える（React の再描画は使わない）。
 */

/** 画面に出すリールフラッシュ（どれを・いつから） */
export interface FlashShow {
  request: FlashRequest;
  /** 光り始める時刻（ms）。ゲームでは第 3 停止の直後 */
  startAt: number;
}

interface Props {
  state: GameState;
  /** デバッグ: 回転アニメーションを省き、停止位置をそのまま出す */
  instant?: boolean;
  /** リールフラッシュ。null なら出さない */
  flash?: FlashShow | null;
}

/**
 * リールフラッシュ（フェーズ8b）
 * 9 コマの上に光のマスを重ね、config/flashes.ts の順番と時間をインラインの animation-delay / duration で渡す。
 * JS がするのはクラスの付け外し（startAt で出し、flashTotalMs 後に消す）だけ。アニメーションは CSS。
 * 出すタイミングは呼び出し側（Cabinet）が決める。ゲームでは第 3 停止の直後、デバッグの試し撃ちは押した瞬間。
 */
function FlashOverlay({ show }: { show: FlashShow }) {
  const def = FLASHES[show.request.id];
  const started = useDeadlinePassed(show.startAt);
  const done = useDeadlinePassed(show.startAt + flashTotalMs(def));
  if (!started || done) return null;
  const delays = flashCellDelays(def);
  return (
    <div className={`flash-grid flash-${def.id}`} aria-hidden="true">
      {delays.map((d, i) => (
        <div key={i} className={d === null ? 'flash-cell' : 'flash-cell lit'} style={d === null ? undefined : { animationDelay: `${d}ms`, animationDuration: `${def.cellMs}ms` }} />
      ))}
    </div>
  );
}

export function ReelWindow({ state, instant = false, flash = null }: Props) {
  const strips = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    const apply = (t: number) => {
      for (const reel of [0, 1, 2] as ReelIndex[]) {
        const el = strips.current[reel];
        const pos = instant ? (state.positions[reel] ?? state.spinFrom[reel]) : reelPosAt(state, reel, t);
        if (el) el.style.transform = `translateY(${translatePercent(pos)}%)`;
      }
    };
    if (instant || (state.phase !== 'spinning' && state.phase !== 'payout')) {
      apply(Date.now());
      return;
    }
    let raf = 0;
    const loop = () => {
      apply(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, instant]);

  const spinningReels = state.phase === 'spinning' ? state.positions.map((p) => p === null) : [false, false, false];

  return (
    <div className="reel-window" role="img" aria-label="リール">
      {([0, 1, 2] as ReelIndex[]).map((reel) => (
        <div key={reel} className={`reel${spinningReels[reel] ? ' spinning' : ''}`}>
          <div className="strip" ref={(el) => void (strips.current[reel] = el)}>
            {Array.from({ length: STRIP_COPIES }, (_, copy) =>
              REELS[reel].map((sym, i) => {
                const glow = glowAt(reel, i);
                return (
                  <img
                    key={`${copy}-${i}`}
                    className={glow ? 'cell glow' : 'cell'}
                    style={glow ? ({ '--glow': glow } as CSSProperties) : undefined}
                    src={SYMBOLS[sym].imagePath}
                    alt={SYMBOLS[sym].label}
                    draggable={false}
                  />
                );
              }),
            )}
          </div>
        </div>
      ))}
      {flash && <FlashOverlay key={`${flash.request.id}-${flash.startAt}`} show={flash} />}
    </div>
  );
}
