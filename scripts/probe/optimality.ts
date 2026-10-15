/**
 * 引き込み最適性（仕様 v1.2 P8）の検査（開発用）
 * 全小役 × 6 押し順 × 21^3 で「揃えられる組み合わせがあるのに揃わなかった」ケースを数え、例を出す。
 * 制御は先の押し位置を知らないので違反は 0 にならない（最適性の保証は test/control.test.ts「引き込み最適性」）。
 * 使い方: node scripts/probe/optimality.ts
 */
import { stopSequence, decideStop } from '../../src/reel/control.ts';
import { rolesIn } from '../../src/payout/judge.ts';
import { buildWindow } from '../../src/reel/window.ts';
import { REACHME } from '../../src/config/reachme.ts';
import { matchReachme } from '../../src/reel/reachme.ts';
import { slipKoma, windowAt } from '../../src/config/reels.ts';
import type { KomaNo, SmallRole } from '../../src/shared/types.ts';

const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] as const;
const strictPats = REACHME.filter((p) => p.strict);
// 全停止位置 → 役の集合・strict リーチ目か
const info = new Map<number, { roles: string[]; strict: boolean }>();
for (let a = 1; a <= 21; a++) for (let b = 1; b <= 21; b++) for (let c = 1; c <= 21; c++) {
  const w = buildWindow([a, b, c]);
  info.set((a * 32 + b) * 32 + c, { roles: rolesIn(w), strict: strictPats.some((p) => matchReachme(w, p) === 'hit') });
}
const key = (p: readonly [number, number, number]) => (p[0] * 32 + p[1]) * 32 + p[2];
function achievable(target: string, pushes: readonly [number, number, number]): boolean {
  for (let s0 = 0; s0 <= 4; s0++) for (let s1 = 0; s1 <= 4; s1++) for (let s2 = 0; s2 <= 4; s2++) {
    const i = info.get(key([slipKoma(pushes[0], s0), slipKoma(pushes[1], s1), slipKoma(pushes[2], s2)]))!;
    if (i.roles.includes(target) && i.roles.every((r) => r === target) && !i.strict) return true;
  }
  return false;
}
for (const target of ['BELL', 'REPLAY', 'MELON', 'CHERRY'] as SmallRole[]) {
  for (const order of ORDERS) {
    let n = 0, hit = 0, ach = 0, viol = 0;
    const examples: string[] = [];
    for (let a = 1; a <= 21; a++) for (let b = 1; b <= 21; b++) for (let c = 1; c <= 21; c++) {
      const pushes = [a, b, c] as [KomaNo, KomaNo, KomaNo];
      const { positions } = stopSequence({ small: target, bonus: null }, 'normal', pushes, order);
      const i = info.get(key(positions))!;
      n++;
      const won = i.roles.includes(target);
      if (won) hit++;
      const can = achievable(target, pushes);
      if (can) ach++;
      if (can && !won) { viol++; if (examples.length < 4) examples.push(`押し[${a},${b},${c}]→停止[${positions.join(',')}]`); }
    }
    console.log(`${target.padEnd(7)} ${order.join('')} 引き込み ${(hit / n * 100).toFixed(1).padStart(5)}%  揃えられる ${(ach / n * 100).toFixed(1).padStart(5)}%  違反 ${viol}${examples.length ? '  例: ' + examples.join(' / ') : ''}`);
  }
}
console.log('\n--- 個別確認 ---');
const flags = { small: 'MELON', bonus: null } as const;
for (const left of [4, 3, 11, 15]) {
  const line: string[] = [];
  for (const push of [8, 9, 10, 11, 12]) {
    const r = decideStop({ reel: 2, pushKoma: push as KomaNo, stopped: [left, null, null], flags, mode: 'normal', history: [{ reel: 0, pushKoma: left as KomaNo, stopKoma: left as KomaNo, slip: 0 }] });
    line.push(`押${push}→右${r.stopKoma}[${windowAt(2, r.stopKoma).map((s) => s[0]).join('')}]`);
  }
  console.log(`左${left}[${windowAt(0, left).map((s) => s[0]).join('')}] 挟み打ち第2停止:`, line.join(' '));
}
