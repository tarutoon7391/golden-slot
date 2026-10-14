/**
 * PC のキー操作の割り当て
 * 値は KeyboardEvent.key（大文字小文字は区別しない）。複数書けばどれでも効く。
 */
export type KeyAction = 'maxBet' | 'lever' | 'stopLeft' | 'stopCenter' | 'stopRight' | 'quit';

export const KEYS: Record<KeyAction, readonly string[]> = {
  /** MAXBET */
  maxBet: ['1', 'b', 'ArrowUp'],
  /** レバー */
  lever: ['Enter', ' ', 'ArrowDown'],
  /** 左ストップ */
  stopLeft: ['ArrowLeft', 'z', 'j'],
  /** 中ストップ */
  stopCenter: ['x', 'k'],
  /** 右ストップ */
  stopRight: ['ArrowRight', 'c', 'l'],
  /** やめる */
  quit: ['Escape'],
};

/** 画面のヘルプに出す表記 */
export const KEY_LABELS: Record<KeyAction, string> = {
  maxBet: 'MAXBET: 1 / B / ↑',
  lever: 'レバー: Enter / Space / ↓',
  stopLeft: '左: ← / Z',
  stopCenter: '中: X',
  stopRight: '右: → / C',
  quit: 'やめる: Esc',
};

/** キーからアクションを引く（該当なしは null） */
export function actionForKey(key: string): KeyAction | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  for (const action of Object.keys(KEYS) as KeyAction[]) {
    if (KEYS[action].some((x) => (x.length === 1 ? x.toLowerCase() : x) === k)) return action;
  }
  return null;
}
