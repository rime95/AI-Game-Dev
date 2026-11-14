import type { Content, Founding, ProductTypeId } from '@stm/content';
import type { CompanyRival, FoundingState, GameState, LogKind, PendingEvent, Product, ProductDesign, ProductProject } from './types';
import { TUNING } from './tuning';
import { pickWeighted, rand, randInt } from './rng';
import { facilitiesCost, refreshHq, stageDef, tickHq } from './hq';
import { normalizeSplit } from './chipDesign';

/**
 * The chip-company years (1991 → the AI era). One turn is one month (state.week counts months).
 * We design processors and graphics chips with the die designer, the factory makes them, the
 * press reviews them, and they sell to segments against rival chips. Rivals always trail our best.
 * Research unlocks generations, new kinds of chip and finally the AI chapter.
 */

type Kind = 'type' | 'generation';

export function companyYear(state: GameState): number {
  return (state.founding?.startYear ?? 1991) + Math.floor(state.week / 12);
}

/** Performance an average new chip has this month; reviews score against it. */
export function chipBar(month: number): number {
  return TUNING.chipBarStart * (1 + TUNING.chipBarGrowth) ** month;
}

export function scoreFor(perf: number, month: number): number {
  return Math.max(1, Math.min(10, 5 + 3.5 * Math.log2(Math.max(0.01, perf) / chipBar(month))));
}

/** A chip's score drifts down as the industry moves on: about a point a year. */
export function scoreNowFor(score: number, monthsOld: number): number {
  return Math.max(1, score - 3.5 * monthsOld * Math.log2(1 + TUNING.chipBarGrowth));
}

export function typeDef(content: Content, id: ProductTypeId) {
  return content.founding.types.find((t) => t.id === id)!;
}
export function genDef(content: Content, id: string) {
  return content.founding.generations.find((g) => g.id === id);
}

export function isUnlocked(content: Content, f: FoundingState, kind: Kind, id: string): boolean {
  const list: { id: string; unlocked: boolean }[] = kind === 'type' ? content.founding.types : content.founding.generations;
  if (list.find((x) => x.id === id)?.unlocked) return true;
  return content.founding.research.some((r) => f.unlocked.includes(r.id) && r.unlocks?.[kind] === id);
}

export function researchError(state: GameState, content: Content, researchId: string): string | null {
  const f = state.founding;
  const r = content.founding.research.find((x) => x.id === researchId);
  if (!f || !r) return 'Unknown research.';
  if (f.unlocked.includes(r.id)) return 'Already done.';
  if (r.year && companyYear(state) < r.year) return `Not possible until ${r.year}.`;
  const missing = r.requires.find((id) => !f.unlocked.includes(id));
  if (missing) return `Needs ${content.founding.research.find((x) => x.id === missing)?.name ?? missing} first.`;
  if (f.researchPoints < r.cost) return `Needs ${r.cost} research points.`;
  return null;
}

/** Research boosts bought so far. */
export function researchBoosts(content: Content, f: FoundingState): { bugs: number; sales: number; score: Partial<Record<ProductTypeId, number>> } {
  const out = { bugs: 0, sales: 0, score: {} as Partial<Record<ProductTypeId, number>> };
  for (const r of content.founding.research) {
    if (!f.unlocked.includes(r.id) || !r.boost) continue;
    out.bugs += r.boost.bugs ?? 0;
    out.sales += r.boost.sales ?? 0;
    if (r.boost.type && r.boost.score) out.score[r.boost.type] = (out.score[r.boost.type] ?? 0) + r.boost.score;
  }
  return out;
}

export function aiReady(content: Content, f: FoundingState | null): boolean {
  return !!f && content.founding.research.some((r) => r.opensAiEra && f.unlocked.includes(r.id));
}

/** Chip designers at work: seated at a workbench or hardware lab count fully, others half. */
export function designers(state: GameState): number {
  const seated = state.hq.seated.hardwareEng ?? 0;
  return (state.hq.effective.hardwareEng ?? 0) + Math.max(0, state.staff.hardwareEng - seated) * 0.5 * state.hq.productivity;
}

/** How many chips we can design at once: one, plus one per five chip designers. */
export function designSlots(state: GameState): number {
  return 1 + Math.floor(state.staff.hardwareEng / 5);
}

