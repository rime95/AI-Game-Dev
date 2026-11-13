import type { Arch, Chip, Content } from '@stm/content';
import type { GameState, ReleasedModel, TrainingSpec } from './types';
import { TUNING } from './tuning';
import {
  archFit,
  capabilityIndex,
  clusterFlopsPerSecond,
  effectiveCompute,
  powerDrawMW,
  servingTokensPerSecond,
  suiteScore,
  trainingFlops,
  utilization,
  type ArchFit,
} from './formulas';

import { powerSpeedFactor, requirementsFor, tierForCapability, type Requirement } from './license';

const START_DATE_UTC = Date.UTC(2026, 0, 5); // Monday, Jan 5 2026

export function dateForWeek(week: number): Date {
  return new Date(START_DATE_UTC + week * 7 * 86_400_000);
}

/** Vendor chips plus the player's own taped-out designs. */
export function allChips(state: GameState | undefined, content: Content): Chip[] {
  return state ? [...content.chips, ...state.customChips] : content.chips;
}

export function getChip(content: Content, id: string, state?: GameState): Chip | undefined {
  return allChips(state, content).find((c) => c.id === id);
}

export function getArch(content: Content, id: string): Arch | undefined {
  return content.archs.find((a) => a.id === id);
}

export function totalChips(state: GameState, chipId: string): number {
  return state.fleet.filter((f) => f.chipId === chipId).reduce((n, f) => n + f.count, 0);
}

export function rentedChips(state: GameState, chipId: string): number {
  return state.fleet.filter((f) => f.chipId === chipId && !f.owned).reduce((n, f) => n + f.count, 0);
}

/** How many of this chip the cloud market will rent to you this week (total, including what you already rent). */
export function cloudSupply(chip: Chip, week: number): number {
  if (week < chip.cloudFromWeek) return 0;
  return Math.floor(chip.cloudSupply * Math.pow(1 + chip.cloudGrowth, week - chip.cloudFromWeek));
}

/** Units of this chip you can still buy this week (vendor or foundry allocation). */
export function buyAllowance(state: GameState, chip: Chip): number {
  const cap = Math.floor(chip.buyPerWeek * Math.pow(1 + chip.buyGrowth, state.week));
  return Math.max(0, cap - (state.purchasedThisWeek[chip.id] ?? 0));
}

export function maxClusterChips(state: GameState): number {
  return state.staff.modelEng * TUNING.chipsPerModelEngineer;
}

export function reservedChips(state: GameState, chipId: string): number {
  return state.training && state.training.spec.chipId === chipId ? state.training.spec.chipCount : 0;
}

export function freeChips(state: GameState, chipId: string): number {
  return Math.max(0, totalChips(state, chipId) - reservedChips(state, chipId));
}

export function ownedPowerMW(state: GameState, content: Content): number {
  return state.fleet
    .filter((f) => f.owned)
    .reduce((mw, f) => {
      const chip = getChip(content, f.chipId, state);
      return chip ? mw + powerDrawMW(chip, f.count) : mw;
    }, 0);
}

export function liveModel(state: GameState): ReleasedModel | undefined {
  return state.models.find((m) => m.id === state.liveModelId);
}

export function bestScore(state: GameState): number {
  return state.models.reduce((best, m) => Math.max(best, m.score), 0);
}

export function bestCapability(state: GameState): number {
  return state.models.reduce((best, m) => Math.max(best, m.capability), 0);
}

/** Score of a capability on the current eval suite. */
export function scoreNow(state: GameState, capability: number): number {
  return suiteScore(capability, state.suite.mid);
}

export function marketSize(week: number): number {
  return Math.min(TUNING.marketCapUsers, TUNING.marketStartUsers * Math.pow(1 + TUNING.marketGrowthPerWeek, week));
}

/** Tokens/week the free (non-training) fleet can serve for the live model. */
export function servingCapacityTokens(state: GameState, content: Content): number {
  const model = liveModel(state);
  if (!model) return 0;
  const arch = getArch(content, model.archId);
  if (!arch) return 0;
  let tokensPerSec = 0;
  for (const chip of allChips(state, content)) {
    const free = freeChips(state, chip.id);
    if (free > 0) tokensPerSec += free * servingTokensPerSecond(chip, arch, model.paramsB, model.precision);
  }
  return tokensPerSec * TUNING.secondsPerWeek;
}

