import type { LineDef, LineId } from '../shared/types.ts';

/**
 * 有効ライン（5 本・3 枚掛け固定）
 * rows は [左の段, 中の段, 右の段]。段は 0=上段, 1=中段, 2=下段
 */
export const LINES: readonly LineDef[] = [
  { id: 'top', rows: [0, 0, 0] },
  { id: 'middle', rows: [1, 1, 1] },
  { id: 'bottom', rows: [2, 2, 2] },
  { id: 'downRight', rows: [0, 1, 2] }, // 右下がり
  { id: 'upRight', rows: [2, 1, 0] }, // 右上がり
];

export const LINE_LABELS: Record<LineId, string> = {
  top: '上段',
  middle: '中段',
  bottom: '下段',
  downRight: '右下がり',
  upRight: '右上がり',
};
