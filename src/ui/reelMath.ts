import type { GameState, ReelIndex } from '../shared/types.ts';
import { KOMA_COUNT, normalizeKoma } from '../config/reels.ts';
import { MS_PER_KOMA } from '../store/gameReducer.ts';

/**
 * リール表示の計算（ReelWindow から分離。テストしやすくするため）
 *
 * 位置は「中段にあるコマ番号」を実数で持つ（pos・正規化しない）。
 * - 回転中: pos = spinFrom + 経過時間 ÷ MS_PER_KOMA（reducer の pushKomaAt と同じ式）
 * - 停止後: 押した時刻の pos から前方に進んで stopKoma で止まる（decideStop の結果どおり）。
 *   通常は押下位置 + スベリ数。デバッグで押下位置を差し替えたときも必ず stopKoma に合わせる
 */

/** 帯に並べる配列の周回数 */
export const STRIP_COPIES = 3;

/** 時刻 t でのリールの位置 */
export function reelPosAt(s: GameState, reel: ReelIndex, t: number): number {
  const stopped = s.positions[reel];
  if (s.phase !== 'spinning' && s.phase !== 'payout') return stopped ?? s.spinFrom[reel];
  if (t < s.spinStartAt) return s.spinFrom[reel];
  const cur = s.spinFrom[reel] + (t - s.spinStartAt) / MS_PER_KOMA;
  if (stopped === null) return cur;
  const stopAt = s.stopAt[reel];
  const result = s.stops[reel];
  if (stopAt === null || !result) return stopped;
  const pushPos = s.spinFrom[reel] + Math.floor(Math.max(0, stopAt - s.spinStartAt) / MS_PER_KOMA);
  const forward = (((result.stopKoma - normalizeKoma(pushPos)) % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  return Math.min(cur, pushPos + forward);
}

/** pos → 帯の translateY（%・帯の高さ基準）。帯は配列を STRIP_COPIES 回つなげたもの */
export function translatePercent(pos: number): number {
  const ci = (((KOMA_COUNT - pos) % KOMA_COUNT) + KOMA_COUNT) % KOMA_COUNT;
  return (-(KOMA_COUNT - 1 + ci) / (KOMA_COUNT * STRIP_COPIES)) * 100;
}
