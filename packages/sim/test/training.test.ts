import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { seated } from './helpers';
import {
  applyCommand,
  createGame,
  getChip,
  incidentRates,
  previewTraining,
  runProgress,
  type GameState,
  type TrainingSpec,
} from '../src';

const longRun: TrainingSpec = {
  name: 'Marathon',
  archId: 'dense',
  paramsB: 70,
  tokensB: 1400,
  precision: 'fp8',
  chipId: 'kite-k1',
  chipCount: 256,
};

function startLongRun(seed: number): GameState {
  let s = createGame(content, seed);
  s.cash = 1e9;
  for (const t of ['power', 'safety', 'compliance', 'environmental'] as const) s.license[t].level = 5;
  s = applyCommand(s, content, { type: 'rentChips', chipId: 'kite-k1', count: 256 }).state;
  s = applyCommand(s, content, { type: 'buyData', billions: 1100 }).state;
  const res = applyCommand(s, content, { type: 'startTraining', spec: longRun });
  if (res.error) throw new Error(res.error);
  return res.state;
}

/** Advance until an incident about the run is pending (or the run ends). */
function untilIncident(s: GameState, maxWeeks = 40): GameState {
  for (let i = 0; i < maxWeeks && s.training; i++) {
    if (s.pendingEvent) {
      if (s.pendingEvent.eventId.startsWith('training-')) return s;
      s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
    }
    s = applyCommand(s, content, { type: 'advanceWeek' }).state;
  }
  return s;
}

function findIncident(id: string): GameState {
  for (let seed = 1; seed < 200; seed++) {
    const s = untilIncident(startLongRun(seed));
    if (s.pendingEvent?.eventId === id) return s;
  }
  throw new Error(`no ${id} found`);
}

describe('training risk', () => {
  it('rates grow with cluster size, low precision and model size; ops engineers help', () => {
    const s = createGame(content, 1);
    const k1 = getChip(content, 'kite-k1')!;
    const small = incidentRates(s, k1, 256, 7, 'fp16');
    expect(incidentRates(s, k1, 65536, 7, 'fp16').hardware).toBeGreaterThan(small.hardware);
    expect(incidentRates(s, k1, 256, 7, 'fp4').lossSpike).toBeGreaterThan(small.lossSpike);
    expect(incidentRates(s, k1, 256, 2000, 'fp16').lossSpike).toBeGreaterThan(small.lossSpike);
    const withOps = seated(s, { ops: 5 });
    expect(incidentRates(withOps, k1, 256, 7, 'fp16').hardware).toBeLessThan(small.hardware);
    expect(previewTraining(startLongRun(1), content, { ...longRun, chipCount: 0 }).incidents.hardware).toBe(0);
  });

  it('long runs hit incidents that pause the week for a decision', () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = untilIncident(startLongRun(seed));
      if (s.pendingEvent?.eventId.startsWith('training-')) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('rolling back costs progress; lowering the learning rate slows the run', () => {
    const s = findIncident('training-loss-spike');
    const before = s.training!.flopsDone;
    const rolled = applyCommand(s, content, { type: 'resolveEvent', choiceId: 'rollback' }).state;
    expect(rolled.training!.flopsDone).toBeLessThan(before);
    const slowed = applyCommand(s, content, { type: 'resolveEvent', choiceId: 'lower-lr' }).state;
    expect(slowed.training!.speedFactor).toBeCloseTo(s.training!.speedFactor * 0.9);
  });

  it('filtering contaminated data lowers final capability; ignoring it risks a scandal', () => {
    const s = findIncident('training-contamination');
    const filtered = applyCommand(s, content, { type: 'resolveEvent', choiceId: 'filter' }).state;
    expect(filtered.training!.capabilityDelta).toBeCloseTo(-0.05);
    const ignored = applyCommand(s, content, { type: 'resolveEvent', choiceId: 'ignore' }).state;
    expect(ignored.training!.scandalChance).toBe(0.5);
  });

  it('checkpoints can be released early at lower capability', () => {
    let s = startLongRun(3);
    expect(applyCommand(s, content, { type: 'releaseCheckpoint' }).error).toMatch(/50%/);
    while (s.training && runProgress(s.training) < 0.6) {
      if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
      s = applyCommand(s, content, { type: 'advanceWeek' }).state;
    }
    const full = s.training!.projectedCapability + s.training!.capabilityDelta;
    s = applyCommand(s, content, { type: 'releaseCheckpoint' }).state;
    expect(s.training).toBeNull();
    expect(s.models).toHaveLength(1);
    expect(s.models[0]!.capability).toBeLessThan(full);
    expect(s.models[0]!.capability).toBeGreaterThan(full - 0.3);
  });
});
