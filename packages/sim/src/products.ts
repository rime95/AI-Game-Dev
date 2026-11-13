import type { Content } from '@stm/content';
import type { EnterpriseOffer, GameState } from './types';
import { TUNING } from './tuning';
import { bestCapability, liveModel, marketSize } from './selectors';
import { tierForCapability } from './license';
import { labPull } from './victory';
import { rand, randInt } from './rng';

export function consumerMarket(week: number): number {
  return marketSize(week) * TUNING.consumerMarketMultiplier;
}

/** Share of paying subscribers among app users. Product managers improve the funnel. */
export function conversion(state: GameState): number {
  return Math.min(TUNING.maxConversion, TUNING.baseConversion + state.staff.product * TUNING.conversionPerProductManager);
}

/** App users we'd converge to, competing with rivals' apps (all priced at the reference). */
export function consumerTarget(state: GameState, content: Content): number {
  const live = liveModel(state);
  if (!state.consumer.launched || !live) return 0;
  const boost = state.modifiers.reduce((b, m) => b * m.shareBoost, 1);
  const ours =
    labPull(state, live.capability, state.consumer.subPrice / TUNING.referenceSubPrice) * Math.sqrt(state.reputation / 50) * boost;
  let total = ours;
  for (const r of state.rivals) total += labPull(state, r.capability, 1);
  return total > 0 ? consumerMarket(state.week) * (ours / total) : 0;
}

export function consumerWeeklyRevenue(state: GameState): number {
  if (!state.consumer.launched) return 0;
  return state.consumer.users * conversion(state) * state.consumer.subPrice * (12 / 52);
}

export function enterpriseSeats(state: GameState): number {
  return state.contracts.reduce((n, c) => n + c.seats, 0);
}

export function enterpriseWeeklyRevenue(state: GameState): number {
  return state.contracts.reduce((n, c) => n + c.seats * c.pricePerSeat, 0);
}

/** Everyone using our models: API users, app users and enterprise seats. */
export function totalUsers(state: GameState): number {
  return state.users + (state.consumer.launched ? state.consumer.users : 0) + enterpriseSeats(state);
}

export function contractCapacity(state: GameState): number {
  return state.staff.product * TUNING.contractsPerProductManager;
}

export function currentTier(state: GameState, content: Content): number {
  return state.models.length ? tierForCapability(content, bestCapability(state)) : 0;
}

export interface OfferCheck {
  checks: { label: string; ok: boolean }[];
  canAccept: boolean;
}

export function offerCheck(state: GameState, content: Content, offer: EnterpriseOffer): OfferCheck {
  const checks = [
    { label: `Tier ${offer.minTier}+ model`, ok: currentTier(state, content) >= offer.minTier },
    { label: `Safety level ${offer.minSafety}`, ok: state.license.safety.level >= offer.minSafety },
    { label: `Compliance level ${offer.minCompliance}`, ok: state.license.compliance.level >= offer.minCompliance },
    {
      label: `Account capacity (${state.contracts.length}/${contractCapacity(state)})`,
      ok: state.contracts.length < contractCapacity(state),
    },
  ];
  return { checks, canAccept: checks.every((c) => c.ok) };
}

/** A new enterprise offer sized to our current tier, from a random sector. */
export function generateOffer(state: GameState, content: Content): EnterpriseOffer {
  const tier = Math.max(1, currentTier(state, content));
  const sector = content.clients[randInt(state, 0, content.clients.length - 1)]!;
  const client = sector.names[randInt(state, 0, sector.names.length - 1)]!;
  const seats = Math.round(1000 * Math.pow(3, tier - 1) * (0.5 + rand(state)));
  const pricePerSeat = Math.round(TUNING.baseSeatPricePerWeek * sector.priceFactor * (0.8 + rand(state) * 0.5) * 100) / 100;
  const terms = [26, 52, 104];
  return {
    id: `o${state.nextId++}`,
    client,
    sector: sector.sector,
    seats,
    pricePerSeat,
    termWeeks: terms[randInt(state, 0, terms.length - 1)]!,
    minTier: Math.max(1, Math.min(5, tier - 1 + randInt(state, 0, 2))),
    minSafety: sector.minSafety,
    minCompliance: sector.minCompliance,
    expiresWeek: state.week + TUNING.offerLifetimeWeeks,
  };
}