/** Design quality from the team: a lone founder ≈ 1, a big team up to ~1.45. */
export function designQuality(state: GameState): number {
  return Math.min(1.45, 0.85 + 0.15 * Math.log2(1 + designers(state)));
}

/** How close a die split is to what this kind of chip wants (1 = spot on). */
export function splitFit(content: Content, type: ProductTypeId, split: ProductDesign['split']): number {
  const s = normalizeSplit(split);
  const ideal = typeDef(content, type).ideal;
  const diff = Math.abs(s.compute - ideal.compute) + Math.abs(s.sram - ideal.sram) + Math.abs(s.memory - ideal.memory) + Math.abs(s.interconnect - ideal.interconnect);
  return Math.max(0.2, 1 - 0.6 * diff);
}

export interface DesignPreview {
  errors: string[];
  months: number;
  devCost: number;
  unitCost: number;
  price: number;
  perf: number;
  /** Expected review (before buzz and the press's mood). */
  expectedScore: number;
  bugChance: number;
  fit: number;
  areaMm2: number;
}

const TYPE_COST: Record<ProductTypeId, number> = { cpu: 1, gpu: 1, console: 1.3, dcgpu: 1.6 };

export function designPreview(state: GameState, content: Content, d: ProductDesign): DesignPreview {
  const f = state.founding;
  const errors: string[] = [];
  const gen = genDef(content, d.genId);
  const type = content.founding.types.find((t) => t.id === d.type);
  if (!f || !gen || !type) return { errors: ['Not possible right now.'], months: 0, devCost: 0, unitCost: 0, price: 0, perf: 0, expectedScore: 0, bugChance: 0, fit: 0, areaMm2: 0 };
  if (!isUnlocked(content, f, 'type', d.type)) errors.push(`Research the ${type.name.toLowerCase()} first.`);
  if (!isUnlocked(content, f, 'generation', d.genId)) errors.push(`Research the ${gen.name} process first.`);
  if (f.projects.length >= designSlots(state)) errors.push(designSlots(state) === 1 ? 'We are already designing a chip.' : 'Every design team is busy.');
  if (!d.name.trim()) errors.push('Give the chip a name.');
  const scale = Math.max(0.6, Math.min(1.4, d.scale));
  const area = gen.dieAreaMm2 * scale;
  const yieldRate = gen.baseYield * 0.95 ** Math.max(0, (scale - 1) * 10);
  const unitCost = (area * gen.costPerMm2) / yieldRate;
  const devCost = Math.round(gen.devCost * scale ** 1.2 * TYPE_COST[d.type]);
  if (devCost > state.cash) errors.push('Not enough cash to design this chip.');
  const fit = splitFit(content, d.type, d.split);
  const perf = gen.perfPerMm2 * area ** 0.9 * fit * designQuality(state);
  const months = gen.months + type.extraMonths + (scale > 1.15 ? 1 : 0);
  const boost = researchBoosts(content, f);
  const expectedScore = Math.min(10, scoreFor(perf, state.week + months) + (boost.score[d.type] ?? 0));
  const bugChance = Math.min(0.9, gen.bugChance * 0.85 ** designers(state) * (1 - Math.min(0.8, boost.bugs)) * (scale > 1.15 ? 1.25 : 1));
  return { errors, months, devCost, unitCost, price: Math.round(unitCost * TUNING.chipMarkup), perf, expectedScore, bugChance, fit, areaMm2: area };
}

export function newFoundingState(content: Content, state: { rng: number }): FoundingState {
  const fd = content.founding;
  return {
    startYear: fd.startYear,
    projects: [],
    products: [],
    researchPoints: 0,
    unlocked: [],
    trust: TUNING.foundingStartTrust,
    // Established makers already have a chip on sale (the later markets' makers arrive with their market).
    rivals: fd.rivals.map((r) => {
      const seg = fd.segments.find((s) => s.buys === r.type);
      const here = !seg || seg.fromYear <= fd.startYear;
      return {
        id: r.id,
        score: Math.round((5.5 - r.trail * 0.5) * 10) / 10,
        chips: here ? 1 : 0,
        lastChip: here ? `${r.prefix} 100` : '',
        month: here ? -6 : 0,
        nextReleaseMonth: randInt(state, 3, 10),
      };
    }),
    lastEventMonth: 0,
    report: null,
    totalSales: 0,
    chapter: { index: 0, done: [] },
  };
}

