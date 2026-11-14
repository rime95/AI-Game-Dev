import { content } from '@stm/content';
import { aiReady, fundingCheck, goalMet, type GameState } from '@stm/sim';
import type { Tab } from './time';

export interface NextStep {
  /** Changes whenever the step does, so the pill can animate in. */
  key: string;
  text: string;
  /** Where the step happens; clicking the pill goes there. */
  tab: Tab;
  /** Sub-tab to open, if the step lives on one. */
  sub?: string;
  /** Step number on the first-hour path, for the "3 of 9" counter. */
  n: number;
  /** How many steps the path has. */
  of?: number;
}

/** The chip-company years: the first chip, then whatever the current chapter asks for next. */
function foundingStep(game: GameState): NextStep {
  const f = game.founding!;
  const step = (key: string, text: string, tab: NextStep['tab'], n = 0): NextStep => ({ key, text, tab, n });
  if (aiReady(content, f)) return step('ai', 'The AI chapter is ready: begin it from Company', 'overview');
  const first = f.projects[0];
  if (!f.products.length && !first) return step('first-chip', 'Design your first chip: a processor or a graphics chip', 'chip');
  if (!f.products.length && first)
    return step('wait', `${first.design.name} is at the factory: ${first.monthsLeft} month${first.monthsLeft === 1 ? '' : 's'} to go`, 'chip');
  const ch = content.founding.chapters[f.chapter.index];
  const goal = ch?.goals.find((g) => !f.chapter.done.includes(g.id) && !goalMet(game, content, g));
  if (!ch || !goal) return step('grow', 'Keep designing better chips', 'chip');
  const TAB: Record<string, NextStep['tab']> = { chips: 'chip', review: 'chip', typeShipped: 'chip', sales: 'chip', stage: 'hq', staff: 'team', research: 'research', leadSegment: 'rivals' };
  return step(`${ch.id}-${goal.id}`, `${ch.name}: ${goal.label}`, TAB[goal.kind] ?? 'chip');
}

export const GUIDE_STEPS = 9;

const hasRoom = (game: GameState, templateId: string) => game.hq.rooms.some((r) => r.templateId === templateId);

/**
 * The one thing to do next, from a fresh garage to designing our own chip. After that the
 * "Ways to win" goals take over and this returns a pointer to them.
 */
export function nextStep(game: GameState): NextStep {
  if (game.era === 'founding' && game.founding) return foundingStep(game);
  if (fundingCheck(game, content).canRaise)
    return { key: `raise-${game.roundsRaised}`, text: 'Investors are calling: raise your next funding round', tab: 'overview', sub: 'summary', n: 0 };
  if (!game.fleet.length) return { key: 'rent', text: 'Rent your first chips', tab: 'compute', sub: 'market', n: 1 };
  if (!game.models.length && !game.training) return { key: 'train', text: 'Train your first model', tab: 'models', sub: 'train', n: 2 };
  if (!game.models.length && game.training)
    return {
      key: 'wait',
      text: `Wait for ${game.training.spec.name} to finish training (${Math.round((game.training.flopsDone / game.training.flopsTotal) * 100)}%)`,
      tab: 'models',
      sub: 'train',
      n: 3,
    };
  if (!game.consumer.launched) {
    if (game.staff.product < 1) return { key: 'hire-pm', text: 'Hire a product manager to launch our app', tab: 'team', n: 4 };
    return { key: 'app', text: 'Launch our chat app', tab: 'products', n: 4 };
  }
  if (!hasRoom(game, 'deskPod') && game.staff.research + game.staff.modelEng + game.staff.product + game.staff.ops + game.staff.hardwareEng > 3)
    return { key: 'desks', text: 'Build desks in HQ for the growing team', tab: 'hq', n: 5 };
  if (!hasRoom(game, 'researchLab')) return { key: 'lab', text: 'Build a research lab in HQ: smarter models', tab: 'hq', n: 5 };
  if (game.roundsRaised === 0) return { key: 'series-a', text: 'Grow to 1M users to raise a Series A', tab: 'overview', sub: 'summary', n: 6 };
  if (game.models.length < 2 && !game.training) return { key: 'train-2', text: 'Train a bigger second model', tab: 'models', sub: 'train', n: 7 };
  if (game.staff.hardwareEng < 1) return { key: 'hire-hw', text: 'Hire a hardware engineer to design our own chips', tab: 'team', n: 8 };
  if (!game.customChips.length && !game.chipProject) return { key: 'chip', text: 'Design our own chip', tab: 'silicon', sub: 'design', n: 9 };
  return { key: 'goals', text: 'Pick a way to win and go for it', tab: 'overview', sub: 'goals', n: GUIDE_STEPS + 1 };
}
