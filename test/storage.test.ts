import { describe, expect, it } from 'vitest';
import { MACHINE } from '../src/config/machine.ts';
import { createInitialState } from '../src/store/gameReducer.ts';
import { clearGame, deserialize, loadGame, saveGame, serialize, type StorageLike } from '../src/store/storage.ts';

/** メモリ上の Storage（テスト用） */
function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('保存・復元', () => {
  const state = createInitialState(4, 123, 0);

  it('保存して読み戻すと同じ状態になる（lastLeverAt の -Infinity も戻る）', () => {
    const st = memoryStorage();
    expect(saveGame(state, st)).toBe(true);
    const loaded = loadGame(st);
    expect(loaded).toEqual(state);
    expect(loaded?.lastLeverAt).toBe(-Infinity);
  });

  it('v2 の保存データは v3 に移行され、フラッシュなし・ランプ全消灯で埋まる', () => {
    const { flash: _f, lamp: _l, ...old } = state;
    const loaded = deserialize(JSON.stringify({ version: 2, savedAt: 0, state: old }));
    expect(MACHINE.saveVersion).toBe(3);
    expect(loaded).toEqual(state);
    expect(loaded?.flash).toBeNull();
    expect(loaded?.lamp).toEqual({ count: 0, lit: [false, false, false] });
  });

  it('壊れた JSON・バージョン違い・形の違うデータは null', () => {
    expect(deserialize('{not json')).toBeNull();
    expect(deserialize(null)).toBeNull();
    expect(deserialize(JSON.stringify({ version: MACHINE.saveVersion + 1, state }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: MACHINE.saveVersion, state: { foo: 1 } }))).toBeNull();
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('Storage が無い・例外を投げるときも落ちない', () => {
    expect(saveGame(state, null)).toBe(false);
    expect(loadGame(null)).toBeNull();
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('quota');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveGame(state, broken)).toBe(false);
    expect(loadGame(broken)).toBeNull();
    expect(() => clearGame(broken)).not.toThrow();
  });

  it('clearGame で消える', () => {
    const st = memoryStorage();
    saveGame(state, st);
    clearGame(st);
    expect(loadGame(st)).toBeNull();
  });
});
