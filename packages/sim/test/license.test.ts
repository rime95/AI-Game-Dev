import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  createGame,
  licenseUpkeep,
  previewTraining,
  tierForScore,
  type Command,
  type GameState,
  type TrainingSpec,
} from '../src';

function run(state: GameState, cmds: Command[]): GameState {
  for (const cmd of cmds) {
    const res = applyCommand(state, content, cmd);
    if (res.error) throw new Error(`${cmd.type}: ${res.error}`);
    state = res.state;
  }
  return state;
}

function advance(state: GameState, weeks: number): GameState {
  for (let i = 0; i < weeks; i++) {
    if (state.pendingEvent) state = run(state, [{ type: 'resolveEvent', choiceId: state.pendingEvent.choices.at(-1)!.id }]);
    state = run(state, [{ type: 'advanceWeek' }]);
  }
  return state;
}

// A 70B model on 700B tokens projects ~34: a Tier 2 run.
const tier2Spec: TrainingSpec = {
  name: 'Climber',
  archId: 'dense',
  paramsB: 70,
  tokensB: 700,
  precision: 'fp8',
  chipId: 'kite-k1',
  chipCount: 256,
};

function readyForTier2Run(seed = 1): GameState {
  return run(createGame(content, seed), [
    { type: 'rentChips', chipId: 'kite-k1', count: 256 },
    { type: 'buyData', billions: 400 },
  ]);
}

describe('License to Scale', () => {
  it('maps eval scores to tiers', () => {
    expect(tierForScore(content, 10)).toBe(1);
    expect(tierForScore(content, 30)).toBe(2);
    expect(tierForScore(content, 59.9)).toBe(3);
    expect(tierForScore(content, 90)).toBe(5);
  });

  it('shows the checklist and risks before a run, without blocking it', () => {
    const s = readyForTier2Run();
    const p = previewTraining(s, content, tier2Spec);
    expect(p.tier).toBe(2);
    expect(p.errors).toEqual([]);
    for (const r of p.requirements) expect(r.gap).toBe(1);
    expect(p.requirements.find((r) => r.track === 'safety')!.risk).toBeCloseTo(content.license.riskPerGap);
    expect(p.speedFactor).toBeCloseTo(1 - content.license.powerSlowdownPerGap);
  });

  it('upgrades take time, cost upkeep, raise the power cap and clear the gap', () => {
    let s = run(createGame(content, 2), [{ type: 'upgradeLicense', track: 'power' }]);
    expect(s.cash).toBe(8_000_000 - 2_000_000);
    expect(applyCommand(s, content, { type: 'upgradeLicense', track: 'power' }).error).toMatch(/underway/);
    s = advance(s, 4);
    expect(s.license.power.level).toBe(2);
    expect(s.powerCapMW).toBe(20);
    expect(licenseUpkeep(s, content)).toBe(20_000);
    s = run(s, [
      { type: 'rentChips', chipId: 'kite-k1', count: 256 },
      { type: 'buyData', billions: 400 },
    ]);
    const p = previewTraining(s, content, tier2Spec);
    expect(p.requirements.find((r) => r.track === 'power')!.gap).toBe(0);
    expect(p.speedFactor).toBe(1);
  });

  it('missing power slows the run down', () => {
    const s = readyForTier2Run();
    const slowed = previewTraining(s, content, tier2Spec);
    const full = { ...s, license: { ...s.license, power: { level: 2, upgrade: null } } };
    const fast = previewTraining(full, content, tier2Spec);
    expect(slowed.flopsPerWeek).toBeLessThan(fast.flopsPerWeek);
  });

  it('shipping under-licensed can trigger fines or incidents; fully licensed never does', () => {
    let hits = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let s = run(readyForTier2Run(seed), [{ type: 'startTraining', spec: tier2Spec }]);
      const cash = s.cash;
      s = advance(s, 10);
      if (s.log.some((l) => /fined|incident|Permit violation/.test(l.text))) hits++;
      expect(s.models).toHaveLength(1);
      expect(cash).toBeGreaterThan(0);
    }
    expect(hits).toBeGreaterThan(0);

    // Fully licensed for tier 2: no consequences in any seed.
    for (let seed = 1; seed <= 12; seed++) {
      let s = readyForTier2Run(seed);
      for (const t of ['power', 'safety', 'compliance', 'environmental'] as const) s.license[t].level = 2;
      s = run(s, [{ type: 'startTraining', spec: tier2Spec }]);
      s = advance(s, 10);
      expect(s.log.some((l) => /fined|incident|Permit violation/.test(l.text))).toBe(false);
    }
  });
});
