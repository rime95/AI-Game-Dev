import type { GameState, v2 } from '@stm/sim';

/**
 * The HQ view and build mode were written for the old game state. They only read the HQ, cash,
 * how many people do what, and a few flags, so a v2 game is shown through this small adapter:
 * people on a project sit in the labs and at the workbench, researchers in research labs, and
 * everyone else at desks.
 */
export function hqShim(g: v2.GameV2): GameState {
  const staff = { research: 0, modelEng: 0, hardwareEng: 0, product: 0, ops: 0 };
  for (const p of g.staff) {
    if (p.task === 'research') staff.research++;
    else if (p.task) staff.hardwareEng++;
    else staff.product++;
  }
  return {
    version: 99,
    era: 'founding',
    status: 'playing',
    week: g.day,
    cash: g.cash,
    companyName: g.companyName,
    hq: g.hq,
    staff,
    fleet: [],
    customChips: [],
    sites: [],
    training: null,
    pendingEvent: null,
    log: [],
    nextId: g.nextId,
  } as unknown as GameState;
}
