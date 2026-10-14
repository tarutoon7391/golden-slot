import type { KomaNo, ReelIndex, StopPositions } from '../shared/types.ts';
import { KOMA_COUNT, slipKoma } from '../config/reels.ts';
import { MACHINE } from '../config/machine.ts';
import { rolesIn, type Role } from '../payout/judge.ts';
import { buildPartialWindow, isAllStopped, withStop } from './window.ts';

/**
 * 先読み（残りリールをどの順・どの位置で押されても大丈夫か）
 *
 * - safe  : 残りのリールをどう押されても「非当選役を揃えない」停止位置が必ずある
 * - value : 当選役を揃えられる見込み（0〜1）。
 *           残りリールの「次に押すリール × 押下位置」を等確率とみなし、
 *           各ケースで最良の停止を選んだときに「当選役が揃い、非当選役が揃わない」確率。
 *           1 なら どう押されても必ず揃う。0 なら もう揃えられない。
 *           safe でない状態は value = 0 とする（蹴飛ばしを優先するため）。
 *
 * 結果は (当選役, 停止位置) ごとにメモ化する。状態数は 22^3 × 役数 程度で小さい。
 */

export interface Outcome {
  safe: boolean;
  value: number;
}

const memo = new Map<string, Outcome>();

function keyOf(target: Role | null, positions: StopPositions): string {
  return `${target ?? '-'}|${positions[0] ?? 0},${positions[1] ?? 0},${positions[2] ?? 0}`;
}

/** 全停止の窓を評価する */
function evaluateLeaf(target: Role | null, positions: StopPositions): Outcome {
  const roles = rolesIn(buildPartialWindow(positions));
  const bad = roles.some((r) => r !== target);
  const hit = target === null || roles.includes(target);
  return { safe: !bad, value: !bad && hit ? 1 : 0 };
}

/** 途中停止の状態から先読みする */
export function lookahead(target: Role | null, positions: StopPositions): Outcome {
  const key = keyOf(target, positions);
  const cached = memo.get(key);
  if (cached) return cached;

  let result: Outcome;
  if (isAllStopped(positions)) {
    result = evaluateLeaf(target, positions);
  } else {
    let safe = true;
    let sum = 0;
    let cases = 0;
    const remaining = ([0, 1, 2] as ReelIndex[]).filter((r) => positions[r] === null);
    // 次に押されるリール × 押下位置 のすべてについて、最良の停止候補を見る
    for (const reel of remaining) {
      for (let push = 1 as KomaNo; push <= KOMA_COUNT; push++) {
        let anySafe = false;
        let best = 0;
        for (let slip = 0; slip <= MACHINE.maxSlip; slip++) {
          const child = lookahead(target, withStop(positions, reel, slipKoma(push, slip)));
          if (child.safe) {
            anySafe = true;
            if (child.value > best) best = child.value;
          }
        }
        safe &&= anySafe;
        sum += best;
        cases++;
      }
    }
    result = { safe, value: safe ? sum / cases : 0 };
  }
  memo.set(key, result);
  return result;
}

/** メモをクリアする（config を動的に変えるデバッグ用） */
export function clearLookaheadCache(): void {
  memo.clear();
}