export function startDesign(state: GameState, content: Content, d: ProductDesign): string | null {
  const pv = designPreview(state, content, d);
  if (pv.errors.length) return pv.errors[0]!;
  const f = state.founding!;
  state.cash -= pv.devCost;
  const design = { ...d, name: d.name.trim(), scale: Math.max(0.6, Math.min(1.4, d.scale)), split: normalizeSplit(d.split) };
  f.projects.push({ id: `p-${state.nextId++}`, design, monthsLeft: pv.months, totalMonths: pv.months, respun: false, buzz: 0, qualityMult: 1, devCost: pv.devCost });
  addReport(f, 'designCost', pv.devCost);
  push(state, 'info', `Started designing ${design.name}, a ${typeDef(content, d.type).name.toLowerCase()}. It goes to the factory and comes back in ${pv.months} months.`);
  return null;
}

/** What the next level of buzz costs for a chip in progress, or null when buzz is maxed. */
export function buzzCost(state: GameState, content: Content, projectId: string): { cost: number; gain: number; label: string } | null {
  const p = state.founding?.projects.find((x) => x.id === projectId);
  if (!p || p.buzz >= 100) return null;
  const level = Math.round(p.buzz / 34);
  const steps = [
    { share: 0.15, gain: 30, label: 'Magazine ads' },
    { share: 0.3, gain: 35, label: 'Trade show booth' },
    { share: 0.6, gain: 35, label: 'Big launch event' },
  ];
  const s = steps[Math.min(level, steps.length - 1)]!;
  void content;
  return { cost: Math.round(p.devCost * s.share), gain: s.gain, label: s.label };
}

export function buyBuzz(state: GameState, content: Content, projectId: string): string | null {
  const next = buzzCost(state, content, projectId);
  if (!next) return 'There is already plenty of buzz.';
  if (state.cash < next.cost) return 'Not enough cash.';
  const p = state.founding!.projects.find((x) => x.id === projectId)!;
  state.cash -= next.cost;
  p.buzz = Math.min(100, p.buzz + next.gain);
  addReport(state.founding!, 'buzzCost', next.cost);
  push(state, 'info', `${next.label} for ${p.design.name}: buzz is now ${p.buzz}.`);
  return null;
}

export function setChipPrice(state: GameState, productId: string, price: number): string | null {
  const p = state.founding?.products.find((x) => x.id === productId);
  if (!p) return 'Unknown chip.';
  if (!(price > p.unitCost * 0.5 && price < p.unitCost * 10)) return 'That price makes no sense for this chip.';
  p.price = Math.round(price);
  return null;
}

export function buyResearch(state: GameState, content: Content, researchId: string): string | null {
  const err = researchError(state, content, researchId);
  if (err) return err;
  const f = state.founding!;
  const r = content.founding.research.find((x) => x.id === researchId)!;
  f.researchPoints -= r.cost;
  f.unlocked.push(r.id);
  push(state, 'good', `Research done: ${r.name}. ${r.blurb}`);
  return null;
}

/** Spend of a segment this month; zero before it exists. */
export function segmentSpend(seg: Founding['segments'][number], year: number, month: number, startYear: number): number {
  if (year < seg.fromYear) return 0;
  const years = (month - (seg.fromYear - startYear) * 12) / 12;
  return seg.monthlySpend * (1 + seg.growth) ** Math.max(0, years);
}

/** How strongly buyers want a chip: doubles every 1.2 review points; price above the usual markup puts them off. */
function pull(effScore: number, priceRatio: number, sensitivity: number): number {
  return 2 ** ((effScore - 5) / 1.2) * priceRatio ** -sensitivity;
}

export interface SegmentShare {
  segmentId: string;
  spend: number;
  ours: number;
  /** Our share of the segment (0–1) and the leader. */
  share: number;
  leader: string;
  byProduct: Record<string, number>;
}

