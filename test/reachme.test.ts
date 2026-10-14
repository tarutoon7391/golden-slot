import { describe, expect, it } from 'vitest';
import type { ActiveFlags, KomaNo, ReachmePattern, ReelIndex, ReelPattern, StopRecord } from '../src/shared/types.ts';
import { windowAt } from '../src/config/reels.ts';
import { decideStop, historyFromStops, historyOf, stopSequence } from '../src/reel/control.ts';
import { STOP_RULES, STOP_RULE_SETS, ruleSetFor } from '../src/reel/rules.ts';
import { conditionMask, conditionsOf, conditionsOk, findReachme, isExcludedIn, isPreferredIn, masksOf } from '../src/reel/reachme.ts';
import { createLookahead } from '../src/reel/lookahead.ts';
import { horizontalBonusLines, isWinShape, sandwichDoubleTempai, tempaiRoles } from '../src/reel/reachmeGen.ts';
import { buildWindow } from '../src/reel/window.ts';
import { rolesIn } from '../src/payout/judge.ts';
import { ALL_ORDERS, DEFAULT_FLAGS, checkDefaultEscapes, formatViolation, reachmeRateUnderBonus } from '../src/sim/reachmeCheck.ts';

/** リールの koma 番中段の窓を、そのままリーチ目の 1 リールぶんにする */
function reelAt(reel: ReelIndex, koma: KomaNo): ReelPattern {
  const w = windowAt(reel, koma);
  return [w[0], w[1], w[2]];
}

const HAZURE: ActiveFlags = { small: null, bonus: null };
const noStop = [null, null, null] as const;

// 仕様書 §3 の一部（受け入れ検算の枠を確かめるためのサンプル。本登録は 7c）
const R01: ReachmePattern = { id: 'R01', label: 'ゲチェナ', reels: [null, null, reelAt(2, 19)] };
const R02: ReachmePattern = { id: 'R02', label: '順押しチスチ', reels: [null, reelAt(1, 10), null] };
const R03: ReachmePattern = { id: 'R03', label: '中押しチスチ', reels: [null, reelAt(1, 10), null], when: { order: [1] }, strict: true };
const R05: ReachmePattern = { id: 'R05', label: '右ベリベ', reels: [null, null, reelAt(2, 2)] };
const R06: ReachmePattern = { id: 'R06', label: '7中段', reels: [reelAt(0, 13), null, null] };
const R07: ReachmePattern = { id: 'R07', label: '7下段3コマ以上スベリ', reels: [reelAt(0, 14), null, null], when: { reels: { 0: { slip: [3, 4] } } } };
const R08: ReachmePattern = { id: 'R08', label: 'BAR枠上', reels: [reelAt(0, 3), null, null] };
const R12: ReachmePattern = { id: 'R12', label: '順押しBAR上段テンパイ', reels: [reelAt(0, 4), reelAt(1, 5), null] };
const S03: ReachmePattern = { id: 'S03', label: 'G上段→4コマで7上段', reels: [reelAt(0, 12), null, null], when: { reels: { 0: { push: [8] } } }, bonus: ['BIG7', 'REG'] };
const G01: ReachmePattern = { id: 'G01', label: '3連G', reels: [reelAt(0, 19), null, null], bonus: ['BIGG'] };
const G04: ReachmePattern = { id: 'G04', label: 'BAR上段→4コマでG上段', reels: [reelAt(0, 8), null, null], when: { reels: { 0: { push: [4] } } }, bonus: ['BIGG'] };

const SAMPLE: readonly ReachmePattern[] = [R01, R02, R03, R05, R06, R07, R08, R12, S03, G01, G04, ...sandwichDoubleTempai(), ...horizontalBonusLines()];

