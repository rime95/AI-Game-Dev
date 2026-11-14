import { content } from '@stm/content';
import { fundingCheck, moveCheck, researchError, type GameState } from '@stm/sim';
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

export const FOUNDING_STEPS = 8;

/** The founding years: from a first chip in the garage to beating the industry's best. */
function foundingStep(game: GameState): NextStep {
  const f = game.founding!;
  const step = (key: string, text: string, tab: NextStep['tab'], n: number): NextStep => ({ key, text, tab, n, of: FOUNDING_STEPS });
  if (f.chapterDone) return step('chapter', 'The 1990s are over: continue into the AI era', 'overview', 0);
  if (!f.chips.length && !f.project) return step('first-chip', 'Design your first chip', 'chip', 1);
  if (!f.chips.length && f.project)
    return step('wait', `${f.project.name} is being designed: ${f.project.monthsLeft} month${f.project.monthsLeft === 1 ? '' : 's'} to go`, 'chip', 2);
  if (!f.unlocked.length) {
    const cheapest = content.founding.research.find((r) => !researchError(game, content, r.id));
    if (cheapest) return step('research', `Spend your research points: ${cheapest.name}`, 'research', 3);
    if (!f.project) return step('second-chip', 'Design another chip: every review earns research points', 'chip', 3);
  }
  if (game.hq.stage === 'garage') {
    if (!moveCheck(game, content).error) return step('office', 'Move out of the garage into an office', 'hq', 4);
    if (!f.project) return step('more-chips', `Keep shipping chips to afford an office (${f.chips.length} of 3)`, 'chip', 4);
    return step('more-chips', `Ship 3 chips to afford an office (${f.chips.length} of 3)`, 'chip', 4);
  }
  if (game.staff.hardwareEng + game.staff.product < 2) return step('hire', 'Hire your first chip designer', 'team', 5);
  if (new Set(f.chips.map((c) => c.marketId)).size < 2) return step('market', 'Sell a chip to a second market', 'chip', 6);
  const best = Math.max(0, ...f.chips.map((c) => c.score));
  if (best < 8) return step('eight', 'Make a chip that reviews 8 or better', 'chip', 7);
  const leader = [...f.rivals].sort((a, b) => b.score - a.score)[0];
  if (leader && leader.score >= (f.chips.at(-1)?.score ?? 0)) {
    const name = content.founding.rivals.find((r) => r.id === leader.id)?.name ?? 'the leader';
    return step('lead', `Beat ${name}'s latest chip (${leader.score.toFixed(1)})`, 'rivals', 8);
  }
  return step('grow', 'You lead the industry. Keep growing until the decade ends', 'overview', 0);
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
