import { useState } from 'react';

/**
 * Small SVG charts in the Night Lab palette. One series colour per owner, hover for values.
 * They scale to their container width.
 */

export function Sparkline({ values, color = 'var(--mint)', height = 22, width = 70 }: { values: number[]; color?: string; height?: number; width?: number }) {
  if (values.length < 2) return <svg className="spark" width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface Series {
  name: string;
  color: string;
  values: number[];
}

/** Lines over a shared x axis (labels), with a hover readout. */
export function LineChart({
  series,
  labels,
  format = (v) => v.toFixed(0),
  height = 160,
  zero = true,
}: {
  series: Series[];
  labels: string[];
  format?: (v: number) => string;
  height?: number;
  zero?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 460;
  const H = height;
  const pad = { l: 46, r: 8, t: 8, b: 20 };
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length || labels.length < 2) return <div className="chart-empty">Not enough history yet.</div>;
  let min = zero ? Math.min(0, ...all) : Math.min(...all);
  let max = Math.max(...all);
  if (max === min) max = min + 1;
  const n = labels.length;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [min, (min + max) / 2, max];
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const fx = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((fx - pad.l) / (W - pad.l - pad.r)) * (n - 1)))));
        }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 3} className="tick" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {min < 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="zero" />}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={s.values.map((v, i) => `${x(i)},${y(Number.isFinite(v) ? v : 0)}`).join(' ')}
          />
        ))}
        <text x={pad.l} y={H - 4} className="tick">
          {labels[0]}
        </text>
        <text x={W - pad.r} y={H - 4} className="tick" textAnchor="end">
          {labels[n - 1]}
        </text>
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="cursor" />}
      </svg>
      <div className="chart-legend">
        {hover !== null && <span className="when">{labels[hover]}</span>}
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
            {hover !== null && <b>{format(s.values[hover] ?? 0)}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Paired bars per period (e.g. revenue and profit), with hover. */
export function Bars({ labels, a, b, format, names }: { labels: string[]; a: number[]; b: number[]; format: (v: number) => string; names: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!labels.length) return <div className="chart-empty">No full months yet.</div>;
  const max = Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs));
  const hasNeg = b.some((v) => v < 0);
  return (
    <div className="chart bars" onMouseLeave={() => setHover(null)}>
      <div className="bar-row">
        {labels.map((l, i) => (
          <div key={l + i} className={`bar-col${hover === i ? ' on' : ''}`} onMouseEnter={() => setHover(i)}>
            <div className="bar-pos">
              <span className="b1" style={{ height: `${(Math.max(0, a[i]!) / max) * 100}%` }} />
              <span className="b2" style={{ height: `${(Math.max(0, b[i]!) / max) * 100}%` }} />
            </div>
            {hasNeg && (
              <div className="bar-neg">
                <span className="b2 neg" style={{ height: `${(Math.max(0, -b[i]!) / max) * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chart-legend">
        {hover !== null && <span className="when">{labels[hover]}</span>}
        <span>
          <i className="b1" />
          {names[0]}
          {hover !== null && <b>{format(a[hover]!)}</b>}
        </span>
        <span>
          <i className="b2" />
          {names[1]}
          {hover !== null && <b>{format(b[hover]!)}</b>}
        </span>
      </div>
    </div>
  );
}

export const OWNER_COLORS: Record<string, string> = {
  you: '#5eead4',
  others: '#53608a',
  intel: '#7aa2ff',
  amd: '#ff8f73',
  cyrix: '#fcd34d',
  s3: '#c58cff',
  matrox: '#6ee7a8',
  nvidia: '#a3e635',
  '3dfx': '#f472b6',
  qualcomm: '#38bdf8',
};
