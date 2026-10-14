import type { BonusRole, LineId, PayoutSmallRole, ReachmePattern, ReelPattern, RowIndex, SymbolId } from '../shared/types.ts';
import { KOMA_COUNT, windowAt } from '../config/reels.ts';
import { ROLES, WIN_PATTERNS } from '../config/roles.ts';
import { SYMBOLS } from '../config/symbols.ts';
import { matchAll } from '../payout/judge.ts';

/**
 * 形が多くて手書きしにくいリーチ目を配列から生成する。
 * config/reachme.ts から呼んで REACHME に展開して使う。生成結果も普通の ReachmePattern なので、
 * デバッグパネルの一致表示や受け入れ検算はそのまま効く。
 *
 * - horizontalBonusLines : R11 ボーナス図柄の横一直線（上段・中段・下段に 7／G／BAR が 3 つ並ぶ。入賞形は除く）
 * - sandwichDoubleTempai : R04 挟み打ち（左→右）の第 2 停止で小役 2 種以上がテンパイする形
 */

/** ボーナス図柄（横一直線の対象） */
export const BONUS_SYMBOLS: readonly SymbolId[] = ['seven', 'g', 'bar'];

const ROW_LINE: Record<RowIndex, LineId> = { 0: 'top', 1: 'middle', 2: 'bottom' };
const ROW_LABEL: Record<RowIndex, string> = { 0: '上段', 1: '中段', 2: '下段' };
const PAYOUT_SMALL: readonly PayoutSmallRole[] = ['BELL', 'MELON', 'REPLAY'];

/** その段に [左, 中, 右] が並んだとき、何かの入賞形になるか（ライン判定と窓判定の両方を見る） */
export function isWinShape(symbols: readonly [SymbolId, SymbolId, SymbolId], row: RowIndex): boolean {
  return WIN_PATTERNS.some((p) => {
    if (p.scope === 'line') {
      if (p.lines && !p.lines.includes(ROW_LINE[row])) return false;
      return p.symbols.every((allowed, i) => allowed === null || allowed.includes(symbols[i]));
    }
    if (p.scope === 'window' && p.cells) {
      // その段以外に条件が無く、その段の条件が一致するなら入賞形
      return p.cells.every((cell, i) => cell.every((c, r) => (r === row ? c === '*' || c === symbols[i] : c === '*')));
    }
    return false;
  });
}

function rowPattern(symbol: SymbolId, row: RowIndex): ReelPattern {
  const p: [SymbolId | '*', SymbolId | '*', SymbolId | '*'] = ['*', '*', '*'];
  p[row] = symbol;
  return p;
}

export interface HorizontalLineOptions {
  /** 形ごとの対象ボーナス（省略で全ボーナス）。例: 上段 7・7・BAR を REG では止めたくない → ['BIG7', 'BIGG'] */
  bonusFor?: (symbols: readonly [SymbolId, SymbolId, SymbolId], row: RowIndex) => readonly BonusRole[] | undefined;
}

/** R11: 上段・中段・下段のいずれかに 7／G／BAR が 3 つ並ぶ形（入賞形以外）。小役が揃っていてもリーチ目扱い（strict） */
export function horizontalBonusLines(options: HorizontalLineOptions = {}): ReachmePattern[] {
  const out: ReachmePattern[] = [];
  for (const row of [0, 1, 2] as const) {
    for (const a of BONUS_SYMBOLS)
      for (const b of BONUS_SYMBOLS)
        for (const c of BONUS_SYMBOLS) {
          const symbols = [a, b, c] as const;
          if (isWinShape(symbols, row)) continue;
          const names = symbols.map((s) => SYMBOLS[s].label).join('・');
          out.push({
            id: `R11-${ROW_LINE[row]}-${a}-${b}-${c}`,
            label: `R11 ${ROW_LABEL[row]}に ${names}`,
            reels: [rowPattern(a, row), rowPattern(b, row), rowPattern(c, row)],
            strict: true,
            bonus: options.bonusFor?.(symbols, row),
          });
        }
  }
  return out;
}

/** 左・右の 2 リール停止時点でテンパイ（成立可能）している払い出し小役（代用スイカ含む） */
export function tempaiRoles(left: number, right: number): PayoutSmallRole[] {
  const window = [windowAt(0, left), null, windowAt(2, right)] as const;
  const roles = new Set<PayoutSmallRole>();
  for (const m of matchAll(window)) {
    if (m.state === 'open' && m.pattern.scope === 'line' && (PAYOUT_SMALL as readonly string[]).includes(m.pattern.role)) {
      roles.add(m.pattern.role as PayoutSmallRole);
    }
  }
  return PAYOUT_SMALL.filter((r) => roles.has(r));
}

/**
 * R04: 挟み打ち（左→右）の第 2 停止で小役 2 種以上がテンパイする形。
 * 条件 when.order = [0, 2] で「左→右」のときだけリーチ目として扱う（右→左・順押しでは対象外）。
 * 当選小役が揃えば小役の出目（strict ではない）。
 */
export function sandwichDoubleTempai(): ReachmePattern[] {
  const out: ReachmePattern[] = [];
  const seen = new Set<string>();
  for (let left = 1; left <= KOMA_COUNT; left++) {
    for (let right = 1; right <= KOMA_COUNT; right++) {
      const roles = tempaiRoles(left, right);
      if (roles.length < 2) continue;
      const lw = windowAt(0, left);
      const rw = windowAt(2, right);
      const key = `${lw.join(',')}|${rw.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `R04-L${left}-R${right}`,
        label: `R04 挟み打ちWテンパイ 左${left}番＋右${right}番（${roles.map((r) => ROLES[r].label).join('・')}）`,
        reels: [[lw[0], lw[1], lw[2]], null, [rw[0], rw[1], rw[2]]],
        when: { order: [0, 2] },
      });
    }
  }
  return out;
}
