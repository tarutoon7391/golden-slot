import type { BonusRole, KomaNo, ReachmePattern, ReelIndex, StopPositions } from '../shared/types.ts';
import { KOMA_COUNT, slipKoma, windowAt } from '../config/reels.ts';
import { MACHINE } from '../config/machine.ts';
import { REACHME } from '../config/reachme.ts';
import { isBonusRole } from '../config/roles.ts';
import { rolesIn, type Role } from '../payout/judge.ts';
import { buildPartialWindow, isAllStopped, withStop } from './window.ts';
import { conditionMask, conditionsOf, conditionsOk, isExcludedIn, isPreferredIn, withMask, type ConditionMasks } from './reachme.ts';

/**
 * 先読み（残りリールをどの順・どの位置で押されても大丈夫か）
 *
 * 全停止の形（葉）を次で評価し、途中停止の状態はそこから再帰で求める。
 * - safe  : 非当選役が揃わない停止位置が、残りをどう押されても必ずある
 * - avoid : safe に加えて「止めてはいけないリーチ目」（isExcludedIn）も避けられる
 *           default では登録リーチ目すべて、ボーナス成立後は他系のリーチ目が対象。
 *           strict でないリーチ目は、当選小役が揃った形なら小役の出目とみなして避けない。
 * - clean : 引き込みの見込みを数えるときの足切り。default では avoid（非成立時のリーチ目は絶対に出さない）、
 *           ボーナス成立後は safe（他系のリーチ目は避けられるなら避けるが、ボーナスの引き込みを犠牲にしてまでは避けない）。
 * - value : 当選役を揃えられる見込み（0〜1）。残りリールの「次に押すリール × 押下位置」を等確率とみなし、
 *           各ケースで最良の停止を選んだときに「当選役が揃い、avoid な形になる」確率。
 * - reach : ボーナス成立後、この系のリーチ目（isPreferredIn）を作れる見込み（0〜1）。value と同じ考え方だが、
 *           value と同じく他系のリーチ目も同時に出る形は数えない（avoid な葉だけ）。
 *           clean でない状態は value = reach = 0 とする（蹴飛ばし・除外を優先するため）。
 *
 * リーチ目の条件（押し順・押下位置・スベリ）があるので、状態は
 * (ボーナス, 当選役, 停止位置, 止めた順, 条件ビット) で持つ。条件ビットは reachme.ts の ConditionMasks。
 * 結果はテーブル（REACHME かテストの差し替え）ごとにメモ化する。葉はメモ化しない（数が多く計算も軽い）。
 */

export interface Outcome {
  safe: boolean;
  avoid: boolean;
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

/** 全停止の位置 → 揃っている役（テーブルによらないので共有キャッシュ） */
const rolesCache = new Map<number, Role[]>();
function rolesAt(positions: readonly [KomaNo, KomaNo, KomaNo]): Role[] {
  const key = (positions[0] * 32 + positions[1]) * 32 + positions[2];
  let roles = rolesCache.get(key);
  if (!roles) {
    roles = rolesIn(buildPartialWindow(positions));
    rolesCache.set(key, roles);
  }
  return roles;
}

/** パターン 1 件について、各リールで出目が一致するコマ番号のビット集合（null のリールは全ビット） */
function komaBits(pattern: ReachmePattern): readonly [number, number, number] {
  const all = ((1 << (KOMA_COUNT + 1)) - 1) >>> 0;
  return [0, 1, 2].map((reel) => {
    const p = pattern.reels[reel as ReelIndex];
    if (p === null) return all;
    let bits = 0;
    for (let koma = 1; koma <= KOMA_COUNT; koma++) {
      const w = windowAt(reel as ReelIndex, koma);
      if (p.every((c, row) => c === '*' || c === w[row])) bits |= 1 << koma;
    }
    return bits;
  }) as [number, number, number];
}

/** テーブルに対する先読み器を作る */
export function createLookahead(table: readonly ReachmePattern[]): Lookahead {
  const conds = conditionsOf(table);
  const bits = table.map(komaBits);
  const memo = new Map<string, Outcome>();

  /** 全停止の窓を評価する */
  function leaf(q: LookaheadQuery): Outcome {
    const pos = q.positions as readonly [KomaNo, KomaNo, KomaNo];
    const roles = rolesAt(pos);
    const badRole = roles.some((r) => r !== q.target);
    const hitTarget = q.target !== null && roles.includes(q.target);
    const smallWin = hitTarget && !isBonusRole(q.target!);
    let badReach = false;
    let goodReach = false;
    for (let i = 0; i < table.length; i++) {
      const b = bits[i];
      if (((b[0] >>> pos[0]) & 1) === 0 || ((b[1] >>> pos[1]) & 1) === 0 || ((b[2] >>> pos[2]) & 1) === 0) continue;
      const p = table[i];
      if (!conditionsOk(conds, p, q.order, q.masks)) continue;
      if (isExcludedIn(p, q.bonus) && (p.strict || !smallWin)) badReach = true;
      if (isPreferredIn(p, q.bonus)) goodReach = true;
    }
    const safe = !badRole;
    const avoid = safe && !badReach;
    const clean = q.bonus ? safe : avoid;
    // value / reach は他系のリーチ目を含まない形だけ数える（他系の形へ進む候補の見込みを下げる。
    // ただし足切りは clean なので、ボーナス成立後は稀な逃げ場なしの押し位置があっても候補ごと捨てない）
    return { safe, avoid, clean, value: avoid && (q.target === null || hitTarget) ? 1 : 0, reach: avoid && goodReach ? 1 : 0 };
  }

  function query(q: LookaheadQuery): Outcome {
    if (isAllStopped(q.positions)) return leaf(q);
    const key = keyOf(q);
    const cached = memo.get(key);
    if (cached) return cached;

    let safe = true;
    let avoid = true;
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
        let anyAvoid = false;
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
          if (child.avoid) anyAvoid = true;
          if (child.clean) {
            anyClean = true;
            if (child.value > bestValue) bestValue = child.value;
            if (child.reach > bestReach) bestReach = child.reach;
          }
        }
        safe &&= anySafe;
        avoid &&= anyAvoid;
        clean &&= anyClean;
        sumValue += bestValue;
        sumReach += bestReach;
        cases++;
      }
    }
    const result: Outcome = clean ? { safe, avoid, clean, value: sumValue / cases, reach: sumReach / cases } : { safe, avoid, clean, value: 0, reach: 0 };
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
  rolesCache.clear();
}
