import type { GameState } from './types';

/** The save format this build writes. Bump it whenever GameState changes shape, and add a migration below. */
export const SAVE_VERSION = 10;

/** Oldest save version this build can still upgrade. Earlier prototype saves can't be loaded. */
export const OLDEST_MIGRATABLE_VERSION = 9;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySave = Record<string, any>;

/** Each migration upgrades a save from version N to N + 1. */
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  9: (s) => ({ ...s, version: 10, companyName: 'Your lab' }),
};

export type MigrationResult = { state: GameState; migratedFrom?: number } | { error: string };

/** Validate and upgrade a parsed save to the current version. */
export function migrateSave(raw: unknown): MigrationResult {
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
    s = step(s);
  }
  for (const key of ['week', 'cash', 'rivals', 'license', 'suite']) {
    if (!(key in s)) return { error: 'This save is damaged (missing data).' };
  }
  return from === SAVE_VERSION ? { state: s as GameState } : { state: s as GameState, migratedFrom: from };
}
