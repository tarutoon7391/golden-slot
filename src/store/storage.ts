import type { GameState } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';

/**
 * localStorage への保存・復元
 * 失敗しても落とさない（プライベートモード・容量超過・壊れたデータはすべて null 扱い）
 */

interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

/** テストで差し替えられるよう、Storage 風のインターフェースだけに依存する */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 保存データとして最低限の形をしているか */
export function isGameStateLike(x: unknown): x is GameState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.setting === 'number' &&
    typeof s.phase === 'string' &&
    typeof s.coins === 'number' &&
    Array.isArray(s.positions) &&
    !!s.counters &&
    typeof s.counters === 'object'
  );
}

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFile = { version: MACHINE.saveVersion, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(text: string | null): GameState | null {
  if (!text) return null;
  try {
    const file = JSON.parse(text) as Partial<SaveFile>;
    if (file.version !== MACHINE.saveVersion) return null;
    if (!isGameStateLike(file.state)) return null;
    // -Infinity は JSON にできず null になるので戻す
    const s = file.state as GameState & { lastLeverAt: number | null };
    return { ...s, lastLeverAt: s.lastLeverAt ?? -Infinity };
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MACHINE.storageKey, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage: StorageLike | null = defaultStorage()): GameState | null {
  if (!storage) return null;
  try {
    return deserialize(storage.getItem(MACHINE.storageKey));
  } catch {
    return null;
  }
}

export function clearGame(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(MACHINE.storageKey);
  } catch {
    // 無視
  }
}
