import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, createGame, migrateSave, SAVE_VERSION } from '../src';

describe('save migrations', () => {
  it('loads current saves unchanged, through a JSON round trip', () => {
    const s = createGame(content, 4, 'Quartz Mind');
    const res = migrateSave(JSON.parse(JSON.stringify(s)));
    expect('state' in res && res.state).toEqual(s);
    expect('state' in res && res.migratedFrom).toBeUndefined();
  });

  it('upgrades a v9 save (adds the company name) and it keeps playing', () => {
    const { companyName: _drop, ...rest } = createGame(content, 4, 'X');
    const v9 = { ...rest, version: 9 };
    const res = migrateSave(v9);
    if (!('state' in res)) throw new Error(res.error);
    expect(res.migratedFrom).toBe(9);
    expect(res.state.version).toBe(SAVE_VERSION);
    expect(res.state.companyName).toBe('Your lab');
    expect(applyCommand(res.state, content, { type: 'advanceWeek' }).error).toBeUndefined();
  });

  it('refuses prototype, future, damaged and foreign files with a clear message', () => {
    expect(migrateSave({ ...createGame(content, 1), version: 3 })).toEqual({ error: expect.stringMatching(/early prototype/) });
    expect(migrateSave({ ...createGame(content, 1), version: SAVE_VERSION + 1 })).toEqual({ error: expect.stringMatching(/newer version/) });
    const { rivals: _r, ...damaged } = createGame(content, 1);
    expect(migrateSave(damaged)).toEqual({ error: expect.stringMatching(/damaged/) });
    expect(migrateSave('hello')).toEqual({ error: expect.stringMatching(/not a Sand to Mind save/) });
  });

  it('uses the company name', () => {
    const s = createGame(content, 1, '  Lumen Works  ');
    expect(s.companyName).toBe('Lumen Works');
    expect(createGame(content, 1, '   ').companyName).toBe('Your lab');
  });
});
