import { useSyncExternalStore } from 'react';

/**
 * 「時刻 deadline を過ぎたか」を返す hook。
 * 過ぎていなければ deadline でちょうど再描画される。描画中に Date.now() を呼ばないための仕組み。
 */
export function useDeadlinePassed(deadline: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const ms = deadline - Date.now();
      if (ms <= 0) return () => {};
      const t = setTimeout(onChange, ms + 5);
      return () => clearTimeout(t);
    },
    () => Date.now() >= deadline,
    () => true,
  );
}
