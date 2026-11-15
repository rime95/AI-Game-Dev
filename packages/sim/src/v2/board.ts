import { ADJACENCY, block, kind, market, marketBar, node, SIZES, type MarketDef } from './data';
import type { GameV2, ProductKind, ProjectSize, Stat, Stats } from './types';

/** The scale that counts as "par" for each stat (a decent small 1991 chip has about these). */
export const STAT_PAR: Stats = { perf: 29, gfx: 17, eff: 7, feat: 5 };
/** Review points per doubling of value against the market bar. */
const POINTS_PER_DOUBLING = 2.4;

export interface BoardResult {
  stats: Stats;
  heat: number;
  budget: number;
  /** Below 1 when the die runs too hot: speed and graphics are throttled. */
  throttle: number;
  /** Blocks the product kind needs but the board lacks. */
  missing: string[];
  /** Cells whose block does nothing (I/O pads off the edge). */
  dead: number[];
  /** Per cell: the stats it ended up adding (for tooltips). */
  cells: (Partial<Stats> | null)[];
  used: number;
}

const zero = (): Stats => ({ perf: 0, gfx: 0, eff: 0, feat: 0 });

/** Evaluate a die layout: block stats, neighbour bonuses, edge rules and the heat budget. */
export function evaluateBoard(board: (string | null)[], size: ProjectSize, nodeId: string, productKind: ProductKind): BoardResult {
  const { w, h } = SIZES[size];
  const n = node(nodeId);
  const stats = zero();
  const cells: (Partial<Stats> | null)[] = [];
  const dead: number[] = [];
  let heat = 0;
  let used = 0;
  const counted: Record<string, number> = {};
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? null : board[y * w + x] ?? null);
  for (let i = 0; i < w * h; i++) {
    const id = board[i] ?? null;
    if (!id) {
      cells.push(null);
      continue;
    }
    used++;
    const b = block(id);
    const x = i % w;
    const y = Math.floor(i / w);
    const onEdge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    heat += b.heat;
    counted[id] = (counted[id] ?? 0) + 1;
    if ((b.edge === 'required' && !onEdge) || (b.maxUseful !== undefined && counted[id]! > b.maxUseful)) {
      dead.push(i);
      cells.push({});
      continue;
    }
    const mine = zero();
    for (const [k, v] of Object.entries(b.stats) as [Stat, number][]) mine[k] += v;
    if (b.edge === 'bonus' && onEdge) mine.perf += 1;
    for (const rule of ADJACENCY) {
      if (rule.a !== id) continue;
      const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter((c) => c === rule.b).length;
      mine[rule.stat] += Math.min(near, rule.max) * rule.bonus;
    }
    for (const k of Object.keys(mine) as Stat[]) stats[k] += mine[k];
    cells.push(mine);
  }
  const budget = w * h * n.heatPerCell;
  const throttle = heat > budget ? Math.pow(budget / heat, 1.5) : 1;
  // A cool die is an efficient die: unused heat headroom counts as efficiency.
  stats.eff += Math.max(0, budget - heat) * 0.35;
  for (const k of Object.keys(stats) as Stat[]) stats[k] *= n.speed;
  stats.perf *= throttle;
  stats.gfx *= throttle;
  const present = new Set(board.filter(Boolean));
  const missing = kind(productKind).needs.filter((b) => !present.has(b));
  return { stats, heat, budget, throttle, missing, dead, cells, used };
}

/** How much a market values these stats: diminishing returns on each, weighted by taste. */
export function marketValue(m: MarketDef, stats: Stats): number {
  let v = 0;
  for (const k of Object.keys(m.taste) as Stat[]) {
    const w = m.taste[k];
    if (w > 0) v += w * Math.pow(Math.max(0, stats[k]) / STAT_PAR[k], 0.7);
  }
  return v;
}

/** Share of your best die value in a market that the press expects next time. */
export const EXPECT_SHARE = 0.95;

/** What reviewers expect in a market: their memory of your best there (0 before your first launch). */
export const expectOf = (s: GameV2, marketId: string) => s.notebook.expect?.[marketId] ?? 0;

/**
 * The review score the die alone earns in a market on a given day (before team and bugs). Scores
 * are measured against the market bar, or against what the press expects of you there, whichever
 * is higher: a chip that only matches your last one scores about 6.5, a big leap 9 or more.
 */
export function boardScore(r: BoardResult, marketId: string, day: number, expect = 0): number {
  return clampScore(rawBoardScore(r, marketId, day, expect));
}

/** The same score without the 1–10 clamp (for comparing weak layouts while searching). */
export function rawBoardScore(r: BoardResult, marketId: string, day: number, expect = 0): number {
  if (r.missing.length) return -5;
  const m = market(marketId);
  const value = marketValue(m, r.stats);
  if (value <= 0) return -5;
  const barFactor = Math.max(marketBar(m, day) / 6, expect);
  return 6 + POINTS_PER_DOUBLING * Math.log2(value / barFactor);
}

/** Die value against the plain market bar (what the press remembers after a launch). */
export const dieValue = (r: BoardResult, marketId: string) => marketValue(market(marketId), r.stats);

/** Review points a product has lost to time: the market bar rose since it launched. */
export function agingLoss(marketId: string, launchDay: number, day: number): number {
  const m = market(marketId);
  return POINTS_PER_DOUBLING * Math.log2(marketBar(m, day) / marketBar(m, launchDay));
}

export function clampScore(s: number): number {
  return Math.max(1, Math.min(10, s));
}

/** Share of a chip's cost fixed by the die size; the rest scales with the tiles actually used. */
export const AREA_COST = { fixed: 0.3, perUsed: 0.7 };

/**
 * Unit cost, mask cost and fab time for a board size and node. Empty tiles are trimmed off the
 * die, so a layout that leaves tiles free makes a cheaper chip (pass `used`, the filled tiles;
 * without it the die is costed as full).
 */
export function chipCosts(size: ProjectSize, nodeId: string, used?: number): { unitCost: number; maskCost: number; fabDays: number } {
  const s = SIZES[size];
  const n = node(nodeId);
  const cells = s.w * s.h;
  const area = used === undefined ? cells : cells * AREA_COST.fixed + Math.min(cells, used) * AREA_COST.perUsed;
  return { unitCost: Math.round(area * n.unitCostPerCell * 10) / 10, maskCost: Math.round(n.maskCost * s.mask), fabDays: n.fabDays };
}

/** Filled tiles on a board. */
export const usedTiles = (board: (string | null)[]) => board.filter(Boolean).length;
