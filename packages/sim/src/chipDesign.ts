import type { Chip, Content, ProcessNode } from '@stm/content';
import type { ChipDesign, DieSplit, GameState } from './types';
import { effectiveStaff, seatedStaff } from './hq';

/** mm² of die area each HBM stack's interface (PHY + controller) needs. */
export const MM2_PER_HBM_STACK = 25;
export const MAX_HBM_STACKS = 8;
/** Share of compute area spent on extra low-precision units. */
export const FP8_AREA_COST = 0.1;
export const FP4_AREA_COST = 0.1;
/** On-die SRAM multiplies effective memory bandwidth (cache hits skip HBM). */
export const SRAM_BANDWIDTH_GAIN = 2;
/** Each hardware engineer cuts tape-out bug risk by this factor. */
export const BUG_REDUCTION_PER_ENGINEER = 0.85;
/** Foundry wafer allocation for your own chips: far more than vendors will sell you. */
export const FOUNDRY_UNITS_PER_WEEK = 2000;
export const FOUNDRY_GROWTH = 0.03;
export const RESPIN_COST_SHARE = 0.4;
export const RESPIN_TIME_SHARE = 0.5;

export function normalizeSplit(s: DieSplit): DieSplit {
  const total = s.compute + s.sram + s.memory + s.interconnect;
  if (total <= 0) return { compute: 0.25, sram: 0.25, memory: 0.25, interconnect: 0.25 };
  return { compute: s.compute / total, sram: s.sram / total, memory: s.memory / total, interconnect: s.interconnect / total };
}

/** Turn a design into a chip profile. `yieldRate` sets unit cost (expected yield before tape-out). */
export function deriveChip(node: ProcessNode, design: ChipDesign, id: string, yieldRate = node.baseYield): Chip {
  const s = normalizeSplit(design.split);
  const area = node.dieAreaMm2;
  const precisionShare = (design.fp8 ? FP8_AREA_COST : 0) + (design.fp8 && design.fp4 ? FP4_AREA_COST : 0);
  const computeArea = area * s.compute * (1 - precisionShare);
  const fp16 = Math.max(1, Math.round(computeArea * node.tflopsPerMm2));
  const stacks = Math.max(1, Math.min(MAX_HBM_STACKS, Math.floor((area * s.memory) / MM2_PER_HBM_STACK)));
  const memBw = stacks * node.hbmTBsPerStack * (1 + s.sram * SRAM_BANDWIDTH_GAIN);
  const link = Math.max(1, Math.round(area * s.interconnect * node.linkGBsPerMm2));
  const watts = Math.round(fp16 * node.wattsPerTflop + stacks * 15);
  const unitCost = Math.round((area * node.costPerMm2) / yieldRate + stacks * node.hbmStackCost);

  return {
    id,
    name: design.name.trim() || 'Untitled chip',
    vendor: 'Your lab',
    blurb: `${node.name} custom design: ${Math.round(s.compute * 100)}% compute, ${Math.round(s.sram * 100)}% SRAM, ${stacks} HBM stacks.`,
    tflops: { fp16, fp8: design.fp8 ? fp16 * 2 : 0, fp4: design.fp8 && design.fp4 ? fp16 * 4 : 0 },
    memGB: stacks * node.hbmGBPerStack,
    memBwTBs: Math.round(memBw * 100) / 100,
    interconnectGBs: link,
    watts,
    priceUsd: unitCost,
    rentPerWeekUsd: 1,
    cloudSupply: 0,
    cloudGrowth: 0,
    cloudFromWeek: 0,
    buyPerWeek: FOUNDRY_UNITS_PER_WEEK,
    buyGrowth: FOUNDRY_GROWTH,
  };
}

export function bugChance(node: ProcessNode, hardwareEngineers: number): number {
  return node.bugChance * Math.pow(BUG_REDUCTION_PER_ENGINEER, hardwareEngineers);
}

export interface ChipPreview {
  errors: string[];
  chip: Chip | null;
  node: ProcessNode | null;
  hbmStacks: number;
  tapeoutCost: number;
  tapeoutWeeks: number;
  bugChance: number;
}

export function previewChip(state: GameState, content: Content, design: ChipDesign): ChipPreview {
  const errors: string[] = [];
  const node = content.nodes.find((n) => n.id === design.nodeId) ?? null;
  if (!node) return { errors: ['Unknown process node.'], chip: null, node, hbmStacks: 0, tapeoutCost: 0, tapeoutWeeks: 0, bugChance: 0 };

  if (!design.name.trim()) errors.push('Name the chip.');
  if (state.week < node.availableFromWeek) errors.push(`That chip generation opens at the factory in week ${node.availableFromWeek}.`);
  if (seatedStaff(state, 'hardwareEng') < node.minHardwareEng)
    errors.push(
      `${node.name} needs at least ${node.minHardwareEng} hardware engineer${node.minHardwareEng > 1 ? 's' : ''} seated in a hardware lab. Hire in Team, build labs in HQ.`,
    );
  if (state.chipProject) errors.push('A chip is already at the factory.');
  if (node.tapeoutCost > state.cash) errors.push('Not enough cash to send it to the factory.');
  const s = normalizeSplit(design.split);
  if (s.compute < 0.1) errors.push('Give compute at least 10% of the die.');
  if (s.memory * node.dieAreaMm2 < MM2_PER_HBM_STACK) errors.push('Memory needs room for at least one memory stack.');

  const chip = deriveChip(node, design, 'preview');
  return {
    errors,
    chip,
    node,
    hbmStacks: Math.round(chip.memGB / node.hbmGBPerStack),
    tapeoutCost: node.tapeoutCost,
    tapeoutWeeks: node.tapeoutWeeks,
    bugChance: bugChance(node, effectiveStaff(state, 'hardwareEng')),
  };
}
