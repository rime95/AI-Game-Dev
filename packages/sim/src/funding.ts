import type { Content, FundingRound } from '@stm/content';
import type { GameState } from './types';
import { bestCapability } from './selectors';
import { tierForCapability } from './license';
import { totalUsers } from './products';

export interface FundingCheck {
  round: FundingRound | undefined;
  checks: { label: string; ok: boolean }[];
  canRaise: boolean;
  /** Equity actually sold: the round's share of what you still own. */
  equitySold: number;
}

export function weeklyNet(state: GameState): number {
  const lw = state.lastWeek;
  if (!lw) return 0;
  return lw.revenue + lw.licenseRevenue - lw.salaries - lw.rent - lw.power - lw.licenseUpkeep - (lw.facilities ?? 0) - (lw.colocation ?? 0) - (lw.sites ?? 0) - (lw.fabCosts ?? 0) + (lw.fabSales ?? 0);
}

export function fundingCheck(state: GameState, content: Content): FundingCheck {
  const round = content.funding[state.roundsRaised];
  if (!round) return { round, checks: [], canRaise: false, equitySold: 0 };
  const tier = state.models.length ? tierForCapability(content, bestCapability(state)) : 0;
  const checks = [
    { label: `${round.minUsers.toLocaleString('en-US')} users`, ok: totalUsers(state) >= round.minUsers },
    { label: `A Tier ${round.minTier}+ model released`, ok: tier >= round.minTier },
  ];
  if (round.requiresProfit) checks.push({ label: 'Profitable last week', ok: weeklyNet(state) > 0 });
  // Rooms investors expect to see (the boardroom from Series B).
  for (const t of content.hq.rooms) {
    const at = t.requiredFor?.fundingRound;
    if (at !== undefined && state.roundsRaised >= at)
      checks.push({ label: `A ${t.name.toLowerCase()} at HQ`, ok: state.hq.rooms.some((r) => r.templateId === t.id) });
  }
  return { round, checks, canRaise: checks.every((c) => c.ok), equitySold: state.ownership * round.equity };
}
