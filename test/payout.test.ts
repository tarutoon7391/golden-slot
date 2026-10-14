import { describe, expect, it } from 'vitest';
import type { Window } from '../src/shared/types.ts';
import { judgeWindow, matchAll, rolesIn } from '../src/payout/judge.ts';
import { buildWindow } from '../src/reel/window.ts';
import { MAX_PAYOUT_PER_GAME } from '../src/config/roles.ts';

/** 窓を作るヘルパー（[左, 中, 右] それぞれ [上, 中, 下]） */
const W = (l: string[], c: string[], r: string[]): Window => [l, c, r] as unknown as Window;

describe('払い出し判定', () => {
  it('ベル中段揃いは 8 枚', () => {
    const r = judgeWindow(W(['replay', 'bell', 'g'], ['cherry', 'bell', 'melon'], ['g', 'bell', 'replay']), 'normal');
    expect(r.hits).toEqual([{ patternId: 'BELL', role: 'BELL', line: 'middle', payout: 8 }]);
    expect(r.totalPayout).toBe(8);
    expect(r.replay).toBe(false);
    expect(r.bonusHit).toBeNull();
  });

  it('ボーナス中のベルは 15 枚', () => {
    const r = judgeWindow(W(['replay', 'bell', 'g'], ['cherry', 'bell', 'melon'], ['g', 'bell', 'replay']), 'big');
    expect(r.totalPayout).toBe(15);
  });

  it('リプレイ右下がりは払い出し 0 で replay=true', () => {
    const r = judgeWindow(W(['replay', 'g', 'bell'], ['bell', 'replay', 'cherry'], ['melon', 'g', 'replay']), 'normal');
    expect(r.hits.map((h) => h.line)).toEqual(['downRight']);
    expect(r.replay).toBe(true);
    expect(r.totalPayout).toBe(0);
  });

  it('スイカ 3 つ揃い（右上がり）は 15 枚', () => {
    const r = judgeWindow(W(['g', 'bell', 'melon'], ['bell', 'melon', 'cherry'], ['melon', 'g', 'replay']), 'normal');
    expect(r.hits).toEqual([{ patternId: 'MELON', role: 'MELON', line: 'upRight', payout: 15 }]);
  });

  it('左スイカ・中スイカ・右BAR は代用スイカで 15 枚', () => {
    const r = judgeWindow(W(['g', 'melon', 'bell'], ['bell', 'melon', 'cherry'], ['replay', 'bar', 'g']), 'normal');
    expect(r.hits).toEqual([{ patternId: 'MELON_BAR', role: 'MELON', line: 'middle', payout: 15 }]);
  });

  it('角チェリー（上段・下段）は 4 枚、中段チェリーは 2 枚。中・右は問わない', () => {
    const top = judgeWindow(W(['cherry', 'g', 'bell'], ['bell', 'melon', 'cherry'], ['replay', 'g', 'bell']), 'normal');
    expect(top.hits).toEqual([{ patternId: 'CHERRY_CORNER', role: 'CHERRY', line: null, payout: 4 }]);
    const bottom = judgeWindow(W(['g', 'bell', 'cherry'], ['bell', 'melon', 'cherry'], ['replay', 'g', 'bell']), 'normal');
    expect(bottom.totalPayout).toBe(4);
    const mid = judgeWindow(W(['g', 'cherry', 'bell'], ['bell', 'melon', 'cherry'], ['replay', 'g', 'bell']), 'normal');
    expect(mid.hits).toEqual([{ patternId: 'CHERRY_MIDDLE', role: 'CHERRY', line: null, payout: 2 }]);
  });

  it('中・右リールだけのチェリーは入賞しない', () => {
    const r = judgeWindow(W(['g', 'bell', 'replay'], ['cherry', 'cherry', 'cherry'], ['cherry', 'g', 'bell']), 'normal');
    expect(r.hits).toEqual([]);
  });

  it('G 揃い・赤7 揃いは BIG、BAR 揃いは REG', () => {
    const g = judgeWindow(W(['g', 'bell', 'replay'], ['bell', 'g', 'cherry'], ['replay', 'bell', 'g']), 'normal');
    expect(g.bonusHit).toBe('BIG');
    expect(g.hits[0].patternId).toBe('BIG_G');
    expect(g.hits[0].line).toBe('downRight');
    const seven = judgeWindow(W(['seven', 'bell', 'replay'], ['seven', 'g', 'cherry'], ['seven', 'bell', 'g']), 'normal');
    expect(seven.bonusHit).toBe('BIG');
    expect(seven.hits[0].patternId).toBe('BIG_SEVEN');
    const bar = judgeWindow(W(['g', 'bell', 'bar'], ['bell', 'bar', 'cherry'], ['bar', 'bell', 'g']), 'normal');
    expect(bar.bonusHit).toBe('REG');
    expect(bar.totalPayout).toBe(0);
  });

  it('複数ライン入賞の合計は 1 ゲーム上限で止まる', () => {
    // 上段と下段にベル → 16 枚 → 上限 15 枚
    const r = judgeWindow(W(['bell', 'g', 'bell'], ['bell', 'melon', 'bell'], ['bell', 'cherry', 'bell']), 'normal');
    expect(r.hits).toHaveLength(2);
    expect(r.totalPayout).toBe(MAX_PAYOUT_PER_GAME);
  });

  it('ハズレ目は何も入賞しない', () => {
    const r = judgeWindow(W(['g', 'bell', 'replay'], ['bell', 'melon', 'cherry'], ['replay', 'g', 'bell']), 'normal');
    expect(r.hits).toEqual([]);
    expect(r.totalPayout).toBe(0);
    expect(rolesIn(W(['g', 'bell', 'replay'], ['bell', 'melon', 'cherry'], ['replay', 'g', 'bell']))).toEqual([]);
  });

  it('途中停止の窓は open（成立の可能性）を返す', () => {
    const partial = [['g', 'bell', 'replay'], null, null] as const;
    const states = matchAll(partial as never).map((m) => m.state);
    expect(states.every((s) => s === 'open')).toBe(true);
    // 左にベル・リプレイ・G があるので、その 3 役の入賞形が open
    const roles = new Set(matchAll(partial as never).map((m) => m.pattern.role));
    expect([...roles].sort()).toEqual(['BELL', 'BIG', 'REPLAY']);
  });

  it('実配列から作った窓でも判定できる（左21・中21・右21 を中段）', () => {
    const w = buildWindow([21, 21, 21]);
    // 左21=リプレイ, 中21=リプレイ, 右21=スイカ → 中段はリプ・リプ・スイカで不成立
    expect(w[0][1]).toBe('replay');
    expect(w[1][1]).toBe('replay');
    expect(w[2][1]).toBe('melon');
    expect(judgeWindow(w, 'normal').replay).toBe(false);
  });
});
