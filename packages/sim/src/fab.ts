import type { Chip, Content, ProcessNode } from '@stm/content';
import type { Fab, FabBottleneck, FabLine, FabStageId, GameState } from './types';
import { getChip } from './selectors';
import { powerDrawMW } from './formulas';
import { seatedStaff } from './hq';
import { rand } from './rng';
import { TUNING } from './tuning';

/**
 * Our own fab (world-and-facilities §7): a cleanroom of bays, each holding a production line built
 * for one process node. A line chains lithography → deposition/etch → test → packaging; the
 * slowest stage, the HBM supply and demand set what it ships. Yield improves with wafers made.
 */

export const FAB_STAGES: FabStageId[] = ['litho', 'etch', 'test', 'packaging'];

export function fabError(state: GameState, content: Content): string | null {
  const r = content.fab;
  if (state.fab) return 'We already have a fab.';
  if (state.roundsRaised < r.requiresRounds) return `A fab needs ${content.funding[r.requiresRounds - 1]?.name ?? 'more funding'} closed first.`;
  if (state.license.power.level < r.requiresPowerLevel) return `A fab draws huge power: it needs Power level ${r.requiresPowerLevel}.`;
  if (state.license.environmental.level < r.requiresEnvironmentalLevel)
    return `A fab uses a lot of water: it needs Environmental level ${r.requiresEnvironmentalLevel}.`;
  if (seatedStaff(state, 'hardwareEng') < r.requiresHardwareEng)
    return `Running a fab needs ${r.requiresHardwareEng} hardware engineers seated in hardware labs.`;
  return null;
}

export function lineCost(content: Content, nodeId: string): number {
  return content.fab.line.costByNode[nodeId] ?? Infinity;
}

export function stageUpgradeCost(content: Content, line: FabLine): number {
  return lineCost(content, line.nodeId) * content.fab.line.stageUpgradeShare;
}

export function diesPerWafer(content: Content, node: ProcessNode): number {
  return Math.floor((content.fab.waferAreaMm2 / node.dieAreaMm2) * content.fab.edgeLoss);
}

/** Yield climbs from the start yield toward the node's mature yield as the line makes wafers. */
export function lineYield(content: Content, line: FabLine, node: ProcessNode): number {
  const r = content.fab;
  const mature = Math.min(0.95, node.baseYield + 0.12);
  const y = mature - (mature - r.startYield) * Math.exp(-line.wafers / r.yieldLearningWafers);
  return y * (line.modWeeks > 0 ? line.yieldMult : 1);
}

export function hbmStacks(chip: Chip, node: ProcessNode): number {
  return Math.max(1, Math.round(chip.memGB / node.hbmGBPerStack));
}

/** Cost to make one good chip on this line: die area at our own wafer cost ÷ yield, plus HBM. */
export function fabUnitCost(content: Content, node: ProcessNode, chip: Chip, yieldRate: number): number {
  return (node.dieAreaMm2 * node.costPerMm2 * content.fab.dieCostShare) / Math.max(0.05, yieldRate) + hbmStacks(chip, node) * node.hbmStackCost;
}

export function hbmPerWeek(state: GameState, content: Content): number {
  const h = content.fab.hbm;
  const mult = state.fab && state.fab.hbmWeeks > 0 ? state.fab.hbmMult : 1;
  return Math.floor(h.stacksPerWeek * Math.pow(1 + h.growthPerWeek, state.week) * mult);
}

export function marketPerWeek(state: GameState, content: Content): number {
  const m = content.fab.market;
  return Math.floor(m.chipsPerWeek * Math.pow(1 + m.growthPerWeek, state.week));
}

/** Power the fab draws once it's online. */
export function fabPowerMW(state: GameState, content: Content): number {
  if (!state.fab || state.fab.status !== 'online') return 0;
  return content.fab.basePowerMW + state.fab.lines.length * content.fab.line.powerMW;
}

export interface LineCapacity {
  wafers: number;
  /** Good chips the wafer stages can make. */
  fromWafers: number;
  packaging: number;
  /** The slowest of the four tool groups. */
  slowest: FabStageId;
  yieldRate: number;
}

export function lineCapacity(content: Content, line: FabLine, node: ProcessNode): LineCapacity {
  const s = content.fab.stages;
  const speed = line.modWeeks > 0 ? line.speedMult : 1;
  const waferStages: [FabStageId, number][] = [
    ['litho', line.stages.litho * (s.litho.wafersPerLevel ?? 0) * speed],
    ['etch', line.stages.etch * (s.etch.wafersPerLevel ?? 0)],
    ['test', line.stages.test * (s.test.wafersPerLevel ?? 0)],
  ];
  const [slowWafer, wafers] = waferStages.reduce((a, b) => (b[1] < a[1] ? b : a));
  const yieldRate = lineYield(content, line, node);
  const fromWafers = Math.floor(wafers * diesPerWafer(content, node) * yieldRate);
  const packaging = line.stages.packaging * (s.packaging.chipsPerLevel ?? 0);
  return { wafers, fromWafers, packaging, slowest: packaging < fromWafers ? 'packaging' : slowWafer, yieldRate };
}

export interface FabWeek {
  costs: number;
  sales: number;
  logs: { kind: 'good' | 'bad' | 'info'; text: string }[];
  incident: { lineId: string; kind: 'cleanroom' | 'litho' | 'hbm' } | null;
}

