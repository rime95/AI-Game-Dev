import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { createGame, type GameState } from '@stm/sim';
import { clockHold, viewForTab, type ClockBlockers } from './time';

const game = (): GameState => createGame(content, 1, 'Test');
const free = (g: GameState | null): ClockBlockers => ({
  game: g,
  pauseOpen: false,
  building: false,
  milestoneOpen: false,
  revealOpen: false,
  memorialOpen: false,
});

describe('viewForTab', () => {
  it('sends each facility tab to its own world view', () => {
    const g = game();
    expect(viewForTab('hq', g, 'map', null)).toBe('hq');
    expect(viewForTab('overview', g, 'map', null)).toBe('hq');
    expect(viewForTab('compute', g, 'hq', null)).toBe('campus');
    expect(viewForTab('fab', g, 'hq', null)).toBe('fab');
    expect(viewForTab('sites', g, 'hq', null)).toBe('map');
  });

  it('reopens the campus we were looking at, if it still exists', () => {
    const g = game();
    expect(viewForTab('sites', g, 'hq', 'gone')).toBe('map');
    const withSite = { ...g, sites: [{ id: 's1' } as GameState['sites'][number]] };
    expect(viewForTab('sites', withSite, 'hq', 's1')).toBe('site');
  });

  it('leaves the view alone for tabs without a place', () => {
    const g = game();
    expect(viewForTab('license', g, 'map', null)).toBe('map');
    expect(viewForTab('deals', g, 'fab', null)).toBe('fab');
  });
});

describe('clockHold', () => {
  it('runs when nothing is open', () => {
    expect(clockHold(free(game()))).toBeNull();
  });

  it('holds for decisions, menus, build mode and announcements', () => {
    const g = game();
    expect(clockHold({ ...free(g), pauseOpen: true })).toBe('menu open');
    expect(clockHold({ ...free(g), building: true })).toBe('building');
    expect(clockHold({ ...free(g), milestoneOpen: true })).toBe('news');
    expect(clockHold({ ...free(g), revealOpen: true })).toBe('tape-out');
    expect(clockHold(free({ ...g, pendingEvent: {} as GameState['pendingEvent'] }))).toBe('decision waiting');
    expect(clockHold(free({ ...g, status: 'bankrupt' } as GameState))).toBe('game over');
    expect(clockHold(free(null))).toBe('loading');
  });
});
