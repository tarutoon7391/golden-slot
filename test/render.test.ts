import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { GameState } from '../src/shared/types.ts';
import { MACHINE } from '../src/config/machine.ts';
import { createInitialState } from '../src/store/gameReducer.ts';
import type { GameApi } from '../src/store/useGame.ts';
import { Cabinet } from '../src/ui/Cabinet.tsx';
import { ReelWindow } from '../src/ui/ReelWindow.tsx';
import { ResultScreen } from '../src/ui/ResultScreen.tsx';

/**
 * 画面のスモークテスト（ブラウザなし）
 * localStorage・AudioContext・requestAnimationFrame が無い環境でも描画が落ちないことを確認する。
 */

function fakeApi(state: GameState): GameApi {
  const noop = () => {};
  return { state, maxBet: noop, lever: noop, stop: noop, quit: noop, newGame: noop, refill: noop, now: () => 0, debugSet: noop };
}

describe('画面の描画', () => {
  const base = createInitialState(2, 7, 0);

  it('筐体（idle）: 機種名・データカウンター・3 リール・操作ボタンが出る', () => {
    const html = renderToString(createElement(Cabinet, { api: fakeApi(base) }));
    expect(html).toContain(MACHINE.name);
    expect(html).toContain('回転数');
    expect((html.match(/class="reel"/g) ?? []).length).toBe(3);
    expect((html.match(/class="cell( glow)?"/g) ?? []).length).toBe(21 * 3 * 3);
    expect(html).toContain('aria-label="レバー"');
    expect(html).toContain('aria-label="左ストップ"');
    expect(html).toContain(String(MACHINE.initialCoins));
  });

  it('設定発表画面: 設定と推測が出る', () => {
    const ended: GameState = { ...base, phase: 'ended' };
    const html = renderToString(createElement(ResultScreen, { state: ended, onNewGame: () => {} }));
    expect(html).toContain('設定発表');
    expect(html).toContain('設定 <!-- -->2');
    expect(html).toContain('データからの推測');
  });

  it('リール窓は入賞ラインの強調クラスを付けられる', () => {
    const html = renderToString(createElement(ReelWindow, { state: base, highlightLines: ['middle'] }));
    expect((html.match(/payline hit/g) ?? []).length).toBe(1);
  });

  it('赤7 と単独 G のコマに発光クラスが付く（左リール: 7 が 1 個・単独 G が 1 個、3 周で 6 個）', () => {
    const html = renderToString(createElement(ReelWindow, { state: base }));
    // 左 1 + 中 1 + 右 1 の赤7、左の単独 G 1 + 中 1 + 右 1 = 6 コマ × 3 周
    expect((html.match(/class="cell glow"/g) ?? []).length).toBe(6 * 3);
  });

  it('図柄画像のパスは public/symbols 配下の SVG', () => {
    const html = renderToString(createElement(ReelWindow, { state: base }));
    expect(html).toMatch(/src="\/symbols\/seven\.svg"/);
    expect(html).toMatch(/src="\/symbols\/g\.svg"/);
  });
});
