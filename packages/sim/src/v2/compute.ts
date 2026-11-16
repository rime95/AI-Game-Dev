import { fairPrice, activeProducts, currentScore, rivalScore } from './markets';
import { node, NODES } from './data';
import type { Campus, ComputeState, GameV2, Product, Project } from './types';
import { clamp, log, money, newId, spend } from './util';

/**
 * Data center campuses: the AI era built on your own chips. A campus sits at a real data-center
 * town and is made of a few components, each upgraded with one action:
 *
 *   halls (MW of IT power) · chips (your own accelerators or bought GPUs: PF per MW) ·
 *   cooling (PUE, so running cost) · power (cheaper, or +% compute) · network (+% compute) · size
 *
 * capacity PF = MW × PF per MW × (1 + network) × (1 + power)
 *
 * Capacity splits between training (AI models train on it, and the AGI run) and serving (AI-model
 * customers). Serving capacity nobody uses is rented out as cloud, so an idle campus still pays.
 */

export const SITES = [
  { id: 'dalles', name: 'The Dalles', region: 'na', lat: 45.6, lon: -121.2, power: 42, climate: 0.08, solar: false, blurb: 'River hydro and cool air: cheap, clean power.' },
  { id: 'ashburn', name: 'Ashburn', region: 'na', lat: 39, lon: -77.5, power: 68, climate: 0, solar: false, net: 0.04, blurb: 'Data center alley: fibre everywhere, power is pricey.' },
  { id: 'councilbluffs', name: 'Council Bluffs', region: 'na', lat: 41.3, lon: -95.9, power: 48, climate: 0.04, solar: false, blurb: 'Prairie wind power and plenty of land.' },
  { id: 'dallas', name: 'Dallas', region: 'na', lat: 32.8, lon: -96.8, power: 50, climate: -0.04, solar: true, blurb: 'Cheap power and sun, hot summers.' },
  { id: 'phoenix', name: 'Phoenix', region: 'na', lat: 33.4, lon: -112, power: 58, climate: -0.08, solar: true, blurb: 'Sun for solar fields; the heat costs you in cooling.' },
  { id: 'dublin', name: 'Dublin', region: 'europe', lat: 53.3, lon: -6.3, power: 84, climate: 0.1, solar: false, blurb: 'Cool and connected to Europe. Needs a European office.' },
  { id: 'tokyo', name: 'Tokyo', region: 'japan', lat: 35.7, lon: 139.7, power: 92, climate: 0, solar: false, blurb: 'Close to Japanese customers. Needs a Japan office.' },
  { id: 'singapore', name: 'Singapore', region: 'asia', lat: 1.35, lon: 103.8, power: 88, climate: -0.1, solar: false, blurb: 'The hub of Asia; hot and humid. Needs an Asia-Pacific office.' },
] as const;
export type Site = (typeof SITES)[number];
export const site = (id: string) => SITES.find((x) => x.id === id)!;

