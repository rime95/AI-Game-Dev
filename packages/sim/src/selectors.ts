import type { Content, Chip } from '@stm/content';
import type { GameState } from './types';

/** Chip lookups the HQ's server-room view still uses (the old game's fleet; empty in the current game). */
export function allChips(state: GameState | undefined, content: Content): Chip[] {
  return state ? [...content.chips, ...(state.customChips ?? [])] : content.chips;
}

export function getChip(content: Content, id: string, state?: GameState): Chip | undefined {
  return allChips(state, content).find((c) => c.id === id);
}

export function totalChips(state: GameState, chipId: string): number {
  return (state.fleet ?? []).filter((f) => f.chipId === chipId).reduce((n, f) => n + f.count, 0);
}

export function freeChips(state: GameState, chipId: string): number {
  return totalChips(state, chipId);
}