/** One week of fab: construction, retooling, production, sales, and maybe an incident. */
export function tickFab(state: GameState, content: Content, ownedMW: number): FabWeek {
  const out: FabWeek = { costs: 0, sales: 0, logs: [], incident: null };
  const fab = state.fab;
  if (!fab) return out;
  const r = content.fab;
  if (fab.status === 'building') {
    fab.weeksLeft -= 1;
    if (fab.weeksLeft <= 0) {
      fab.status = 'online';
      out.logs.push({ kind: 'good', text: 'Our fab is online. Build a production line in a bay and point it at one of our chip designs.' });
    }
    return out;
  }

  out.costs += r.upkeepPerWeek + fab.lines.length * r.line.upkeepPerWeek;
  out.costs += fabPowerMW(state, content) * 168 * TUNING.powerPricePerMWh;

  let hbmLeft = hbmPerWeek(state, content);
  let marketLeft = marketPerWeek(state, content);
  let powerLeft = state.powerCapMW - ownedMW - fabPowerMW(state, content);

  for (const line of fab.lines) {
    if (line.status !== 'running') {
      line.weeksLeft -= 1;
      if (line.weeksLeft <= 0) {
        const wasRetool = line.status === 'retooling';
        line.status = 'running';
        out.logs.push({ kind: 'good', text: `Fab line ${line.bay + 1} is ${wasRetool ? 'retooled' : 'built'} and ready (${nodeName(content, line.nodeId)}).` });
      }
      line.lastWeek = null;
      continue;
    }
    if (line.modWeeks > 0) line.modWeeks -= 1;
    if (line.pausedWeeks > 0) {
      line.pausedWeeks -= 1;
      line.lastWeek = { chips: 0, sold: 0, toFleet: 0, bottleneck: 'paused', yieldRate: 0, unitCost: 0 };
      continue;
    }
    const chip = line.chipId ? getChip(content, line.chipId, state) : undefined;
    const node = content.nodes.find((n) => n.id === line.nodeId);
    if (!chip || !node) {
      line.lastWeek = { chips: 0, sold: 0, toFleet: 0, bottleneck: 'design', yieldRate: 0, unitCost: 0 };
      continue;
    }
    const cap = lineCapacity(content, line, node);
    const stacks = hbmStacks(chip, node);
    const byHbm = Math.floor(hbmLeft / stacks);
    const perChipMW = powerDrawMW(chip, 1);
    const fleetRoom = line.mode === 'fleet' ? Math.max(0, Math.floor(powerLeft / perChipMW)) : 0;
    const demand = fleetRoom + marketLeft;
    const chips = Math.max(0, Math.min(cap.fromWafers, cap.packaging, byHbm, demand));
    let bottleneck: FabBottleneck = cap.slowest;
    if (chips === byHbm && byHbm < Math.min(cap.fromWafers, cap.packaging)) bottleneck = 'hbm';
    else if (chips === demand && demand < Math.min(cap.fromWafers, cap.packaging, byHbm)) bottleneck = 'demand';

    // Wafers actually started scale with what we ship.
    const wafers = cap.fromWafers > 0 ? cap.wafers * (chips / cap.fromWafers) : 0;
    line.wafers += wafers;
    hbmLeft -= chips * stacks;
    const unitCost = fabUnitCost(content, node, chip, cap.yieldRate);
    out.costs += chips * unitCost;

    const toFleet = Math.min(chips, fleetRoom);
    const sold = chips - toFleet;
    if (toFleet > 0) {
      addOwned(state, chip.id, toFleet);
      fab.madeForFleet += toFleet;
      powerLeft -= toFleet * perChipMW;
    }
    marketLeft -= sold;
    out.sales += sold * unitCost * r.market.priceMarkup;
    line.lastWeek = { chips, sold, toFleet, bottleneck, yieldRate: cap.yieldRate, unitCost };

    if (!out.incident && rand(state) < r.incidentChancePerLine) {
      const kinds = ['cleanroom', 'litho', 'hbm'] as const;
      out.incident = { lineId: line.id, kind: kinds[Math.floor(rand(state) * kinds.length)]! };
    }
  }
  if (fab.hbmWeeks > 0) fab.hbmWeeks -= 1;
  return out;
}

function addOwned(state: GameState, chipId: string, count: number): void {
  const existing = state.fleet.find((f) => f.chipId === chipId && f.owned);
  if (existing) existing.count += count;
  else state.fleet.push({ id: `f${state.nextId++}`, chipId, count, owned: true });
}

function nodeName(content: Content, id: string): string {
  return content.nodes.find((n) => n.id === id)?.name ?? id;
}

/** Share of owned chips that our fab made (Full Stack victory). */
export function fabChipShare(state: GameState): number {
  const owned = state.fleet.filter((f) => f.owned);
  const total = owned.reduce((n, f) => n + f.count, 0);
  if (!total || !state.fab) return 0;
  const custom = owned.filter((f) => state.customChips.some((c) => c.id === f.chipId)).reduce((n, f) => n + f.count, 0);
  return Math.min(state.fab.madeForFleet, custom) / total;
}

export function newLine(id: string, bay: number, nodeId: string, weeks: number): FabLine {
  return {
    id,
    bay,
    nodeId,
    chipId: null,
    status: 'building',
    weeksLeft: weeks,
    wafers: 0,
    stages: { litho: 1, etch: 1, test: 1, packaging: 1 },
    mode: 'fleet',
    pausedWeeks: 0,
    yieldMult: 1,
    speedMult: 1,
    modWeeks: 0,
    lastWeek: null,
  };
}

export function newFab(content: Content): Fab {
  return { status: 'building', weeksLeft: content.fab.buildWeeks, totalWeeks: content.fab.buildWeeks, lines: [], hbmMult: 1, hbmWeeks: 0, madeForFleet: 0 };
}