export const COMPUTE = {
  /** IT power per hall (MW), its build cost and time. */
  hall: { mw: 20, cost: 150_000_000, days: 90 },
  /** Opening a campus (land, substation, buildings) by size; each size holds more halls. */
  sizes: [
    { name: 'Small campus', halls: 2, cost: 100_000_000 },
    { name: 'Large campus', halls: 4, cost: 350_000_000 },
    { name: 'Hyperscale campus', halls: 8, cost: 1_000_000_000 },
  ],
  cooling: [
    { name: 'Air cooling', pue: 1.55, perHall: 0 },
    { name: 'Liquid cooling', pue: 1.28, perHall: 40_000_000 },
    { name: 'Immersion cooling', pue: 1.12, perHall: 90_000_000 },
  ],
  power: [
    { name: 'Grid power', price: 1, bonus: 0, perHall: 0, blurb: 'Whatever the local grid charges.' },
    { name: 'Solar and storage', price: 0.68, bonus: 0, perHall: 80_000_000, blurb: 'Cheaper, greener power (best where it is sunny).' },
    { name: 'Redundant power', price: 1.1, bonus: 0.03, perHall: 50_000_000, blurb: 'Never goes down: +3% compute.' },
  ],
  network: [
    { name: 'Standard links', bonus: 0, cost: 0 },
    { name: 'Dual fibre routes', bonus: 0.08, cost: 60_000_000 },
  ],
  /** Accelerators per MW (for the price of a refit). */
  chipsPerMw: 300,
  /** Staff and upkeep per hall per month, on top of power. */
  hallUpkeep: 1_500_000,
  /** AI-model customers one PF serves per day. */
  customersPerPf: 24,
  /** Cloud rental: what a MW-equivalent of idle serving capacity earns per day. */
  cloudPerMwDay: 30_000,
  /** Training needs, in MW-days of today's bought GPUs, by model size. */
  trainMwDays: { S: 600, M: 1500, L: 4000, XL: 10_000 } as Record<string, number>,
  /** The AGI run, in MW-days of today's bought GPUs. */
  agiMwDays: 120_000,
};

/** Make sure the compute state exists (older saves get it, with any old data centers turned into a campus). */
export function ensureCompute(s: GameV2): ComputeState {
  if (s.compute) return s.compute;
  const c: ComputeState = { campuses: [], trainShare: 0.5, demand: 0 };
  s.compute = c;
  if (s.facilities.dc > 0) {
    const halls = Math.max(1, Math.ceil(s.facilities.dc / 1500));
    c.campuses.push({
      id: newId(s, 'campus'),
      siteId: 'ashburn',
      size: halls > 4 ? 2 : halls > 2 ? 1 : 0,
      halls,
      building: [],
      chip: boughtChip(s),
      cooling: 0,
      power: 0,
      network: 0,
      openedDay: s.day,
    });
    s.facilities.dc = 0;
  }
  return c;
}

// ---------------------------------------------------------------- Chips

/** PF per MW for a chip of this score on this node (better chips and newer nodes pack more compute per watt). */
export const pfPerMw = (score: number, nodeId: string) => Math.round(10 * node(nodeId).speed * Math.pow(2, (score - 6) / 2.4) * 10) / 10;

/** The best GPU you can buy: the rivals' best data-center chip, a node behind yours. */
export function boughtChip(s: GameV2): Campus['chip'] {
  // GPUs come from the chip makers (Nvidia), not the AI labs that also sell into data centers.
  const offers = s.rivals.filter((r) => !r.acquired && r.id === 'nvidia').flatMap((r) => r.products.filter((p) => p.marketId === 'datacenter').map((p) => ({ r, p, sc: rivalScore(s, p) })));
  const nvidia = offers.sort((a, b) => b.sc - a.sc)[0];
  const best = Math.max(5.5, ...s.rivals.flatMap((r) => r.products.filter((p) => p.marketId === 'datacenter').map((p) => rivalScore(s, p))));
  const score = nvidia ? nvidia.sc : best;
  const mine = NODES.findIndex((n) => n.id === bestNodeId(s));
  const nodeId = NODES[Math.max(0, mine - 1)]!.id;
  return { source: 'bought', name: nvidia ? `${nvidia.r.name} ${nvidia.p.name}` : 'Data center GPUs', pfPerMw: pfPerMw(score, nodeId), unitPrice: Math.round(fairPrice('datacenter', score)) };
}

function bestNodeId(s: GameV2): string {
  return [...NODES].reverse().find((n) => !n.tech || s.research.done.includes(n.tech))!.id;
}

/** Your own AI accelerators you could refit with (on sale or ever shipped), best first. */
export function ownChips(s: GameV2): Product[] {
  return s.products.filter((p) => p.kind === 'accel').sort((a, b) => pfPerMw(b.score, b.nodeId) - pfPerMw(a.score, a.nodeId));
}
export const ownChip = (p: Product): Campus['chip'] => ({ source: 'own', productId: p.id, name: p.name, pfPerMw: pfPerMw(p.score, p.nodeId), unitPrice: p.unitCost });

