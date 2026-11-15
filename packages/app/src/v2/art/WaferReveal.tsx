import { useEffect, useMemo, useState } from 'react';
import { v2 } from '@stm/sim';
import { useStore } from '../../store';

/**
 * First silicon: when a chip comes back from the fab, the wafer spins and its dies light up green
 * (good) or red (defects) one by one, and the yield counts in. The share of green dies is the
 * chip's real yield, which sets its cost per chip.
 */
export function WaferReveal({ g }: { g: v2.GameV2 }) {
  const id = useStore((s) => s.reveal2);
  const close = useStore((s) => s.closeReveal2);
  const pr = g.projects.find((p) => p.id === id);
  const yieldRate = pr?.yield ?? 0.9;
  const dies = useMemo(() => waferDies(yieldRate, id ?? ''), [yieldRate, id]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!id) return;
    const t = setInterval(() => setShown((n) => Math.min(dies.length, n + 3)), 40);
    return () => clearInterval(t);
  }, [id, dies.length]);
  if (!id || !pr) return null;
  const good = dies.slice(0, shown).filter((d) => d.good).length;
  const done = shown >= dies.length;
  const R = 130;
  const cost = v2.chipCosts(pr.size, pr.nodeId, v2.usedTiles(pr.board), v2.specOf(pr)).unitCost;
  return (
    <div className="overlay center" role="dialog" aria-label={`${pr.name} first silicon`}>
      <div className="wafer-card">
        <div className="k-over">First silicon · {v2.node(pr.nodeId).name}</div>
        <h2>{pr.name}</h2>
        <svg width={R * 2 + 20} height={R * 2 + 20} className={done ? '' : 'spin'} aria-hidden="true">
          <defs>
            <radialGradient id="wafer" cx="0.4" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#3c5f8f" />
              <stop offset="0.6" stopColor="#1f3a63" />
              <stop offset="1" stopColor="#14284a" />
            </radialGradient>
          </defs>
          <circle cx={R + 10} cy={R + 10} r={R} fill="url(#wafer)" stroke="#cfe0ff" strokeOpacity="0.6" strokeWidth={1.5} />
          <path d={`M${R + 10 - 14},${2 * R + 10} h28`} stroke="#0d1f3a" strokeWidth={6} />
          {dies.map((d, i) => (
            <rect
              key={i}
              x={R + 10 + d.x}
              y={R + 10 + d.y}
              width={d.size - 1.5}
              height={d.size - 1.5}
              rx={1}
              fill={i < shown ? (d.good ? '#3fd0a0' : '#ff6b7a') : 'rgb(255 255 255 / 0.07)'}
              opacity={i < shown ? 0.9 : 1}
            />
          ))}
        </svg>
        <div className="wafer-yield">
          <b>{shown ? Math.round((good / shown) * 100) : 0}%</b> good dies
          <span>
            {' '}
            · {good} of {shown} work
          </span>
        </div>
        <p className="small muted">
          {done
            ? `Yield ${Math.round(yieldRate * 100)}%: about ${v2.moneyV2(cost * (v2.YIELD.mature / yieldRate))} per good chip. ${yieldRate < 0.85 ? 'A young process: yields climb as the node matures.' : 'A mature process: most dies work.'}`
            : 'Testing the first wafer…'}
        </p>
        <button className="btn primary" onClick={close} disabled={!done}>
          {done ? 'Start making them' : 'Testing chips…'}
        </button>
      </div>
    </div>
  );
}

/** Square dies inside a circular wafer; exactly round(yield × n) of them are good, scattered deterministically. */
function waferDies(yieldRate: number, seed: string): { x: number; y: number; size: number; good: boolean }[] {
  const R = 124;
  const size = 15;
  const cells: { x: number; y: number }[] = [];
  for (let y = -R; y < R; y += size)
    for (let x = -R; x < R; x += size) {
      const corners = [
        [x, y],
        [x + size, y],
        [x, y + size],
        [x + size, y + size],
      ];
      if (corners.every(([cx, cy]) => cx! * cx! + cy! * cy! < R * R)) cells.push({ x, y });
    }
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  const bad = new Set<number>();
  const target = Math.round(cells.length * (1 - yieldRate));
  // Defects cluster toward the wafer edge, like real ones.
  while (bad.size < target) {
    const i = Math.floor(r() * cells.length);
    const c = cells[i]!;
    if (r() < 0.35 + (Math.hypot(c.x, c.y) / R) * 0.65) bad.add(i);
  }
  return cells.map((c, i) => ({ ...c, size, good: !bad.has(i) }));
}
