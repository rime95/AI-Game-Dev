import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, createGame, serverLayout, siteFailureFactor, type Command, type GameState } from '../src';

function act(s: GameState, cmd: Command): GameState {
  const res = applyCommand(s, content, cmd);
  if (res.error) throw new Error(res.error);
  return res.state;
}

function week(s: GameState, n = 1): GameState {
  for (let i = 0; i < n; i++) {
    if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0].id });
    s = act(s, { type: 'advanceWeek' });
  }
  return s;
}

/** A rich lab with Power 3 (and an Environmental level of our choosing). */
function licensed(env = 1): GameState {
  const s = createGame(content, 5);
  return {
    ...s,
    cash: 2_000_000_000,
    powerCapMW: 100,
    license: { ...s.license, power: { level: 3, upgrade: null }, environmental: { level: env, upgrade: null } },
  };
}

/** A campus whose construction finishes next week. */
function onlineSite(locationId = 'cascadia'): GameState {
  let s = act(licensed(3), { type: 'buildSite', locationId });
  s.sites[0].weeksLeft = 1;
  return week(s);
}

describe('data center campuses', () => {
  it('need Power level 3, and dry sites need Environmental levels', () => {
    const s = createGame(content, 5);
    expect(applyCommand({ ...s, cash: 1e9 }, content, { type: 'buildSite', locationId: 'cascadia' }).error).toMatch(/Power license level 3/);
    expect(applyCommand(licensed(1), content, { type: 'buildSite', locationId: 'plains' }).error).toMatch(/Environmental level 3/);
    expect(applyCommand(licensed(1), content, { type: 'buildSite', locationId: 'emerald' }).error).toMatch(/Environmental level 2/);
    const built = act(licensed(1), { type: 'buildSite', locationId: 'cascadia' });
    expect(built.sites[0]).toMatchObject({ status: 'building', weeksLeft: 14 });
    expect(built.sites[0].halls).toHaveLength(2);
    expect(applyCommand(built, content, { type: 'buildSite', locationId: 'cascadia' }).error).toMatch(/already have/);
  });

  it('come online after construction and charge site upkeep', () => {
    const s = onlineSite();
    expect(s.sites[0].status).toBe('online');
    expect(s.sites[0].halls.every((h) => h.status === 'online')).toBe(true);
    expect(s.lastWeek?.sites).toBe(100_000 + 2 * 20_000);
  });

  it('fill a hall with a standard layout and rack owned chips there instead of colocation', () => {
    let s = onlineSite();
    const hall = s.sites[0].halls[0].id;
    s = act(s, { type: 'fillHall', hallId: hall, coolingId: 'coolLiquid' });
    const placed = s.sites[0].halls[0].equipment;
    expect(placed.filter((e) => e.equipId === 'rack').length).toBeGreaterThan(60);
    s = act({ ...s, purchasedThisWeek: {} }, { type: 'buyChips', chipId: 'kite-k2', count: 300 });
    const layout = serverLayout(s, content);
    expect(layout.colo).toBe(0);
    expect(layout.byChip['kite-k2']).toMatchObject({ hq: 300, unattended: 300 });
    const room = layout.rooms.find((r) => r.siteId)!;
    expect(room.throttle).toBe(1);
    expect(room.powerPricePerMWh).toBe(55);
  });

  it('cold sites cool better and run at a lower PUE', () => {
    const cold = onlineSite('laurentia');
    const hall = cold.sites[0].halls[0].id;
    let s = act(cold, { type: 'placeEquipment', hallId: hall, equipId: 'coolAir', x: 0, y: 0, rot: 0 });
    s = act(s, { type: 'placeEquipment', hallId: hall, equipId: 'rack', x: 1, y: 0, rot: 0 });
    s = act(s, { type: 'placeEquipment', hallId: hall, equipId: 'pdu', x: 2, y: 0, rot: 0 });
    const room = serverLayout(s, content).rooms.find((r) => r.roomId === hall)!;
    expect(room.coolingKW).toBeCloseTo(60 * 1.25);
    expect(room.pue).toBeCloseTo(1.5 - 0.08);
  });

  it('an operations center cuts hardware failures for chips at that site', () => {
    let s = onlineSite();
    s = act(s, { type: 'fillHall', hallId: s.sites[0].halls[0].id, coolingId: 'coolLiquid' });
    s = act({ ...s, purchasedThisWeek: {} }, { type: 'buyChips', chipId: 'kite-k2', count: 200 });
    expect(siteFailureFactor(s, content, 'kite-k2')).toBeCloseTo(1.25);
    s = act(s, { type: 'buildOpsCenter', siteId: s.sites[0].id });
    expect(siteFailureFactor(s, content, 'kite-k2')).toBeCloseTo(0.75);
  });

  it('adds halls up to six and clears a hall for a refund', () => {
    let s = onlineSite();
    for (let i = 0; i < 4; i++) s = act(s, { type: 'addHall', siteId: s.sites[0].id });
    expect(applyCommand(s, content, { type: 'addHall', siteId: s.sites[0].id }).error).toMatch(/room for 6 halls/);
    expect(s.sites[0].halls.filter((h) => h.status === 'building')).toHaveLength(4);
    const hall = s.sites[0].halls[0].id;
    s = act(s, { type: 'fillHall', hallId: hall, coolingId: 'coolAir' });
    const spent = s.sites[0].halls[0].equipment.reduce((n, e) => n + e.spent, 0);
    const before = s.cash;
    s = act(s, { type: 'clearHall', hallId: hall });
    expect(s.sites[0].halls[0].equipment).toHaveLength(0);
    expect(s.cash).toBe(before + spent * 0.5);
  });
});