describe('リーチ目の条件（押し順・押下位置・スベリ）', () => {
  it('条件はリールごとのビットに畳まれ、押下位置・スベリで判定する', () => {
    const table = [R07, S03, G04];
    const conds = conditionsOf(table);
    expect(conds.perReel[0]).toHaveLength(3);
    expect(conds.perReel[1]).toHaveLength(0);
    // R07: スベリ 3〜4 / S03: 押下 8 / G04: 押下 4
    expect(conditionMask(conds, 0, 11, 3)).toBe(1);
    expect(conditionMask(conds, 0, 11, 2)).toBe(0);
    expect(conditionMask(conds, 0, 8, 4)).toBe(1 | 2);
    expect(conditionMask(conds, 0, 4, 4)).toBe(1 | 4);
    expect(conditionMask(conds, 1, 8, 4)).toBe(0);
    expect(conditionsOk(conds, R07, [0], [1, 0, 0])).toBe(true);
    expect(conditionsOk(conds, R07, [0], [2, 0, 0])).toBe(false);
    expect(conditionsOk(conds, S03, [1, 0], [2, 0, 0])).toBe(true);
    expect(conditionsOk(conds, R06, [0], [0, 0, 0])).toBe(true); // 条件なし
  });

  it('押し順は先頭一致。[0, 2] は左→右の挟み打ちだけ、[1] は中押し全般', () => {
    const conds = conditionsOf([R03]);
    expect(conditionsOk(conds, R03, [1], [0, 0, 0])).toBe(true);
    expect(conditionsOk(conds, R03, [1, 2, 0], [0, 0, 0])).toBe(true);
    expect(conditionsOk(conds, R03, [0, 1], [0, 0, 0])).toBe(false);
    const r04: ReachmePattern = { id: 'x', label: '', reels: [null, null, null], when: { order: [0, 2] } };
    const c2 = conditionsOf([r04]);
    expect(conditionsOk(c2, r04, [0, 2, 1], [0, 0, 0])).toBe(true);
    expect(conditionsOk(c2, r04, [2, 0, 1], [0, 0, 0])).toBe(false);
    expect(conditionsOk(c2, r04, [0, 1, 2], [0, 0, 0])).toBe(false);
  });

  it('findReachme は ctx を渡すと条件込み、渡さなければ出目だけで照合する', () => {
    const table = [R07];
    const w = buildWindow([14, 1, 1]);
    expect(findReachme(w, table).map((p) => p.id)).toEqual(['R07']);
    const history: StopRecord[] = [{ reel: 0, pushKoma: 11, stopKoma: 14, slip: 3 }];
    expect(findReachme(w, table, { order: [0], masks: masksOf(conditionsOf(table), history) }).map((p) => p.id)).toEqual(['R07']);
    const history2: StopRecord[] = [{ reel: 0, pushKoma: 13, stopKoma: 14, slip: 1 }];
    expect(findReachme(w, table, { order: [0], masks: masksOf(conditionsOf(table), history2) })).toEqual([]);
  });

  it('history を省略すると stopped から左→中→右の順・スベリ条件なしとして補う', () => {
    expect(historyOf({ reel: 2, pushKoma: 1, stopped: [5, 7, null], flags: HAZURE, mode: 'normal' })).toEqual([
      { reel: 0, pushKoma: 5, stopKoma: 5, slip: 0 },
      { reel: 1, pushKoma: 7, stopKoma: 7, slip: 0 },
    ]);
    // useGame 用: 停止時刻の順に並べる
    const stops = [
      { reel: 0, pushKoma: 1, stopKoma: 2, slip: 1, ruleSet: 'default' as const, candidates: [] },
      null,
      { reel: 2, pushKoma: 3, stopKoma: 3, slip: 0, ruleSet: 'default' as const, candidates: [] },
    ];
    expect(historyFromStops(stops, [200, null, 100]).map((h) => h.reel)).toEqual([2, 0]);
  });
});

describe('ルールセット（STOP_RULE_SETS）', () => {
  it('flags.bonus で選ぶ。4 セットとも同じルール列', () => {
    expect(ruleSetFor(HAZURE).id).toBe('default');
    expect(ruleSetFor({ small: 'BELL', bonus: null }).id).toBe('default');
    expect(ruleSetFor({ small: null, bonus: 'BIG7' }).id).toBe('BIG7');
    expect(ruleSetFor({ small: 'CHERRY', bonus: 'REG' }).id).toBe('REG');
    for (const id of ['default', 'BIG7', 'BIGG', 'REG'] as const) expect(STOP_RULE_SETS[id].rules).toBe(STOP_RULES);
  });

  it('停止結果に使ったセットが入る', () => {
    expect(decideStop({ reel: 0, pushKoma: 1, stopped: noStop, flags: HAZURE, mode: 'normal' }).ruleSet).toBe('default');
    expect(decideStop({ reel: 0, pushKoma: 1, stopped: noStop, flags: { small: null, bonus: 'BIGG' }, mode: 'normal' }).ruleSet).toBe('BIGG');
  });

  it('isExcludedIn / isPreferredIn: default は全部除外、成立後は他系だけ除外・自系を優先', () => {
    expect(isExcludedIn(R06, null)).toBe(true);
    expect(isExcludedIn(R06, 'BIG7')).toBe(false);
    expect(isExcludedIn(G01, 'BIG7')).toBe(true);
    expect(isExcludedIn(G01, 'BIGG')).toBe(false);
    expect(isPreferredIn(R06, null)).toBe(false);
    expect(isPreferredIn(R06, 'REG')).toBe(true);
    expect(isPreferredIn(G01, 'REG')).toBe(false);
    const gase: ReachmePattern = { ...R06, usage: 'preferOnly' };
    expect(isExcludedIn(gase, null)).toBe(false);
  });
});

