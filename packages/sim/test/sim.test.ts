import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  archFit,
  capabilityScore,
  createGame,
  getArch,
  getChip,
  previewTraining,
  trainingFlops,
  type Command,
  type GameState,
  type TrainingSpec,
} from '../src';

const dense = getArch(content, 'dense')!;
const moe = getArch(content, 'moe')!;
const k1 = getChip(content, 'kite-k1')!;
const m3 = getChip(content, 'monolith-m3')!;

function run(state: GameState, cmds: Command[]): GameState {
  for (const cmd of cmds) {
    const res = applyCommand(state, content, cmd);
    if (res.error) throw new Error(`${cmd.type}: ${res.error}`);
    state = res.state;
  }
  return state;
}

const firstModel: TrainingSpec = {
  name: 'Seedling',
  archId: 'dense',
  paramsB: 7,
  tokensB: 140,
  precision: 'fp16',
  chipId: 'kite-k1',
  chipCount: 64,
};

describe('formulas', () => {
  it('uses 6·N·D for dense training compute', () => {
    expect(trainingFlops(dense, 7, 140)).toBeCloseTo(6 * 7e9 * 140e9);
  });

  it('only counts active parameters for MoE', () => {
    expect(trainingFlops(moe, 100, 100)).toBeCloseTo(trainingFlops(dense, 100, 100) * 0.25);
  });

  it('makes memory-poor chips a bad fit for MoE (the co-design hook)', () => {
    expect(archFit(m3, moe).fit).toBeLessThan(0.5);
    expect(archFit(k1, moe).fit).toBeCloseTo(1);
    expect(archFit(m3, dense).fit).toBeGreaterThan(archFit(m3, moe).fit);
  });

  it('capability rises with compute and stays within 0–100', () => {
    const scores = [1e18, 1e21, 1e24, 1e27, 1e30].map(capabilityScore);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
    expect(scores[0]!).toBeGreaterThan(0);
    expect(scores[4]!).toBeLessThan(100);
  });
});

describe('game', () => {
  it('is deterministic for the same seed and commands', () => {
    const cmds: Command[] = [
      { type: 'rentChips', chipId: 'kite-k1', count: 64 },
      { type: 'startTraining', spec: firstModel },
      ...Array.from({ length: 30 }, () => ({ type: 'advanceWeek' }) as Command),
    ];
    const play = () => {
      let s = createGame(content, 42);
      for (const cmd of cmds) {
        const res = applyCommand(s, content, cmd);
        s = res.state;
        if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('does not mutate the previous state', () => {
    const s0 = createGame(content, 1);
    const snapshot = structuredClone(s0);
    applyCommand(s0, content, { type: 'rentChips', chipId: 'kite-k1', count: 8 });
    expect(s0).toEqual(snapshot);
  });

  it('trains, releases a model and starts earning', () => {
    let s = run(createGame(content, 7), [
      { type: 'rentChips', chipId: 'kite-k1', count: 64 },
      { type: 'startTraining', spec: firstModel },
    ]);
    for (let i = 0; i < 12; i++) {
      if (s.pendingEvent) s = run(s, [{ type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }]);
      s = run(s, [{ type: 'advanceWeek' }]);
    }
    expect(s.models).toHaveLength(1);
    expect(s.liveModelId).toBe(s.models[0]!.id);
    expect(s.users).toBeGreaterThan(0);
    expect(s.lastWeek!.revenue).toBeGreaterThan(0);
  });

  it('refuses training without enough free chips', () => {
    const s = createGame(content, 3);
    const p = previewTraining(s, content, firstModel);
    expect(p.errors.some((e) => e.includes('free'))).toBe(true);
    expect(applyCommand(s, content, { type: 'startTraining', spec: firstModel }).error).toBeDefined();
  });

  it('caps rentals at the cloud supply and clusters at engineer capacity', () => {
    const s = createGame(content, 3);
    expect(applyCommand(s, content, { type: 'rentChips', chipId: 'kite-k1', count: 10_000 }).error).toMatch(/cloud/);
    expect(applyCommand(s, content, { type: 'rentChips', chipId: 'kite-k2', count: 8 }).error).toMatch(/week 26/);
    const s2 = run(s, [{ type: 'rentChips', chipId: 'kite-k1', count: 256 }]);
    const p = previewTraining(s2, content, { ...firstModel, chipCount: 256 });
    expect(p.errors).toEqual([]);
    const s3 = run(s2, [{ type: 'buyChips', chipId: 'kite-k1', count: 8 }]);
    expect(previewTraining(s3, content, { ...firstModel, chipCount: 264 }).errors.join()).toMatch(/model engineer/);
  });

  it('blocks buying beyond site power', () => {
    const s = createGame(content, 3);
    const res = applyCommand(s, content, { type: 'buyChips', chipId: 'kite-k1', count: 10_000 });
    expect(res.error).toBeDefined();
  });

  it('goes bankrupt after sustained negative cash', () => {
    let s = run(createGame(content, 5), [
      { type: 'buyData', billions: 1550 },
      { type: 'rentChips', chipId: 'kite-k1', count: 256 },
    ]);
    for (let i = 0; i < 20 && s.status === 'playing'; i++) {
      if (s.pendingEvent) s = run(s, [{ type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }]);
      s = run(s, [{ type: 'advanceWeek' }]);
    }
    expect(s.status).toBe('bankrupt');
  });
});

describe('going live', () => {
  it('keeps the current model live when a bigger one is too big to serve on our chips', async () => {
    const { applyCommand: apply, createGame: make, capabilityForScore } = await import('../src');
    const { content: c } = await import('@stm/content');
    let s = make(c, 3);
    s = apply(s, c, { type: 'rentChips', chipId: 'kite-k1', count: 64 }).state;
    s.models.push({ id: 'small', name: 'Small', archId: 'dense', paramsB: 7, tokensB: 140, precision: 'fp16', capability: 22, score: 20, releasedWeek: 0 });
    s.liveModelId = 'small';
    // A finished 5,000B run: far too big for one 8-chip server of Kite K1.
    s.training = {
      spec: { name: 'Giant', archId: 'dense', paramsB: 5000, tokensB: 100, precision: 'fp16', chipId: 'kite-k1', chipCount: 8 },
      flopsTotal: 1,
      flopsDone: 1,
      startedWeek: 0,
      projectedCapability: capabilityForScore(60, s.suite.mid),
      projectedScore: 60,
      tier: 1,
      gaps: { power: 0, safety: 0, compliance: 0, environmental: 0 },
      speedFactor: 1,
      capabilityDelta: 0,
      scandalChance: 0,
      incidents: 0,
    };
    s = apply(s, c, { type: 'advanceWeek' }).state;
    expect(s.models.some((m) => m.name === 'Giant')).toBe(true);
    expect(s.liveModelId).toBe('small');
    expect(s.log.some((l) => /too big to serve/.test(l.text))).toBe(true);
  });
});

describe('reputation', () => {
  it('recovers slowly while demand is served, up to a ceiling raised by Safety and Compliance', async () => {
    const { applyCommand: apply, createGame: make, reputationCeiling } = await import('../src');
    const { content: c } = await import('@stm/content');
    let s = { ...make(c, 4), reputation: 10 };
    for (let i = 0; i < 8; i++) {
      if (s.pendingEvent) s = apply(s, c, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
      s = apply(s, c, { type: 'advanceWeek' }).state;
    }
    expect(s.reputation).toBeGreaterThan(10);
    expect(reputationCeiling(s)).toBe(50);
    expect(reputationCeiling({ ...s, license: { ...s.license, safety: { level: 3, upgrade: null } } })).toBe(60);
  });
});
