import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  capabilityForScore,
  createGame,
  scoreNow,
  targetUsers,
  tierForCapability,
  TUNING,
  type GameState,
} from '../src';

function advance(state: GameState, weeks: number): GameState {
  for (let i = 0; i < weeks && state.status === 'playing'; i++) {
    if (state.pendingEvent) state = applyCommand(state, content, { type: 'resolveEvent', choiceId: state.pendingEvent.choices.at(-1)!.id }).state;
    state = applyCommand(state, content, { type: 'advanceWeek' }).state;
  }
  return state;
}

/** A game where we have one released model and a rival about to saturate Suite v1. */
function nearSaturation(): GameState {
  const s = createGame(content, 4);
  const ourCap = capabilityForScore(60, s.suite.mid);
  s.models.push({ id: 'm1', name: 'Ours', archId: 'dense', paramsB: 70, tokensB: 1400, precision: 'fp8', capability: ourCap, score: 60, releasedWeek: 0 });
  s.liveModelId = 'm1';
  s.users = 1_000_000;
  const r = s.rivals[0]!;
  r.capability = capabilityForScore(91, s.suite.mid);
  r.score = 91;
  return s;
}

describe('eval suite retirement', () => {
  it('retires a saturated suite and re-scores everyone lower, keeping the order', () => {
    const before = nearSaturation();
    const after = advance(before, 1);
    expect(after.suite.version).toBe(2);
    expect(after.suite.mid).toBeCloseTo(before.suite.mid + TUNING.suiteStep);
    const ours = after.models[0]!;
    const rival = after.rivals.find((r) => r.id === before.rivals[0]!.id)!;
    expect(ours.score).toBeLessThan(60);
    expect(rival.score).toBeLessThan(TUNING.suiteSaturationScore);
    expect(rival.score).toBeGreaterThan(ours.score);
    expect(ours.capability).toBe(before.models[0]!.capability);
    expect(after.log.some((l) => /test v1 is too easy/.test(l.text))).toBe(true);
  });

  it('never changes tiers or market share', () => {
    const s = nearSaturation();
    const shifted: GameState = { ...s, suite: { ...s.suite, mid: s.suite.mid + TUNING.suiteStep } };
    expect(targetUsers(shifted, content)).toBeCloseTo(targetUsers(s, content));
    const cap = s.models[0]!.capability;
    // Same capability scores lower on the harder suite, but its tier is unchanged (tiers take capability only).
    expect(scoreNow(shifted, cap)).toBeLessThan(scoreNow(s, cap));
    expect(tierForCapability(content, cap)).toBe(3);
  });

  it('waits for us: rivals never outgrow a player who stands still', () => {
    const s = advance(createGame(content, 9), 320);
    expect(s.suite.version).toBe(1);
    for (const r of s.rivals) expect(r.score).toBeLessThan(TUNING.rivalBaselineScore);
  });
});

describe('rivals follow the player', () => {
  it('climb toward our best model over time but stay behind it', () => {
    const s = createGame(content, 5);
    const ours = capabilityForScore(70, s.suite.mid);
    s.models.push({ id: 'm1', name: 'Ours', archId: 'dense', paramsB: 70, tokensB: 1400, precision: 'fp8', capability: ours, score: 70, releasedWeek: 0 });
    s.liveModelId = 'm1';
    const later = advance(s, 156);
    const best = Math.max(...later.rivals.map((r) => r.capability));
    expect(best).toBeLessThan(ours);
    expect(best).toBeGreaterThan(ours - 0.5);
    for (const r of later.rivals) expect(r.capability).toBeLessThan(ours);
  });
});
