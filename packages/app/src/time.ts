import type { GameState } from '@stm/sim';
import type { Speed } from './saves';

export type Tab =
  | 'overview'
  | 'hq'
  | 'sites'
  | 'fab'
  | 'compute'
  | 'silicon'
  | 'license'
  | 'models'
  | 'products'
  | 'team'
  | 'deals'
  | 'rivals';
export type WorldView = 'hq' | 'campus' | 'map' | 'site' | 'fab';

/**
 * Which world view a nav tab shows. One navigation drives both the panel and the world.
 * Silicon, Models and Products draw their own scenes (blueprint, showcase), so they keep the view as is.
 */
export function viewForTab(tab: Tab, game: GameState | null, current: WorldView, siteId: string | null): WorldView {
  switch (tab) {
    case 'overview':
    case 'hq':
    case 'team':
      return 'hq';
    case 'sites':
      return siteId && game?.sites.some((s) => s.id === siteId) ? 'site' : 'map';
    case 'fab':
      return 'fab';
    case 'compute':
      return 'campus';
    default:
      return current;
  }
}

/** Milliseconds between weeks at each speed. */
export const TICK_MS: Record<Exclude<Speed, 0>, number> = { 1: 3000, 2: 1500, 4: 750 };

export interface ClockBlockers {
  game: GameState | null;
  pauseOpen: boolean;
  building: boolean;
  milestoneOpen: boolean;
  revealOpen: boolean;
  memorialOpen: boolean;
}

/** Why the clock is held right now, or null when it may run. */
export function clockHold(b: ClockBlockers): string | null {
  if (!b.game) return 'loading';
  if (b.game.status !== 'playing') return 'game over';
  if (b.pauseOpen) return 'menu open';
  if (b.game.pendingEvent) return 'decision waiting';
  if (b.milestoneOpen) return 'news';
  if (b.revealOpen) return 'tape-out';
  if (b.memorialOpen) return 'memorial';
  if (b.building) return 'building';
  return null;
}
