import type { KomaNo, ReelIndex, StopPositions, SymbolId, Window } from '../shared/types.ts';
import { windowAt } from '../config/reels.ts';

/** 1 リールぶんの窓（[上段, 中段, 下段]） */
export type ReelWindow = readonly [SymbolId, SymbolId, SymbolId];

/** 途中停止の窓。未停止のリールは null */
export type PartialWindow = readonly [ReelWindow | null, ReelWindow | null, ReelWindow | null];

/** 停止位置（途中可）から窓を作る */
export function buildPartialWindow(positions: StopPositions): PartialWindow {
  return [
    positions[0] === null ? null : windowAt(0, positions[0]),
    positions[1] === null ? null : windowAt(1, positions[1]),
    positions[2] === null ? null : windowAt(2, positions[2]),
  ];
}

/** 全停止の窓を作る */
export function buildWindow(positions: readonly [KomaNo, KomaNo, KomaNo]): Window {
  return [windowAt(0, positions[0]), windowAt(1, positions[1]), windowAt(2, positions[2])];
}

/** 停止位置に 1 リールぶんを差し込んだ新しい停止位置を返す */
export function withStop(positions: StopPositions, reel: ReelIndex, koma: KomaNo): StopPositions {
  const next: [KomaNo | null, KomaNo | null, KomaNo | null] = [positions[0], positions[1], positions[2]];
  next[reel] = koma;
  return next;
}

/** 3 リールすべて止まっているか */
export function isAllStopped(positions: StopPositions): positions is readonly [KomaNo, KomaNo, KomaNo] {
  return positions[0] !== null && positions[1] !== null && positions[2] !== null;
}