describe('default セットの除外（条件付き）', () => {
  // 左 12 番も除外しておき、11 番押しで 13（R06）・14（R07 3 コマスベリ）が除外されると 15 番になる
  const X12: ReachmePattern = { id: 'X12', label: 'テスト用 左12', reels: [reelAt(0, 12), null, null] };

  it('スベリ条件: 左 14 番は 3 コマ以上スベって止まるときだけリーチ目', () => {
    const table = [X12, R06, R07];
    const a = decideStop({ reel: 0, pushKoma: 11, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: table });
    expect(a.stopKoma).toBe(15);
    expect(a.candidates.find((c) => c.koma === 14)?.excludedBy).toBe('reachmeExclude');
    const b = decideStop({ reel: 0, pushKoma: 13, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: table });
    expect(b.stopKoma).toBe(14); // 1 コマスベリなら OK
    // R07 が無ければ 11 番押しでも 14 で止まる
    const c = decideStop({ reel: 0, pushKoma: 11, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: [X12, R06] });
    expect(c.stopKoma).toBe(14);
  });

  it('スベリ条件は左が第 2・第 3 停止でも効く', () => {
    const table = [X12, R06, R07];
    const mid = decideStop({ reel: 1, pushKoma: 1, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: table });
    const history: StopRecord[] = [{ reel: 1, pushKoma: 1, stopKoma: mid.stopKoma, slip: mid.slip }];
    const left = decideStop({ reel: 0, pushKoma: 11, stopped: [null, mid.stopKoma, null], flags: HAZURE, mode: 'normal', history }, { reachme: table });
    expect(left.stopKoma).toBe(15);
  });

  it('押し順条件: 中押しチスチ（R03）は中が第 1 停止のときだけ除外', () => {
    const table = [R03];
    const first = decideStop({ reel: 1, pushKoma: 10, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: table });
    expect(first.stopKoma).not.toBe(10);
    expect(first.candidates.find((c) => c.koma === 10)?.excludedBy).toBe('reachmeExclude');
    const left = decideStop({ reel: 0, pushKoma: 1, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: table });
    const history: StopRecord[] = [{ reel: 0, pushKoma: 1, stopKoma: left.stopKoma, slip: left.slip }];
    const second = decideStop({ reel: 1, pushKoma: 10, stopped: [left.stopKoma, null, null], flags: HAZURE, mode: 'normal', history }, { reachme: table });
    expect(second.stopKoma).toBe(10);
  });

  it('strict でないリーチ目は当選小役が揃う形なら許す。strict なら小役より除外を優先する', () => {
    const bell: ActiveFlags = { small: 'BELL', bonus: null };
    // 左 11 番押し・ベル当選: 13（ベル上段・7 中段 = R06 の形）が最小スベリ
    const soft = decideStop({ reel: 0, pushKoma: 11, stopped: noStop, flags: bell, mode: 'normal', history: [] }, { reachme: [R06] });
    expect(soft.stopKoma).toBe(13);
    const strict = decideStop({ reel: 0, pushKoma: 11, stopped: noStop, flags: bell, mode: 'normal', history: [] }, { reachme: [{ ...R06, strict: true }] });
    expect(strict.stopKoma).toBe(14);
    expect(strict.candidates.find((c) => c.koma === 13)?.excludedBy).toBe('pullIn');
  });

  it('先読み: 2 リール目で止めると 3 リール目がどこを押されてもリーチ目になる形は、2 リール目で避ける', () => {
    // 右 19 番（ゲチェナ）を右リールだけで決まるリーチ目として登録 → ハズレでは右 19 番に止まらない
    const r = decideStop({ reel: 2, pushKoma: 19, stopped: noStop, flags: HAZURE, mode: 'normal', history: [] }, { reachme: [R01] });
    expect(r.stopKoma).not.toBe(19);
    // 2 リール目の形から 3 リール目が逃げられない形を作る: 左 4 + 中 5（R12）は右がどこでもリーチ目
    const mid = decideStop({ reel: 1, pushKoma: 5, stopped: [4, null, null], flags: HAZURE, mode: 'normal', history: [{ reel: 0, pushKoma: 4, stopKoma: 4, slip: 0 }] }, { reachme: [R12] });
    expect(mid.stopKoma).not.toBe(5);
    expect(mid.candidates.find((c) => c.koma === 5)?.excludedBy).toBe('reachmeExclude');
  });
});

