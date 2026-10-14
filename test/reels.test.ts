import { describe, expect, it } from 'vitest';
import { REELS, KOMA_COUNT, komaToIndex, indexToKoma, normalizeKoma, symbolAt, windowAt, slipKoma, komaListOf } from '../src/config/reels.ts';
import type { ReelIndex, SymbolId } from '../src/shared/types.ts';

/** 配列中の図柄を数える */
function countSymbols(strip: readonly SymbolId[]): Record<SymbolId, number> {
  const c: Record<SymbolId, number> = { seven: 0, g: 0, bar: 0, bell: 0, melon: 0, cherry: 0, replay: 0 };
  for (const s of strip) c[s]++;
  return c;
}

describe('リール配列', () => {
  it('3 リールある', () => {
    expect(REELS).toHaveLength(3);
  });

  it('各リールが 21 コマ', () => {
    expect(KOMA_COUNT).toBe(21);
    for (const strip of REELS) expect(strip).toHaveLength(21);
  });

  it('左リールの図柄個数: G4・赤7 1・BAR1・ベル5・リプレイ5・スイカ3・チェリー2', () => {
    expect(countSymbols(REELS[0])).toEqual({ g: 4, seven: 1, bar: 1, bell: 5, replay: 5, melon: 3, cherry: 2 });
  });

  it('中リールの図柄個数: G1・赤7 1・BAR1・ベル6・リプレイ6・スイカ3・チェリー3', () => {
    expect(countSymbols(REELS[1])).toEqual({ g: 1, seven: 1, bar: 1, bell: 6, replay: 6, melon: 3, cherry: 3 });
  });

  it('右リールの図柄個数: G1・赤7 1・BAR1・ベル6・リプレイ6・スイカ4・チェリー2', () => {
    expect(countSymbols(REELS[2])).toEqual({ g: 1, seven: 1, bar: 1, bell: 6, replay: 6, melon: 4, cherry: 2 });
  });

  it('配列は指定どおり（上から 21番→1番）', () => {
    // 仕様書の並びをそのまま転記して照合する
    const left = 'リプレイ, G, G, G, ベル, リプレイ, スイカ, ベル, 赤7, リプレイ, スイカ, チェリー, G, ベル, リプレイ, チェリー, BAR, ベル, スイカ, リプレイ, ベル';
    const center = 'リプレイ, ベル, チェリー, スイカ, 赤7, リプレイ, ベル, G, リプレイ, ベル, チェリー, スイカ, チェリー, リプレイ, ベル, BAR, リプレイ, ベル, スイカ, リプレイ, ベル';
    const right = 'スイカ, リプレイ, チェリー, 赤7, ベル, スイカ, リプレイ, ベル, BAR, リプレイ, G, ベル, スイカ, リプレイ, チェリー, ベル, リプレイ, スイカ, ベル, リプレイ, ベル';
    const map: Record<string, SymbolId> = { 赤7: 'seven', G: 'g', BAR: 'bar', ベル: 'bell', スイカ: 'melon', チェリー: 'cherry', リプレイ: 'replay' };
    const toIds = (s: string) => s.split(',').map((x) => map[x.trim()]);
    expect(REELS[0]).toEqual(toIds(left));
    expect(REELS[1]).toEqual(toIds(center));
    expect(REELS[2]).toEqual(toIds(right));
  });
});

describe('コマ番号の変換', () => {
  it('21番 = index 0、1番 = index 20', () => {
    expect(komaToIndex(21)).toBe(0);
    expect(komaToIndex(1)).toBe(20);
    expect(indexToKoma(0)).toBe(21);
    expect(indexToKoma(20)).toBe(1);
  });

  it('normalizeKoma は 1〜21 に丸める（21 の次は 1）', () => {
    expect(normalizeKoma(22)).toBe(1);
    expect(normalizeKoma(0)).toBe(21);
    expect(normalizeKoma(25)).toBe(4);
    expect(normalizeKoma(-1)).toBe(20);
  });

  it('停止位置 = 押下コマ番号 + スベリ数', () => {
    expect(slipKoma(5, 0)).toBe(5);
    expect(slipKoma(5, 4)).toBe(9);
    expect(slipKoma(19, 4)).toBe(2);
    expect(slipKoma(21, 1)).toBe(1);
  });

  it('左リール: 21番はリプレイ、1番はベル、13番は赤7（上から 9 番目）', () => {
    expect(symbolAt(0, 21)).toBe('replay');
    expect(symbolAt(0, 1)).toBe('bell');
    expect(symbolAt(0, 13)).toBe('seven'); // 上から 9 番目 = 21-9+1 = 13 番
  });

  it('窓は [上段 = koma+1, 中段 = koma, 下段 = koma-1]', () => {
    for (const reel of [0, 1, 2] as ReelIndex[]) {
      for (let k = 1; k <= 21; k++) {
        expect(windowAt(reel, k)).toEqual([symbolAt(reel, k + 1), symbolAt(reel, k), symbolAt(reel, k - 1)]);
      }
    }
    // 1 番が中段なら上段は 2 番、下段は 21 番
    expect(windowAt(0, 1)).toEqual([symbolAt(0, 2), symbolAt(0, 1), symbolAt(0, 21)]);
  });

  it('komaListOf は図柄のあるコマ番号を返す', () => {
    expect(komaListOf(0, 'seven')).toEqual([13]);
    expect(komaListOf(1, 'bar')).toEqual([6]); // 上から 16 番目 = 21-16+1 = 6
    expect(komaListOf(2, 'g')).toEqual([11]); // 上から 11 番目 = 11
    expect(komaListOf(0, 'g')).toHaveLength(4);
  });
});
