import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, buyAllowance, capabilityForScore, createGame, fundingCheck, getChip, type GameState } from '../src';

function withModel(score: number, users: number): GameState {
  const s = createGame(content, 3);
  s.models.push({
    id: 'm1',
    name: 'Ours',
    archId: 'dense',
    paramsB: 70,
    tokensB: 1400,
    precision: 'fp8',
    capability: capabilityForScore(score, s.suite.mid),
    score,
    releasedWeek: 0,
  });
  s.liveModelId = 'm1';
  s.users = users;
  return s;
}

describe('funding rounds', () => {
  it('needs both traction and a competitive model', () => {
    expect(fundingCheck(withModel(20, 2_000_000), content).canRaise).toBe(false); // tier 1 model
    expect(fundingCheck(withModel(35, 100_000), content).canRaise).toBe(false); // too few users
    expect(fundingCheck(withModel(35, 2_000_000), content).canRaise).toBe(true);
  });

  it('adds cash, dilutes ownership and moves to the next round', () => {
    const s = withModel(35, 2_000_000);
    const res = applyCommand(s, content, { type: 'raiseFunding' });
    expect(res.error).toBeUndefined();
    const a = content.funding[0]!;
    expect(res.state.cash).toBe(s.cash + a.cash);
    expect(res.state.ownership).toBeCloseTo(s.ownership * (1 - a.equity));
    expect(res.state.roundsRaised).toBe(1);
    expect(fundingCheck(res.state, content).round?.id).toBe(content.funding[1]!.id);
    expect(applyCommand(res.state, content, { type: 'raiseFunding' }).error).toMatch(/convinced/);
  });
});

describe('chip allocation', () => {
  it('limits purchases per week and resets next week', () => {
    let s = createGame(content, 5);
    s.cash = 1e9;
    s.powerCapMW = 1000;
    const k2 = getChip(content, 'kite-k2')!;
    const cap = buyAllowance(s, k2);
    expect(cap).toBe(k2.buyPerWeek);
    s = applyCommand(s, content, { type: 'buyChips', chipId: k2.id, count: cap }).state;
    expect(buyAllowance(s, k2)).toBe(0);
    expect(applyCommand(s, content, { type: 'buyChips', chipId: k2.id, count: 8 }).error).toMatch(/only ship/);
    s = applyCommand(s, content, { type: 'advanceWeek' }).state;
    if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
    expect(buyAllowance(s, k2)).toBeGreaterThan(0);
  });
});