/** What refitting a campus's halls with a chip costs. */
export const refitCost = (c: Campus, chip: Campus['chip']) => Math.round(c.halls * COMPUTE.hall.mw * COMPUTE.chipsPerMw * chip.unitPrice);

// ---------------------------------------------------------------- Capacity and cost

const liveHalls = (c: Campus) => c.halls;
export const campusMw = (c: Campus) => liveHalls(c) * COMPUTE.hall.mw;
export const campusPf = (c: Campus) =>
  campusMw(c) * c.chip.pfPerMw * (1 + COMPUTE.network[c.network]!.bonus + ((site(c.siteId) as { net?: number }).net ?? 0)) * (1 + COMPUTE.power[c.power]!.bonus);
export const campusPue = (c: Campus) => Math.max(1.05, COMPUTE.cooling[c.cooling]!.pue - site(c.siteId).climate);
/** Running cost per month: power for IT and cooling, plus staff per hall. */
export const campusMonthly = (c: Campus) => {
  const st = site(c.siteId);
  const price = st.power * COMPUTE.power[c.power]!.price * (c.power === 1 && !st.solar ? 1.15 : 1);
  return campusMw(c) * campusPue(c) * price * 720 + liveHalls(c) * COMPUTE.hallUpkeep;
};

export const totalPf = (s: GameV2) => (s.compute?.campuses ?? []).reduce((n, c) => n + campusPf(c), 0);
export const totalMw = (s: GameV2) => (s.compute?.campuses ?? []).reduce((n, c) => n + campusMw(c), 0);
export const trainingPf = (s: GameV2) => totalPf(s) * (s.compute?.trainShare ?? 0.5);
export const servingPf = (s: GameV2) => totalPf(s) - trainingPf(s);
/** AI-model customers a day the serving share can handle. */
export const servingCustomers = (s: GameV2) => servingPf(s) * COMPUTE.customersPerPf;
/** A MW of today's bought GPUs, in PF (the yardstick for training needs and cloud prices). */
export const yardstick = (s: GameV2) => boughtChip(s).pfPerMw;

/** PF-days a model project needs to finish training. */
export const trainingNeed = (s: GameV2, size: string) => Math.round((COMPUTE.trainMwDays[size] ?? 1500) * yardstick(s));
/** PF-days the AGI run needs. */
export const agiNeed = (s: GameV2) => Math.round(COMPUTE.agiMwDays * yardstick(s));

/** Review points a model gains (or loses) from how much compute went into it against what it needed. */
export const scaleBonus = (pfDays: number, need: number) => (need > 0 ? clamp(1.5 * Math.log2(Math.max(1, pfDays) / need), -2, 1.5) : 0);

// ---------------------------------------------------------------- Building

export type CampusPart = 'hall' | 'chips' | 'cooling' | 'power' | 'network' | 'size';

/** Why a site can't take a campus (needs the research, an office in that region, or the cash). */
export function campusError(s: GameV2, siteId: string): string | null {
  const st = SITES.find((x) => x.id === siteId);
  if (!st) return 'Unknown site.';
  if (!s.research.done.includes('datacenters')) return 'Research data center engineering first.';
  if (st.region !== 'na' && !s.offices.includes(st.region)) return `Open a sales office in that region first.`;
  if ((s.compute?.campuses ?? []).some((c) => c.siteId === siteId)) return 'You already have a campus there.';
  const cost = COMPUTE.sizes[0]!.cost + COMPUTE.hall.cost;
  if (s.cash < cost) return `A campus with its first hall costs ${money(cost)}.`;
  return null;
}

