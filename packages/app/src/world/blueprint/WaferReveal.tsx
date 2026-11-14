import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '@stm/sim';
import { useStore } from '../../store';

/**
 * Tape-out reveal (art-direction §5.3): the wafer spins, dies light up green (good) or red
 * (defects) one by one, and the yield counts in. The share of green dies is the chip's real yield.
 */
export function WaferReveal({ game }: { game: GameState }) {
  const reveal = useStore((s) => s.reveal);
  const close = useStore((s) => s.closeReveal);
  const chip = game.customChips.find((c) => c.id === reveal);
  const info = reveal ? game.customChipInfo?.[reveal] : undefined;
  const yieldRate = info?.yieldRate ?? 0.8;

  const dies = useMemo(() => waferDies(yieldRate, reveal ?? ''), [yieldRate, reveal]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!reveal) return;
    const t = setInterval(() => setShown((n) => Math.min(dies.length, n + 2)), 40);
    return () => clearInterval(t);
  }, [reveal, dies.length]);

  if (!reveal || !chip) return null;
  const good = dies.slice(0, shown).filter((d) => d.good).length;
  const done = shown >= dies.length;
  const R = 130;

  return (
    <div className="wafer-reveal" role="dialog" aria-label={`${chip.name} first silicon`}>
      <div className="bp-tag">First silicon</div>
      <h2>{chip.name}</h2>
      <svg width={R * 2 + 20} height={R * 2 + 20} className={done ? '' : 'spin'} aria-hidden="true">
        <circle cx={R + 10} cy={R + 10} r={R} fill="#1d4f80" stroke="#eaf3ff" strokeWidth={1.5} />
        <path d={`M${R + 10 - 14},${2 * R + 10} h28`} stroke="#123a63" strokeWidth={6} />
        {dies.map((d, i) => (
          <rect
            key={i}
            x={R + 10 + d.x}
            y={R + 10 + d.y}
            width={d.size - 2}
            height={d.size - 2}
            fill={i < shown ? (d.good ? '#3fbf7f' : '#e0574f') : 'rgb(255 255 255 / 0.08)'}
            stroke="rgb(234 243 255 / 0.35)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
      <div className="wafer-yield">
        Yield {shown ? Math.round((good / shown) * 100) : 0}%
        <span className="bp-sub">
          {' '}
          · {good} good of {shown} dies
        </span>
      </div>
      <button className="bp-btn" onClick={close} disabled={!done}>
        {done ? 'Into production' : 'Testing dies…'}
      </button>
    </div>
  );
}

/** Square dies inside a circular wafer; exactly round(yield × n) of them are good, scattered deterministically. */
function waferDies(yieldRate: number, seed: string) {
  const R = 130;
  const size = 18;
  const dies: { x: number; y: number; size: number; good: boolean }[] = [];
  for (let gy = -R; gy < R; gy += size)
    for (let gx = -R; gx < R; gx += size) {
      const corners = [
        [gx, gy],
        [gx + size, gy],
        [gx, gy + size],
        [gx + size, gy + size],
      ];
      if (corners.every(([x, y]) => x * x + y * y < (R - 4) * (R - 4))) dies.push({ x: gx, y: gy, size, good: true });
    }
  // Defects cluster toward the edge, like real wafers.
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const scored = dies.map((d, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const edge = Math.hypot(d.x + size / 2, d.y + size / 2) / R;
    return { i, score: edge * 0.7 + (h / 2 ** 32) * 0.6 };
  });
  scored.sort((a, b) => b.score - a.score);
  const bad = Math.round(dies.length * (1 - yieldRate));
  for (let k = 0; k < bad; k++) dies[scored[k]!.i]!.good = false;
  // Reveal in a sweep from the top.
  return dies.sort((a, b) => a.y - b.y || a.x - b.x);
}
