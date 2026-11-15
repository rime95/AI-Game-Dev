import { rand } from '../rng';
import { agingLoss, clampScore } from './board';
import { kind, market, MARKETS, RIVAL_LINES, RIVALS, T, type MarketDef } from './data';
import type { GameV2, Mood, Product, Rival, RivalPlan, RivalProduct } from './types';
import { servingRatio } from './facilities';
import { reach, WORLD_WEIGHT } from './wealth';
import { between, clamp, log, money, pick } from './util';

// ---------------------------------------------------------------- Markets

export function isMarketOpen(s: GameV2, m: MarketDef): boolean {
  return !m.tech || s.research.done.includes(m.tech);
}

/** Add newly opened markets (a tech just unlocked them). */
export function openMarkets(s: GameV2): void {
  for (const m of MARKETS) {
    if (!isMarketOpen(s, m) || s.markets.some((x) => x.id === m.id)) continue;
    s.markets.push({ id: m.id, size: m.startSize, openedDay: s.day, basePrice: m.basePrice, shares: {} });
    if (s.day > 0) log(s, `A new market opened: ${m.name}.`, 'good');
  }
}

export function marketSize(s: GameV2, id: string, day = s.day): number {
  const ms = s.markets.find((m) => m.id === id);
  if (!ms) return 0;
  const m = market(id);
  // The whole world's buyers; you reach only the regions where you have offices.
  return m.startSize * WORLD_WEIGHT * Math.pow(1 + m.growth, (day - ms.openedDay) / 360);
}

/** Price buyers think is fair for a product of this score. */
export function fairPrice(marketId: string, score: number): number {
  return market(marketId).basePrice * Math.pow(1.12, score - 6);
}

/** A product's review score today: launch score minus what the rising market bar took away. */
export function currentScore(p: { score: number; marketId: string; launchDay: number }, day: number): number {
  return clampScore(p.score - agingLoss(p.marketId, p.launchDay, day));
}

export const activeProducts = (s: GameV2, marketId?: string): Product[] =>
  s.products.filter((p) => p.retiredDay === undefined && (!marketId || p.marketId === marketId));

/** Our best score on sale in a market today, or null if we sell nothing there. */
export function playerBest(s: GameV2, marketId: string, day = s.day): number | null {
  const ours = activeProducts(s, marketId);
  if (!ours.length) return null;
  return Math.max(...ours.map((p) => currentScore(p, day)));
}

/**
 * A rival product's score today. The design rule: rivals never get ahead of the player. Their
 * product is capped just below our best in that market (or at a modest legacy level before we
 * sell anything there), every day, so it holds even as products age or retire.
 */
export function rivalScore(s: GameV2, rp: RivalProduct, day = s.day): number {
  const own = currentScore(rp, day);
  const best = playerBest(s, rp.marketId, day);
  const cap = best === null ? T.rivalLegacyScore : best - T.rivalMinGap;
  return Math.min(own, cap);
}

const pull = (score: number, price: number, fair: number, sens: number, brand: number, hype: number) =>
  brand * Math.pow(2, (score - 5) / T.scorePerDoubling) * Math.pow(fair / Math.max(1, price), sens) * (1 + hype);

export const ourBrandFactor = (s: GameV2) => (0.2 + s.brand / 40) * reach(s);

export function hypeNow(p: Product, day: number): number {
  return p.hype * Math.exp(-(day - p.launchDay) / 40);
}

