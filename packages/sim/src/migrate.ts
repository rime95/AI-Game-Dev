import type { Content } from '@stm/content';
import type { GameState } from './types';
import { autoFurnish, initialHq, refreshHq } from './hq';
import { rivalCeiling } from './game';
import { scoreNow } from './selectors';

/** The save format this build writes. Bump it whenever GameState changes shape, and add a migration below. */
export const SAVE_VERSION = 18;

/** Oldest save version this build can still upgrade. Earlier prototype saves can't be loaded. */
export const OLDEST_MIGRATABLE_VERSION = 9;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySave = Record<string, any>;

/** Each migration upgrades a save from version N to N + 1. */
const MIGRATIONS: Record<number, (s: AnySave, content: Content) => AnySave> = {
  9: (s) => ({ ...s, version: 10, companyName: 'Your lab' }),
  // v11: the HQ grid. Funded labs start in the office; rooms are set up for the current team.
  10: (s, content) => {
    const stage = (s.roundsRaised ?? 0) >= 1 && content.hq.stages[1] ? content.hq.stages[1].id : content.hq.stages[0].id;
    const next: AnySave = { ...s, version: 11, hq: { ...initialHq(content), stage, rooms: [] } };
    next.lastWeek = s.lastWeek ? { ...s.lastWeek, facilities: 0 } : null;
    autoFurnish(next as GameState, content);
    refreshHq(next as GameState, content);
    delete next.hq.equipment;
    return next;
  },
  // v12: server rooms. Owned chips start out in colocation.
  11: (s) => ({
    ...s,
    version: 12,
    hq: { ...s.hq, equipment: [] },
    lastWeek: s.lastWeek ? { ...s.lastWeek, colocation: 0 } : null,
  }),
  // v13: floors and specialist rooms. The interim one-floor HQ building becomes three floors, so its
  // layout is refunded and rebuilt; everyone else keeps their rooms. Ops, product and hardware staff
  // now need their own rooms, which are set up free of charge where they fit.
  12: (s, content) => {
    const hq = { ...s.hq, rooms: s.hq.rooms.map((r: AnySave) => ({ ...r, floor: 0 })) };
    delete hq.research;
    const next: AnySave = { ...s, version: 13, hq };
    if (hq.stage === 'hqBuilding') {
      const spent = [...hq.rooms, ...hq.equipment].reduce((n: number, x: AnySave) => n + (x.spent ?? 0), 0);
      next.cash += spent;
      hq.rooms = [];
      hq.equipment = [];
    }
    autoFurnish(next as GameState, content);
    refreshHq(next as GameState, content);
    return next;
  },
  // v14: custom chips remember their design and yield. Older chips have none (Blueprint shows their stats only).
  13: (s) => ({ ...s, version: 14, customChipInfo: {} }),
  // v15: data center campuses.
  14: (s) => ({ ...s, version: 15, sites: [], lastWeek: s.lastWeek ? { ...s.lastWeek, sites: 0 } : null }),
  // v16: our own fab.
  15: (s) => ({ ...s, version: 16, fab: null, lastWeek: s.lastWeek ? { ...s.lastWeek, fabCosts: 0, fabSales: 0 } : null }),
  // v17: rivals follow the player. Anyone ahead of their new place drops back just behind our best model.
  16: (s, content) => {
    const next: AnySave = { ...s, version: 17, rivals: s.rivals.map((r: AnySave) => ({ ...r })) };
    for (const r of next.rivals) {
      const def = content.rivals.find((d) => d.id === r.id);
      const ceiling = rivalCeiling(next as GameState, def?.trail ?? 0.3);
      if (r.capability > ceiling) {
        r.capability = ceiling;
        r.score = Math.round(scoreNow(next as GameState, ceiling) * 10) / 10;
      }
    }
    return next;
  },
  // v18: eras. Every older save is an AI-era company with no chip-company years behind it.
  17: (s) => ({ ...s, version: 18, era: 'ai', founding: null }),
};

export type MigrationResult = { state: GameState; migratedFrom?: number } | { error: string };

/** Validate and upgrade a parsed save to the current version. */
export function migrateSave(raw: unknown, content: Content): MigrationResult {
  if (!raw || typeof raw !== 'object') return { error: 'This file is not a Sand to Mind save.' };
  let s = raw as AnySave;
  const from = s.version;
  if (typeof from !== 'number') return { error: 'This file is not a Sand to Mind save.' };
  if (from > SAVE_VERSION) return { error: `This save is from a newer version of the game (v${from}). Update the game to load it.` };
  if (from < OLDEST_MIGRATABLE_VERSION)
    return { error: `This save is from an early prototype (v${from}) and can't be loaded in this version.` };
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return { error: `No upgrade path from save version ${s.version}.` };
    s = step(s, content);
  }
  for (const key of ['week', 'cash', 'rivals', 'license', 'suite', 'hq']) {
    if (!(key in s)) return { error: 'This save is damaged (missing data).' };
  }
  return from === SAVE_VERSION ? { state: s as GameState } : { state: s as GameState, migratedFrom: from };
}
