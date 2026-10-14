import type { ActiveFlags, BonusRole, KomaNo, ReachmePattern, ReelIndex } from '../shared/types.ts';
import { REACHME } from '../config/reachme.ts';
import { KOMA_COUNT } from '../config/reels.ts';
import { ROLES, isBonusRole } from '../config/roles.ts';
import { rolesIn, type Role } from '../payout/judge.ts';
import { stopSequence, targetRoleOf } from '../reel/control.ts';
import { conditionsOf, findReachme, isExcludedIn, isPreferredIn, masksOf } from '../reel/reachme.ts';
import { buildWindow } from '../reel/window.ts';

/**
 * リーチ目の受け入れ検算（docs/reachme/reachme_check.py の考え方を本物の decideStop で行う）
 *
 * - checkDefaultEscapes : ボーナス非成立のとき、全押し順 × 全押下位置（21^3）で
 *                         「止めてはいけないリーチ目」にも「非当選役」にもならないことを確認する
 * - reachmeRateUnderBonus : ボーナス成立中に、ボーナスが揃う／リーチ目になる／どちらでもない の割合を数える
 *
 * テスト（test/reachme.test.ts）と開発用スクリプトが使う。
 */

export const ALL_ORDERS: readonly (readonly ReelIndex[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** default セットで検算する当選状況（ボーナス非成立） */
export const DEFAULT_FLAGS: readonly ActiveFlags[] = [
  { small: null, bonus: null },
  { small: 'BELL', bonus: null },
  { small: 'REPLAY', bonus: null },
  { small: 'MELON', bonus: null },
  { small: 'CHERRY', bonus: null },
];

export interface ReachmeViolation {
  flags: ActiveFlags;
  order: readonly ReelIndex[];
  pushes: readonly [KomaNo, KomaNo, KomaNo];
  positions: readonly [KomaNo, KomaNo, KomaNo];
  /** 出てしまったリーチ目の id */
  reachme: string[];
  /** 揃ってしまった非当選役 */
  badRoles: Role[];
}

export interface ReachmeCheckResult {
  checked: number;
  violations: ReachmeViolation[];
}

export interface CheckOptions {
  flagsList?: readonly ActiveFlags[];
  orders?: readonly (readonly ReelIndex[])[];
  /** 見つけた違反の上限（これを超えたら打ち切る。0 で無制限） */
  limit?: number;
}

const ALL_KOMA: KomaNo[] = Array.from({ length: KOMA_COUNT }, (_, i) => i + 1);

/** 1 ゲームぶんを止めて評価する */
function evaluateGame(table: readonly ReachmePattern[], flags: ActiveFlags, order: readonly ReelIndex[], pushes: readonly [KomaNo, KomaNo, KomaNo]) {
  const { positions, stops } = stopSequence(flags, 'normal', pushes, order, { reachme: table });
  const window = buildWindow(positions);
  const target = targetRoleOf(flags);
  const roles = rolesIn(window);
  const badRoles = roles.filter((r) => r !== target);
  const smallWin = target !== null && roles.includes(target) && !isBonusRole(target);
  const masks = masksOf(conditionsOf(table), stops);
  const hits = findReachme(window, table, { order, masks });
  return { positions, roles, badRoles, smallWin, hits };
}

/** ボーナス非成立で、止めてはいけないリーチ目・非当選役が出ないことを総当たりで確認する */
export function checkDefaultEscapes(table: readonly ReachmePattern[] = REACHME, options: CheckOptions = {}): ReachmeCheckResult {
  const flagsList = options.flagsList ?? DEFAULT_FLAGS;
  const orders = options.orders ?? ALL_ORDERS;
  const limit = options.limit ?? 50;
  const violations: ReachmeViolation[] = [];
  let checked = 0;
  for (const flags of flagsList) {
    for (const order of orders) {
      for (const a of ALL_KOMA)
        for (const b of ALL_KOMA)
          for (const c of ALL_KOMA) {
            const pushes = [a, b, c] as const;
            const g = evaluateGame(table, flags, order, pushes);
            checked++;
            const reachme = g.hits.filter((p) => isExcludedIn(p, null) && (p.strict || !g.smallWin)).map((p) => p.id);
            if (reachme.length > 0 || g.badRoles.length > 0) {
              violations.push({ flags, order, pushes, positions: g.positions, reachme, badRoles: g.badRoles });
              if (limit > 0 && violations.length >= limit) return { checked, violations };
            }
          }
    }
  }
  return { checked, violations };
}

export interface BonusReachmeRate {
  games: number;
  /** ボーナス図柄が揃った */
  bonusHit: number;
  /** 当選小役が揃った（重複ゲーム） */
  smallHit: number;
  /** この系のリーチ目が出た（ボーナス・小役は揃っていない） */
  reachme: number;
  /** 他系のリーチ目が出てしまった（出てはいけない） */
  wrongReachme: number;
  /** どれでもない（ただのハズレ目） */
  plain: number;
}

/** ボーナス成立中の出目の内訳（全押下位置 21^3）。ランダム押し相当 */
export function reachmeRateUnderBonus(table: readonly ReachmePattern[], flags: ActiveFlags & { bonus: BonusRole }, order: readonly ReelIndex[]): BonusReachmeRate {
  const r: BonusReachmeRate = { games: 0, bonusHit: 0, smallHit: 0, reachme: 0, wrongReachme: 0, plain: 0 };
  for (const a of ALL_KOMA)
    for (const b of ALL_KOMA)
      for (const c of ALL_KOMA) {
        const g = evaluateGame(table, flags, order, [a, b, c]);
        r.games++;
        if (g.hits.some((p) => isExcludedIn(p, flags.bonus) && (p.strict || !g.smallWin))) r.wrongReachme++;
        if (g.roles.includes(flags.bonus)) r.bonusHit++;
        else if (flags.small && g.roles.includes(flags.small)) r.smallHit++;
        else if (g.hits.some((p) => isPreferredIn(p, flags.bonus))) r.reachme++;
        else r.plain++;
      }
  return r;
}

/** 違反 1 件を 1 行にする（テストの失敗表示・スクリプト用） */
export function formatViolation(v: ReachmeViolation): string {
  const flag = `${v.flags.small ? ROLES[v.flags.small].label : 'ハズレ'}${v.flags.bonus ? `+${ROLES[v.flags.bonus].label}` : ''}`;
  const order = v.order.map((r) => ['左', '中', '右'][r]).join('→');
  return `${flag} ${order} 押下 ${v.pushes.join('/')} → 停止 ${v.positions.join('/')}: ${[...v.reachme, ...v.badRoles.map((r) => `非当選 ${ROLES[r].label}`)].join(', ')}`;
}
