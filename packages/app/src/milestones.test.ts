import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { createGame, type GameState } from '@stm/sim';
import { detectMilestone } from './milestones';

const base = (): GameState => createGame(content, 3, 'Quartz');

describe('milestone news cards', () => {
  it('announce leaving the garage, the first data center, the fab and the IPO', () => {
    const a = base();
    expect(detectMilestone(a, { ...a, hq: { ...a.hq, stage: 'office' } })?.title).toBe("We're out of the garage");

    const site = {
      id: 's1',
      locationId: 'cascadia',
      name: 'Cascadia',
      status: 'building' as const,
      weeksLeft: 1,
      totalWeeks: 14,
      halls: [],
      opsCenter: false,
    };
    const building = { ...a, sites: [site] };
    expect(detectMilestone(building, { ...building, sites: [{ ...site, status: 'online' }] })?.title).toBe(
      'Our first data center is online',
    );

    const fab = { status: 'building' as const, weeksLeft: 1, totalWeeks: 30, lines: [], hbmMult: 1, hbmWeeks: 0, madeForFleet: 0 };
    expect(detectMilestone({ ...a, fab }, { ...a, fab: { ...fab, status: 'online' } })?.kind).toBe('fab');

    const n = content.funding.length;
    expect(detectMilestone({ ...a, roundsRaised: n - 1 }, { ...a, roundsRaised: n })?.title).toBe("We're public");
  });

  it('stays quiet on an ordinary week', () => {
    const a = base();
    expect(detectMilestone(a, { ...a, week: 1, cash: a.cash - 1000 })).toBeNull();
  });
});
