import type { Chip, Content, Precision } from '@stm/content';
import type { GameState, TrainingRun } from './types';
import { TUNING } from './tuning';
import { clusterFlopsPerSecond } from './formulas';
import { getArch, getChip } from './selectors';
import { effectiveStaff } from './hq';
import { chipEfficiency } from './servers';
import { siteFailureFactor } from './sites';

export interface IncidentRates {
  hardware: number;
  lossSpike: number;
  contamination: number;
}

/** Weekly chance of each kind of training incident for a run. */
export function incidentRates(
  state: GameState,
  chip: Chip | undefined,
  chipCount: number,
  paramsB: number,
  precision: Precision,
  /** Hardware failure multiplier from where the chips are hosted (sites with or without an ops center). */
  siteFactor = 1,
): IncidentRates {
  const doublings = Math.max(0, Math.log2(Math.max(1, chipCount) / 1024));
  const custom = !!chip && state.customChips.some((c) => c.id === chip.id);
  const hardware =
    TUNING.hardwareFailureBase *
    (1 + TUNING.hardwareFailurePerDoubling * doublings) *
    (custom ? TUNING.customChipFailureMult : 1) *
    Math.pow(TUNING.hardwareFailureOpsFactor, effectiveStaff(state, 'ops')) *
    siteFactor;
  const precisionRisk = precision === 'fp4' ? 2.5 : precision === 'fp8' ? 1.5 : 1;
  const sizeRisk = 1 + Math.max(0, Math.log10(paramsB / 100));
  return {
    hardware: Math.min(0.5, hardware),
    lossSpike: Math.min(0.5, TUNING.lossSpikeBase * precisionRisk * sizeRisk),
    contamination: TUNING.contaminationBase,
  };
}

export function runIncidentRates(state: GameState, content: Content, run: TrainingRun): IncidentRates {
  return incidentRates(
    state,
    getChip(content, run.spec.chipId, state),
    run.spec.chipCount,
    run.spec.paramsB,
    run.spec.precision,
    siteFailureFactor(state, content, run.spec.chipId),
  );
}

/** FLOPs the run completes in one week at its current speed. */
export function runFlopsPerWeek(state: GameState, content: Content, run: TrainingRun): number {
  const arch = getArch(content, run.spec.archId);
  const chip = getChip(content, run.spec.chipId, state);
  if (!arch || !chip) return 0;
  return (
    clusterFlopsPerSecond(chip, arch, run.spec.precision, run.spec.chipCount) *
    TUNING.secondsPerWeek *
    run.speedFactor *
    chipEfficiency(state, content, chip.id)
  );
}

export function runProgress(run: TrainingRun): number {
  return Math.min(1, run.flopsDone / run.flopsTotal);
}

/** Capability if released now from the latest checkpoint (less trained = less capable). */
export function checkpointCapability(run: TrainingRun): number {
  return run.projectedCapability + run.capabilityDelta + Math.log10(Math.max(0.01, runProgress(run)));
}
