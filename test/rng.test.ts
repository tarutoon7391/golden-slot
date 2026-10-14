import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('rng', () => {
  it('同じシードなら同じ列を返す', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1000));
    const seqB = Array.from({ length: 20 }, () => b.nextInt(1000));
    expect(seqA).toEqual(seqB);
  });

  it('異なるシードなら異なる列を返す', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1000));
    const seqB = Array.from({ length: 20 }, () => b.nextInt(1000));
    expect(seqA).not.toEqual(seqB);
  });

  it('nextInt は [0, max) の整数を返す', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextInt(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('hit(1, 2) はおおむね 50% になる', () => {
    const rng = createRng(7);
    let hits = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) if (rng.hit(1, 2)) hits++;
    expect(hits / n).toBeGreaterThan(0.48);
    expect(hits / n).toBeLessThan(0.52);
  });

  it('pickWeighted は重みに比例して選ぶ', () => {
    const rng = createRng(3);
    const counts = [0, 0, 0];
    const n = 100000;
    for (let i = 0; i < n; i++) counts[rng.pickWeighted([1, 2, 7])]++;
    expect(counts[0] / n).toBeCloseTo(0.1, 1);
    expect(counts[1] / n).toBeCloseTo(0.2, 1);
    expect(counts[2] / n).toBeCloseTo(0.7, 1);
  });

  it('src 配下で Math.random を直呼びしていない', () => {
    const root = path.resolve(__dirname, '..', 'src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
    };
    walk(root);
    const offenders = files.filter((f) => /Math\.random\s*\(/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
