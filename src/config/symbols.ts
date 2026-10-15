import type { SymbolId } from '../shared/types.ts';

/**
 * 図柄の表示情報。
 * 画像は public/symbols/<id>.svg に 1 図柄 1 ファイルで置く。
 * PNG に差し替えたいときは imagePath を変えるだけでよい。
 */
export interface SymbolInfo {
  id: SymbolId;
  /** 表示名 */
  label: string;
  /** 画像パス（public 直下からの絶対パス） */
  imagePath: string;
}

export const SYMBOLS: Record<SymbolId, SymbolInfo> = {
  seven: { id: 'seven', label: '赤7', imagePath: '/symbols/seven.svg' },
  g: { id: 'g', label: 'G', imagePath: '/symbols/g.svg' },
  bar: { id: 'bar', label: 'BAR', imagePath: '/symbols/bar.svg' },
  bell: { id: 'bell', label: 'ベル', imagePath: '/symbols/bell.svg' },
  melon: { id: 'melon', label: 'スイカ', imagePath: '/symbols/melon.svg' },
  cherry: { id: 'cherry', label: 'チェリー', imagePath: '/symbols/cherry.svg' },
  replay: { id: 'replay', label: 'リプレイ', imagePath: '/symbols/replay.svg' },
};

/**
 * 目押し用に光らせる図柄（色は CSS の drop-shadow に使う）。
 * isolatedOnly: 前後のコマが同じ図柄でないときだけ光らせる。
 *   左リールの G 3 連は見つけやすいので光らせず、単独 G だけ光らせるための設定。
 */
export interface GlowInfo {
  color: string;
  isolatedOnly?: boolean;
}

export const GLOW: Partial<Record<SymbolId, GlowInfo>> = {
  seven: { color: '#ff1f1f' },
  g: { color: '#ff9d00', isolatedOnly: true },
};

/** 全図柄IDの一覧（順序は表示用） */
export const SYMBOL_IDS: readonly SymbolId[] = ['seven', 'g', 'bar', 'bell', 'melon', 'cherry', 'replay'];
