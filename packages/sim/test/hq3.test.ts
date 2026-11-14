import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  createGame,
  effectiveStaff,
  fundingCheck,
  migrateSave,
  previewChip,
  seatedStaff,
  type Command,
  type GameState,
} from '../src';

function act(s: GameState, cmd: Command): GameState {
  const res = applyCommand(s, content, cmd);
  if (res.error) throw new Error(res.error);
  return res.state;
}

/** A rich lab already in the given HQ stage. */
function at(stage: string, rounds = 3): GameState {
  const s = createGame(content, 1);
  return { ...s, cash: 900_000_000, roundsRaised: rounds, hq: { ...s.hq, stage } };
}

describe('multi-floor HQ', () => {
  it('has three floors in the HQ building; each floor is its own grid', () => {
    let s = at('hqBuilding');
    s = act(s, { type: 'placeRoom', templateId: 'cafeteria', x: 5, y: 5, rot: 0, floor: 1 });
    s = act(s, { type: 'placeRoom', templateId: 'cafeteria', x: 5, y: 5, rot: 0, floor: 2 });
    expect(s.hq.rooms.filter((r) => r.templateId === 'cafeteria').map((r) => r.floor)).toEqual([1, 2]);
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'cafeteria', x: 5, y: 5, rot: 0, floor: 1 }).error).toMatch(/already there/);
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'deskPod', x: 0, y: 0, rot: 0, floor: 3 }).error).toMatch(/no such floor/);
  });

  it('keeps the cafeteria and boardroom out of the garage', () => {
    const s = createGame(content, 1);
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'boardroom', x: 2, y: 0, rot: 0 }).error).toMatch(/needs at least the office/);
  });

  it('moves from the HQ building to the six-floor campus with Series C', () => {
    let s = act(at('hqBuilding', 2), { type: 'placeRoom', templateId: 'deskPod', x: 3, y: 3, rot: 0, floor: 2 });
    expect(applyCommand(s, content, { type: 'moveHq' }).error).toMatch(/Series C/);
    s = act({ ...s, roundsRaised: 3 }, { type: 'moveHq' });
    expect(s.hq.stage).toBe('hqCampus');
    expect(s.hq.rooms.find((r) => r.x === 3 && r.y === 3)?.floor).toBe(2);
    expect(applyCommand(s, content, { type: 'placeRoom', templateId: 'deskPod', x: 0, y: 0, rot: 0, floor: 5 }).error).toBeUndefined();
  });
});

describe('specialist rooms', () => {
  it('ops, product and hardware staff only do specialist work when seated', () => {
    let s = { ...at('office'), staff: { research: 0, modelEng: 1, hardwareEng: 2, product: 3, ops: 2 } };
    s = act(s, { type: 'advanceWeek' });
    if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0].id });
    expect(effectiveStaff(s, 'ops')).toBe(0);
    expect(effectiveStaff(s, 'product')).toBe(0);
    s = act(s, { type: 'placeRoom', templateId: 'opsRoom', x: 0, y: 4, rot: 0 });
    s = act(s, { type: 'placeRoom', templateId: 'productStudio', x: 4, y: 4, rot: 0 });
    expect(seatedStaff(s, 'ops')).toBe(2);
    expect(seatedStaff(s, 'product')).toBe(3);
    expect(effectiveStaff(s, 'product')).toBeCloseTo(3 * s.hq.productivity);
    // Model engineers have no room of their own: they work from any desk.
    expect(effectiveStaff(s, 'modelEng')).toBeCloseTo(1 * s.hq.productivity);
  });

  it('tape-outs need hardware engineers seated in a hardware lab', () => {
    let s = { ...at('office'), staff: { ...createGame(content, 1).staff, hardwareEng: 2 } };
    const design = { name: 'X1', nodeId: 'n7', split: { compute: 0.5, sram: 0.2, memory: 0.2, interconnect: 0.1 }, fp8: true, fp4: false };
    expect(previewChip(s, content, design).errors.join()).toMatch(/seated in a hardware lab/);
    s = act(s, { type: 'placeRoom', templateId: 'hardwareLab', x: 0, y: 4, rot: 0 });
    expect(previewChip(s, content, design).errors.join()).not.toMatch(/hardware/);
  });
});

describe('rooms as requirements', () => {
  it('Series B investors want a boardroom', () => {
    const s = at('office', 1);
    const label = (g: GameState) => fundingCheck(g, content).checks.find((c) => /boardroom/.test(c.label));
    expect(label(s)?.ok).toBe(false);
    expect(label(act(s, { type: 'placeRoom', templateId: 'boardroom', x: 0, y: 4, rot: 0 }))?.ok).toBe(true);
    expect(label(at('garage', 0))).toBeUndefined();
  });

  it('Compliance and Safety level 3 need a legal office and a secure vault', () => {
    let s = at('office');
    s = { ...s, license: { ...s.license, compliance: { level: 2, upgrade: null }, safety: { level: 2, upgrade: null } } };
    expect(applyCommand(s, content, { type: 'upgradeLicense', track: 'compliance' }).error).toMatch(/legal office/);
    expect(applyCommand(s, content, { type: 'upgradeLicense', track: 'safety' }).error).toMatch(/secure vault/);
    s = act(s, { type: 'placeRoom', templateId: 'legalOffice', x: 0, y: 4, rot: 0 });
    expect(applyCommand(s, content, { type: 'upgradeLicense', track: 'compliance' }).error).toBeUndefined();
  });
});

describe('save upgrade to v13', () => {
  it('refunds and rebuilds the old one-floor HQ building, and seats specialists', () => {
    const s = createGame(content, 2);
    const old = {
      ...s,
      version: 12,
      staff: { research: 6, modelEng: 4, hardwareEng: 2, product: 2, ops: 2 },
      hq: {
        stage: 'hqBuilding',
        rooms: [{ id: 'r1', templateId: 'serverRoom', x: 26, y: 20, rot: 0, tier: 1, spent: 100_000 }],
        equipment: [{ id: 'e1', equipId: 'rack', roomId: 'r1', x: 26, y: 20, rot: 0, spent: 20_000 }],
        morale: 70,
        moveInWeeks: 0,
        productivity: 1,
        research: 0,
      },
    };
    const res = migrateSave(JSON.parse(JSON.stringify(old)), content);
    if (!('state' in res)) throw new Error(res.error);
    expect(res.state.cash).toBe(s.cash + 120_000);
    expect(res.state.hq.equipment).toHaveLength(0);
    expect(res.state.hq.rooms.every((r) => r.x < 20 && r.y < 14)).toBe(true);
    expect(seatedStaff(res.state, 'ops')).toBe(2);
    expect(seatedStaff(res.state, 'research')).toBe(6);
  });
});