/** Daily sales in every open market. Returns revenue and cost of goods. */
export function tickSales(s: GameV2): { revenue: number; cogs: number } {
  let revenue = 0;
  let cogs = 0;
  let salesMod = 1;
  for (const m of s.modifiers) if (m.sales && m.until > s.day) salesMod *= m.sales;
  const drivers = s.research.done.includes('drivers');
  // AI-model customers can only be served up to data center capacity: settle those after the loop.
  const models: { p: Product; units: number }[] = [];
  for (const ms of s.markets) {
    const m = market(ms.id);
    ms.size = marketSize(s, ms.id);
    const entries: { owner: string; pull: number; product?: Product }[] = [];
    for (const p of activeProducts(s, ms.id)) {
      const sc = currentScore(p, s.day);
      entries.push({ owner: 'you', product: p, pull: pull(sc, p.price, fairPrice(ms.id, sc), m.priceSensitivity, ourBrandFactor(s), hypeNow(p, s.day)) * salesMod * (drivers && p.kind === 'gpu' ? 1.15 : 1) });
    }
    for (const r of s.rivals) {
      if (r.acquired) continue;
      const rp = r.products.find((x) => x.marketId === ms.id);
      if (!rp) continue;
      const sc = rivalScore(s, rp);
      entries.push({ owner: r.id, pull: pull(sc, rp.price, fairPrice(ms.id, sc), m.priceSensitivity, r.brand, 0) });
    }
    entries.push({ owner: 'others', pull: T.othersPull });
    const total = entries.reduce((n, e) => n + e.pull, 0);
    const shares: Record<string, number> = {};
    for (const e of entries) {
      const share = e.pull / total;
      shares[e.owner] = (shares[e.owner] ?? 0) + share;
      if (!e.product) continue;
      const units = ms.size * share;
      if (e.product.kind === 'model') {
        models.push({ p: e.product, units });
        continue;
      }
      const rev = units * e.product.price;
      const cost = units * e.product.unitCost;
      e.product.units += units;
      e.product.revenue += rev;
      e.product.profit += rev - cost;
      e.product.rate = units;
      revenue += rev;
      cogs += cost;
    }
    ms.shares = shares;
  }
  const ratio = servingRatio(s, models.reduce((n, x) => n + x.units, 0));
  for (const { p, units: want } of models) {
    const units = want * ratio;
    const rev = units * p.price;
    const cost = units * p.unitCost;
    p.units += units;
    p.revenue += rev;
    p.profit += rev - cost;
    p.rate = units;
    revenue += rev;
    cogs += cost;
    const ms = s.markets.find((x) => x.id === p.marketId)!;
    ms.shares.you = (ms.shares.you ?? 0) * (want > 0 ? units / want : 1);
  }
  return { revenue, cogs };
}

// ---------------------------------------------------------------- Rivals

export function initialRivals(s: GameV2): Rival[] {
  return RIVALS.map((d) => ({
    id: d.id,
    name: d.name,
    ceo: d.ceo,
    style: d.style,
    brand: d.brand,
    potential: d.potential,
    cash: d.cash,
    markets: d.markets,
    products: [],
    plans: [],
    strength: 60,
    mood: 'confident' as Mood,
    techs: [],
    truceUntil: 0,
    lastOffer: -1e9,
    released: 0,
  }));
}

/** A rival is in the game once its era's technology exists (they follow the player's lead). */
export function rivalActive(s: GameV2, r: Rival): boolean {
  const def = RIVALS.find((d) => d.id === r.id)!;
  if (!def.tech) return true;
  const day = s.research.doneDay[def.tech];
  return day !== undefined && s.day >= day + 120;
}

/** How far behind our recent launches each kind of rival aims (review points). */
export const RIVAL_GAP: Record<Rival['style'], number> = { premium: 0.4, copycat: 0.35, giant: 0.6, priceCutter: 0.9 };
/** A rival's mood changes how hard it tries: rattled and desperate rivals throw everything at it; one up for sale has given up. */
const MOOD_EFFORT: Record<Mood, number> = { confident: 1, rattled: 0.75, desperate: 0.55, forSale: 1.3 };
/** Our launches a rival studies: the last this many days. */
const STUDY_DAYS = 540;

/** Our best launch score in a market over the last year and a half (before ageing), or null. */
export function recentLaunch(s: GameV2, marketId: string): number | null {
  const ours = s.products.filter((p) => p.marketId === marketId && s.day - p.launchDay <= STUDY_DAYS);
  return ours.length ? Math.max(...ours.map((p) => p.score)) : null;
}

/**
 * What a rival builds in a market, before the "never ahead of you" cap. Rivals follow our lead:
 * they aim a little behind our recent launches there (the gap depends on their style and mood),
 * and without anything of ours to chase they ship modest chips of their own. So a market you keep
 * fresh stays a clear lead, and one you neglect is where they catch up (until the cap stops them).
 */
function rivalBuild(s: GameV2, r: Rival, marketId: string): number {
  const own = r.potential - 0.9 + (r.style === 'premium' ? 0.3 : 0) + between(s, -0.3, 0.3);
  const chase = recentLaunch(s, marketId);
  if (chase === null) return clampScore(own);
  const gap = RIVAL_GAP[r.style] * MOOD_EFFORT[r.mood] + between(s, -0.35, 0.35);
  return clampScore(Math.max(own, chase - Math.max(0.1, gap)));
}

