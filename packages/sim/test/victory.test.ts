import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  capabilityForScore,
  createGame,
  deriveChip,
  goalProgress,
  marketShares,
  previewAgi,
  TUNING,
  type GameState,
} from '../src';

function step(s: GameState): GameState {
  if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
  return applyCommand(s, content, { type: 'advanceWeek' }).state;
}

/** A late-game company with a frontier model. */
function frontierLab(seed = 1, capability = 27.5): GameState {
  const s = createGame(content, seed);
  s.models.push({
    id: 'm1',
    name: 'Apex',
    archId: 'moe',
    paramsB: 2000,
    tokensB: 40000,
    precision: 'fp8',
    capability,
    score: 0,
    releasedWeek: 0,
  });
  s.liveModelId = 'm1';
  s.cash = 50e9;
  s.powerCapMW = 5000;
  s.fleet.push({ id: 'f-big', chipId: 'kite-k2', count: 60_000, owned: true });
  return s;
}

describe('market shares', () => {
  it('sum to 1 across all labs', () => {
    const s = frontierLab();
    const { you, rivals } = marketShares(s, content);
    expect(you + Object.values(rivals).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(you).toBeGreaterThan(0.9); // a frontier model dominates
  });
});

describe('AGI Program', () => {
  it('is gated on capability, cash and chips', () => {
    const early = createGame(content, 1);
    expect(previewAgi(early, content, 'kite-k2', 60_000).errors.length).toBeGreaterThan(0);
    const s = frontierLab();
    expect(previewAgi(s, content, 'kite-k2', 60_000).errors).toEqual([]);
    expect(previewAgi(s, content, 'kite-k2', 1_000).errors.join()).toMatch(/at least/);
    expect(previewAgi(frontierLab(1, 26), content, 'kite-k2', 60_000).errors.join()).toMatch(/more capable/);
  });

  it('with a full safety case ends in Safe Frontier', () => {
    let s = frontierLab();
    s.license.safety.level = 5;
    s = applyCommand(s, content, { type: 'startAgiProgram', chipId: 'kite-k2', chipCount: 60_000 }).state;
    expect(s.cash).toBe(50e9 - TUNING.agiCost);
    for (let i = 0; i < TUNING.agiWeeks && s.status === 'playing'; i++) s = step(s);
    expect(s.status).toBe('won');
    expect(s.victory?.kind).toBe('safeFrontier');
    // The player can keep going after winning.
    s = applyCommand(s, content, { type: 'continuePlaying' }).state;
    expect(s.status).toBe('playing');
    s = step(s);
    expect(s.status).toBe('playing');
  });

  it('with weak safety often ends in catastrophe', () => {
    let catastrophes = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let s = frontierLab(seed);
      s = applyCommand(s, content, { type: 'startAgiProgram', chipId: 'kite-k2', chipCount: 60_000 }).state;
      for (let i = 0; i < TUNING.agiWeeks && s.status === 'playing'; i++) s = step(s);
      expect(['won', 'catastrophe']).toContain(s.status);
      if (s.status === 'catastrophe') catastrophes++;
      else expect(s.victory?.kind).toBe('recklessFrontier');
    }
    // Safety level 1 of 5 → 100% catastrophe chance.
    expect(catastrophes).toBe(10);
  });
});

describe('other victories', () => {
  it('Market Leader after two years with the most users', () => {
    // (A stagnant leader gets caught by rivals within ~1.5 years, so start near the end of a streak.)
    let s = frontierLab();
    s.users = 3e8;
    s.leaderStreak = TUNING.marketLeaderWeeks - 3;
    for (let i = 0; i < 5 && s.status === 'playing'; i++) s = step(s);
    expect(s.victory?.kind).toBe('marketLeader');
    // Losing the lead resets the streak.
    const t = frontierLab(1, 20);
    t.leaderStreak = 50;
    expect(step(t).leaderStreak).toBe(0);
  });

  it('Full Stack with fab-made silicon, own generation and the top model', () => {
    let s = frontierLab();
    const n7 = content.nodes[0]!;
    const chip = deriveChip(n7, { name: 'Ours', nodeId: 'n7', split: { compute: 0.55, sram: 0.15, memory: 0.2, interconnect: 0.1 }, fp8: true, fp4: false }, 'custom-1');
    s.customChips.push(chip);
    s.fleet.push({ id: 'f-own', chipId: chip.id, count: 80_000, owned: true });
    s.license.power.level = 5;
    // Designing our own chips isn't enough: the fab has to make them.
    expect(goalProgress(s, content).find((g) => g.kind === 'fullStack')!.checks[0]!.ok).toBe(false);
    s.fab = { status: 'online', weeksLeft: 0, totalWeeks: 30, lines: [], hbmMult: 1, hbmWeeks: 0, madeForFleet: 80_000 };
    s.powerCapMW = 2000;
    const goals = goalProgress(s, content).find((g) => g.kind === 'fullStack')!;
    expect(goals.checks.every((c) => c.ok)).toBe(true);
    s = step(s);
    expect(s.victory?.kind).toBe('fullStack');
  });

  it('nobody wins by default', () => {
    let s = createGame(content, 2);
    for (let i = 0; i < 60; i++) s = step(s);
    expect(s.victory).toBeNull();
    expect(capabilityForScore(50, s.suite.mid)).toBeLessThan(TUNING.agiCapability);
  });
});
