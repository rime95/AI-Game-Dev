import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, availableDeals, createGame, previewTraining, type GameState } from '../src';

function step(s: GameState, weeks = 1): GameState {
  for (let i = 0; i < weeks; i++) {
    if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
    s = applyCommand(s, content, { type: 'advanceWeek' }).state;
  }
  return s;
}

/** A dominant lab: rivals far behind, so some are "struggling" and antitrust is in play. */
function dominantLab(seed = 1): GameState {
  const s = createGame(content, seed);
  s.week = 60;
  s.cash = 50e9;
  s.models.push({ id: 'm1', name: 'Apex', archId: 'dense', paramsB: 400, tokensB: 8000, precision: 'fp8', capability: 26.5, score: 70, releasedWeek: 50 });
  s.liveModelId = 'm1';
  s.users = 100e6;
  return s;
}

describe('acquisitions', () => {
  it('offers startups as they appear, at prices that grow over time', () => {
    const s = createGame(content, 1);
    const ids = availableDeals(s, content).map((d) => d.id);
    expect(ids).toContain('tokenmill');
    expect(ids).not.toContain('deepfold');
    const later = { ...s, week: 50 };
    const tokenmillLater = availableDeals(later, content).find((d) => d.id === 'tokenmill')!;
    expect(tokenmillLater.price).toBeGreaterThan(availableDeals(s, content).find((d) => d.id === 'tokenmill')!.price);
  });

  it('pays up front and delivers after integration', () => {
    let s = createGame(content, 1);
    const data = s.dataTokensB;
    s = applyCommand(s, content, { type: 'acquire', dealId: 'tokenmill' }).state;
    expect(s.cash).toBe(8_000_000 - 3_000_000);
    expect(availableDeals(s, content).some((d) => d.id === 'tokenmill')).toBe(false);
    expect(applyCommand(s, content, { type: 'acquire', dealId: 'tokenmill' }).error).toBeDefined();
    s = step(s, 2);
    expect(s.dataTokensB).toBe(data + 500);
    expect(s.acquired).toContain('tokenmill');
  });

  it('IP raises effective compute on future runs', () => {
    let s = createGame(content, 2);
    s.week = 10;
    s.cash = 100e6;
    s = applyCommand(s, content, { type: 'rentChips', chipId: 'kite-k1', count: 64 }).state;
    const spec = { name: 'X', archId: 'dense', paramsB: 7, tokensB: 140, precision: 'fp16' as const, chipId: 'kite-k1', chipCount: 64 };
    const before = previewTraining(s, content, spec).effectiveCompute;
    s = applyCommand(s, content, { type: 'acquire', dealId: 'quanta-labs' }).state;
    s = step(s, 6);
    expect(s.ipBonus).toBeCloseTo(0.08);
    expect(previewTraining(s, content, spec).effectiveCompute).toBeGreaterThan(before * 1.07);
  });

  it('culture clash can cost half the acquired team; ops engineers reduce the risk', () => {
    const base = createGame(content, 1);
    const risky = availableDeals(base, content).find((d) => d.id === 'gradient-garage')!;
    const withOps = availableDeals({ ...base, staff: { ...base.staff, ops: 6 } }, content).find((d) => d.id === 'gradient-garage')!;
    expect(withOps.clashChance).toBeLessThan(risky.clashChance);
    let clashes = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = applyCommand(createGame(content, seed), content, { type: 'acquire', dealId: 'gradient-garage' }).state;
      const engineers = s.staff.modelEng;
      s = step(s, 4);
      const gained = s.staff.modelEng - engineers;
      expect([1, 3]).toContain(gained);
      if (gained === 1) clashes++;
    }
    expect(clashes).toBeGreaterThan(0);
    expect(clashes).toBeLessThan(20);
  });

  it('struggling rivals can be bought out of the race, subject to antitrust', () => {
    const s = dominantLab();
    const rivalDeals = availableDeals(s, content).filter((d) => d.kind === 'rival');
    expect(rivalDeals.length).toBeGreaterThan(0);
    const deal = rivalDeals[0]!;
    expect(deal.antitrustChance).toBeGreaterThan(0);
    // A top compliance team makes approval likely.
    const compliant = { ...s, license: { ...s.license, compliance: { level: 5, upgrade: null } } };
    expect(availableDeals(compliant, content).find((d) => d.id === deal.id)!.antitrustChance).toBeLessThan(deal.antitrustChance);

    let completed = 0;
    let blocked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let g = dominantLab(seed);
      const cash = g.cash;
      g = applyCommand(g, content, { type: 'acquire', dealId: deal.id }).state;
      g = step(g, 16);
      if (g.acquired.includes(deal.id)) {
        completed++;
        expect(g.rivals.some((r) => r.id === deal.rivalId)).toBe(false);
      } else {
        blocked++;
        expect(g.rivals.some((r) => r.id === deal.rivalId)).toBe(true);
        expect(g.cash).toBeLessThan(cash); // break fee lost
      }
    }
    expect(completed + blocked).toBe(12);
    expect(blocked).toBeGreaterThan(0);
  });

  it('acquired power survives later license upgrades', () => {
    let s = createGame(content, 3);
    s.week = 40;
    s.cash = 1e9;
    s = applyCommand(s, content, { type: 'acquire', dealId: 'northwind-power' }).state;
    s = step(s, 10);
    expect(s.powerCapMW).toBe(5 + 200);
    s = applyCommand(s, content, { type: 'upgradeLicense', track: 'power' }).state;
    s = step(s, 4);
    expect(s.powerCapMW).toBe(20 + 200);
  });
});