/** Who sells what in each segment this month. */
export function segmentShares(state: GameState, content: Content): SegmentShare[] {
  const f = state.founding!;
  const year = companyYear(state);
  const boost = researchBoosts(content, f);
  const salesFactor = (0.5 + f.trust / 100) * (1 + boost.sales) * (1 + Math.min(0.5, 0.05 * (state.hq.effective.product ?? 0)));
  const out: SegmentShare[] = [];
  for (const seg of content.founding.segments) {
    const spend = segmentSpend(seg, year, state.week, f.startYear);
    if (spend <= 0) continue;
    const mine = f.products.filter((p) => !p.retired && p.design.type === seg.buys);
    const theirs = f.rivals.filter((r) => r.chips > 0 && content.founding.rivals.find((d) => d.id === r.id)?.type === seg.buys);
    const byProduct: Record<string, number> = {};
    // Our best chip carries our pull; older ones on the shelf add a little (they mostly eat each other's sales).
    const pulls = mine
      .map((p) => ({ id: p.id, v: pull(scoreNowFor(p.reception, state.week - p.month), p.price / (p.unitCost * TUNING.chipMarkup), seg.priceSensitivity) * salesFactor }))
      .sort((a, b) => b.v - a.v);
    let ours = 0;
    pulls.forEach((x, i) => (ours += x.v * (i === 0 ? 1 : TUNING.chipShelfOverlap)));
    const pullSum = pulls.reduce((n, x) => n + x.v, 0);
    for (const x of pulls) byProduct[x.id] = pullSum > 0 ? x.v / pullSum : 0;
    let total = ours;
    let leader = ours > 0 ? 'you' : '';
    let best = ours;
    for (const r of theirs) {
      // Established makers have brand loyalty on their side.
      const v = pull(scoreNowFor(r.score, state.week - r.month), 1, seg.priceSensitivity) * TUNING.rivalBrand;
      total += v;
      if (v > best) {
        best = v;
        leader = r.id;
      }
    }
    const share = total > 0 ? ours / total : 0;
    for (const id of Object.keys(byProduct)) byProduct[id] = spend * share * byProduct[id]!;
    out.push({ segmentId: seg.id, spend, ours: spend * share, share, leader, byProduct });
  }
  return out;
}

export function leadsSegment(state: GameState, content: Content, segmentId: string): boolean {
  return segmentShares(state, content).find((s) => s.segmentId === segmentId)?.leader === 'you';
}

/** One month of the chip-company years. */
export function tickCompany(state: GameState, content: Content): void {
  const f = state.founding!;
  const fd = content.founding;

  // 1. The office: four weeks of morale and settling in. Researchers bring in points.
  for (let i = 0; i < 4; i++) tickHq(state, content);
  refreshHq(state, content);
  f.researchPoints += Math.round((state.hq.effective.research ?? 0) * TUNING.researchPointsPerResearcher * 10) / 10;

  // 2. Chips at the factory.
  for (const p of [...f.projects]) {
    p.monthsLeft -= 1;
    if (p.monthsLeft > 0) continue;
    const pv = designPreview(state, content, p.design);
    if (!p.respun && rand(state) < pv.bugChance) {
      const extra = Math.max(1, Math.ceil(p.totalMonths * 0.5));
      const cost = Math.round(p.devCost * 0.4);
      p.respun = true;
      p.monthsLeft = extra;
      p.totalMonths += extra;
      state.cash -= cost;
      addReport(f, 'designCost', cost);
      push(state, 'bad', `The first ${p.design.name} chips came back with a bug. Fixing it and sending it again: ${extra} more months, $${Math.round(cost / 1000)}K.`);
      continue;
    }
    release(state, content, p, pv.perf, pv.unitCost);
  }

  // 3. Sales.
  let sales = 0;
  let cogs = 0;
  for (const p of f.products) p.lastMonthRevenue = 0;
  for (const seg of segmentShares(state, content)) {
    for (const [id, rev] of Object.entries(seg.byProduct)) {
      const p = f.products.find((x) => x.id === id)!;
      const units = rev / p.price;
      p.lastMonthRevenue += rev;
      p.revenue += rev;
      p.units += units;
      sales += rev;
      cogs += units * p.unitCost;
    }
  }
  for (const p of f.products) {
    if (p.retired) continue;
    p.monthsOnSale += 1;
    if (scoreNowFor(p.reception, state.week + 1 - p.month) <= 1.5 && p.monthsOnSale > 12) {
      p.retired = true;
      push(state, 'info', `${p.design.name} is too old to sell any more. Retired after ${p.monthsOnSale} months.`);
    }
  }
  f.totalSales += sales;

  // 4. Costs: salaries (the founder takes none), rent and room upkeep.
  const headcount = Object.values(state.staff).reduce((n, c) => n + c, 0);
  const salaries = Math.max(0, headcount - 1) * TUNING.foundingSalaryPerMonth;
  const rent = stageDef(content, state.hq.stage).founding?.rentPerMonth ?? 0;
  const upkeep = facilitiesCost(state, content).upkeep * (52 / 12) * TUNING.foundingCostScale;
  state.cash += sales - cogs - salaries - rent - upkeep;
  f.report = { sales, costOfGoods: cogs, salaries, rent, upkeep, designCost: f.report?.designCost ?? 0, buzzCost: f.report?.buzzCost ?? 0 };

  // 5. Rivals: each trails our best chip of its kind.
  tickRivals(state, content);

  // 6. At most one decision every few months.
  if (!state.pendingEvent && state.week - f.lastEventMonth >= TUNING.foundingEventCooldown && rand(state) < TUNING.foundingEventChance) {
    const pool = content.events.filter((e) => e.trigger === 'founding' && (!e.requiresProject || f.projects.length > 0) && (e.id !== 'f-poach' || headcount > 1));
    const ev = pickWeighted(state, pool);
    if (ev) {
      state.pendingEvent = toPending(ev);
      f.lastEventMonth = state.week;
    }
  }

  // 7. Chapters.
  checkChapter(state, content);

  // 8. Out of money for too long ends the company.
  if (state.cash < 0) {
    state.weeksNegative += 1;
    if (state.weeksNegative >= TUNING.foundingBankruptMonths) {
      state.status = 'bankrupt';
      push(state, 'bad', 'Out of cash for too long. The company is bankrupt.');
    } else push(state, 'bad', `We are out of cash. Bankrupt in ${TUNING.foundingBankruptMonths - state.weeksNegative} months unless sales pick up.`);
  } else state.weeksNegative = 0;

  state.week += 1;
  f.report.designCost = 0;
  f.report.buzzCost = 0;
  state.history.push({ week: state.week, cash: state.cash, users: f.products.length, bestScore: Math.max(0, ...f.products.map((p) => p.score)) });
}