function nextName(r: Rival): string {
  const lines = RIVAL_LINES[r.id] ?? [`${r.name} chip`];
  const base = lines[Math.min(r.released, lines.length - 1)]!;
  return r.released >= lines.length ? `${base} ${r.released - lines.length + 2}` : base;
}

/** Days ahead that a rival's plan shows on the launch calendar. */
export const ANNOUNCE_DAYS = 75;

export function visiblePlans(s: GameV2): (RivalPlan & { rival: string; rivalId: string })[] {
  const out: (RivalPlan & { rival: string; rivalId: string })[] = [];
  for (const r of s.rivals)
    for (const p of r.plans)
      if (!r.acquired && p.launchDay - s.day <= ANNOUNCE_DAYS && p.estimate > 0) {
        // Shown through the same cap as their products: they never get ahead of you.
        const best = playerBest(s, p.marketId);
        const cap = best === null ? T.rivalLegacyScore : best - T.rivalMinGap;
        out.push({ ...p, estimate: Math.round(Math.min(p.estimate, cap) * 10) / 10, rival: r.name, rivalId: r.id });
      }
  return out.sort((a, b) => a.launchDay - b.launchDay);
}

/** Daily rival update: plan launches, launch on the day, cut prices when hurting. */
export function tickRivals(s: GameV2): void {
  for (const r of s.rivals) {
    if (r.acquired || !rivalActive(s, r)) continue;
    const def = RIVALS.find((d) => d.id === r.id)!;
    for (const mid of r.markets) {
      const ms = s.markets.find((x) => x.id === mid);
      if (!ms) continue;
      // First appearance: they already have something on sale.
      if (!r.products.some((p) => p.marketId === mid)) {
        const score = rivalBuild(s, r, mid);
        r.products.push({ name: nextName(r), marketId: mid, score, price: Math.round(fairPrice(mid, Math.min(score, T.rivalLegacyScore)) * styleMult(r)), launchDay: s.day });
        r.released++;
      }
      let plan = r.plans.find((p) => p.marketId === mid);
      if (!plan) {
        plan = { marketId: mid, name: nextName(r), estimate: 0, launchDay: s.day + Math.round(between(s, def.cadence[0], def.cadence[1])) };
        r.plans.push(plan);
      }
      if (plan.launchDay - s.day <= ANNOUNCE_DAYS && plan.estimate === 0) {
        plan.estimate = Math.round(rivalBuild(s, r, mid) * 2) / 2;
        log(s, `${r.name} announced the ${plan.name} for ${market(mid).name}, due ${Math.round((plan.launchDay - s.day) / 30)} months from now.`, 'rival');
      }
      if (s.day >= plan.launchDay) {
        const score = rivalBuild(s, r, mid);
        const prod: RivalProduct = { name: plan.name, marketId: mid, score, price: 0, launchDay: s.day };
        prod.price = Math.round(fairPrice(mid, rivalScore(s, prod)) * styleMult(r));
        r.products = r.products.filter((p) => p.marketId !== mid);
        r.products.push(prod);
        r.released++;
        r.plans = r.plans.filter((p) => p !== plan);
        const shown = rivalScore(s, prod);
        const best = playerBest(s, mid);
        const close = best !== null && best - shown < 0.5;
        log(s, `${r.name} launched the ${prod.name} in ${market(mid).name} at ${money(prod.price)}: reviews average ${shown.toFixed(1)}${close ? ', right behind yours' : ''}.`, 'rival');
      }
    }
  }
}

const styleMult = (r: Rival) => ({ premium: 1.12, priceCutter: 0.85, copycat: 0.9, giant: 1.02 })[r.style];

