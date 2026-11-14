import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, chipEfficiency, createGame, ownedChipCosts, serverLayout, TUNING, type Command, type GameState } from '../src';

function act(s: GameState, cmd: Command): GameState {
  const res = applyCommand(s, content, cmd);
  if (res.error) throw new Error(res.error);
  return res.state;
}

/** Garage with a server room on the right (tiles 2–5 × 0–2). */
function garageServerRoom(): GameState {
  return act(createGame(content, 1), { type: 'placeRoom', templateId: 'serverRoom', x: 2, y: 0, rot: 0 });
}

/** Office with a large server room (tiles 0–5 × 4–8) and lots of cash. */
function officeServerRoom(): GameState {
  let s = { ...createGame(content, 1), cash: 60_000_000, roundsRaised: 1 };
  s = act(s, { type: 'moveHq' });
  return act(s, { type: 'placeRoom', templateId: 'serverRoomLarge', x: 0, y: 4, rot: 0 });
}

const k2 = () => content.chips.find((c) => c.id === 'kite-k2')!;

describe('server rooms', () => {
  it('only takes equipment inside a server room, and the garage only fits one rack', () => {
    let s = garageServerRoom();
    expect(applyCommand(s, content, { type: 'placeEquipment', equipId: 'rack', x: 0, y: 2, rot: 0 }).error).toMatch(/inside a server room/);
    s = act(s, { type: 'placeEquipment', equipId: 'rack', x: 2, y: 0, rot: 0 });
    expect(s.hq.equipment[0].roomId).toBe(s.hq.rooms[1].id);
    expect(applyCommand(s, content, { type: 'placeEquipment', equipId: 'rack', x: 3, y: 0, rot: 0 }).error).toMatch(/can't take more than 1 rack/);
    expect(applyCommand(s, content, { type: 'placeEquipment', equipId: 'pdu', x: 2, y: 1, rot: 0 }).error).toMatch(/already there/);
    expect(applyCommand(s, content, { type: 'placeEquipment', equipId: 'coolLiquid', x: 4, y: 0, rot: 0 }).error).toMatch(/Power license level 2/);
  });

  it('racks owned chips when the rack has power, otherwise they go to colocation', () => {
    let s = garageServerRoom();
    s = act(s, { type: 'placeEquipment', equipId: 'rack', x: 2, y: 0, rot: 0 });
    s = act(s, { type: 'placeEquipment', equipId: 'coolAir', x: 3, y: 0, rot: 0 });
    s = act(s, { type: 'buyChips', chipId: k2().id, count: 40 });
    // No power unit yet: nothing switches on.
    let layout = serverLayout(s, content);
    expect(layout.colo).toBe(40);
    expect(ownedChipCosts(s, content, layout).colocation).toBe(40 * TUNING.colocationPerChipWeek);

    s = act(s, { type: 'placeEquipment', equipId: 'pdu', x: 4, y: 0, rot: 0 });
    layout = serverLayout(s, content);
    expect(layout.byChip[k2().id]).toMatchObject({ owned: 40, hq: 32, colo: 8 });
    expect(layout.rooms[0].throttle).toBe(1);
    expect(chipEfficiency(s, content, k2().id)).toBe(1);

    s = act(s, { type: 'advanceWeek' });
    expect(s.lastWeek?.colocation).toBe(8 * TUNING.colocationPerChipWeek);
  });

  it('throttles every chip in a room to cooling ÷ heat when cooling falls short', () => {
    let s = officeServerRoom();
    for (const x of [0, 1]) s = act(s, { type: 'placeEquipment', equipId: 'rack', x, y: 4, rot: 0 });
    s = act(s, { type: 'placeEquipment', equipId: 'pdu', x: 2, y: 4, rot: 0 });
    s = act(s, { type: 'placeEquipment', equipId: 'coolAir', x: 3, y: 4, rot: 0 });
    s = act(s, { type: 'buyChips', chipId: k2().id, count: 64 });
    const room = serverLayout(s, content).rooms[0];
    expect(room.itKW).toBeCloseTo(64);
    expect(room.throttle).toBeCloseTo(60 / 64);
    expect(chipEfficiency(s, content, k2().id)).toBeCloseTo(60 / 64);

    // A second air cooler fixes it.
    s = act(s, { type: 'placeEquipment', equipId: 'coolAir', x: 4, y: 4, rot: 0 });
    expect(serverLayout(s, content).rooms[0].throttle).toBe(1);
  });

  it('bills HQ racks at the room PUE and charges equipment upkeep', () => {
    let s = garageServerRoom();
    s = act(s, { type: 'placeEquipment', equipId: 'rack', x: 2, y: 0, rot: 0 });
    s = act(s, { type: 'placeEquipment', equipId: 'coolAir', x: 3, y: 0, rot: 0 });
    s = act(s, { type: 'placeEquipment', equipId: 'pdu', x: 4, y: 0, rot: 0 });
    s = act(s, { type: 'buyChips', chipId: k2().id, count: 32 });
    const perKWWeek = (168 * TUNING.powerPricePerMWh) / 1000;
    expect(ownedChipCosts(s, content).power).toBeCloseTo(32 * 1.5 * perKWWeek);
    s = act(s, { type: 'advanceWeek' });
    // Desk pod + server room + rack + cooler + power unit.
    expect(s.lastWeek?.facilities).toBe(500 + 2000 + 200 + 300 + 300);
  });

  it('demolishing a server room clears and refunds its equipment', () => {
    let s = garageServerRoom();
    s = act(s, { type: 'placeEquipment', equipId: 'rack', x: 2, y: 0, rot: 0 });
    const before = s.cash;
    s = act(s, { type: 'demolishRoom', roomId: s.hq.rooms[1].id });
    expect(s.hq.equipment).toHaveLength(0);
    expect(s.cash).toBe(before + (100_000 + 20_000) * 0.5);
  });

  it('keeps equipment in its room when moving HQ', () => {
    let s = garageServerRoom();
    s = act(s, { type: 'placeEquipment', equipId: 'rack', x: 3, y: 1, rot: 0 });
    s = act({ ...s, roundsRaised: 1 }, { type: 'moveHq' });
    expect(s.hq.equipment[0]).toMatchObject({ x: 3, y: 1 });
  });
});