function release(state: GameState, content: Content, p: ProductProject, perf: number, unitCost: number): void {
  const f = state.founding!;
  const fd = content.founding;
  const boost = researchBoosts(content, f);
  const base = Math.min(10, scoreFor(perf * p.qualityMult, state.week) + (boost.score[p.design.type] ?? 0) + (rand(state) - 0.5) * 0.8);
  const reviews = fd.reviewers.map((r) => {
    const score = Math.max(1, Math.min(10, Math.round(base + (rand(state) - 0.5) * 2.2)));
    const band = score <= 4 ? r.quotes.low : score <= 7 ? r.quotes.mid : r.quotes.high;
    return { reviewerId: r.id, score, quote: band[randInt(state, 0, band.length - 1)]! };
  });
  const score = Math.round((reviews.reduce((n, r) => n + r.score, 0) / reviews.length) * 10) / 10;
  const reception = launchReception(score, p.buzz);
  // Our best of this kind before this chip, as it stands today.
  const prevBest = Math.max(0, ...f.products.filter((q) => q.design.type === p.design.type).map((q) => scoreNowFor(q.score, state.week - q.month)));
  const product: Product = {
    id: `chip-${state.nextId++}`,
    design: p.design,
    month: state.week,
    perf: perf * p.qualityMult,
    score,
    reception,
    buzz: p.buzz,
    reviews,
    unitCost,
    price: Math.round(unitCost * TUNING.chipMarkup),
    monthsOnSale: 0,
    revenue: 0,
    units: 0,
    lastMonthRevenue: 0,
    retired: false,
  };
  f.products.push(product);
  f.projects = f.projects.filter((x) => x.id !== p.id);
  f.trust = Math.max(0, Math.min(100, f.trust + (reception - 5) * 1.5));
  const points = 1 + Math.round(score * 0.6);
  f.researchPoints += points;
  state.hq.morale = Math.max(0, Math.min(100, state.hq.morale + (reception - 5)));
  push(state, reception >= 5 ? 'good' : 'bad', `${p.design.name} is out! Reviews average ${score.toFixed(1)}/10${p.buzz ? `, launch reception ${reception.toFixed(1)}` : ''}. +${points} research points.`);
  for (const r of f.rivals) {
    const def = fd.rivals.find((d) => d.id === r.id);
    if (def?.type !== p.design.type || r.chips === 0) continue;
    const theirs = scoreNowFor(r.score, state.week - r.month);
    if (score > theirs && prevBest <= theirs) push(state, 'good', `${product.design.name} beats ${def.name}'s latest chip.`);
  }
}

