import { content } from '@stm/content';
import { autoFurnish, refreshHq, type GameState } from '../src';

/**
 * A copy of the game with the staff changed and everyone given a seat in the right room
 * (in the biggest HQ, rooms placed free). For tests about staff bonuses, not about the HQ.
 */
export function seated(s: GameState, staff: Partial<GameState['staff']> = {}): GameState {
  const next = structuredClone({ ...s, staff: { ...s.staff, ...staff } });
  next.hq.stage = content.hq.stages[content.hq.stages.length - 1].id;
  autoFurnish(next, content);
  refreshHq(next, content);
  return next;
}
