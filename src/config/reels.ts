import type { KomaNo, ReelIndex, ReelStrip, SymbolId } from '../shared/types.ts';
import { MACHINE } from './machine.ts';

/**
 * リール配列（確定済み・実装の都合で変更しない）
 *
 * 各配列は「上から 21番 → 1番」の順。index 0 が 21番、index 20 が 1番。
 * リールは上から下へ流れるので、中段に n 番があるとき 上段は n+1 番、下段は n−1 番。
 * 押下位置から k コマすべった停止位置は「押下コマ番号 + k」（21 の次は 1）。
 */
export const REELS: readonly [ReelStrip, ReelStrip, ReelStrip] = [
  // 左
  ['replay', 'g', 'g', 'g', 'bell', 'replay', 'melon', 'bell', 'seven', 'replay', 'melon', 'cherry', 'g', 'bell', 'replay', 'cherry', 'bar', 'bell', 'melon', 'replay', 'bell'],
  // 中
  ['replay', 'bell', 'cherry', 'melon', 'seven', 'replay', 'bell', 'g', 'replay', 'bell', 'cherry', 'melon', 'cherry', 'replay', 'bell', 'bar', 'replay', 'bell', 'melon', 'replay', 'bell'],
  // 右
  ['melon', 'replay', 'cherry', 'seven', 'bell', 'melon', 'replay', 'bell', 'bar', 'replay', 'g', 'bell', 'melon', 'replay', 'cherry', 'bell', 'replay', 'melon', 'bell', 'replay', 'bell'],
];

/** 1 リールのコマ数 */
export const KOMA_COUNT = MACHINE.komaCount;

/** コマ番号を 1〜21 の範囲に正規化する（0 → 21、22 → 1） */
export function normalizeKoma(koma: number): KomaNo {
  const m = ((koma - 1) % KOMA_COUNT + KOMA_COUNT) % KOMA_COUNT;
  return m + 1;
}

/** コマ番号 → 配列 index（21番 = 0, 1番 = 20） */
export function komaToIndex(koma: KomaNo): number {
  return KOMA_COUNT - normalizeKoma(koma);
}

/** 配列 index → コマ番号 */
export function indexToKoma(index: number): KomaNo {
  return KOMA_COUNT - index;
}

/** 指定リールの指定コマ番号にある図柄 */
export function symbolAt(reel: ReelIndex, koma: KomaNo): SymbolId {
  return REELS[reel][komaToIndex(koma)];
}

/**
 * 中段に koma 番が止まったときの窓の 3 図柄 [上段, 中段, 下段]
 * 上段 = koma+1、下段 = koma−1
 */
export function windowAt(reel: ReelIndex, koma: KomaNo): readonly [SymbolId, SymbolId, SymbolId] {
  return [symbolAt(reel, koma + 1), symbolAt(reel, koma), symbolAt(reel, koma - 1)];
}

/** 押下コマ番号から slip コマすべった停止コマ番号 */
export function slipKoma(pushKoma: KomaNo, slip: number): KomaNo {
  return normalizeKoma(pushKoma + slip);
}

/** 指定リールで symbol が存在するコマ番号の一覧（昇順） */
export function komaListOf(reel: ReelIndex, symbol: SymbolId): KomaNo[] {
  const list: KomaNo[] = [];
  for (let k = 1; k <= KOMA_COUNT; k++) if (symbolAt(reel, k) === symbol) list.push(k);
  return list;
}