/** Buzz raises expectations: a good chip with buzz flies, a weak one with lots of buzz disappoints. */
export function launchReception(score: number, buzz: number): number {
  const expectation = 4 + buzz / 20;
  const r = score + buzz / 50 - Math.max(0, expectation - score) * 0.6;
  return Math.round(Math.max(1, Math.min(10, r)) * 10) / 10;
}

function tickRivals(state: GameState, content: Content): void {
  const f = state.founding!;
  const year = companyYear(state);
  for (const rival of f.rivals) {
    if (state.week < rival.nextReleaseMonth) continue;
    const def = content.founding.rivals.find((r) => r.id === rival.id);
    if (!def) continue;
    const seg = content.founding.segments.find((s) => s.buys === def.type);
    if (!seg || year < seg.fromYear) {
      rival.nextReleaseMonth = state.week + 6;
      continue;
    }
    // Our best chip of this kind, as it stands today.
    const ours = f.products.filter((p) => p.design.type === def.type).map((p) => scoreNowFor(p.score, state.week - p.month));
    const best = ours.length ? Math.max(...ours) : null;
    const target = best !== null ? best - def.trail : 5 - def.trail * 0.5;
    rival.score = Math.round(Math.max(1, Math.min(best !== null ? best - 0.1 : 10, target + (rand(state) - 0.5) * 0.4)) * 10) / 10;
    rival.chips += 1;
    rival.month = state.week;
    rival.lastChip = `${def.prefix} ${100 + rival.chips * 10 + randInt(state, 0, 9)}`;
    rival.nextReleaseMonth = state.week + randInt(state, 8, 14);
    push(state, 'rival', `${def.name} released the ${rival.lastChip}. Reviews: ${rival.score.toFixed(1)}/10.`);
  }
}

/** Is a chapter goal met? */
export function goalMet(state: GameState, content: Content, g: Founding['chapters'][number]['goals'][number]): boolean {
  const f = state.founding!;
  const v = g.value ?? 0;
  switch (g.kind) {
    case 'chips':
      return f.products.length >= v;
    case 'review':
      return f.products.some((p) => p.score >= v);
    case 'sales':
      return f.totalSales >= v;
    case 'typeShipped':
      return (g.ref ?? '').split('+').every((t) => f.products.some((p) => p.design.type === t));
    case 'stage': {
      const at = content.hq.stages.findIndex((s) => s.id === state.hq.stage);
      return at >= content.hq.stages.findIndex((s) => s.id === g.ref);
    }
    case 'staff':
      return Object.values(state.staff).reduce((n, c) => n + c, 0) >= v;
    case 'research':
      return f.unlocked.includes(g.ref ?? '');
    case 'leadSegment':
      return leadsSegment(state, content, g.ref ?? '');
  }
}

function checkChapter(state: GameState, content: Content): void {
  const f = state.founding!;
  const ch = content.founding.chapters[f.chapter.index];
  if (!ch) return;
  for (const g of ch.goals) if (!f.chapter.done.includes(g.id) && goalMet(state, content, g)) f.chapter.done.push(g.id);
  if (!ch.goals.every((g) => f.chapter.done.includes(g.id))) return;
  if (ch.reward.cash) state.cash += ch.reward.cash;
  if (ch.reward.researchPoints) f.researchPoints += ch.reward.researchPoints;
  if (ch.reward.trust) f.trust = Math.min(100, f.trust + ch.reward.trust);
  push(state, 'good', `Chapter complete: ${ch.name}. ${ch.reward.text}`);
  f.chapter = { index: f.chapter.index + 1, done: [] };
}

function addReport(f: FoundingState, key: 'designCost' | 'buzzCost', amount: number): void {
  f.report = { ...(f.report ?? { sales: 0, costOfGoods: 0, salaries: 0, rent: 0, upkeep: 0, designCost: 0, buzzCost: 0 }) };
  f.report[key] += amount;
}

function toPending(ev: Content['events'][number]): PendingEvent {
  return { eventId: ev.id, deck: ev.deck, speaker: ev.speaker, title: ev.title, body: ev.body, choices: ev.choices.map((c) => ({ ...c })) };
}

function push(state: GameState, kind: LogKind, text: string): void {
  state.log.push({ week: state.week, kind, text });
  if (state.log.length > TUNING.logLimit) state.log.splice(0, state.log.length - TUNING.logLimit);
}

export type { CompanyRival };