export function buildCampus(s: GameV2, siteId: string): string | null {
  const err = campusError(s, siteId);
  if (err) return err;
  const c = ensureCompute(s);
  const cost = COMPUTE.sizes[0]!.cost + COMPUTE.hall.cost;
  spend(s, 'other', cost);
  const own = ownChips(s)[0];
  c.campuses.push({ id: newId(s, 'campus'), siteId, size: 0, halls: 0, building: [s.day + COMPUTE.hall.days], chip: own ? ownChip(own) : boughtChip(s), cooling: 0, power: 0, network: 0, openedDay: s.day });
  log(s, `Breaking ground on a campus at ${site(siteId).name} (${money(cost)}). The first hall opens in ${COMPUTE.hall.days} days.`);
  return null;
}

/** The next option for a campus part, what it costs, and why it can't be bought (if so). */
export function upgradeQuote(s: GameV2, c: Campus, part: CampusPart, option?: number | string): { cost: number; label: string; error: string | null } {
  const halls = c.halls + c.building.length;
  const cap = COMPUTE.sizes[c.size]!.halls;
  const err = (cost: number, label: string, why?: string | null) => ({ cost, label, error: why ?? (s.cash < cost ? `Needs ${money(cost)}.` : null) });
  switch (part) {
    case 'hall':
      return err(COMPUTE.hall.cost, 'Add hall', halls >= cap ? 'The campus is full: grow it first.' : null);
    case 'size': {
      const next = COMPUTE.sizes[c.size + 1];
      return next ? err(next.cost - COMPUTE.sizes[c.size]!.cost, `Grow to ${next.name.toLowerCase()}`) : err(0, 'Largest', 'Already the largest.');
    }
    case 'cooling': {
      const to = typeof option === 'number' ? option : c.cooling + 1;
      const o = COMPUTE.cooling[to];
      return o && to > c.cooling ? err(Math.max(1, halls) * o.perHall, o.name) : err(0, 'Top tier', 'Already the best there is.');
    }
    case 'power': {
      const to = typeof option === 'number' ? option : (c.power + 1) % COMPUTE.power.length;
      const o = COMPUTE.power[to]!;
      return to === c.power ? err(0, o.name, 'Already on it.') : err(Math.max(1, halls) * o.perHall * (to === 1 && !site(c.siteId).solar ? 1.3 : 1), o.name);
    }
    case 'network': {
      const o = COMPUTE.network[c.network + 1];
      return o ? err(o.cost, o.name) : err(0, 'Top tier', 'Already the best there is.');
    }
    case 'chips': {
      const p = typeof option === 'string' && option !== 'bought' ? s.products.find((x) => x.id === option && x.kind === 'accel') : undefined;
      const chip = option === 'bought' || !p ? boughtChip(s) : ownChip(p);
      return err(refitCost({ ...c, halls: Math.max(1, halls) }, chip), `Refit with ${chip.name}`, typeof option === 'string' && option !== 'bought' && !p ? 'Unknown chip.' : null);
    }
  }
}

export function upgradeCampus(s: GameV2, campusId: string, part: CampusPart, option?: number | string): string | null {
  const c = ensureCompute(s).campuses.find((x) => x.id === campusId);
  if (!c) return 'No such campus.';
  const q = upgradeQuote(s, c, part, option);
  if (q.error) return q.error;
  spend(s, 'other', q.cost);
  const name = site(c.siteId).name;
  switch (part) {
    case 'hall':
      c.building.push(s.day + COMPUTE.hall.days);
      log(s, `A new hall is going up at ${name} (${money(q.cost)}, ${COMPUTE.hall.days} days).`);
      break;
    case 'size':
      c.size++;
      log(s, `${name} is now a ${COMPUTE.sizes[c.size]!.name.toLowerCase()}.`);
      break;
    case 'cooling':
      c.cooling = typeof option === 'number' ? option : c.cooling + 1;
      log(s, `${name} switched to ${COMPUTE.cooling[c.cooling]!.name.toLowerCase()}.`);
      break;
    case 'power':
      c.power = typeof option === 'number' ? option : (c.power + 1) % COMPUTE.power.length;
      log(s, `${name} now runs on ${COMPUTE.power[c.power]!.name.toLowerCase()}.`);
      break;
    case 'network':
      c.network++;
      log(s, `${name} got ${COMPUTE.network[c.network]!.name.toLowerCase()}.`);
      break;
    case 'chips': {
      const p = typeof option === 'string' && option !== 'bought' ? s.products.find((x) => x.id === option) : undefined;
      c.chip = p ? ownChip(p) : boughtChip(s);
      log(s, `${name} refitted with ${c.chip.name}: ${c.chip.pfPerMw} PF per MW.`, 'good');
      break;
    }
  }
  return null;
}

