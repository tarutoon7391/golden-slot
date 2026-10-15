import { describe, expect, it } from 'vitest';
import type { ActiveFlags, KomaNo, ReachmePattern, ReelIndex } from '../src/shared/types.ts';
import { decideStop, stopSequence, targetRoleOf, allowedRolesOf } from '../src/reel/control.ts';
import { judgeWindow, matchAll } from '../src/payout/judge.ts';
import { buildPartialWindow, buildWindow } from '../src/reel/window.ts';
import { patternsOf } from '../src/config/roles.ts';
import { MACHINE } from '../src/config/machine.ts';
import { slipKoma, windowAt } from '../src/config/reels.ts';
import { REACHME } from '../src/config/reachme.ts';
import { findReachme, formatAsReachme, matchReachme } from '../src/reel/reachme.ts';
import { rolesIn } from '../src/payout/judge.ts';

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
    const strict = REACHME.filter((p) => p.strict && !p.when); // R11（R03 は中押し条件つきなので順押しでは出ない）
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
          // 候補 0〜4 のうち「スイカが揃い、他役が揃わず、strict のリーチ目（7・7・BAR 横一直線など）にもならない」ものがあるか
          const possible = [0, 1, 2, 3, 4].some((slip) => {
            const w = buildWindow([left.stopKoma, mid.stopKoma, ((c + slip - 1) % 21) + 1]);
            const roles = judgeWindow(w, 'normal').hits.map((h) => h.role);
            return roles.includes('MELON') && roles.every((r) => r === 'MELON') && !strict.some((p) => matchReachme(w, p) === 'hit');
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
    // 右を先に止めると右ベルが中段にしか来ない押下位置があり、その場合に取りこぼす（仕様メモ: 右先押しは保証しない）。
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

  it('スイカの引き込み率（全押し順）は仕様 v1.2 P8 修正後の値を下回らない', () => {
    // 修正前 → 後: 順押し 59.7→63.8%、左右中 45.8→54.4%、中押し 63.4%、中右左 53.6%、右左中 48.5→51.9%、右中左 45.1%
    // （中右左・右中左の取りこぼしは、仕様 v1.2 P1 補足の一覧にない形を経由しないと救えないので従来どおり）
    // 左右中（挟み打ち）は平行スイカ優先（roll 省略 = 平行固定）で 54.4% → 52.7% に下がる。振り分けで斜めになる 1/10 は 54.4%
    const floors: Record<string, number> = { '012': 0.637, '021': 0.526, '102': 0.633, '120': 0.535, '201': 0.518, '210': 0.45 };
    for (const order of ORDERS) {
      const key = order.join('');
      const r = sweep({ small: 'MELON', bonus: null }, order);
      expect(r.bad, `order ${key}`).toBe(0);
      expect(r.rate, `order ${key}`).toBeGreaterThanOrEqual(floors[key]);
    }
  });
});

