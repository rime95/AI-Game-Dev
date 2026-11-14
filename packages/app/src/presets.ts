import type { Content, Precision } from '@stm/content';
import { allChips, archFit, freeChips, maxClusterChips, previewTraining, TUNING, type GameState, type TrainingPreview, type TrainingSpec } from '@stm/sim';

export const PARAM_OPTIONS = [1, 3, 7, 13, 34, 70, 180, 400, 1000, 2000];

/** Size cards in the simple Models view, by how long the player is willing to wait. */
const TARGETS = [
  { id: 'quick', label: 'Quick', weeks: 8, blurb: 'Done in a couple of months. Good for a first model.' },
  { id: 'standard', label: 'Standard', weeks: 17, blurb: 'A solid model in about four months.' },
  { id: 'big', label: 'Big', weeks: 26, blurb: 'Half a year. Worth it if we can wait.' },
  { id: 'moonshot', label: 'Moonshot', weeks: 44, blurb: 'Most of a year, for a big leap ahead.' },
] as const;

export interface ModelPreset {
  id: string;
  label: string;
  blurb: string;
  spec: TrainingSpec;
  preview: TrainingPreview;
  /** Data we'd have to buy first, in billions of tokens. */
  dataShortB: number;
  dataCost: number;
  /** Chip time plus any data to buy. */
  totalCost: number;
  /** Why this card can't start right now, in plain words. */
  blocked: string | null;
}

/** The free chips that would train this style fastest, and how many we can run at once. */
export function bestTrainingChip(game: GameState, content: Content, archId: string): { chipId: string; count: number } | null {
  const arch = content.archs.find((a) => a.id === archId);
  if (!arch) return null;
  let best: { chipId: string; count: number; score: number } | null = null;
  const cap = maxClusterChips(game);
  for (const c of allChips(game, content)) {
    const count = Math.min(freeChips(game, c.id), cap);
    if (count <= 0) continue;
    const score = count * c.tflops.fp16 * archFit(c, arch).fit;
    if (!best || score > best.score) best = { chipId: c.id, count, score };
  }
  return best && { chipId: best.chipId, count: best.count };
}

/** Fast math when the chip has it; Turbo is left for players who open the details. */
export function bestPrecision(game: GameState, content: Content, chipId: string): Precision {
  const chip = allChips(game, content).find((c) => c.id === chipId);
  return chip && chip.tflops.fp8 > 0 ? 'fp8' : 'fp16';
}

/** One spec per size card: the biggest model that finishes inside the card's time, fed the usual 20× data. */
export function modelPresets(game: GameState, content: Content, archId: string, name: string): ModelPreset[] {
  const pick = bestTrainingChip(game, content, archId);
  if (!pick) return [];
  const precision = bestPrecision(game, content, pick.chipId);
  const specFor = (paramsB: number): TrainingSpec => ({
    name,
    archId,
    paramsB,
    tokensB: paramsB * 20,
    precision,
    chipId: pick.chipId,
    chipCount: pick.count,
  });
  const out: ModelPreset[] = [];
  let lastParams = 0;
  for (const t of TARGETS) {
    let paramsB = PARAM_OPTIONS[0]!;
    for (const p of PARAM_OPTIONS) {
      const pv = previewTraining(game, content, specFor(p));
      if (pv.weeks > 0 && pv.weeks <= t.weeks) paramsB = p;
    }
    if (paramsB <= lastParams) continue;
    lastParams = paramsB;
    const spec = specFor(paramsB);
    const preview = previewTraining(game, content, spec);
    const dataShortB = Math.max(0, spec.tokensB - game.dataTokensB);
    const dataCost = dataShortB * TUNING.dataCostPerBillionTokens;
    const totalCost = preview.weeklyChipCost * preview.weeks + dataCost;
    const errors = preview.errors.filter((e) => !e.startsWith('Not enough data') && !e.startsWith('Give the model'));
    const blocked = errors[0] ?? (dataCost > game.cash ? 'Not enough cash to buy the training data.' : null);
    out.push({ id: t.id, label: t.label, blurb: t.blurb, spec, preview, dataShortB, dataCost, totalCost, blocked });
  }
  return out;
}
