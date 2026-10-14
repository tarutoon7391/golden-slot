import type { BonusRole, GameMode, LineDef, LineHit, LineId, PayoutResult, SmallRole, WinPattern, Window } from '../shared/types.ts';
import { LINES } from '../config/lines.ts';
import { REELS } from '../config/reels.ts';
import { MAX_PAYOUT_PER_GAME, ROLES, WIN_PATTERNS, isBonusRole } from '../config/roles.ts';
import type { PartialWindow } from '../reel/window.ts';

/** 払い出しのある役（小役＋ボーナス） */
export type Role = SmallRole | BonusRole;

/**
 * 入賞形の成立状態
 * - hit  : 成立している
 * - miss : 成立しない（止まっているリールで否定された）
 * - open : 未停止リールがあり、まだ成立の可能性がある
 */
export type MatchState = 'hit' | 'miss' | 'open';

/** 有効ライン 1 本上での入賞形の状態（途中停止にも対応） */
export function matchLine(pattern: WinPattern, window: PartialWindow, line: LineDef): MatchState {
  let open = false;
  for (const reel of [0, 1, 2] as const) {
    const allowed = pattern.symbols[reel];
    if (allowed === null) continue; // この位置は任意
    const rw = window[reel];
    if (rw === null) {
      // 未停止：そのリールに図柄が存在すれば可能性あり
      if (!allowed.some((s) => REELS[reel].includes(s))) return 'miss';
      open = true;
      continue;
    }
    if (!allowed.includes(rw[line.rows[reel]])) return 'miss';
  }
  return open ? 'open' : 'hit';
}

/** 左リールだけを見る入賞形（チェリー）の状態 */
export function matchLeftReel(pattern: WinPattern, window: PartialWindow): MatchState {
  const rw = window[0];
  if (rw === null) return 'open';
  const allowed = pattern.symbols[0] ?? [];
  const rows = pattern.leftRows ?? [0, 1, 2];
  return rows.some((r) => allowed.includes(rw[r])) ? 'hit' : 'miss';
}

/** 窓全体を見る入賞形（リーチ目役など）の状態 */
export function matchWindow(pattern: WinPattern, window: PartialWindow): MatchState {
  const cells = pattern.cells;
  if (!cells) return 'miss';
  let open = false;
  for (const reel of [0, 1, 2] as const) {
    const rw = window[reel];
    const want = cells[reel];
    if (rw === null) {
      if (want.some((c) => c !== '*')) open = true;
      continue;
    }
    if (!want.every((c, row) => c === '*' || c === rw[row])) return 'miss';
  }
  return open ? 'open' : 'hit';
}

/** 入賞形 × ライン の照合結果 */
export interface PatternMatch {
  pattern: WinPattern;
  /** leftReel 判定のときは null */
  line: LineId | null;
  state: MatchState;
}

/**
 * すべての入賞形を照合する（miss は除く）。
 * リール制御の「引き込み」「蹴飛ばし」判定と、払い出し判定の両方がこれを使う。
 */
export function matchAll(window: PartialWindow, patterns: readonly WinPattern[] = WIN_PATTERNS): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (const pattern of patterns) {
    if (pattern.scope === 'leftReel' || pattern.scope === 'window') {
      const state = pattern.scope === 'leftReel' ? matchLeftReel(pattern, window) : matchWindow(pattern, window);
      if (state !== 'miss') out.push({ pattern, line: null, state });
      continue;
    }
    for (const line of LINES) {
      if (pattern.lines && !pattern.lines.includes(line.id)) continue;
      const state = matchLine(pattern, window, line);
      if (state !== 'miss') out.push({ pattern, line: line.id, state });
    }
  }
  return out;
}

/** 入賞形の払い出し枚数（パターン固有 > ボーナス中配当 > 役の配当） */
export function payoutOf(pattern: WinPattern, mode: GameMode): number {
  if (pattern.payout !== undefined) return pattern.payout;
  const def = ROLES[pattern.role];
  if (mode !== 'normal' && def.payoutInBonus !== undefined) return def.payoutInBonus;
  return def.payout;
}

/** 全停止の窓から払い出しを判定する */
export function judgeWindow(window: Window, mode: GameMode): PayoutResult {
  const hits: LineHit[] = matchAll(window)
    .filter((m) => m.state === 'hit')
    .map((m) => ({
      patternId: m.pattern.id,
      role: m.pattern.role,
      line: m.line,
      payout: payoutOf(m.pattern, mode),
    }));
  const sum = hits.reduce((a, h) => a + h.payout, 0);
  const bonus = hits.find((h) => isBonusRole(h.role));
  return {
    hits,
    totalPayout: Math.min(sum, MAX_PAYOUT_PER_GAME),
    replay: hits.some((h) => h.role === 'REPLAY'),
    bonusHit: bonus ? (bonus.role as BonusRole) : null,
  };
}

/** 窓に成立している役の一覧（重複なし） */
export function rolesIn(window: PartialWindow): Role[] {
  const roles = new Set<Role>();
  for (const m of matchAll(window)) if (m.state === 'hit') roles.add(m.pattern.role);
  return [...roles];
}
