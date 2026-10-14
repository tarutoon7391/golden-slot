import { describe, expect, it } from 'vitest';
import type { ActiveFlags, KomaNo, ReachmePattern, ReelIndex } from '../src/shared/types.ts';
import { decideStop, stopSequence, targetRoleOf, allowedRolesOf } from '../src/reel/control.ts';
import { judgeWindow, matchAll } from '../src/payout/judge.ts';
import { buildPartialWindow, buildWindow } from '../src/reel/window.ts';
import { patternsOf } from '../src/config/roles.ts';
import { windowAt } from '../src/config/reels.ts';
import { findReachme, formatAsReachme } from '../src/reel/reachme.ts';

const ALL: KomaNo[] = Array.from({ length: 21 }, (_, i) => i + 1);
const ORDERS: ReelIndex[][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** 全押下位置で回して、当選役の入賞率と非当選役の成立回数を返す */
function sweep(flags: ActiveFlags, order: ReelIndex[]) {
  const target = targetRoleOf(flags);
  let n = 0;
  let hit = 0;
  let bad = 0;
  for (const a of ALL)
    for (const b of ALL)
      for (const c of ALL) {
        const { positions } = stopSequence(flags, 'normal', [a, b, c], order);
        const roles = new Set(judgeWindow(buildWindow(positions), 'normal').hits.map((h) => h.role));
        n++;
        if (target && roles.has(target)) hit++;
        for (const r of roles) if (r !== target) bad++;
      }
  return { rate: hit / n, bad };
}

describe('引き込む役・揃ってよい役', () => {
  it('小役優先。小役が無ければボーナス。何も無ければ null', () => {
    expect(targetRoleOf({ small: 'BELL', bonus: 'BIGG' })).toBe('BELL');
    expect(targetRoleOf({ small: null, bonus: 'REG' })).toBe('REG');
    expect(targetRoleOf({ small: null, bonus: null })).toBeNull();
    expect(allowedRolesOf({ small: 'CHERRY', bonus: 'BIGG' })).toEqual(['CHERRY']);
    expect(allowedRolesOf({ small: null, bonus: null })).toEqual([]);
  });
});

describe('引き込み（順押し・全押下位置 21^3）', () => {
  it('ベルは 3 リールともどの位置で押しても揃う', () => {
    const r = sweep({ small: 'BELL', bonus: null }, [0, 1, 2]);
    expect(r.rate).toBe(1);
    expect(r.bad).toBe(0);
  });

  it('リプレイは 3 リールともどの位置で押しても揃う', () => {
    const r = sweep({ small: 'REPLAY', bonus: null }, [0, 1, 2]);
    expect(r.rate).toBe(1);
    expect(r.bad).toBe(0);
  });

  it('ベル＋BIG 重複でもベルを優先して揃え、ボーナス図柄は揃えない', () => {
    const r = sweep({ small: 'BELL', bonus: 'BIGG' }, [0, 1, 2]);
    expect(r.rate).toBe(1);
    expect(r.bad).toBe(0);
  });

  it('右スイカ: 右リールはどの段・どの位置で押しても 4 コマ以内にスイカか BAR（代用）を置ける', () => {
    for (const row of [0, 1, 2] as const) {
      for (const c of ALL) {
        const ok = [0, 1, 2, 3, 4].some((slip) => ['melon', 'bar'].includes(windowAt(2, c + slip)[row]));
        expect(ok, `右 ${c} 番押し・段 ${row}`).toBe(true);
      }
    }
  });

  it('右スイカ: 左・中スイカテンパイで、他役と衝突せずに揃えられる候補があれば必ず揃える（代用BAR含む）', () => {
    const flags: ActiveFlags = { small: 'MELON', bonus: null };
    let checked = 0;
    let completed = 0;
    for (const a of ALL)
      for (const b of ALL) {
        // 左→中 を止めた状態
        const left = decideStop({ reel: 0, pushKoma: a, stopped: [null, null, null], flags, mode: 'normal' });
        const mid = decideStop({ reel: 1, pushKoma: b, stopped: [left.stopKoma, null, null], flags, mode: 'normal' });
        const stopped = [left.stopKoma, mid.stopKoma, null] as const;
        const open = matchAll(buildPartialWindow(stopped), patternsOf('MELON')).some((m) => m.state === 'open');
        if (!open) continue; // 左・中でスイカが途切れたケースは対象外（取りこぼし）
        for (const c of ALL) {
          // 候補 0〜4 のうち「スイカが揃い、他役が揃わない」ものがあるか
          const possible = [0, 1, 2, 3, 4].some((slip) => {
            const roles = judgeWindow(buildWindow([left.stopKoma, mid.stopKoma, ((c + slip - 1) % 21) + 1]), 'normal').hits.map((h) => h.role);
            return roles.includes('MELON') && roles.every((r) => r === 'MELON');
          });
          if (!possible) continue;
          checked++;
          const right = decideStop({ reel: 2, pushKoma: c, stopped, flags, mode: 'normal' });
          const roles = judgeWindow(buildWindow([left.stopKoma, mid.stopKoma, right.stopKoma]), 'normal').hits.map((h) => h.role);
          if (roles.includes('MELON')) completed++;
        }
      }
    expect(checked).toBeGreaterThan(0);
    expect(completed).toBe(checked);
  });
});

describe('変則押し（全 6 押し順・全押下位置）', () => {
  it('リプレイはどの押し順でも必ず揃う', () => {
    for (const order of ORDERS) {
      const r = sweep({ small: 'REPLAY', bonus: null }, order);
      expect(r.rate, `order ${order.join('')}`).toBe(1);
      expect(r.bad).toBe(0);
    }
  });

  it('ベルは 左→中→右 / 左→右→中 で必ず揃う。中→左→右 は 99.5% 以上、右を先に止める押し順は 89% 以上', () => {
    // 左リールのベルは最大 6 コマ空く（8番→14番）ので、先に止まったリールの出目で
    // 左ベルの段が「中段のみ」に限定されると 5 コマの引き込みでは届かないことがある。
    // 右を先に止めると右ベルが中段にしか来ない押下位置があり、その場合に取りこぼす。
    // 中→左→右 は、中第 1 停止の候補を「次に左が押されるか右が押されるか分からない」前提の見込みで選ぶため、
    // リーチ目テーブルの回避が入った分だけ左向きに最適でない候補が選ばれる押下位置がわずかにある（32/9261）。
    const perfect = ['012', '021'];
    for (const order of ORDERS) {
      const key = order.join('');
      const r = sweep({ small: 'BELL', bonus: null }, order);
      expect(r.bad, `order ${key}`).toBe(0);
      if (perfect.includes(key)) expect(r.rate, `order ${key}`).toBe(1);
      else if (key === '102') expect(r.rate, `order ${key}`).toBeGreaterThan(0.995);
      else expect(r.rate, `order ${key}`).toBeGreaterThan(0.89);
    }
  });
});

describe('蹴飛ばし（非当選役を揃えない）', () => {
  const cases: [string, ActiveFlags][] = [
    ['ハズレ', { small: null, bonus: null }],
    ['スイカ', { small: 'MELON', bonus: null }],
    ['チェリー', { small: 'CHERRY', bonus: null }],
    ['BIGG 内部中', { small: null, bonus: 'BIGG' }],
    ['BIG7 内部中', { small: null, bonus: 'BIG7' }],
    ['リーチ目役A＋BIG7', { small: 'REACH_A', bonus: 'BIG7' }],
    ['リーチ目役B＋REG', { small: 'REACH_B', bonus: 'REG' }],
    ['REG 内部中', { small: null, bonus: 'REG' }],
    ['チェリー＋REG', { small: 'CHERRY', bonus: 'REG' }],
  ];
  for (const [name, flags] of cases) {
    it(`${name}: 全押し順・全押下位置で非当選役が揃わない`, () => {
      for (const order of ORDERS) {
        expect(sweep(flags, order).bad, `order ${order.join('')}`).toBe(0);
      }
    });
  }
});

describe('候補の評価結果（デバッグ表示用）', () => {
  it('候補は 0〜4 コマの 5 つ。選ばれたものは 1 つで excludedBy は null、他は除外理由を持つ', () => {
    const r = decideStop({ reel: 0, pushKoma: 9, stopped: [null, null, null], flags: { small: null, bonus: null }, mode: 'normal' });
    expect(r.candidates.map((c) => c.slip)).toEqual([0, 1, 2, 3, 4]);
    expect(r.candidates.map((c) => c.koma)).toEqual([9, 10, 11, 12, 13]);
    const chosen = r.candidates.filter((c) => c.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].excludedBy).toBeNull();
    expect(chosen[0].koma).toBe(r.stopKoma);
    for (const c of r.candidates) {
      if (!c.chosen) expect(c.excludedBy).not.toBeNull();
      expect(c.evaluations.length).toBeGreaterThan(0);
      expect(c.symbols).toEqual(windowAt(0, c.koma));
    }
  });

  it('ハズレで左 9 番押し: チェリー（10 番）が窓に入る 9〜11 は蹴飛ばされる', () => {
    const r = decideStop({ reel: 0, pushKoma: 9, stopped: [null, null, null], flags: { small: null, bonus: null }, mode: 'normal' });
    for (const c of r.candidates) {
      if (c.koma <= 11) {
        expect(c.excludedBy).toBe('kick');
        expect(c.evaluations.find((e) => e.ruleId === 'kick')?.verdict).toBe('reject');
      }
    }
    expect(r.stopKoma).toBeGreaterThanOrEqual(12);
  });
});

