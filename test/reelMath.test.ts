import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/shared/types.ts';
import { KOMA_COUNT, normalizeKoma, symbolAt } from '../src/config/reels.ts';
import { REELS } from '../src/config/reels.ts';
import { decideStop } from '../src/reel/control.ts';
import { MS_PER_KOMA, createInitialState, gameReducer, pushKomaAt } from '../src/store/gameReducer.ts';
import { STRIP_COPIES, reelPosAt, translatePercent } from '../src/ui/reelMath.ts';

const NO_EFFECT = { leverSound: 'none', blackout: false, flash: 'none', lamp: 'none', bgm: 'none' } as const;

/** translateY（%）から、中段に来ている帯のセル index を逆算する */
function centerCellIndex(pct: number): number {
  // translate = (1 - cell) / 63 * 100 → cell = 1 - translate * 63 / 100
  return 1 - (pct * KOMA_COUNT * STRIP_COPIES) / 100;
}

describe('リール表示の計算', () => {
  it('整数の pos では、そのコマ番号の図柄が中段に来る', () => {
    for (let koma = 1; koma <= KOMA_COUNT; koma++) {
      const cell = centerCellIndex(translatePercent(koma));
      expect(cell).toBeCloseTo(Math.round(cell), 6);
      const idx = Math.round(cell) % KOMA_COUNT;
      expect(REELS[0][idx]).toBe(symbolAt(0, koma));
    }
  });

  it('pos が増えると帯は下へ動く（translateY が増える）。21 を超えても連続', () => {
    expect(translatePercent(5.5)).toBeGreaterThan(translatePercent(5));
    expect(translatePercent(22)).toBeCloseTo(translatePercent(1), 9);
    expect(translatePercent(-1)).toBeCloseTo(translatePercent(20), 9);
  });

  it('回転中の位置は reducer の押下コマ番号と一致し、停止後はスベリ分だけ進んで止まる', () => {
    let s: GameState = createInitialState(1, 1, 0);
    s = gameReducer(s, { type: 'BET' });
    s = gameReducer(s, { type: 'LEVER', lottery: { small: null, bonus: null }, carriedBonus: null, effect: NO_EFFECT, now: 1000 });
    const t = 1000 + MS_PER_KOMA * 7.3;
    expect(normalizeKoma(Math.floor(reelPosAt(s, 0, t)))).toBe(pushKomaAt(s, 0, t));
    expect(reelPosAt(s, 0, 900)).toBe(21); // 開始前は動かない

    const result = decideStop({ reel: 0, pushKoma: pushKomaAt(s, 0, t), stopped: s.positions, flags: { small: null, bonus: null }, mode: 'normal' });
    s = gameReducer(s, { type: 'STOP', result, now: t });
    const target = 21 + 7 + result.slip; // spinFrom + 経過コマ + スベリ
    expect(reelPosAt(s, 0, t)).toBeCloseTo(21 + 7.3, 6); // 押した瞬間はまだ途中
    expect(reelPosAt(s, 0, t + MS_PER_KOMA * 10)).toBe(target); // 十分時間が経てば止まっている
    expect(normalizeKoma(target)).toBe(result.stopKoma);
    // 未停止のリールは回り続ける
    expect(reelPosAt(s, 1, t + MS_PER_KOMA * 10)).toBeGreaterThan(reelPosAt(s, 1, t));
  });
});
