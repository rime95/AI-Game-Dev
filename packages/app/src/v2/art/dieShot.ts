import { v2 } from '@stm/sim';

/**
 * A die shot drawn from a real layout: every block type has its own silicon texture (logic grids
 * for cores, fine SRAM stripes for cache, PHY bars for memory, a pad ring for I/O…), with a seal
 * ring, the chip's name etched in a corner, and an iridescent sheen. Deterministic per chip, and
 * used both as the 3D die's texture and as 2D art.
 */

/** Base tint per block (the metal layers catch these colours under the microscope). */
const TINT: Record<string, string> = {
  core: '#3fd0b4',
  cache: '#e8b84a',
  mem: '#6f8dff',
  io: '#a983ff',
  pixel: '#ff8a6b',
  texture: '#ff6fa3',
  fpu: '#52c7ff',
  vector: '#5fe0ff',
  tensor: '#7cf29a',
  gate: '#9fb4d8',
  media: '#c497ff',
  hbm: '#8fa6ff',
  npu: '#f6d36b',
  gpus: '#7cf29a',
  data: '#e8b84a',
  safety: '#9fe6ff',
  rlhf: '#ff9fd0',
};

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** Draw a die shot of `board` (w×h tiles) into a square canvas context of side `px`. */
export function drawDieShot(
  ctx: CanvasRenderingContext2D,
  px: number,
  board: (string | null)[],
  size: v2.ProjectSize,
  opts: { name?: string; seed?: string; nodeIndex?: number } = {},
): void {
  const { w, h } = v2.SIZES[size];
  const r = rng(opts.seed ?? board.join(','));
  const pad = px * 0.06;
  const cell = (px - pad * 2) / Math.max(w, h);
  const ox = (px - cell * w) / 2;
  const oy = (px - cell * h) / 2;

  // Silicon base: deep, slightly warm grey-blue, darker as nodes shrink.
  const g = ctx.createLinearGradient(0, 0, px, px);
  g.addColorStop(0, '#1b2440');
  g.addColorStop(1, '#0d1428');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);

  // Seal ring.
  ctx.strokeStyle = 'rgba(232, 200, 120, 0.85)';
  ctx.lineWidth = Math.max(2, px * 0.012);
  ctx.strokeRect(pad * 0.45, pad * 0.45, px - pad * 0.9, px - pad * 0.9);
  ctx.strokeStyle = 'rgba(232, 200, 120, 0.35)';
  ctx.lineWidth = Math.max(1, px * 0.004);
  ctx.strokeRect(pad * 0.7, pad * 0.7, px - pad * 1.4, px - pad * 1.4);

  for (let i = 0; i < w * h; i++) {
    const id = board[i];
    const x = ox + (i % w) * cell;
    const y = oy + Math.floor(i / w) * cell;
    const inset = cell * 0.04;
    if (!id) {
      // Trimmed area: bare, faintly patterned fill.
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
      continue;
    }
    drawBlock(ctx, id, x + inset, y + inset, cell - inset * 2, r);
  }

  // Global routing: a few long metal lines across the die.
  ctx.strokeStyle = 'rgba(220, 230, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    const yy = oy + r() * cell * h;
    ctx.beginPath();
    ctx.moveTo(ox, yy);
    ctx.lineTo(ox + cell * w, yy);
    ctx.stroke();
  }

  // Iridescent sheen.
  const sheen = ctx.createLinearGradient(0, px, px, 0);
  sheen.addColorStop(0, 'rgba(120, 255, 220, 0.10)');
  sheen.addColorStop(0.5, 'rgba(255, 120, 220, 0.05)');
  sheen.addColorStop(1, 'rgba(120, 160, 255, 0.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, px, px);

  if (opts.name) {
    ctx.fillStyle = 'rgba(232, 200, 120, 0.8)';
    ctx.font = `600 ${Math.round(px * 0.028)}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.name.toUpperCase(), pad * 0.9, px - pad * 0.75);
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, s: number, r: () => number): void {
  const c = TINT[id] ?? '#9fb4d8';
  ctx.fillStyle = shade(c, 0.22);
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = shade(c, 0.75);
  ctx.fillStyle = shade(c, 0.6);
  ctx.lineWidth = 1;
  const step = (n: number) => s / n;
  switch (id) {
    case 'cache':
    case 'data': {
      // SRAM: fine stripes in banks.
      for (let b = 0; b < 2; b++)
        for (let k = 0; k < 22; k++) {
          const yy = y + s * 0.06 + k * step(24);
          ctx.fillRect(x + s * 0.06 + b * s * 0.47, yy, s * 0.41, step(24) * 0.45);
        }
      break;
    }
    case 'mem':
    case 'hbm': {
      // PHY: tall bars.
      for (let k = 0; k < 10; k++) ctx.fillRect(x + s * 0.08 + k * step(11), y + s * 0.1, step(11) * 0.5, s * 0.8);
      break;
    }
    case 'io': {
      // Pad ring.
      const n = 6;
      for (let k = 0; k < n; k++)
        for (let j = 0; j < n; j++) {
          if (k > 0 && k < n - 1 && j > 0 && j < n - 1) continue;
          ctx.fillRect(x + s * 0.08 + k * step(n + 0.6), y + s * 0.08 + j * step(n + 0.6), step(n) * 0.55, step(n) * 0.55);
        }
      break;
    }
    case 'pixel':
    case 'texture':
    case 'gpus': {
      // Shader array: a grid of small cores.
      const n = id === 'gpus' ? 7 : 6;
      for (let k = 0; k < n; k++)
        for (let j = 0; j < n; j++) ctx.fillRect(x + s * 0.06 + k * step(n + 0.4), y + s * 0.06 + j * step(n + 0.4), step(n) * 0.7, step(n) * 0.7);
      break;
    }
    case 'tensor':
    case 'vector':
    case 'fpu':
    case 'npu': {
      // Systolic mesh.
      const n = 8;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        ctx.moveTo(x + s * 0.06 + k * step(n + 1), y + s * 0.06);
        ctx.lineTo(x + s * 0.06 + k * step(n + 1), y + s * 0.94);
        ctx.moveTo(x + s * 0.06, y + s * 0.06 + k * step(n + 1));
        ctx.lineTo(x + s * 0.94, y + s * 0.06 + k * step(n + 1));
      }
      ctx.stroke();
      break;
    }
    case 'gate':
    case 'safety': {
      // Hatching.
      ctx.beginPath();
      for (let k = -10; k < 20; k++) {
        ctx.moveTo(x + k * step(10), y);
        ctx.lineTo(x + k * step(10) + s, y + s);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, s, s);
      ctx.clip();
      ctx.beginPath();
      for (let k = -10; k < 20; k++) {
        ctx.moveTo(x + k * step(10), y);
        ctx.lineTo(x + k * step(10) + s, y + s);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
    default: {
      // Logic: random standard-cell rows.
      for (let k = 0; k < 14; k++) {
        let xx = x + s * 0.05;
        const yy = y + s * 0.05 + k * step(15);
        while (xx < x + s * 0.93) {
          const len = s * (0.03 + r() * 0.12);
          if (r() > 0.25) ctx.fillRect(xx, yy, Math.min(len, x + s * 0.95 - xx), step(15) * 0.6);
          xx += len + s * 0.015;
        }
      }
    }
  }
  ctx.strokeStyle = shade(c, 0.45);
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

/** Mix a hex colour toward black (k=0) or keep it (k=1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

/** A die shot as a data URL (cached), for <img> tags and box art. */
const cache = new Map<string, string>();
export function dieShotUrl(board: (string | null)[], size: v2.ProjectSize, name = '', px = 256): string {
  const key = `${size}|${name}|${px}|${board.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawDieShot(ctx, px, board, size, { name, seed: key });
  const url = canvas.toDataURL('image/png');
  if (cache.size > 200) cache.clear();
  cache.set(key, url);
  return url;
}
