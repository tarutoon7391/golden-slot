/**
 * シミュレーター CLI
 *
 * 使い方:
 *   npm run sim                         設定 1〜6 を各 1000 万 G
 *   npm run sim -- --setting 3          設定 3 だけ
 *   npm run sim -- --games 1000000      ゲーム数を変える
 *   npm run sim -- --seed 42            シード指定
 */
import type { Setting } from '../../src/shared/types.ts';
import { ROW_KEYS, ROW_LABELS, bonusRowsOf } from '../../src/lottery/lottery.ts';
import { ALL_SETTINGS } from '../../src/lottery/setting.ts';
import { BIG_KINDS, BONUS_ROLES, BONUS_SPECS, ROLES, isBigBonus } from '../../src/config/roles.ts';
import { oneIn, payoutRate, simulate, type SimResult } from '../../src/sim/simulate.ts';
import { effectSummaryRows } from '../../src/sim/effectStats.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const games = Number(arg('games', '10000000'));
const seed = Number(arg('seed', '1'));
const settingArg = arg('setting', 'all');
const settings: Setting[] = settingArg === 'all' ? [...ALL_SETTINGS] : [Number(settingArg) as Setting];


function printDetail(r: SimResult): void {
  const g = r.normalGames;
  console.log(`\n■ 設定 ${r.setting}（通常時 ${g.toLocaleString()} G / 総 ${r.totalGames.toLocaleString()} G / seed ${r.seed}）`);
  console.log('  役                 回数        確率');
  for (const k of [...ROW_KEYS, 'NONE'] as const) {
    const c = r.rowCounts[k];
    console.log(`  ${ROW_LABELS[k].padEnd(14, '　')} ${String(c).padStart(10)}  ${oneIn(g, c)}`);
  }
  const sumRows = (kinds: readonly typeof BONUS_ROLES[number][]) => kinds.flatMap(bonusRowsOf).reduce((a, k) => a + r.rowCounts[k], 0);
  const bigAll = sumRows(BIG_KINDS);
  const regAll = sumRows(['REG']);
  console.log(`  BIG 合算(抽選)      ${String(bigAll).padStart(10)}  ${oneIn(g, bigAll)}`);
  console.log(`  REG 合算(抽選)      ${String(regAll).padStart(10)}  ${oneIn(g, regAll)}`);
  console.log(`  BIG 入賞            ${String(r.bigCount).padStart(10)}  ${oneIn(g, r.bigCount)}`);
  console.log(`  REG 入賞            ${String(r.regCount).padStart(10)}  ${oneIn(g, r.regCount)}`);
  console.log(`  ボーナス合算(入賞)  ${String(r.bigCount + r.regCount).padStart(10)}  ${oneIn(g, r.bigCount + r.regCount)}`);
  // 種別ごとの平均枚数・平均ゲーム数（入賞回数は rowCounts から出せないので、払い出しとゲーム数の比で近似）
  for (const k of BONUS_ROLES) {
    const games = r.bonusGames[k];
    const count = isBigBonus(k) ? r.bigCount : r.regCount;
    console.log(`  ${ROLES[k].label.padEnd(5)} 払出合計 ${r.bonusPayout[k]} 枚 / ${games} G（規定 ${BONUS_SPECS[k].maxPayout}・${isBigBonus(k) ? 'BIG' : 'REG'} 入賞 ${count} 回）`);
  }
  console.log(`  投入 ${r.coinsIn.toLocaleString()} 枚 / 払出 ${r.coinsOut.toLocaleString()} 枚`);
  console.log(`  機械割 ${payoutRate(r).toFixed(2)} %`);
  console.log('  演出                       出現        出た時点でボーナス');
  for (const [label, freq, rate] of effectSummaryRows(r.effects)) {
    console.log(`  ${label.padEnd(16, '　')} ${freq.padStart(10)}  ${rate}`);
  }
}

console.log(`シミュレーション開始: 設定 ${settings.join(',')} / 各 ${games.toLocaleString()} G / seed ${seed}`);
const results: SimResult[] = [];
for (const s of settings) {
  const t0 = performance.now();
  const r = simulate(s, games, seed + s);
  results.push(r);
  printDetail(r);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} 秒)`);
}

// まとめ表
console.log('\n■ まとめ');
console.log('  設定  BIG      REG      合算     ベル     機械割');
for (const r of results) {
  const g = r.normalGames;
  console.log(
    `  ${String(r.setting).padStart(3)}   ${oneIn(g, r.bigCount).padEnd(8)} ${oneIn(g, r.regCount).padEnd(8)} ${oneIn(g, r.bigCount + r.regCount).padEnd(8)} ${oneIn(g, r.rowCounts.BELL).padEnd(8)} ${payoutRate(r).toFixed(2)} %`,
  );
}
