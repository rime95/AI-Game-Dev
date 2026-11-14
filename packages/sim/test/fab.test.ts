import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, createGame, deriveChip, fabChipShare, fabError, lineCapacity, type ChipDesign, type Command, type GameState } from '../src';
import { seated } from './helpers';

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

const design: ChipDesign = { name: 'Sandpiper', nodeId: 'n7', split: { compute: 0.55, sram: 0.15, memory: 0.2, interconnect: 0.1 }, fp8: true, fp4: false };

/** A late-game lab that qualifies for a fab and owns one taped-out n7 design. */
function eligible(): GameState {
  let s = createGame(content, 8);
  s = seated(s, { hardwareEng: 4 });
  s.cash = 10_000_000_000;
  s.roundsRaised = 4;
  s.powerCapMW = 300;
  s.license.power.level = 4;
  s.license.environmental.level = 3;
  const chip = deriveChip(content.nodes[0]!, design, 'custom-fab', 0.8);
  s.customChips.push(chip);
  s.customChipInfo[chip.id] = { design, yieldRate: 0.8 };
  return s;
}

/** Fab online with one running n7 line making our chip. */
function running(): GameState {
  let s = act(eligible(), { type: 'buildFab' });
  s.fab!.weeksLeft = 1;
  s = week(s);
  s = act(s, { type: 'addFabLine', nodeId: 'n7' });
  s.fab!.lines[0]!.weeksLeft = 1;
  s = week(s);
  return act(s, { type: 'setFabLineChip', lineId: s.fab!.lines[0]!.id, chipId: 'custom-fab' });
}

describe('the fab', () => {
  it('needs Series D, Power 4, Environmental 3 and four seated hardware engineers', () => {
    const base = createGame(content, 8);
    expect(fabError({ ...base, roundsRaised: 3 }, content)).toMatch(/Series D/);
    const s = eligible();
    expect(fabError({ ...s, license: { ...s.license, power: { level: 3, upgrade: null } } }, content)).toMatch(/Power level 4/);
    expect(fabError({ ...s, license: { ...s.license, environmental: { level: 2, upgrade: null } } }, content)).toMatch(/Environmental level 3/);
    expect(fabError(seated(s, { hardwareEng: 2 }), content)).toMatch(/hardware engineers/);
    expect(fabError(s, content)).toBeNull();
    const built = act(s, { type: 'buildFab' });
    expect(built.cash).toBe(s.cash - 2_500_000_000);
    expect(built.fab).toMatchObject({ status: 'building', weeksLeft: 30 });
  });

  it('makes chips into the fleet, and yield climbs as wafers pile up', () => {
    let s = week(running());
    const first = s.fab!.lines[0]!.lastWeek!;
    expect(first.chips).toBeGreaterThan(0);
    expect(first.toFleet).toBe(first.chips);
    expect(first.yieldRate).toBeCloseTo(0.35, 1);
    expect(s.fleet.find((f) => f.chipId === 'custom-fab' && f.owned)?.count).toBe(first.chips);
    expect(s.lastWeek!.fabCosts).toBeGreaterThan(first.chips * first.unitCost);
    s = week(s, 30);
    const later = s.fab!.lines[0]!.lastWeek!;
    expect(later.yieldRate).toBeGreaterThan(first.yieldRate + 0.2);
    expect(later.unitCost).toBeLessThan(first.unitCost);
    expect(fabChipShare(s)).toBe(1);
  });

  it('sells on the chip market, up to what the market will take', () => {
    let s = running();
    s = act(s, { type: 'setFabLineMode', lineId: s.fab!.lines[0]!.id, mode: 'sell' });
    for (const st of ['litho', 'etch', 'test', 'packaging'] as const) {
      s = act(s, { type: 'upgradeFabStage', lineId: s.fab!.lines[0]!.id, stage: st });
      s = act(s, { type: 'upgradeFabStage', lineId: s.fab!.lines[0]!.id, stage: st });
      s = act(s, { type: 'upgradeFabStage', lineId: s.fab!.lines[0]!.id, stage: st });
    }
    s.fab!.lines[0]!.wafers = 200_000; // a mature line
    s.week = 60; // HBM supply has grown past what the market takes
    s = week(s);
    const lw = s.fab!.lines[0]!.lastWeek!;
    expect(lw.sold).toBe(lw.chips);
    expect(lw.bottleneck).toBe('demand');
    expect(s.lastWeek!.fabSales).toBeCloseTo(lw.sold * lw.unitCost * 1.3, -2);
  });

  it('the slowest tool group sets throughput; upgrading it moves the bottleneck', () => {
    const s = running();
    const line = s.fab!.lines[0]!;
    const node = content.nodes[0]!;
    expect(lineCapacity(content, line, node).slowest).toBe('litho');
    const up = act(s, { type: 'upgradeFabStage', lineId: line.id, stage: 'litho' });
    expect(lineCapacity(content, up.fab!.lines[0]!, node).slowest).toBe('etch');
    expect(lineCapacity(content, up.fab!.lines[0]!, node).wafers).toBe(150);
  });

  it('retooling to a newer node costs half a line, takes weeks and restarts yield learning', () => {
    let s = running();
    s.week = 80;
    s.fab!.lines[0]!.wafers = 50_000;
    const before = s.cash;
    s = act(s, { type: 'retoolFabLine', lineId: s.fab!.lines[0]!.id, nodeId: 'n5' });
    expect(s.cash).toBe(before - 250_000_000);
    expect(s.fab!.lines[0]).toMatchObject({ status: 'retooling', wafers: 0, chipId: null, nodeId: 'n5' });
    expect(applyCommand(s, content, { type: 'setFabLineChip', lineId: s.fab!.lines[0]!.id, chipId: 'custom-fab' }).error).toMatch(/different process node/);
  });

  it('fab incidents hit the line they happened on', () => {
    let s = running();
    const ev = content.events.find((e) => e.id === 'fab-contamination')!;
    s.pendingEvent = { eventId: ev.id, deck: ev.deck, speaker: ev.speaker, title: ev.title, body: ev.body, choices: ev.choices, fabLineId: s.fab!.lines[0]!.id };
    s = act(s, { type: 'resolveEvent', choiceId: 'scrap' });
    expect(s.fab!.lines[0]!.pausedWeeks).toBe(2);
    s = week(s);
    expect(s.fab!.lines[0]!.lastWeek!.bottleneck).toBe('paused');
  });

  it('counts the fab against site power', () => {
    const s = running();
    // 60 MW for the fab plus 15 MW per line.
    expect(applyCommand({ ...s, powerCapMW: 70 }, content, { type: 'buyChips', chipId: 'kite-k1', count: 10 }).error).toMatch(/site power/);
  });
});
