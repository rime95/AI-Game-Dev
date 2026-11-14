import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, capabilityForScore, createGame, fundingCheck, migrateSave, previewTraining, TUNING, type GameState } from '../src';

const act = (s: GameState, cmd: Parameters<typeof applyCommand>[2]): GameState => {
  const r = applyCommand(s, content, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
};

describe('pacing', () => {
  it('one turn is a month of weeks, stopping early for a decision', () => {
    let s = createGame(content, 3);
    s = act(s, { type: 'advanceMonth' });
    expect(s.week === TUNING.weeksPerTurn || !!s.pendingEvent).toBe(true);
    // Play two years of months: the turn never runs past an open decision.
    for (let i = 0; i < 24; i++) {
      if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
      const before = s.week;
      s = act(s, { type: 'advanceMonth' });
      expect(s.week - before).toBeLessThanOrEqual(TUNING.weeksPerTurn);
      if (s.week - before < TUNING.weeksPerTurn) expect(s.pendingEvent).not.toBeNull();
    }
  });

  it('spaces press and random events out', () => {
    let s = createGame(content, 11);
    const fired: number[] = [];
    for (let w = 0; w < 400 && s.status === 'playing'; w++) {
      if (s.pendingEvent) {
        fired.push(s.week);
        s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
      }
      s = act(s, { type: 'advanceWeek' });
    }
    for (let i = 1; i < fired.length; i++) expect(fired[i]! - fired[i - 1]!).toBeGreaterThanOrEqual(TUNING.eventCooldownWeeks - 1);
  });

  it('every training run takes at least a couple of months', () => {
    let s = createGame(content, 2);
    s = act(s, { type: 'rentChips', chipId: content.chips[0]!.id, count: 64 });
    const spec = { name: 'Tiny', archId: 'dense', paramsB: 1, tokensB: 20, precision: 'fp16' as const, chipId: content.chips[0]!.id, chipCount: 64 };
    expect(previewTraining(s, content, spec).weeks).toBe(TUNING.minTrainingWeeks);
    s = act(s, { type: 'startTraining', spec });
    let weeks = 0;
    while (s.training && weeks < 50) {
      if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
      s = act(s, { type: 'advanceWeek' });
      weeks++;
    }
    expect(weeks).toBeGreaterThanOrEqual(TUNING.minTrainingWeeks);
  });

  it('old saves bring runaway rivals back behind our best model', () => {
    const s = createGame(content, 1) as unknown as Record<string, unknown> & GameState;
    const ours = capabilityForScore(40, s.suite.mid);
    s.models.push({ id: 'm1', name: 'Ours', archId: 'dense', paramsB: 7, tokensB: 140, precision: 'fp16', capability: ours, score: 40, releasedWeek: 0 });
    s.rivals[0]!.capability = capabilityForScore(80, s.suite.mid);
    const old = { ...structuredClone(s), version: 16 };
    const res = migrateSave(old, content);
    expect('state' in res).toBe(true);
    if ('state' in res) for (const r of res.state.rivals) expect(r.capability).toBeLessThan(ours);
  });

  it('investors wait about half a year between rounds', () => {
    const s = createGame(content, 4);
    s.roundsRaised = 1;
    s.week = 100;
    s.lastRoundWeek = 90;
    expect(fundingCheck(s, content).checks.find((c) => c.label.startsWith('Time since'))?.ok).toBe(false);
    s.lastRoundWeek = 100 - TUNING.minWeeksBetweenRounds;
    expect(fundingCheck(s, content).checks.find((c) => c.label.startsWith('Time since'))?.ok).toBe(true);
  });
});
