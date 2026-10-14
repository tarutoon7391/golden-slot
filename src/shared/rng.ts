/**
 * 乱数の集約モジュール
 * - ゲーム内のすべての乱数はここを通す（Math.random の直呼びは禁止）
 * - シードを指定すれば同じ結果を再現できる（テスト・デバッグ用）
 * - アルゴリズムは xoshiro128**（32bit×4 状態・軽量で周期が長い）
 */

export interface Rng {
  /** 生成時のシード（再現用に保持） */
  readonly seed: number;
  /** [0, 1) の浮動小数を返す */
  next(): number;
  /** [0, max) の整数を返す（max は 1 以上の整数） */
  nextInt(max: number): number;
  /** 分母 denom の抽選。 numer/denom の確率で true */
  hit(numer: number, denom: number): boolean;
  /** 重み付きで配列からインデックスを1つ選ぶ */
  pickWeighted(weights: readonly number[]): number;
}

/** 32bit 整数の掛け算（Math.imul と同等） */
function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32: 1つのシードから 4 つの内部状態を作る */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/**
 * シード指定で乱数生成器を作る。
 * seed を省略すると時刻ベースで自動生成する（この場合も seed プロパティで値を参照できる）。
 */
export function createRng(seed?: number): Rng {
  const actualSeed = seed === undefined ? autoSeed() : seed >>> 0;
  const sm = splitmix32(actualSeed);
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();
  // 全ゼロ状態は xoshiro で禁止なので回避
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  const rng: Rng = {
    seed: actualSeed,
    next: () => nextU32() / 4294967296,
    nextInt: (max: number) => {
      if (!Number.isInteger(max) || max < 1) {
        throw new Error(`nextInt: max は 1 以上の整数が必要です (${max})`);
      }
      return Math.floor(rng.next() * max);
    },
    hit: (numer: number, denom: number) => rng.nextInt(denom) < numer,
    pickWeighted: (weights: readonly number[]) => {
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) throw new Error('pickWeighted: 重みの合計が 0 です');
      let r = rng.nextInt(total);
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
  };
  return rng;
}

/** シード省略時の自動シード（時刻と高分解能タイマーを混ぜる。Math.random は使わない） */
function autoSeed(): number {
  const t = Date.now();
  const p =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? Math.floor(performance.now() * 1000)
      : 0;
  return ((t ^ (p * 2654435761)) >>> 0) || 1;
}

/**
 * アプリ全体で共有する既定の乱数生成器。
 * デバッグモードでシードを固定するときは setGlobalRng() で差し替える。
 */
let globalRng: Rng = createRng();

export function getRng(): Rng {
  return globalRng;
}

export function setGlobalRng(rng: Rng): void {
  globalRng = rng;
}
