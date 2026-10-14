import type { BonusRole, KomaNo, ReachmePattern, ReelIndex, StopPositions } from '../shared/types.ts';
import { KOMA_COUNT, slipKoma } from '../config/reels.ts';
import { MACHINE } from '../config/machine.ts';
import { REACHME } from '../config/reachme.ts';
import { isBonusRole } from '../config/roles.ts';
import { rolesIn, type Role } from '../payout/judge.ts';
import { buildPartialWindow, isAllStopped, withStop } from './window.ts';
import { conditionMask, conditionsOf, conditionsOk, isExcludedIn, isPreferredIn, matchReachme, withMask, type ConditionMasks } from './reachme.ts';

/**
 * 先読み（残りリールをどの順・どの位置で押されても大丈夫か）
 *
 * 全停止の形（葉）を次の 4 つで評価し、途中停止の状態はそこから再帰で求める。
 * - safe  : 非当選役が揃わない停止位置が、残りをどう押されても必ずある
 * - clean : safe に加えて「止めてはいけないリーチ目」（isExcludedIn）も避けられる
 *           default では登録リーチ目すべて、ボーナス成立後は他系のリーチ目が対象。
 *           strict でないリーチ目は、当選小役が揃った形なら小役の出目とみなして避けない。
 * - value : 当選役を揃えられる見込み（0〜1）。残りリールの「次に押すリール × 押下位置」を等確率とみなし、
 *           各ケースで最良の停止を選んだときに「当選役が揃い、clean な形になる」確率。
 * - reach : ボーナス成立後、この系のリーチ目（isPreferredIn）を作れる見込み（0〜1）。同じ考え方。
 *           clean でない状態は value = reach = 0 とする（蹴飛ばし・除外を優先するため）。
 *
 * リーチ目の条件（押し順・押下位置・スベリ）があるので、状態は
 * (ボーナス, 当選役, 停止位置, 止めた順, 条件ビット) で持つ。条件ビットは reachme.ts の ConditionMasks。
 * 結果はテーブル（REACHME かテストの差し替え）ごとにメモ化する。葉はメモ化しない（数が多く計算も軽い）。
 */

export interface Outcome {
  safe: boolean;
  clean: boolean;
  value: number;
  reach: number;
}

export interface LookaheadQuery {
  /** 引き込む役（小役優先）。null はハズレ */
  target: Role | null;
  /** 成立中のボーナス（ルールセットの選択と同じ）。null なら default */
  bonus: BonusRole | null;
  positions: StopPositions;
  /** 止めた順（リール番号） */
  order: readonly ReelIndex[];
  masks: ConditionMasks;
}

export interface Lookahead {
  query(q: LookaheadQuery): Outcome;
  /** リールを (push, slip) で止めたときの条件ビット */
  mask(reel: ReelIndex, push: KomaNo, slip: number): number;
}

function keyOf(q: LookaheadQuery): string {
  return `${q.bonus ?? '-'}|${q.target ?? '-'}|${q.positions[0] ?? 0},${q.positions[1] ?? 0},${q.positions[2] ?? 0}|${q.order.join('')}|${q.masks[0]},${q.masks[1]},${q.masks[2]}`;
}

/** テーブルに対する先読み器を作る */
export function createLookahead(table: readonly ReachmePattern[]): Lookahead {
  const conds = conditionsOf(table);
  const memo = new Map<string, Outcome>();

  /** 全停止の窓を評価する */
  function leaf(q: LookaheadQuery): Outcome {
    const window = buildPartialWindow(q.positions);
    const roles = rolesIn(window);
    const badRole = roles.some((r) => r !== q.target);
    const hitTarget = q.target !== null && roles.includes(q.target);
    const smallWin = hitTarget && !isBonusRole(q.target!);
    let badReach = false;
    let goodReach = false;
    for (const p of table) {
      if (matchReachme(window, p) !== 'hit' || !conditionsOk(conds, p, q.order, q.masks)) continue;
      if (isExcludedIn(p, q.bonus) && (p.strict || !smallWin)) badReach = true;
      if (isPreferredIn(p, q.bonus)) goodReach = true;
    }
    const safe = !badRole;
    const clean = safe && !badReach;
    return {
      safe,
      clean,
      value: clean && (q.target === null || hitTarget) ? 1 : 0,
      reach: clean && goodReach ? 1 : 0,
    };
  }

  function query(q: LookaheadQuery): Outcome {
    if (isAllStopped(q.positions)) return leaf(q);
    const key = keyOf(q);
    const cached = memo.get(key);
    if (cached) return cached;

    let safe = true;
    let clean = true;
    let sumValue = 0;
    let sumReach = 0;
    let cases = 0;
    const remaining = ([0, 1, 2] as ReelIndex[]).filter((r) => q.positions[r] === null);
    // 次に押されるリール × 押下位置 のすべてについて、最良の停止候補を見る
    for (const reel of remaining) {
      const order = [...q.order, reel];
      for (let push = 1 as KomaNo; push <= KOMA_COUNT; push++) {
        let anySafe = false;
        let anyClean = false;
        let bestValue = 0;
        let bestReach = 0;
        for (let slip = 0; slip <= MACHINE.maxSlip; slip++) {
          const child = query({
            target: q.target,
            bonus: q.bonus,
            positions: withStop(q.positions, reel, slipKoma(push, slip)),
            order,
            masks: withMask(q.masks, reel, conditionMask(conds, reel, push, slip)),
          });
          if (child.safe) anySafe = true;
          if (child.clean) {
            anyClean = true;
            if (child.value > bestValue) bestValue = child.value;
            if (child.reach > bestReach) bestReach = child.reach;
          }
        }
        safe &&= anySafe;
        clean &&= anyClean;
        sumValue += bestValue;
        sumReach += bestReach;
        cases++;
      }
    }
    const result: Outcome = { safe, clean, value: clean ? sumValue / cases : 0, reach: clean ? sumReach / cases : 0 };
    memo.set(key, result);
    return result;
  }

  return { query, mask: (reel, push, slip) => conditionMask(conds, reel, push, slip) };
}

let cache = new WeakMap<readonly ReachmePattern[], Lookahead>();

/** テーブルごとの先読み器（配列の参照ごとにキャッシュ。既定は REACHME） */
export function lookaheadFor(table: readonly ReachmePattern[] = REACHME): Lookahead {
  let la = cache.get(table);
  if (!la) {
    la = createLookahead(table);
    cache.set(table, la);
  }
  return la;
}

/** メモをすべて捨てる（config を動的に変えるデバッグ用） */
export function clearLookaheadCache(): void {
  cache = new WeakMap();
}
