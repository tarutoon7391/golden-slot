import type { FlashId, ReelIndex, RowIndex } from '../shared/types.ts';

/**
 * リールフラッシュ 6 種の動き（フェーズ8b・演出仕様 v1.0 §1.1）
 *
 * 窓の 9 コマを [リール, 段] で指し、steps の順に光らせる。
 * - 各ステップの開始時刻は durationMs を steps 数で等分した位置（0, 1/n, 2/n, …）
 * - cellMs は 1 コマが光っている時間。ステップ間隔より長くすると光が尾を引いて流れる
 * 見た目（色・形）は cabinet.css の .flash-cell。ここは順番と時間だけ。出すタイミングは第 3 停止の直後（ui/Cabinet.tsx）。
 * 発生率（どの役で何 % 出るか）はフェーズ8c の effects/flashTable.ts に置く。
 */

/** 窓のコマ [リール(0=左,1=中,2=右), 段(0=上,1=中,2=下)] */
export type FlashCell = readonly [ReelIndex, RowIndex];

export interface FlashDef {
  id: FlashId;
  /** 表示名 */
  label: string;
  /** 全体の長さ（ms）。最初のステップから最後のステップの開始まで */
  durationMs: number;
  /** 1 コマが光っている時間（ms） */
  cellMs: number;
  /** 光らせる順。同じステップのコマは同時に光る */
  steps: readonly (readonly FlashCell[])[];
}

export const FLASHES: Record<FlashId, FlashDef> = {
  // 3 リール同時に、下段 → 中段 → 上段へゆっくり光が上がる
  REP: {
    id: 'REP',
    label: 'リプレイF',
    durationMs: 800,
    cellMs: 450,
    steps: [
      [[0, 2], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1]],
      [[0, 0], [1, 0], [2, 0]],
    ],
  },
  // 中央（中リール中段）以外の 8 コマが、左上から時計回りに 1 周光る
  BELL: {
    id: 'BELL',
    label: 'ベルF',
    durationMs: 800,
    cellMs: 220,
    steps: [[[0, 0]], [[1, 0]], [[2, 0]], [[2, 1]], [[2, 2]], [[1, 2]], [[0, 2]], [[0, 1]]],
  },
  // 右上から左下へ、剣で斬るように一直線に速く光る
  MEL: {
    id: 'MEL',
    label: 'スイカF',
    durationMs: 360,
    cellMs: 240,
    steps: [[[2, 0]], [[1, 1]], [[0, 2]]],
  },
  // 左リールのみ、上段 → 中段 → 下段へゆっくり光が下りる
  CHER: {
    id: 'CHER',
    label: 'チェリーF',
    durationMs: 800,
    cellMs: 450,
    steps: [[[0, 0]], [[0, 1]], [[0, 2]]],
  },
  // 右上と左上から同時に、斜め下へ速く光る（X 字）
  CMEL: {
    id: 'CMEL',
    label: 'チャンススイカF',
    durationMs: 400,
    cellMs: 240,
    steps: [
      [[2, 0], [0, 0]],
      [[1, 1]],
      [[0, 2], [2, 2]],
    ],
  },
  // 左 → 中 → 右の順に、各リールが下段 → 上段へ速く光る（1 リール 160ms）
  CCHER: {
    id: 'CCHER',
    label: 'チャンスチェリーF',
    durationMs: 480,
    cellMs: 150,
    steps: [[[0, 2]], [[0, 1]], [[0, 0]], [[1, 2]], [[1, 1]], [[1, 0]], [[2, 2]], [[2, 1]], [[2, 0]]],
  },
};

/** 全フラッシュ ID（デバッグパネルの並び順） */
export const FLASH_IDS: readonly FlashId[] = ['REP', 'BELL', 'MEL', 'CHER', 'CMEL', 'CCHER'];

/** ステップ間隔（ms） */
export function flashIntervalMs(def: FlashDef): number {
  return def.durationMs / def.steps.length;
}

/** 最初の光り始めから最後の光が消えるまで（ms）。画面はこの時間が過ぎたらフラッシュを消す */
export function flashTotalMs(def: FlashDef): number {
  return flashIntervalMs(def) * (def.steps.length - 1) + def.cellMs;
}

/**
 * 9 コマそれぞれの光り始め（ms）。光らないコマは null。
 * 並びは画面の grid と同じ行優先: index = 段 × 3 + リール（上段の左・中・右, 中段の…, 下段の…）
 */
export function flashCellDelays(def: FlashDef): (number | null)[] {
  const delays: (number | null)[] = Array.from({ length: 9 }, () => null);
  const interval = flashIntervalMs(def);
  def.steps.forEach((cells, i) => {
    for (const [reel, row] of cells) {
      const idx = row * 3 + reel;
      if (delays[idx] === null) delays[idx] = i * interval;
    }
  });
  return delays;
}