describe('ボーナス成立後（種別セット）', () => {
  const table = [R06, G01];

  it('自系のリーチ目: ボーナスを引き込めない位置では、リーチ目を作れる候補を優先する', () => {
    // BIGG 成立・左 11 番押し: 11〜15 に G は無い → 13（7 中段 = 共通リーチ目 R06）を優先
    const r = decideStop({ reel: 0, pushKoma: 11, stopped: noStop, flags: { small: null, bonus: 'BIGG' }, mode: 'normal', history: [] }, { reachme: table });
    expect(r.stopKoma).toBe(13);
    const chosen = r.candidates.find((c) => c.chosen)!;
    expect(chosen.evaluations.find((e) => e.ruleId === 'reachmePrefer')?.verdict).toBe('accept');
  });

  it('他系のリーチ目: BIG7 成立中は G 系の形（3 連 G）を止めない。BIGG 成立中は止める', () => {
    const big7 = decideStop({ reel: 0, pushKoma: 17, stopped: noStop, flags: { small: null, bonus: 'BIG7' }, mode: 'normal', history: [] }, { reachme: table });
    expect(big7.stopKoma).not.toBe(19);
    expect(big7.candidates.find((c) => c.koma === 19)?.excludedBy).toBe('reachmeExclude');
    const bigg = decideStop({ reel: 0, pushKoma: 17, stopped: noStop, flags: { small: null, bonus: 'BIGG' }, mode: 'normal', history: [] }, { reachme: table });
    expect(bigg.stopKoma).toBe(19);
  });

  it('bonus を絞ったリーチ目は、対象外のボーナスでは default と同じく除外される', () => {
    const la = createLookahead([G01]);
    const q = { target: null, positions: [19, 1, 1] as const, order: [0, 1, 2] as const, masks: [0, 0, 0] as const };
    expect(la.query({ ...q, bonus: null }).clean).toBe(false);
    expect(la.query({ ...q, bonus: 'BIG7' }).avoid).toBe(false);
    expect(la.query({ ...q, bonus: 'BIG7' }).clean).toBe(true); // 成立後は引き込みの足切りにはしない
    expect(la.query({ ...q, bonus: 'BIGG' }).avoid).toBe(true);
    expect(la.query({ ...q, bonus: 'BIGG' }).reach).toBe(1);
  });
});