describe('リーチ目ルール（テーブル差し替え）', () => {
  // 左 2 番押し → 候補 2〜6 番。窓は 1〜7 番の範囲で G も赤7 も無い → BIG 取りこぼし
  const push: KomaNo = 2;
  const base = { reel: 0 as ReelIndex, pushKoma: push, stopped: [null, null, null] as const, mode: 'normal' as const };

  it('テーブルが空ならリーチ目のルールは何も判断しない', () => {
    const a = decideStop({ ...base, flags: { small: null, bonus: 'BIGG' } }, { reachme: [] });
    const exclude = a.candidates.flatMap((c) => c.evaluations).filter((e) => e.ruleId === 'reachmeExclude');
    expect(exclude.length).toBeGreaterThan(0);
    expect(exclude.every((e) => e.verdict === 'neutral')).toBe(true);
    // 先のルールで除外済みの候補は後のルールを評価しないので、評価が付いた候補だけ見る
    const prefer = a.candidates.flatMap((c) => c.evaluations).filter((e) => e.ruleId === 'reachmePrefer');
    expect(prefer.length).toBeGreaterThan(0);
    expect(prefer.every((e) => e.verdict === 'neutral')).toBe(true);
  });

  it('内部中に取りこぼしたら、リーチ目に一致する候補を優先する', () => {
    const baseline = decideStop({ ...base, flags: { small: null, bonus: 'BIGG' } }, { reachme: [] });
    // 本来はスベリ最小で落ちていた別の安全な候補を探す
    const other = baseline.candidates.find((c) => !c.chosen && c.excludedBy === 'minSlip');
    expect(other).toBeDefined();
    const pattern: ReachmePattern = {
      id: 'test',
      label: 'テスト用',
      reels: [[other!.symbols[0], other!.symbols[1], other!.symbols[2]], null, null],
    };
    const r = decideStop({ ...base, flags: { small: null, bonus: 'BIGG' } }, { reachme: [pattern] });
    expect(r.stopKoma).toBe(other!.koma);
    const chosen = r.candidates.find((c) => c.chosen)!;
    expect(chosen.evaluations.find((e) => e.ruleId === 'reachmePrefer')?.verdict).toBe('accept');
  });

  it('ボーナス非成立時は、リーチ目に一致する候補を除外する', () => {
    const baseline = decideStop({ ...base, flags: { small: null, bonus: null } }, { reachme: [] });
    const chosen = baseline.candidates.find((c) => c.chosen)!;
    const pattern: ReachmePattern = {
      id: 'test',
      label: 'テスト用',
      reels: [[chosen.symbols[0], chosen.symbols[1], chosen.symbols[2]], null, null],
    };
    const r = decideStop({ ...base, flags: { small: null, bonus: null } }, { reachme: [pattern] });
    expect(r.stopKoma).not.toBe(chosen.koma);
    const excluded = r.candidates.find((c) => c.koma === chosen.koma)!;
    expect(excluded.excludedBy).toBe('reachmeExclude');
  });

  it('findReachme / formatAsReachme', () => {
    const w = buildWindow([21, 21, 21]);
    const pattern: ReachmePattern = { id: 'p', label: 'l', reels: [['*', 'replay', '*'], null, ['*', 'melon', '*']] };
    expect(findReachme(w, [pattern]).map((p) => p.id)).toEqual(['p']);
    const text = formatAsReachme(w, 'x', 'テスト');
    expect(text).toContain("id: 'x'");
    expect(text).toContain(`['${w[0][0]}', '${w[0][1]}', '${w[0][2]}']`);
  });
});
