import type { Content } from '@stm/content';
import type { GameState, VictoryKind } from './types';
import { TUNING } from './tuning';
import { bestCapability, getChip, liveModel, marketSize, freeChips } from './selectors';
import { fabChipShare } from './fab';

export const VICTORY_TEXT: Record<VictoryKind, { title: string; body: string }> = {
  safeFrontier: {
    title: 'Safe Frontier',
    body: 'The AGI Program is complete, and our safety case held. The world gets a transformative system it can trust.',
  },
  recklessFrontier: {
    title: 'Frontier, at a cost',
    body: 'The AGI Program is complete. We cut corners on safety and got lucky. History will argue about this one.',
  },
  marketLeader: {
    title: 'Market Leader',
    body: 'Two straight years as the lab with the most users. Everyone else is building on our platform.',
  },
  fullStack: {
    title: 'Full Stack',
    body: 'Our own fab, our own power, and the best model on the planet. We own the whole stack, from sand to mind.',
  },
};

/**
 * How strongly a lab's model attracts users: rises steeply with capability, falls with price.
 * Uses capability (not suite score), so retiring an eval suite doesn't reshuffle the market.
 */
export function labPull(state: GameState, capability: number, priceRatio: number): number {
  return Math.exp((capability - state.suite.mid) / TUNING.capabilitySoftness) * Math.pow(priceRatio, -TUNING.priceElasticity);
}

/** Everyone using our models: API users, app users and enterprise seats. */
function ourTotalUsers(state: GameState): number {
  const seats = state.contracts.reduce((n, c) => n + c.seats, 0);
  return state.users + (state.consumer.launched ? state.consumer.users : 0) + seats;
}

/** Each lab's share of the API market's "pull" (capability, price, reputation, boosts). */
export function marketShares(state: GameState, content: Content): { you: number; rivals: Record<string, number> } {
  const pull = (capability: number, price: number) => labPull(state, capability, price / TUNING.referencePrice);
  const live = liveModel(state);
  const boost = state.modifiers.reduce((b, m) => b * m.shareBoost, 1);
  const ours = live ? pull(live.capability, state.apiPrice) * Math.sqrt(state.reputation / 50) * boost : 0;
  const rivalPull: Record<string, number> = {};
  let total = ours;
  for (const r of state.rivals) {
    const def = content.rivals.find((d) => d.id === r.id);
    const p = def ? pull(r.capability, def.apiPrice) : 0;
    rivalPull[r.id] = p;
    total += p;
  }
  const rivals: Record<string, number> = {};
  for (const [id, p] of Object.entries(rivalPull)) rivals[id] = total > 0 ? p / total : 0;
  return { you: total > 0 ? ours / total : 0, rivals };
}

/** Rival user counts across API and consumer markets: established labs convert their share instantly. */
export function rivalUsers(state: GameState, content: Content): Record<string, number> {
  const { rivals } = marketShares(state, content);
  const m = marketSize(state.week) * (1 + TUNING.consumerMarketMultiplier);
  return Object.fromEntries(Object.entries(rivals).map(([id, s]) => [id, s * m]));
}

export function isUserLeader(state: GameState, content: Content): boolean {
  const ours = ourTotalUsers(state);
  const others = Object.values(rivalUsers(state, content));
  return ours > 0 && others.every((u) => ours > u);
}

export function leadsEval(state: GameState): boolean {
  const mine = bestCapability(state);
  return mine > 0 && state.rivals.every((r) => mine > r.capability);
}


export interface GoalProgress {
  kind: VictoryKind;
  checks: { label: string; ok: boolean; detail?: string }[];
}

export function goalProgress(state: GameState, content: Content): GoalProgress[] {
  const maxPower = content.license.tracks.find((t) => t.id === 'power')!.levels.length;
  const maxSafety = content.license.tracks.find((t) => t.id === 'safety')!.levels.length;
  return [
    {
      kind: 'safeFrontier',
      checks: [
        { label: 'Capability to start the AGI Program', ok: bestCapability(state) >= TUNING.agiCapability },
        { label: `Safety level ${maxSafety}`, ok: state.license.safety.level >= maxSafety, detail: `level ${state.license.safety.level}` },
        { label: 'Complete the AGI Program', ok: false, detail: state.agi ? `${state.agi.weeksLeft} wk left` : 'not started' },
      ],
    },
    {
      kind: 'marketLeader',
      checks: [
        { label: 'Most users of any lab', ok: isUserLeader(state, content) },
        {
          label: `Hold it ${TUNING.marketLeaderWeeks} weeks in a row`,
          ok: state.leaderStreak >= TUNING.marketLeaderWeeks,
          detail: `${state.leaderStreak}/${TUNING.marketLeaderWeeks} wk`,
        },
      ],
    },
    {
      kind: 'fullStack',
      checks: [
        {
          label: `${Math.round(TUNING.fullStackCustomShare * 100)}%+ of owned chips made in our own fab`,
          ok: fabChipShare(state) >= TUNING.fullStackCustomShare,
          detail: `${Math.round(fabChipShare(state) * 100)}%`,
        },
        { label: `Power level ${maxPower} (own generation)`, ok: state.license.power.level >= maxPower, detail: `level ${state.license.power.level}` },
        { label: '#1 on the smarts test', ok: leadsEval(state) },
      ],
    },
  ];
}

export interface AgiPreview {
  errors: string[];
  catastropheChance: number;
}

export function previewAgi(state: GameState, content: Content, chipId: string, chipCount: number): AgiPreview {
  const errors: string[] = [];
  if (state.agi) errors.push('The AGI Program is already running.');
  if (bestCapability(state) < TUNING.agiCapability) errors.push('We need a more capable model before attempting AGI.');
  if (state.cash < TUNING.agiCost) errors.push(`The program needs $${TUNING.agiCost / 1e9}B in cash.`);
  if (!getChip(content, chipId, state)) errors.push('Pick a chip.');
  if (chipCount < TUNING.agiMinChips) errors.push(`Commit at least ${TUNING.agiMinChips.toLocaleString('en-US')} chips.`);
  if (chipCount > freeChips(state, chipId)) errors.push('Not enough free chips of that type.');
  const maxSafety = content.license.tracks.find((t) => t.id === 'safety')!.levels.length;
  const catastropheChance = Math.min(1, (maxSafety - state.license.safety.level) * TUNING.agiCatastrophePerMissingSafety);
  return { errors, catastropheChance };
}
