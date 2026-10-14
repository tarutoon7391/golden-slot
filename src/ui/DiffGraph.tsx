/**
 * 差枚数グラフ（SVG）
 * series は diffStep ゲームごとの差枚数。0 のラインを基準に上下に描く。
 */
interface Props {
  series: readonly number[];
  step: number;
  width?: number;
  height?: number;
}

export function DiffGraph({ series, step, width = 320, height = 120 }: Props) {
  const pad = { top: 8, right: 8, bottom: 18, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const n = Math.max(series.length, 2);
  const max = Math.max(50, ...series);
  const min = Math.min(-50, ...series);
  const x = (i: number) => pad.left + (i / (n - 1)) * w;
  const y = (v: number) => pad.top + ((max - v) / (max - min)) * h;
  const points = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = series[series.length - 1] ?? 0;
  const games = (series.length - 1) * step;

  return (
    <svg className="diff-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`差枚数の推移 現在 ${last} 枚`}>
      <rect x={pad.left} y={pad.top} width={w} height={h} className="graph-bg" />
      <line x1={pad.left} x2={pad.left + w} y1={y(0)} y2={y(0)} className="graph-zero" />
      <text x={pad.left - 4} y={y(max) + 4} className="graph-tick" textAnchor="end">
        {max}
      </text>
      <text x={pad.left - 4} y={y(0) + 4} className="graph-tick" textAnchor="end">
        0
      </text>
      <text x={pad.left - 4} y={y(min) + 4} className="graph-tick" textAnchor="end">
        {min}
      </text>
      <text x={pad.left + w} y={height - 4} className="graph-tick" textAnchor="end">
        {games} G
      </text>
      {series.length >= 2 && <polyline points={points} className={`graph-line ${last >= 0 ? 'plus' : 'minus'}`} />}
    </svg>
  );
}
