/**
 * リーチ目の受け入れ検算（開発用）
 * 登録済みの REACHME に対して、
 * 1. ボーナス非成立（default セット）で全押し順 × 全押下位置を回し、止めてはいけないリーチ目・非当選役が出ないか
 * 2. ボーナス成立中（種別セット）で、揃う／自系リーチ目／ハズレ目／他系リーチ目 の割合
 * を表示する。使い方: node scripts/probe/reachme.ts
 */
import { REACHME } from '../../src/config/reachme.ts';
import { ROLES } from '../../src/config/roles.ts';
import { ALL_ORDERS, checkDefaultEscapes, formatViolation, reachmeRateUnderBonus } from '../../src/sim/reachmeCheck.ts';

console.log(`リーチ目 ${REACHME.length} 件`);
const t0 = Date.now();
const r = checkDefaultEscapes(REACHME, { limit: 0 });
console.log(`default: ${r.checked} ゲーム検査、違反 ${r.violations.length} 件（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
for (const v of r.violations.slice(0, 40)) console.log('  ' + formatViolation(v));
if (r.violations.length > 40) console.log(`  ...他 ${r.violations.length - 40} 件`);

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1).padStart(5)}%`;
for (const bonus of ['BIG7', 'BIGG', 'REG'] as const) {
  for (const order of ALL_ORDERS) {
    const s = reachmeRateUnderBonus(REACHME, { small: null, bonus }, order);
    console.log(
      `${ROLES[bonus].label.padEnd(5)} order ${order.join('')}  揃う ${pct(s.bonusHit, s.games)}  リーチ目 ${pct(s.reachme, s.games)}  ハズレ目 ${pct(s.plain, s.games)}  他系リーチ目 ${s.wrongReachme}`,
    );
  }
}
