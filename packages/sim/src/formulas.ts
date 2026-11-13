import type { Arch, Chip, Precision } from '@stm/content';
import { TUNING } from './tuning';

/** Bytes per parameter at each precision. */
export const BYTES_PER_PARAM: Record<Precision, number> = { fp16: 2, fp8: 1, fp4: 0.5 };

/** The precision a chip actually runs: falls back to fp16 if unsupported. */
export function effectivePrecision(chip: Chip, wanted: Precision): Precision {
  return chip.tflops[wanted] > 0 ? wanted : 'fp16';
}

/** Training compute: the classic 6 × N_active × D rule. */
export function trainingFlops(arch: Arch, paramsB: number, tokensB: number): number {
  return 6 * paramsB * 1e9 * arch.activeParamFraction * tokensB * 1e9;
}

export interface ArchFit {
  /** Chip memory per PFLOPS ÷ what the arch wants (capped at 1). */
  memory: number;
  /** Chip interconnect per TFLOPS ÷ what the arch wants (capped at 1). */
  interconnect: number;
  /** Combined fit, 0–1. */
  fit: number;
}

/** How well a chip's profile matches an architecture's demand profile. */
export function archFit(chip: Chip, arch: Arch): ArchFit {
  const memPerPF = chip.memGB / (chip.tflops.fp16 / 1000);
  const linkPerTF = chip.interconnectGBs / chip.tflops.fp16;
  const memory = Math.min(1, memPerPF / arch.memNeedGBPerPF);
  const interconnect = Math.min(1, linkPerTF / arch.linkNeedGBsPerTF);
  return { memory, interconnect, fit: Math.sqrt(memory) * Math.sqrt(interconnect) };
}

/** Scaling efficiency across many chips (1 → 0.5 at the half-efficiency size). */
export function fabricScaling(chipCount: number): number {
  return 1 / (1 + chipCount / TUNING.fabricHalfEfficiencyChips);
}

/** Share of peak FLOPS the cluster actually delivers for this arch. */
export function utilization(chip: Chip, arch: Arch, chipCount: number): number {
  return TUNING.baseUtilization * archFit(chip, arch).fit * fabricScaling(chipCount);
}

/** Delivered training FLOP/s for a cluster. */
export function clusterFlopsPerSecond(chip: Chip, arch: Arch, precision: Precision, chipCount: number): number {
  const p = effectivePrecision(chip, precision);
  return chipCount * chip.tflops[p] * 1e12 * utilization(chip, arch, chipCount);
}

/** Penalty for straying from ~20 tokens per parameter (compute-optimal ratio). */
export function dataRatioFactor(paramsB: number, tokensB: number): number {
  const r = tokensB / (20 * paramsB);
  const ln = Math.log(r);
  return Math.exp(-0.15 * ln * ln);
}

/** Small capability tax for low precision. */
export function precisionFactor(p: Precision): number {
  return p === 'fp16' ? 1 : p === 'fp8' ? 0.97 : 0.9;
}

export function researchBonus(researchers: number): number {
  return 1 + Math.min(TUNING.researcherComputeBonusCap, researchers * TUNING.researcherComputeBonus);
}

/** Capability-equivalent compute after architecture, data, precision and research. */
export function effectiveCompute(
  arch: Arch,
  paramsB: number,
  tokensB: number,
  precision: Precision,
  researchers: number,
): number {
  return (
    trainingFlops(arch, paramsB, tokensB) *
    arch.computeMultiplier *
    dataRatioFactor(paramsB, tokensB) *
    precisionFactor(precision) *
    researchBonus(researchers)
  );
}

/** Capability index: log10 of effective compute. Unbounded, never re-baselined. */
export function capabilityIndex(effCompute: number): number {
  return effCompute > 0 ? Math.log10(effCompute) : 0;
}

/** Score (0–100) of a capability on an eval suite with the given midpoint. */
export function suiteScore(capability: number, suiteMid: number): number {
  if (capability <= 0) return 0;
  return 100 / (1 + Math.exp(-(capability - suiteMid) / TUNING.capabilityScale));
}

/** Inverse of suiteScore: the capability that scores `score` on a suite. */
export function capabilityForScore(score: number, suiteMid: number): number {
  const p = Math.min(99.999, Math.max(0.001, score)) / 100;
  return suiteMid + TUNING.capabilityScale * Math.log(p / (1 - p));
}

/** Score on suite v1 from effective compute. */
export function capabilityScore(effCompute: number): number {
  return suiteScore(capabilityIndex(effCompute), TUNING.capabilityMid);
}

/** True if the model's weights fit in one server of this chip. */
export function modelFitsOnServer(chip: Chip, paramsB: number, precision: Precision): boolean {
  const weightsGB = paramsB * BYTES_PER_PARAM[effectivePrecision(chip, precision)];
  return weightsGB <= chip.memGB * TUNING.chipsPerServer;
}

/**
 * Serving throughput of one chip, tokens/s. Decode is usually memory-bandwidth-bound:
 * every token reads the active weights. Batching amortizes that read.
 */
export function servingTokensPerSecond(chip: Chip, arch: Arch, paramsB: number, precision: Precision): number {
  if (!modelFitsOnServer(chip, paramsB, precision)) return 0;
  const p = effectivePrecision(chip, precision);
  const activeParams = paramsB * 1e9 * arch.activeParamFraction;
  const computeBound = (chip.tflops[p] * 1e12 * TUNING.servingComputeUtilization) / (2 * activeParams);
  const bandwidthBound = ((chip.memBwTBs * 1e12) / (BYTES_PER_PARAM[p] * activeParams)) * TUNING.servingBatch;
  return Math.min(computeBound, bandwidthBound);
}

/** Weekly electricity cost for owned chips. */
export function weeklyPowerCost(chip: Chip, count: number): number {
  const mw = (chip.watts * count) / 1e6;
  return mw * TUNING.pue * 168 * TUNING.powerPricePerMWh;
}

/** Facility power draw in MW (IT load × PUE). */
export function powerDrawMW(chip: Chip, count: number): number {
  return ((chip.watts * count) / 1e6) * TUNING.pue;
}