// ---------------------------------------------------------------- Daily

/** Daily: halls finish, power is paid, training compute flows to models in training and to the AGI run. */
export function tickCompute(s: GameV2): void {
  const c = ensureCompute(s);
  for (const cp of c.campuses) {
    const done = cp.building.filter((d) => s.day >= d).length;
    if (done) {
      cp.building = cp.building.filter((d) => s.day < d);
      cp.halls += done;
      log(s, `A hall opened at ${site(cp.siteId).name}: ${Math.round(campusPf(cp)).toLocaleString('en-US')} PF there now.`, 'good');
    }
    spend(s, 'facilities', campusMonthly(cp) / 30);
  }
  const pf = trainingPf(s);
  const training = s.projects.filter((p) => p.phase === 'training');
  const agiRunning = !!s.agi && s.ending !== 'safe' && s.ending !== 'reckless' && (s.agi.pfDays ?? 0) < (s.agi.need ?? Infinity);
  const shares = training.length + (agiRunning ? 1 : 0);
  if (shares) {
    const each = pf / shares;
    for (const p of training) {
      p.progress = Math.min(p.need * 4, p.progress + each);
      p.pfDays = (p.pfDays ?? 0) + each;
    }
    if (agiRunning) s.agi!.pfDays = (s.agi!.pfDays ?? 0) + each;
  }
}

/** After sales: idle serving capacity is rented out as cloud. */
export function tickCloud(s: GameV2): number {
  const c = ensureCompute(s);
  const idle = Math.max(0, servingPf(s) - (c.demand ?? 0) / COMPUTE.customersPerPf);
  if (idle <= 0) return 0;
  const revenue = (idle / Math.max(1, yardstick(s))) * COMPUTE.cloudPerMwDay;
  return revenue;
}

/** Share of AI-model demand the serving capacity can handle today (records the demand for the cloud). */
export function servingRatio(s: GameV2, demand: number): number {
  const c = ensureCompute(s);
  c.demand = demand;
  if (demand <= 0) return 1;
  return Math.min(1, servingCustomers(s) / demand);
}

/** One-button growth (the old "build a data center"): a new campus, or the next hall or size where there's room. */
export function growCompute(s: GameV2): string | null {
  const c = ensureCompute(s);
  for (const cp of c.campuses) {
    if (!upgradeQuote(s, cp, 'hall').error) return upgradeCampus(s, cp.id, 'hall');
  }
  for (const cp of c.campuses) {
    if (!upgradeQuote(s, cp, 'size').error) return upgradeCampus(s, cp.id, 'size');
  }
  const open = SITES.filter((x) => !campusError(s, x.id)).sort((a, b) => a.power - b.power)[0];
  return open ? buildCampus(s, open.id) : 'Nothing to build right now.';
}

/** Your best model on sale (for the HQ and campus views). */
export const bestModel = (s: GameV2) => activeProducts(s).filter((p) => p.kind === 'model').sort((a, b) => currentScore(b, s.day) - currentScore(a, s.day))[0];

export type { Project };