describe('引き込み最適性（仕様 v1.2 P1・P8）', () => {
  const flags: ActiveFlags = { small: 'MELON', bonus: null };
  const hist = (koma: KomaNo) => [{ reel: 0 as ReelIndex, pushKoma: koma, stopKoma: koma, slip: 0 }];

  it('スイカ成立中の挟み打ち 左4番（BAR上段）＋右押し9番: 非strictのリーチ目形でもスイカをテンパイさせる（右10番か右12番）', () => {
    const r = decideStop({ reel: 2, pushKoma: 9, stopped: [4, null, null], flags, mode: 'normal', history: hist(4) });
    expect([10, 12]).toContain(r.stopKoma);
    const open = matchAll(buildPartialWindow([4, null, r.stopKoma]), patternsOf('MELON')).some((m) => m.state === 'open');
    expect(open).toBe(true);
  });

  it('スイカ成立中の挟み打ち 左15番（スイカ中段）＋右押し10・11番: 右13番の BAR 中段（代用）で救う', () => {
    for (const push of [10, 11] as KomaNo[]) {
      const r = decideStop({ reel: 2, pushKoma: push, stopped: [15, null, null], flags, mode: 'normal', history: hist(15) });
      expect(r.stopKoma, `左15 右押し${push}`).toBe(13);
    }
  });

  it('左3番（スイカ中段）は R08 BAR 枠上の形そのもので経由不可: スイカ成立時も左は 3 番に止まらず、スイカが見える別の位置（2 番上段・4 番下段）に止まる', () => {
    // 左 11 番（リ・ス・チ）もチェリー非成立では枠内チェリーで蹴られるので、スイカ中段の挟み打ちは実質 15 番だけ
    for (const push of [1, 2, 3] as KomaNo[]) {
      const r = decideStop({ reel: 0, pushKoma: push, stopped: [null, null, null], flags, mode: 'normal' });
      expect(r.stopKoma, `左押し${push}`).not.toBe(3);
      expect([2, 4], `左押し${push}`).toContain(r.stopKoma);
    }
  });

  it('ハズレ時は従来どおり: 左4番＋右押し9番でリーチ目形（右10・12番）には止めない', () => {
    const r = decideStop({ reel: 2, pushKoma: 9, stopped: [4, null, null], flags: { small: null, bonus: null }, mode: 'normal', history: hist(4) });
    expect([10, 12]).not.toContain(r.stopKoma);
  });

  it('全小役 × 6 押し順 × 21^3: 第 2 停止で「第 3 停止をどこで押されても揃えられる」候補があればそれを選び、第 3 停止で揃えられるなら必ず揃える', () => {
    // 全停止の形 → 役の集合・strict リーチ目か。「きれいに揃う」= 当選役だけが揃い strict リーチ目でない
    // strict の条件は押し順だけ（R03 中押しチスチ）なので、押し順ごとに照合する。リールの押下位置・スベリ条件を持つ strict は無い前提
    const strict = REACHME.filter((p) => p.strict);
    expect(strict.every((p) => !p.when?.reels)).toBe(true);
    const strictOk = (p: ReachmePattern, order: readonly ReelIndex[]) => !p.when?.order || p.when.order.every((r, i) => order[i] === r);
    const info = new Map<number, { roles: string[]; strictHits: ReachmePattern[] }>();
    const key = (p: readonly [number, number, number]) => (p[0] * 32 + p[1]) * 32 + p[2];
    for (const a of ALL) for (const b of ALL) for (const c of ALL) {
      const w = buildWindow([a, b, c]);
      info.set(key([a, b, c]), { roles: rolesIn(w), strictHits: strict.filter((p) => matchReachme(w, p) === 'hit') });
    }
    let currentOrder: readonly ReelIndex[] = [0, 1, 2];
    const cleanWin = (target: string, pos: readonly [number, number, number]) => {
      const i = info.get(key(pos))!;
      return i.roles.includes(target) && i.roles.every((r) => r === target) && !i.strictHits.some((p) => strictOk(p, currentOrder));
    };
    const place = (pos: readonly (number | null)[], reel: ReelIndex, koma: number) => pos.map((p, i) => (i === reel ? koma : p)) as [number, number, number];
    // 第 3 リールをどこで押されても、きれいに揃えられるスベリがあるか
    const guaranteed = (target: string, pos: readonly (number | null)[], last: ReelIndex) =>
      ALL.every((c) => [0, 1, 2, 3, 4].some((s) => cleanWin(target, place(pos, last, slipKoma(c, s)))));

    const violations: string[] = [];
    for (const target of ['BELL', 'REPLAY', 'MELON', 'CHERRY'] as const) {
      const f: ActiveFlags = { small: target, bonus: null };
      for (const order of ORDERS) {
        const [r1, r2, r3] = order;
        currentOrder = order;
        for (const a of ALL) {
          const s1 = decideStop({ reel: r1, pushKoma: a, stopped: [null, null, null], flags: f, mode: 'normal' });
          const pos1: (number | null)[] = place([null, null, null], r1, s1.stopKoma);
          for (const b of ALL) {
            const s2 = decideStop({ reel: r2, pushKoma: b, stopped: pos1 as never, flags: f, mode: 'normal', history: [s1] });
            const pos2 = place(pos1, r2, s2.stopKoma);
            // 第 2 停止: 保証できる候補があったのに保証できない候補を選んでいないか
            const anyGuaranteed = [0, 1, 2, 3, 4].some((s) => guaranteed(target, place(pos1, r2, slipKoma(b, s)), r3));
            if (anyGuaranteed && !guaranteed(target, pos2, r3)) violations.push(`${target} ${order.join('')} 第2停止 押し[${a},${b}] → ${pos2.join(',')}`);
            // 第 3 停止: きれいに揃えられる位置があるなら必ず揃える
            for (const c of ALL) {
              const can = [0, 1, 2, 3, 4].some((s) => cleanWin(target, place(pos2, r3, slipKoma(c, s))));
              if (!can) continue;
              const s3 = decideStop({ reel: r3, pushKoma: c, stopped: pos2 as never, flags: f, mode: 'normal', history: [s1, s2] });
              if (!info.get(key(place(pos2, r3, s3.stopKoma)))!.roles.includes(target)) violations.push(`${target} ${order.join('')} 第3停止 押し[${a},${b},${c}] → ${place(pos2, r3, s3.stopKoma).join(',')}`);
            }
          }
        }
      }
    }
    expect(violations.slice(0, 10)).toEqual([]);
    expect(violations.length).toBe(0);
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
    expect(excluded.excludedBy).toBe('reachmeHard'); // 経由不可（viaForPullIn でない）の形は経由不可の枠で落ちる
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

describe('挟み打ちの平行／斜めスイカ振り分け（MACHINE.hasamiDiagonalMelonRate）', () => {
  const flags: ActiveFlags = { small: 'MELON', bonus: null };
  const PAR = new Set(['top', 'middle', 'bottom']);
  const kinds = (left: KomaNo, right: KomaNo) => {
    const open = matchAll(buildPartialWindow([left, null, right]), patternsOf('MELON')).filter((m) => m.state === 'open');
    return { p: open.some((m) => m.line && PAR.has(m.line)), d: open.some((m) => m.line && !PAR.has(m.line)) };
  };
  const hasami = (left: ReturnType<typeof decideStop>, c: KomaNo, roll?: number) =>
    decideStop({ reel: 2, pushKoma: c, stopped: [left.stopKoma, null, null], flags, mode: 'normal', history: [left], roll });

  it('平行にも斜めにも狙える押下位置では、既定（roll 省略）は平行、roll < 斜め率 なら斜めを選ぶ。片方しか狙えなければ振り分けしない', () => {
    expect(MACHINE.hasamiDiagonalMelonRate).toBeGreaterThan(0);
    expect(MACHINE.hasamiDiagonalMelonRate).toBeLessThan(0.5);
    let both = 0;
    for (const a of ALL) {
      const left = decideStop({ reel: 0, pushKoma: a, stopped: [null, null, null], flags, mode: 'normal' });
      for (const c of ALL) {
        const base = hasami(left, c);
        const par = hasami(left, c, 0.999);
        const dia = hasami(left, c, 0);
        expect(par.stopKoma, `左${a} 右${c}`).toBe(base.stopKoma);
        const routed = base.candidates.some((cand) => cand.evaluations.some((e) => e.ruleId === 'hasamiLine' && e.verdict === 'accept'));
        if (routed) {
          both++;
          expect(kinds(left.stopKoma, base.stopKoma).p, `左${a} 右${c} 平行`).toBe(true);
          const k = kinds(left.stopKoma, dia.stopKoma);
          expect(k.d && !k.p, `左${a} 右${c} 斜め`).toBe(true);
        } else {
          expect(dia.stopKoma, `左${a} 右${c}`).toBe(base.stopKoma);
        }
      }
    }
    expect(both).toBeGreaterThan(50);
  });

  it('斜めスイカの割合: 振り分け前は約 48% → 振り分け後は 4 割未満（斜めしか狙えない押下位置が残るため 1/10 にはならない）', () => {
    const sweepHasami = (roll: number) => {
      let win = 0;
      let dia = 0;
      for (const a of ALL) {
        const left = decideStop({ reel: 0, pushKoma: a, stopped: [null, null, null], flags, mode: 'normal' });
        for (const c of ALL) {
          const right = hasami(left, c, roll);
          for (const b of ALL) {
            const mid = decideStop({ reel: 1, pushKoma: b, stopped: [left.stopKoma, null, right.stopKoma], flags, mode: 'normal', history: [left, right], roll });
            const hits = judgeWindow(buildWindow([left.stopKoma, mid.stopKoma, right.stopKoma]), 'normal').hits.filter((h) => h.role === 'MELON');
            if (!hits.length) continue;
            win++;
            if (!hits.some((h) => h.line && PAR.has(h.line))) dia++;
          }
        }
      }
      return { win, dia };
    };
    const p = sweepHasami(0.999);
    const d = sweepHasami(0);
    const rate = MACHINE.hasamiDiagonalMelonRate;
    const diagShare = ((1 - rate) * p.dia + rate * d.dia) / ((1 - rate) * p.win + rate * d.win);
    expect(diagShare).toBeLessThan(0.4);
    expect(diagShare).toBeGreaterThan(0);
    // 平行優先は候補を平行に絞るぶん引き込み率が少し下がる（54.4% → 52.7%）。斜め側は従来どおり
    expect(p.win / 21 ** 3).toBeGreaterThanOrEqual(0.526);
    expect(d.win / 21 ** 3).toBeGreaterThanOrEqual(0.543);
  });

  it('順押し・中押しには影響しない（roll を変えても停止位置が同じ）', () => {
    for (const order of [[0, 1, 2], [1, 0, 2], [1, 2, 0]] as ReelIndex[][]) {
      for (const a of ALL) for (const b of [1, 5, 9, 13, 17, 21] as KomaNo[]) for (const c of [2, 8, 14, 20] as KomaNo[]) {
        const x = stopSequence(flags, 'normal', [a, b, c], order, { roll: 0 }).positions;
        const y = stopSequence(flags, 'normal', [a, b, c], order, { roll: 0.999 }).positions;
        expect(x, `${order.join('')} ${a},${b},${c}`).toEqual(y);
      }
    }
  });
});
