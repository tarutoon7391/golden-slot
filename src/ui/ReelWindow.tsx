import { useEffect, useRef } from 'react';
import type { GameState, LineId, ReelIndex } from '../shared/types.ts';
import { REELS } from '../config/reels.ts';
import { SYMBOLS } from '../config/symbols.ts';
import { LINES } from '../config/lines.ts';
import { STRIP_COPIES, reelPosAt, translatePercent } from './reelMath.ts';

/**
 * 3 リール窓
 *
 * 各リールは配列 21 コマを 3 回つなげた帯（63 コマ）を縦に動かして表示する。
 * 位置の計算は reelMath.ts（reducer の pushKomaAt と同じ式）。
 * 描画は requestAnimationFrame で transform を直接書き換える（React の再描画は使わない）。
 */

interface Props {
  state: GameState;
  /** 入賞ラインを光らせる（払い出し表示中） */
  highlightLines?: readonly LineId[];
}

export function ReelWindow({ state, highlightLines = [] }: Props) {
  const strips = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    const apply = (t: number) => {
      for (const reel of [0, 1, 2] as ReelIndex[]) {
        const el = strips.current[reel];
        if (el) el.style.transform = `translateY(${translatePercent(reelPosAt(state, reel, t))}%)`;
      }
    };
    if (state.phase !== 'spinning' && state.phase !== 'payout') {
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
  }, [state]);

  const spinningReels = state.phase === 'spinning' ? state.positions.map((p) => p === null) : [false, false, false];

  return (
    <div className="reel-window" role="img" aria-label="リール">
      {([0, 1, 2] as ReelIndex[]).map((reel) => (
        <div key={reel} className={`reel${spinningReels[reel] ? ' spinning' : ''}`}>
          <div className="strip" ref={(el) => void (strips.current[reel] = el)}>
            {Array.from({ length: STRIP_COPIES }, (_, copy) =>
              REELS[reel].map((sym, i) => (
                <img key={`${copy}-${i}`} className="cell" src={SYMBOLS[sym].imagePath} alt={SYMBOLS[sym].label} draggable={false} />
              )),
            )}
          </div>
        </div>
      ))}
      <svg className="line-overlay" viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden="true">
        {LINES.map((line) => {
          const y = (row: number) => 30 + row * 60;
          const points = `0,${y(line.rows[0])} 50,${y(line.rows[0])} 150,${y(line.rows[1])} 250,${y(line.rows[2])} 300,${y(line.rows[2])}`;
          return <polyline key={line.id} points={points} className={`payline${highlightLines.includes(line.id) ? ' hit' : ''}`} />;
        })}
      </svg>
    </div>
  );
}
