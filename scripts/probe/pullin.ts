/**
 * 停止制御の網羅チェック（開発用）
 * 全役 × 全押し順 × 全押下位置（21^3）で、引き込み率と非当選役の成立回数を表示する。
 * 使い方: node scripts/probe/pullin.ts
 */
import { stopSequence } from '../../src/reel/control.ts';
import { judgeWindow } from '../../src/payout/judge.ts';
import { buildWindow } from '../../src/reel/window.ts';
const ORDERS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]] as const;
const flagsList = [
  ['NONE', { small: null, bonus: null }],
  ['BELL', { small: 'BELL', bonus: null }],
  ['REPLAY', { small: 'REPLAY', bonus: null }],
  ['MELON', { small: 'MELON', bonus: null }],
  ['CHERRY', { small: 'CHERRY', bonus: null }],
  ['REACH_A', { small: 'REACH_A', bonus: 'BIG7' }],
  ['REACH_B', { small: 'REACH_B', bonus: 'BIGG' }],
  ['BIG7', { small: null, bonus: 'BIG7' }],
  ['BIGG', { small: null, bonus: 'BIGG' }],
  ['REG', { small: null, bonus: 'REG' }],
  ['BELL+BIG7', { small: 'BELL', bonus: 'BIG7' }],
  ['CHERRY+REG', { small: 'CHERRY', bonus: 'REG' }],
] as const;
for (const [name, flags] of flagsList) {
  for (const order of ORDERS) {
    let n = 0, hit = 0, badHit = 0;
    const allowed = flags.small ?? flags.bonus;
    for (let a = 1; a <= 21; a++) for (let b = 1; b <= 21; b++) for (let c = 1; c <= 21; c++) {
      const { positions } = stopSequence(flags as any, 'normal', [a, b, c], order);
      const pr = judgeWindow(buildWindow(positions), 'normal');
      n++;
      const roles = new Set(pr.hits.map(h => h.role));
      if (allowed && roles.has(allowed)) hit++;
      for (const r of roles) if (r !== allowed) badHit++;
    }
    console.log(`${name.padEnd(11)} order ${order.join('')}  引き込み ${(hit / n * 100).toFixed(1).padStart(5)}%  非当選成立 ${badHit}`);
  }
}