describe('生成リーチ目（reachmeGen）', () => {
  it('R11: 3 段 × 27 通りから入賞形（7・7・7 / G・G・G / 上段 BAR・BAR・BAR）を除いた 74 件', () => {
    const list = horizontalBonusLines();
    expect(list).toHaveLength(74);
    expect(list.every((p) => p.strict)).toBe(true);
    expect(isWinShape(['seven', 'seven', 'seven'], 1)).toBe(true);
    expect(isWinShape(['seven', 'seven', 'bar'], 2)).toBe(false); // REG は右下がりのみ
    expect(isWinShape(['seven', 'seven', 'bar'], 0)).toBe(false);
    expect(isWinShape(['bar', 'bar', 'bar'], 0)).toBe(true);
    expect(isWinShape(['bar', 'bar', 'bar'], 1)).toBe(false);
    // 生成した形はどれも入賞形ではない（REACH_A は窓判定なので上段 BAR 揃いも除かれている）
    for (const p of list) {
      const [l, m, r] = p.reels.map((rp) => rp!.find((c) => c !== '*')!) as ['seven' | 'g' | 'bar', 'seven' | 'g' | 'bar', 'seven' | 'g' | 'bar'];
      const row = p.reels[0]!.findIndex((c) => c !== '*') as 0 | 1 | 2;
      expect(isWinShape([l, m, r], row)).toBe(false);
    }
    const custom = horizontalBonusLines({ bonusFor: (s, row) => (row === 0 && s.join() === 'seven,seven,bar' ? ['BIG7', 'BIGG'] : undefined) });
    expect(custom.find((p) => p.id === 'R11-top-seven-seven-bar')?.bonus).toEqual(['BIG7', 'BIGG']);
    expect(custom.find((p) => p.id === 'R11-top-seven-g-bar')?.bonus).toBeUndefined();
  });

  it('R04: 左→右の挟み打ちで小役 2 種以上がテンパイする形。仕様の代表例（左 4 番＋右 1・3・10・14・17 番）を含む', () => {
    const list = sandwichDoubleTempai();
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.when?.order).toEqual([0, 2]);
      expect(p.reels[1]).toBeNull();
      expect(p.strict).toBeUndefined();
    }
    for (const right of [1, 3, 10, 14, 17]) {
      expect(tempaiRoles(4, right).length, `左4 右${right}`).toBeGreaterThanOrEqual(2);
      expect(list.some((p) => p.id === `R04-L4-R${right}`)).toBe(true);
    }
  });

  it('R04 を登録すると、ハズレの挟み打ちで W テンパイが 2 リール目に止まらない（右→左では対象外）', () => {
    const table = sandwichDoubleTempai();
    let before = 0;
    let after = 0;
    let reverse = 0;
    for (let a = 1; a <= 21; a++)
      for (let c = 1; c <= 21; c++) {
        const base = stopSequence(HAZURE, 'normal', [a, 1, c], [0, 2], { reachme: [] }).positions;
        if (tempaiRoles(base[0]!, base[2]!).length >= 2) before++;
        const now = stopSequence(HAZURE, 'normal', [a, 1, c], [0, 2], { reachme: table }).positions;
        if (tempaiRoles(now[0]!, now[2]!).length >= 2) after++;
        const rev = stopSequence(HAZURE, 'normal', [a, 1, c], [2, 0], { reachme: table }).positions;
        if (tempaiRoles(rev[0]!, rev[2]!).length >= 2) reverse++;
      }
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
    expect(reverse).toBeGreaterThan(0);
  });
});

describe('受け入れ検算（サンプルテーブル・本物の decideStop・全押し順 × 全押下位置）', () => {
  for (const flags of DEFAULT_FLAGS) {
    const name = flags.small ?? 'ハズレ';
    it(`${name}: 止めてはいけないリーチ目も非当選役も出ない`, () => {
      const r = checkDefaultEscapes(SAMPLE, { flagsList: [flags], limit: 20 });
      expect(r.checked).toBe(6 * 21 ** 3);
      expect(r.violations.map(formatViolation)).toEqual([]);
    });
  }

  it('ボーナス成立中は他系のリーチ目が出ず、自系のリーチ目は出る', () => {
    for (const bonus of ['BIG7', 'BIGG', 'REG'] as const) {
      const r = reachmeRateUnderBonus(SAMPLE, { small: null, bonus }, ALL_ORDERS[0]);
      expect(r.games).toBe(21 ** 3);
      expect(r.wrongReachme, bonus).toBe(0);
      expect(r.reachme, bonus).toBeGreaterThan(0);
      expect(r.bonusHit, bonus).toBeGreaterThan(0);
    }
  });

  it('リーチ目テーブルが空なら、ボーナス成立中の出目は「揃う」か「ただのハズレ目」だけ', () => {
    const r = reachmeRateUnderBonus([], { small: null, bonus: 'REG' }, ALL_ORDERS[1]);
    expect(r.reachme).toBe(0);
    expect(r.wrongReachme).toBe(0);
    expect(r.bonusHit + r.plain).toBe(r.games);
    // 揃った形では非当選役が無い
    const { positions } = stopSequence({ small: null, bonus: 'REG' }, 'normal', [12, 17, 14], [0, 1, 2]); // 右下がり 7・7・BAR
    expect(rolesIn(buildWindow(positions))).toEqual(['REG']);
  });
});
