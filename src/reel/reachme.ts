import type { BonusRole, ReachmePattern, ReelPattern } from '../shared/types.ts';
import { REACHME } from '../config/reachme.ts';
import type { MatchState } from '../payout/judge.ts';
import type { PartialWindow, ReelWindow } from './window.ts';

/**
 * リーチ目の照合
 * config/reachme.ts のパターンと窓（途中停止可）を比べる。
 * デバッグパネル（一致表示・出目コピー）とリール制御のルールが共用する。
 */

/** 1 リールぶんの照合 */
function matchReel(pattern: ReelPattern, reel: ReelWindow): boolean {
  return pattern.every((p, row) => p === '*' || p === reel[row]);
}

/** リーチ目 1 件と窓の状態 */
export function matchReachme(window: PartialWindow, pattern: ReachmePattern): MatchState {
  let open = false;
  for (const reel of [0, 1, 2] as const) {
    const p = pattern.reels[reel];
    if (p === null) continue; // そのリールは見ない
    const rw = window[reel];
    if (rw === null) {
      open = true;
      continue;
    }
    if (!matchReel(p, rw)) return 'miss';
  }
  return open ? 'open' : 'hit';
}

/** 窓に一致（確定）しているリーチ目の一覧 */
export function findReachme(window: PartialWindow, table: readonly ReachmePattern[] = REACHME): ReachmePattern[] {
  return table.filter((p) => matchReachme(window, p) === 'hit');
}

/** そのボーナスを対象にしているか */
export function reachmeTargets(pattern: ReachmePattern, bonus: BonusRole): boolean {
  return !pattern.bonus || pattern.bonus.includes(bonus);
}

/** 内部中に優先する対象か */
export function isPreferable(pattern: ReachmePattern): boolean {
  const u = pattern.usage ?? 'both';
  return u === 'both' || u === 'preferOnly';
}

/** 非成立時に除外する対象か */
export function isExcludable(pattern: ReachmePattern): boolean {
  const u = pattern.usage ?? 'both';
  return u === 'both' || u === 'excludeOnly';
}

/** 全停止の窓を reachme.ts の書式の文字列にする（デバッグの「出目をコピー」用） */
export function formatAsReachme(window: PartialWindow, id = 'new-pattern', label = ''): string {
  const reel = (rw: ReelWindow | null) => (rw === null ? 'null' : `['${rw[0]}', '${rw[1]}', '${rw[2]}']`);
  return [
    '{',
    `  id: '${id}',`,
    `  label: '${label}',`,
    '  reels: [',
    `    ${reel(window[0])}, // 左 [上段, 中段, 下段]`,
    `    ${reel(window[1])}, // 中`,
    `    ${reel(window[2])}, // 右`,
    '  ],',
    '},',
  ].join('\n');
}