export interface TrainingPreview {
  errors: string[];
  flops: number;
  effectiveCompute: number;
  projectedCapability: number;
  projectedScore: number;
  fit: ArchFit | null;
  utilization: number;
  flopsPerWeek: number;
  weeks: number;
  chipsFree: number;
  /** Weekly cost of the chips used (rent or power), for the run's duration. */
  weeklyChipCost: number;
  /** License to Scale: the run's capability tier and the checklist for it. */
  tier: number;
  requirements: Requirement[];
  /** Training speed multiplier from missing power (1 = no curtailment). */
  speedFactor: number;
}

/** Pure preview of a training run: everything the player sees before committing. */
export function previewTraining(state: GameState, content: Content, spec: TrainingSpec): TrainingPreview {
  const errors: string[] = [];
  const arch = getArch(content, spec.archId);
  const chip = getChip(content, spec.chipId, state);
  const chipsFree = chip ? freeChips(state, chip.id) : 0;

  if (!spec.name.trim()) errors.push('Give the model a name.');
  if (!arch) errors.push('Unknown architecture.');
  if (!chip) errors.push('Unknown chip.');
  if (spec.paramsB <= 0) errors.push('Parameters must be above zero.');
  if (spec.tokensB <= 0) errors.push('Tokens must be above zero.');
  if (spec.tokensB > state.dataTokensB) errors.push(`Not enough data: you have ${state.dataTokensB}B tokens.`);
  if (spec.chipCount <= 0) errors.push('Assign at least one chip.');
  if (chip && spec.chipCount > chipsFree) errors.push(`Only ${chipsFree} ${chip.name} chips are free.`);
  if (state.training) errors.push('A training run is already in progress.');
  if (state.staff.modelEng < 1) errors.push('Hire a model engineer first.');
  else if (spec.chipCount > maxClusterChips(state))
    errors.push(
      `${state.staff.modelEng} model engineer${state.staff.modelEng > 1 ? 's' : ''} can run at most ${maxClusterChips(state)} chips. Hire more in Team.`,
    );

  if (!arch || !chip || spec.paramsB <= 0 || spec.tokensB <= 0 || spec.chipCount <= 0) {
    return {
      errors,
      flops: 0,
      effectiveCompute: 0,
      projectedCapability: 0,
      projectedScore: 0,
      fit: null,
      utilization: 0,
      flopsPerWeek: 0,
      weeks: 0,
      chipsFree,
      weeklyChipCost: 0,
      tier: 1,
      requirements: requirementsFor(state, content, 1),
      speedFactor: 1,
    };
  }

  const flops = trainingFlops(arch, spec.paramsB, spec.tokensB);
  const eff = effectiveCompute(arch, spec.paramsB, spec.tokensB, spec.precision, state.staff.research);
  const projectedCapability = capabilityIndex(eff);
  const projectedScore = suiteScore(projectedCapability, state.suite.mid);
  const tier = tierForCapability(content, projectedCapability);
  const requirements = requirementsFor(state, content, tier);
  const speedFactor = powerSpeedFactor(content, requirements.find((r) => r.track === 'power')!.gap);
  const flopsPerWeek =
    clusterFlopsPerSecond(chip, arch, spec.precision, spec.chipCount) * TUNING.secondsPerWeek * speedFactor;
  const weeks = Math.max(1, Math.ceil(flops / flopsPerWeek));
  const ownedShare = Math.min(1, totalChips(state, chip.id) > 0 ? ownedCount(state, chip.id) / totalChips(state, chip.id) : 0);
  const weeklyChipCost =
    spec.chipCount * (ownedShare * (chip.watts / 1e6) * TUNING.pue * 168 * TUNING.powerPricePerMWh + (1 - ownedShare) * chip.rentPerWeekUsd);

  return {
    errors,
    flops,
    effectiveCompute: eff,
    projectedCapability,
    projectedScore,
    fit: archFit(chip, arch),
    utilization: utilization(chip, arch, spec.chipCount),
    flopsPerWeek,
    weeks,
    chipsFree,
    weeklyChipCost,
    tier,
    requirements,
    speedFactor,
  };
}

function ownedCount(state: GameState, chipId: string): number {
  return state.fleet.filter((f) => f.chipId === chipId && f.owned).reduce((n, f) => n + f.count, 0);
}
