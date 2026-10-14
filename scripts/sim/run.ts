/**
 * シミュレーター CLI
 *
 * 使い方:
 *   npm run sim                         設定 1〜6 を各 1000 万 G
 *   npm run sim -- --setting 3          設定 3 だけ
 *   npm run sim -- --games 1000000      ゲーム数を変える
 *   npm run sim -- --seed 42            シード指定
 */
import type { LotteryRowKey, Setting } from '../../src/shared/types.ts';
import { ROW_KEYS } from '../../src/lottery/lottery.ts';
import { ALL_SETTINGS } from '../../src/lottery/setting.ts';
import { BONUS_SPECS } from '../../src/config/roles.ts';
import { oneIn, payoutRate, simulate, type SimResult } from '../../src/sim/simulate.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const games = Number(arg('games', '10000000'));
const seed = Number(arg('seed', '1'));
const settingArg = arg('setting', 'all');
const settings: Setting[] = settingArg === 'all' ? [...ALL_SETTINGS] : [Number(settingArg) as Setting];

const ROW_LABEL: Record<LotteryRowKey | 'NONE', string> = {
  BIG: 'BIG単独',
  BIG_CHERRY: 'BIG+チェリー',
  BIG_MELON: 'BIG+スイカ',
  REG: 'REG単独',
  REG_CHERRY: 'REG+チェリー',
  REG_MELON: 'REG+スイカ',
  BELL: 'ベル',
  MELON: 'スイカ',
  CHERRY: 'チェリー',
  REPLAY: 'リプレイ',
  NONE: 'ハズレ',
};

function printDetail(r: SimResult): void {
  const g = r.normalGames;
  console.log(`\n■ 設定 ${r.setting}（通常時 ${g.toLocaleString()} G / 総 ${r.totalGames.toLocaleString()} G / seed ${r.seed}）`);
  console.log('  役                 回数        確率');
  for (const k of [...ROW_KEYS, 'NONE'] as const) {
    const c = r.rowCounts[k];
    console.log(`  ${ROW_LABEL[k].padEnd(12, '　')} ${String(c).padStart(10)}  ${oneIn(g, c)}`);
  }
  const bigAll = r.rowCounts.BIG + r.rowCounts.BIG_CHERRY + r.rowCounts.BIG_MELON;
  const regAll = r.rowCounts.REG + r.rowCounts.REG_CHERRY + r.rowCounts.REG_MELON;
  console.log(`  BIG 合算(抽選)      ${String(bigAll).padStart(10)}  ${oneIn(g, bigAll)}`);
  console.log(`  REG 合算(抽選)      ${String(regAll).padStart(10)}  ${oneIn(g, regAll)}`);
  console.log(`  BIG 入賞            ${String(r.bigCount).padStart(10)}  ${oneIn(g, r.bigCount)}`);
  console.log(`  REG 入賞            ${String(r.regCount).padStart(10)}  ${oneIn(g, r.regCount)}`);
  console.log(`  ボーナス合算(入賞)  ${String(r.bigCount + r.regCount).padStart(10)}  ${oneIn(g, r.bigCount + r.regCount)}`);
  const avg = (k: 'BIG' | 'REG') => (r.bonusGames[k] === 0 ? 0 : r.bonusPayout[k] / (k === 'BIG' ? r.bigCount : r.regCount));
  const avgG = (k: 'BIG' | 'REG') => (k === 'BIG' ? r.bonusGames.BIG / Math.max(1, r.bigCount) : r.bonusGames.REG / Math.max(1, r.regCount));
  console.log(`  BIG 平均 ${avg('BIG').toFixed(1)} 枚 / ${avgG('BIG').toFixed(1)} G（規定 ${BONUS_SPECS.BIG.maxPayout}）`);
  console.log(`  REG 平均 ${avg('REG').toFixed(1)} 枚 / ${avgG('REG').toFixed(1)} G（規定 ${BONUS_SPECS.REG.maxPayout}）`);
  console.log(`  投入 ${r.coinsIn.toLocaleString()} 枚 / 払出 ${r.coinsOut.toLocaleString()} 枚`);
  console.log(`  機械割 ${payoutRate(r).toFixed(2)} %`);
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