/** Monthly: rival strength and mood against us, price cuts, a CEO quote. */
export function monthlyRivals(s: GameV2): void {
  const active = s.rivals.filter((r) => !r.acquired && rivalActive(s, r));
  for (const r of active) {
    let theirs = 0;
    let ours = 0;
    let n = 0;
    for (const mid of r.markets) {
      const ms = s.markets.find((x) => x.id === mid);
      if (!ms) continue;
      theirs += ms.shares[r.id] ?? 0;
      ours += ms.shares.you ?? 0;
      n++;
    }
    if (!n) continue;
    const ourBest = Math.max(0, ...activeProducts(s).map((p) => currentScore(p, s.day)));
    r.strength = clamp(50 + (110 * (theirs - ours)) / n - Math.max(0, ourBest - 6) * 4, 0, 100);
    // Rivals feel our success: out-selling them wears their brand down (and the reverse, slowly).
    // ...and each rival's name slowly recovers toward what it was, so beaten rivals can come back.
    const def = RIVALS.find((d) => d.id === r.id)!;
    r.brand = clamp(r.brand * (1 + (0.15 * (theirs - ours)) / n) + (def.brand - r.brand) * 0.06, 0.4, 5);
    r.mood = moodFor(r.mood, r.strength);
    const truce = r.truceUntil > s.day;
    // A desperate rival starts a price war across every market it shares with us.
    if (r.mood === 'desperate' && !truce && rand(s) < 0.25) {
      let cut = 0;
      for (const p of r.products) if ((s.markets.find((m) => m.id === p.marketId)?.shares.you ?? 0) > 0.03) {
        p.price = Math.max(1, Math.round(p.price * 0.85));
        cut++;
      }
      if (cut) log(s, `${r.name} started a price war: 15% off across ${cut} market${cut > 1 ? 's' : ''}.`, 'rival');
    } else if ((r.style === 'priceCutter' || r.mood === 'desperate') && r.mood !== 'confident' && !truce && rand(s) < 0.35) {
      const p = r.products.find((x) => (s.markets.find((m) => m.id === x.marketId)?.shares.you ?? 0) > 0.05);
      if (p) {
        p.price = Math.max(1, Math.round(p.price * 0.88));
        log(s, `${r.name} cut the price of the ${p.name} to ${money(p.price)} in ${market(p.marketId).name}.`, 'rival');
      }
    }
  }
  // Our brand grows with the share we hold, and settles slowly without it.
  const selling = s.markets.filter((ms) => activeProducts(s, ms.id).length > 0);
  const avgShare = selling.length ? selling.reduce((n, ms) => n + (ms.shares.you ?? 0), 0) / selling.length : 0;
  // Brand fades without fresh success, so it stays something to keep up rather than a bar that fills once.
  s.brand = clamp(s.brand + 3 * avgShare - (s.brand - T.startBrand) * 0.035, 0, 100);
  if (active.length && rand(s) < 0.8) {
    const r = pick(s, active);
    const def = RIVALS.find((d) => d.id === r.id)!;
    log(s, `${r.ceo}, ${r.name}: “${pick(s, def.quotes)}”`, 'rival');
  }
}

export const kindName = (k: string) => kind(k).name;

/** Grounds Up's rivalry thresholds, with hysteresis so a mood doesn't flicker. */
export const RIVALRY = {
  confident: 55,
  rattled: 35,
  desperate: 20,
  hysteresis: 4,
  priceMult: { confident: 1.15, rattled: 1, desperate: 0.8, forSale: 0.65 } as Record<Mood, number>,
  defeatBrand: 5,
  truceDays: 168,
  offerCooldownDays: 90,
};

export function moodFor(prev: Mood, strength: number): Mood {
  const h = RIVALRY.hysteresis;
  const raw: Mood = strength >= RIVALRY.confident ? 'confident' : strength >= RIVALRY.rattled ? 'rattled' : strength >= RIVALRY.desperate ? 'desperate' : 'forSale';
  if (raw === prev) return raw;
  // Only change mood once strength is clearly past the line.
  const line = { confident: RIVALRY.confident, rattled: RIVALRY.rattled, desperate: RIVALRY.desperate, forSale: 0 };
  const order: Mood[] = ['forSale', 'desperate', 'rattled', 'confident'];
  const up = order.indexOf(raw) > order.indexOf(prev);
  return up ? (strength >= line[raw] + h ? raw : prev) : strength < line[prev] - h ? raw : prev;
}

/** A rival's yearly sales at today's shares and prices. */
export function rivalRevenue(s: GameV2, r: Rival): number {
  let n = 0;
  for (const p of r.products) {
    const ms = s.markets.find((m) => m.id === p.marketId);
    if (ms) n += (ms.shares[r.id] ?? 0) * ms.size * p.price * 360;
  }
  return n;
}

/** What it costs to buy a rival outright: a multiple of its sales, cheaper the more it is struggling. */
export function takeoverPrice(s: GameV2, r: Rival): number {
  const base = Math.max(2_000_000, rivalRevenue(s, r) * 2.5 + r.brand * 400_000);
  return Math.round((base * RIVALRY.priceMult[r.mood]) / 10_000) * 10_000;
}
