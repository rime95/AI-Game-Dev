import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  createGame,
  crowdingFactor,
  deskStats,
  effectiveStaff,
  maxClusterChips,
  moraleFactor,
  productivity,
  type Command,
  type GameState,
} from '../src';

function act(s: GameState, cmd: Command): GameState {
  const res = applyCommand(s, content, cmd);
  if (res.error) throw new Error(res.error);
  return res.state;
}

describe('HQ grid and rooms', () => {
  it('starts in the garage with one desk pod for the three founders', () => {
    const s = createGame(content, 1);
    expect(s.hq.stage).toBe('garage');
    expect(s.hq.rooms).toHaveLength(1);
    const d = deskStats(s, content);
    expect(d.headcount).toBe(3);
    expect(d.capacity).toBe(4);
    expect(d.crowding).toBeLessThanOrEqual(1);
  });

  it('places rooms on free tiles, rejects overlaps and out-of-bounds, and charges the cost', () => {
    const s = createGame(content, 1);
    const placed = act(s, { type: 'placeRoom', templateId: 'breakRoom', x: 2, y: 0, rot: 0 });
    expect(placed.hq.rooms).toHaveLength(2);
    expect(placed.cash).toBe(s.cash - 60_000);
    expect(applyCommand(placed, content, { type: 'placeRoom', templateId: 'deskPod', x: 3, y: 1, rot: 0 }).error).toMatch(/already there/);
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'researchLab', x: 3, y: 0, rot: 0 }).error).toMatch(/doesn't fit/);
    // Rotated, the 4×3 lab becomes 3×4 and fits in the garage's right side.
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'researchLab', x: 3, y: 0, rot: 1 }).error).toBeUndefined();
  });

  it('refunds half of what was spent on demolish', () => {
    let s = createGame(content, 1);
    s = act(s, { type: 'placeRoom', templateId: 'breakRoom', x: 2, y: 0, rot: 0 });
    s = act(s, { type: 'upgradeRoom', roomId: s.hq.rooms[1].id });
    const before = s.cash;
    s = act(s, { type: 'demolishRoom', roomId: s.hq.rooms[1].id });
    expect(s.cash).toBe(before + (60_000 + 60_000) * 0.5);
  });

  it('only gives the research bonus to researchers seated in a lab', () => {
    let s = createGame(content, 1);
    expect(effectiveStaff(s, 'research')).toBe(0);
    s = act(s, { type: 'placeRoom', templateId: 'researchLab', x: 2, y: 0, rot: 0 });
    expect(effectiveStaff(s, 'research')).toBeCloseTo(1 * s.hq.productivity);
    // Seven researchers, six seats: one works at a desk without the bonus.
    s = { ...s, staff: { ...s.staff, research: 7 } };
    s = act(s, { type: 'upgradeRoom', roomId: s.hq.rooms[1].id });
    expect(s.hq.research).toBeCloseTo(6 * 1.1 * s.hq.productivity);
  });

  it('gives labs next to a break room a small bonus', () => {
    let office = { ...createGame(content, 1), cash: 50_000_000 };
    office = act(office, { type: 'moveHq' });
    const lab = act(office, { type: 'placeRoom', templateId: 'researchLab', x: 4, y: 4, rot: 0 });
    const near = act(lab, { type: 'placeRoom', templateId: 'breakRoom', x: 8, y: 4, rot: 0 });
    const far = act(lab, { type: 'placeRoom', templateId: 'breakRoom', x: 10, y: 8, rot: 0 });
    const perSeat = (s: GameState) => s.hq.research / s.hq.productivity;
    expect(perSeat(near)).toBeCloseTo(1.05);
    expect(perSeat(far)).toBeCloseTo(1);
  });
});

describe('soft desk cap and morale', () => {
  it('slows everyone down by 1 / crowding² when there are more people than seats', () => {
    expect(crowdingFactor(1)).toBe(1);
    expect(crowdingFactor(1.1)).toBeCloseTo(0.826, 3);
    expect(crowdingFactor(1.3)).toBeCloseTo(0.592, 3);
    expect(moraleFactor(0)).toBeCloseTo(0.8);
    expect(moraleFactor(100)).toBeCloseTo(1.1);

    let s = createGame(content, 1);
    const roomy = maxClusterChips(s);
    for (let i = 0; i < 3; i++) s = act(s, { type: 'hire', discipline: 'modelEng' });
    expect(deskStats(s, content).crowding).toBeCloseTo(6 / 4);
    expect(productivity(s, content).crowding).toBeCloseTo(1 / 2.25);
    // Four engineers crammed into a garage orchestrate less than four times as much.
    expect(maxClusterChips(s)).toBeLessThan(roomy * 4 * 0.5);
    expect(s.log.some((l) => /out of desks/.test(l.text))).toBe(true);
  });

  it('drifts morale up with break space and down when overcrowded', () => {
    let calm = act(createGame(content, 1), { type: 'placeRoom', templateId: 'breakRoom', x: 2, y: 0, rot: 0 });
    let packed = createGame(content, 1);
    for (let i = 0; i < 4; i++) packed = act(packed, { type: 'hire', discipline: 'product' });
    for (let w = 0; w < 8; w++) {
      calm = act(calm, { type: 'advanceWeek' });
      packed = act(packed, { type: 'advanceWeek' });
      if (packed.pendingEvent) packed = act(packed, { type: 'resolveEvent', choiceId: packed.pendingEvent.choices[0].id });
      if (calm.pendingEvent) calm = act(calm, { type: 'resolveEvent', choiceId: calm.pendingEvent.choices[0].id });
    }
    expect(calm.hq.morale).toBeGreaterThan(75);
    expect(packed.hq.morale).toBeLessThan(40);
  });

  it('charges room upkeep and rent every week', () => {
    let s = act(createGame(content, 1), { type: 'placeRoom', templateId: 'breakRoom', x: 2, y: 0, rot: 0 });
    s = act(s, { type: 'advanceWeek' });
    expect(s.lastWeek?.facilities).toBe(500 + 1000);
  });
});

describe('moving HQ', () => {
  it('needs a funding round or $20M, then moves the rooms along with a short slowdown', () => {
    const s = act(createGame(content, 1), { type: 'placeRoom', templateId: 'breakRoom', x: 2, y: 0, rot: 0 });
    expect(applyCommand(s, content, { type: 'moveHq' }).error).toMatch(/Series A/);
    const funded = { ...s, roundsRaised: 1 };
    const moved = act(funded, { type: 'moveHq' });
    expect(moved.hq.stage).toBe('office');
    expect(moved.cash).toBe(funded.cash - 500_000);
    expect(moved.hq.rooms).toHaveLength(2);
    expect(productivity(moved, content).moveIn).toBeLessThan(1);
    const week = act(moved, { type: 'advanceWeek' });
    expect(productivity(week, content).moveIn).toBe(1);
    expect(week.lastWeek?.facilities).toBe(40_000 + 500 + 1000);
    // Next up: the HQ building, which needs Series B.
    expect(applyCommand(week, content, { type: 'moveHq' }).error).toMatch(/HQ building needs Series B/);
  });
});
