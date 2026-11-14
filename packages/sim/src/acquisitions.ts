import type { AcquisitionGains, Content, Startup } from '@stm/content';
import type { GameState } from './types';
import { TUNING } from './tuning';
import { marketShares, rivalUsers } from './victory';
import { effectiveStaff } from './hq';

export type DealKind = Startup['kind'] | 'rival';

export interface Deal {
  id: string;
  name: string;
  kind: DealKind;
  blurb: string;
  price: number;
  integrationWeeks: number;
  gives: AcquisitionGains;
  rivalId?: string;
  /** Chance some acquired staff quit during integration. */
  clashChance: number;
  /** Chance regulators block the deal at completion (most of the price is refunded). */
  antitrustChance: number;
}

export function startupPrice(s: Startup, week: number): number {
  return Math.round(s.price * Math.pow(1 + TUNING.startupPriceGrowthPerWeek, Math.max(0, week - s.availableFromWeek)));
}

export function clashChance(state: GameState, gives: AcquisitionGains): number {
  if (!gives.staff?.length) return 0;
  return TUNING.cultureClashBase * Math.pow(TUNING.cultureClashOpsFactor, effectiveStaff(state, 'ops'));
}

/** Antitrust: only big players get reviewed; a strong compliance team usually gets deals through. */
export function antitrustChance(state: GameState, content: Content, rivalDeal: boolean): number {
  const share = marketShares(state, content).you;
  const threshold = rivalDeal ? TUNING.antitrustShareRivalDeal : TUNING.antitrustShare;
  if (share <= threshold) return 0;
  const base = 0.7 - 0.15 * (state.license.compliance.level - 1) + (rivalDeal ? 0.2 : 0);
  return Math.max(0.05, Math.min(0.9, base));
}

function busy(state: GameState, id: string): boolean {
  return state.acquired.includes(id) || state.integrations.some((i) => i.dealId === id);
}

/** Every deal currently on the table: startups that have appeared, plus struggling rival labs. */
export function availableDeals(state: GameState, content: Content): Deal[] {
  const deals: Deal[] = [];
  for (const s of content.startups) {
    if (state.week < s.availableFromWeek || busy(state, s.id)) continue;
    deals.push({
      id: s.id,
      name: s.name,
      kind: s.kind,
      blurb: s.blurb,
      price: startupPrice(s, state.week),
      integrationWeeks: s.integrationWeeks,
      gives: s.gives,
      clashChance: clashChance(state, s.gives),
      antitrustChance: antitrustChance(state, content, false),
    });
  }

  if (state.week >= TUNING.strugglingRivalFromWeek) {
    const shares = marketShares(state, content).rivals;
    const users = rivalUsers(state, content);
    for (const r of state.rivals) {
      const id = `rival:${r.id}`;
      if ((shares[r.id] ?? 1) >= TUNING.strugglingRivalShare || busy(state, id)) continue;
      const def = content.rivals.find((d) => d.id === r.id);
      if (!def) continue;
      const theirUsers = users[r.id] ?? 0;
      const gives: AcquisitionGains = {
        users: Math.max(1, Math.round(theirUsers * 0.5)),
        ipBonus: 0.1,
        staff: [
          { discipline: 'research', count: 5 },
          { discipline: 'modelEng', count: 5 },
        ],
      };
      deals.push({
        id,
        name: def.name,
        kind: 'rival',
        blurb: `A struggling rival lab. Buying it takes ${def.name} out of the race and brings over half its users.`,
        price: Math.max(3e9, theirUsers * 150 + 1e9),
        integrationWeeks: 16,
        gives,
        rivalId: r.id,
        clashChance: clashChance(state, gives),
        antitrustChance: antitrustChance(state, content, true),
      });
    }
  }
  return deals;
}
