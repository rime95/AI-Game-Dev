import type { Content, FitLevel, Founding } from '@stm/content';
import type { FoundingChip, FoundingProject, FoundingRival, FoundingState, GameState, LogKind, PendingEvent } from './types';
import { TUNING } from './tuning';
import { pickWeighted, rand, randInt } from './rng';
import { facilitiesCost, refreshHq, stageDef, tickHq } from './hq';

/**
 * The founding era (1991–98): a chip startup in a garage. One turn is one month (state.week
 * counts months here). Pick a chip type and a market, the team designs it for a few months,
 * the press reviews it, and it sells for about a year. Reviews teach which pairs fit,
 * research unlocks new chips, markets and generations, and rivals keep pace with us.
 */

type Kind = 'type' | 'market' | 'generation';

export const fitKey = (typeId: string, marketId: string) => `${typeId}:${marketId}`;

export function foundingYear(state: GameState): number {
  return (state.founding?.startYear ?? 1991) + Math.floor(state.week / 12);
}

/** What an average new chip scores 5 against this month: the industry keeps getting better. */
export function marketBar(month: number): number {
  return TUNING.foundingBarStart * (1 + TUNING.foundingBarGrowth) ** month;
}

/** Review score (1–10) for a chip of this quality released this month. */
export function scoreFor(quality: number, month: number): number {
  return Math.max(1, Math.min(10, 5 + 3.5 * Math.log2(Math.max(0.01, quality) / marketBar(month))));
}

/** Research boosts bought so far. */
export function boosts(content: Content, f: FoundingState): { design: number; polish: number; sales: number } {
  const out = { design: 0, polish: 0, sales: 0 };
  for (const r of content.founding.research) {
    if (!f.unlocked.includes(r.id) || !r.boost) continue;
    out.design += r.boost.design ?? 0;
    out.polish += r.boost.polish ?? 0;
    out.sales += r.boost.sales ?? 0;
  }
  return out;
}

export function isUnlocked(content: Content, f: FoundingState, kind: Kind, id: string): boolean {
  const list: { id: string; unlocked: boolean }[] =
    kind === 'type' ? content.founding.types : kind === 'market' ? content.founding.markets : content.founding.generations;
  if (list.find((x) => x.id === id)?.unlocked) return true;
  return content.founding.research.some((r) => f.unlocked.includes(r.id) && r.unlocks?.[kind] === id);
}

/** Why a research node can't be bought right now, or null. */
export function researchError(state: GameState, content: Content, researchId: string): string | null {
  const f = state.founding;
  const r = content.founding.research.find((x) => x.id === researchId);
  if (!f || !r) return 'Unknown research.';
  if (f.unlocked.includes(r.id)) return 'Already done.';
  if (r.year && foundingYear(state) < r.year) return `Not possible until ${r.year}.`;
  if (f.researchPoints < r.cost) return `Needs ${r.cost} research points.`;
  return null;
}

/**
 * Design and polish points the team makes in a month. Designers sitting at a workbench or in a
 * hardware lab work best; product people add polish. Bigger teams help with diminishing returns.
 */
export function teamOutput(state: GameState, content: Content): { design: number; polish: number; total: number } {
  const f = state.founding!;
  const p = state.hq.productivity;
  const seatedHw = state.hq.seated.hardwareEng ?? 0;
  const designers = (state.hq.effective.hardwareEng ?? 0) + Math.max(0, state.staff.hardwareEng - seatedHw) * 0.5 * p;
  const seatedPm = state.hq.seated.product ?? 0;
  const product = (state.hq.effective.product ?? 0) + Math.max(0, state.staff.product - seatedPm) * 0.5 * p;
  const raw = designers + product;
  if (raw <= 0) return { design: 0, polish: 0, total: 0 };
  const total = TUNING.foundingPointsPerPerson * raw ** TUNING.foundingTeamExponent;
  const designShare = (designers * 0.7 + product * 0.15) / raw;
  const b = boosts(content, f);
  return { design: total * designShare * (1 + b.design), polish: total * (1 - designShare) * (1 + b.polish), total };
}

/** Quality of a finished (or hypothetical) project. */
export function projectQuality(content: Content, p: Pick<FoundingProject, 'typeId' | 'genId' | 'design' | 'polish' | 'totalMonths' | 'qualityMult'>, fit: FitLevel): number {
  const type = content.founding.types.find((t) => t.id === p.typeId)!;
  const gen = content.founding.generations.find((g) => g.id === p.genId)!;
  const points = p.design + p.polish;
  if (points <= 0) return 0;
  const share = p.design / points;
  const balance = 1 - 0.6 * Math.abs(share - type.design);
  return (points / Math.max(1, p.totalMonths)) * balance * gen.quality * TUNING.foundingFitQuality[fit] * p.qualityMult;
}

export function fitOf(content: Content, typeId: string, marketId: string): FitLevel {
  return content.founding.fit[typeId]?.[marketId] ?? 'ok';
}

export interface ProjectPreview {
  months: number;
  cost: number;
  /** What we know about this pair, if we've shipped it before. */
  knownFit: FitLevel | null;
  /** Expected review score with today's team, assuming an "ok" fit when we don't know. */
  expectedScore: number;
  errors: string[];
}

export function projectPreview(state: GameState, content: Content, typeId: string, marketId: string, genId: string): ProjectPreview {
  const f = state.founding;
  const errors: string[] = [];
  const type = content.founding.types.find((t) => t.id === typeId);
  const market = content.founding.markets.find((m) => m.id === marketId);
  const gen = content.founding.generations.find((g) => g.id === genId);
  if (!f) return { months: 0, cost: 0, knownFit: null, expectedScore: 0, errors: ['Not in the founding era.'] };
  if (!type || !isUnlocked(content, f, 'type', typeId)) errors.push('Research this chip type first.');
  if (!market || !isUnlocked(content, f, 'market', marketId)) errors.push('Research this market first.');
  if (!gen || !isUnlocked(content, f, 'generation', genId)) errors.push('Research this generation first.');
  if (f.project) errors.push('We are already designing a chip.');
  const months = type?.months ?? 0;
  const cost = gen?.devCost ?? 0;
  if (cost > state.cash) errors.push('Not enough cash to start this chip.');
  const knownFit = f.fitKnown[fitKey(typeId, marketId)] ?? null;
  let expectedScore = 0;
  if (type && gen) {
    const out = teamOutput(state, content);
    const q = projectQuality(content, { typeId, genId, design: out.design * months, polish: out.polish * months, totalMonths: months, qualityMult: 1 }, knownFit ?? 'ok');
    expectedScore = scoreFor(q, state.week + months);
  }
  if (teamOutput(state, content).total <= 0) errors.push('Nobody is free to design chips.');
  return { months, cost, knownFit, expectedScore, errors };
}

export function newFoundingState(content: Content, state: { rng: number }): FoundingState {
  const fd = content.founding;
  const rivals: FoundingRival[] = fd.rivals.map((r) => {
    const quality = marketBar(0) * 0.9 * (1 + r.pace);
    return { id: r.id, quality, score: Math.round(scoreFor(quality, 0) * 10) / 10, chips: 0, lastChip: '', nextReleaseMonth: randInt(state, 2, 8) };
  });
  return {
    startYear: fd.startYear,
    project: null,
    chips: [],
    researchPoints: 0,
    unlocked: [],
    fitKnown: {},
    trust: TUNING.foundingStartTrust,
    rivals,
    lastEventMonth: 0,
    report: null,
    chapterDone: false,
  };
}

/** Start designing a chip. Returns an error, or null on success. */
export function startProject(state: GameState, content: Content, name: string, typeId: string, marketId: string, genId: string): string | null {
  const pv = projectPreview(state, content, typeId, marketId, genId);
  if (pv.errors.length) return pv.errors[0]!;
  if (!name.trim()) return 'Give the chip a name.';
  const f = state.founding!;
  state.cash -= pv.cost;
  f.project = { name: name.trim(), typeId, marketId, genId, monthsLeft: pv.months, totalMonths: pv.months, design: 0, polish: 0, qualityMult: 1, startedMonth: state.week };
  f.report = { ...(f.report ?? { sales: 0, salaries: 0, rent: 0, upkeep: 0, projectCost: 0 }), projectCost: (f.report?.projectCost ?? 0) + pv.cost };
  const type = content.founding.types.find((t) => t.id === typeId)!;
  const market = content.founding.markets.find((m) => m.id === marketId)!;
  push(state, 'info', `Started designing ${name.trim()}: a ${type.name.toLowerCase()} for ${market.name.toLowerCase()}, ready in ${pv.months} months.`);
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

/** Monthly sales of a chip in its n-th month on sale (0 = the month after release). */
export function chipSales(chip: FoundingChip, n: number): number {
  return n >= TUNING.foundingSalesMonths ? 0 : chip.launchSales * TUNING.foundingSalesDecay ** n;
}

/** One month of the founding era. */
export function tickFounding(state: GameState, content: Content): void {
  const f = state.founding!;
  const fd = content.founding;

  // 1. The office: four weeks of morale and settling in.
  for (let i = 0; i < 4; i++) tickHq(state, content);
  refreshHq(state, content);

  // 2. The chip in progress.
  const project = f.project;
  if (project) {
    const out = teamOutput(state, content);
    const wobble = 0.85 + rand(state) * 0.3;
    project.design += out.design * wobble;
    project.polish += out.polish * wobble;
    project.monthsLeft -= 1;
    if (project.monthsLeft <= 0) releaseChip(state, content, project, fd);
  }

  // 3. Sales of everything on the shelves.
  let sales = 0;
  for (const chip of f.chips) {
    const s = chipSales(chip, chip.monthsOnSale);
    chip.monthsOnSale += 1;
    chip.totalSales += s;
    sales += s;
  }

  // 4. Costs: salaries (the founder takes none), rent and room upkeep.
  const headcount = Object.values(state.staff).reduce((n, c) => n + c, 0);
  const salaries = Math.max(0, headcount - 1) * TUNING.foundingSalaryPerMonth;
  const rent = stageDef(content, state.hq.stage).founding?.rentPerMonth ?? 0;
  const upkeep = facilitiesCost(state, content).upkeep * (52 / 12) * TUNING.foundingCostScale;
  state.cash += sales - salaries - rent - upkeep;
  f.report = { sales, salaries, rent, upkeep, projectCost: f.report?.projectCost ?? 0 };

  // 5. Rivals release on their own rhythm, but aim for a pace set by our best work.
  tickRivals(state, content);

  // 6. At most one decision every few months.
  if (!state.pendingEvent && state.week - f.lastEventMonth >= TUNING.foundingEventCooldown && rand(state) < TUNING.foundingEventChance) {
    const hires = headcount > 1;
    const pool = content.events.filter((e) => e.trigger === 'founding' && (!e.requiresProject || f.project) && (e.id !== 'f-poach' || hires));
    const ev = pickWeighted(state, pool);
    if (ev) {
      state.pendingEvent = toPending(ev);
      f.lastEventMonth = state.week;
    }
  }

  // 7. Out of money for too long ends the company.
  if (state.cash < 0) {
    state.weeksNegative += 1;
    if (state.weeksNegative >= TUNING.foundingBankruptMonths) {
      state.status = 'bankrupt';
      push(state, 'bad', 'Out of cash for too long. The company is bankrupt.');
    } else push(state, 'bad', `We are out of cash. Bankrupt in ${TUNING.foundingBankruptMonths - state.weeksNegative} months unless sales pick up.`);
  } else state.weeksNegative = 0;

  state.week += 1;
  if (f.report) f.report.projectCost = 0;
  state.history.push({ week: state.week, cash: state.cash, users: f.chips.length, bestScore: Math.max(0, ...f.chips.map((c) => c.score)) });

  // 8. The end of the founding chapter.
  if (!f.chapterDone && foundingYear(state) > fd.endYear) {
    f.chapterDone = true;
    push(state, 'good', `The ${fd.startYear}s chapter is complete: ${f.chips.length} chips shipped. The world is about to change.`);
  }
}

function releaseChip(state: GameState, content: Content, p: FoundingProject, fd: Founding): void {
  const f = state.founding!;
  const fit = fitOf(content, p.typeId, p.marketId);
  const quality = projectQuality(content, p, fit);
  const base = scoreFor(quality, state.week) + (rand(state) - 0.5);
  const reviews = fd.reviewers.map((r) => {
    const score = Math.max(1, Math.min(10, Math.round(base + (rand(state) - 0.5) * 2.4)));
    const band = score <= 4 ? r.quotes.low : score <= 7 ? r.quotes.mid : r.quotes.high;
    return { reviewerId: r.id, score, quote: band[randInt(state, 0, band.length - 1)]! };
  });
  const score = Math.round((reviews.reduce((n, r) => n + r.score, 0) / reviews.length) * 10) / 10;
  const market = fd.markets.find((m) => m.id === p.marketId)!;
  const years = state.week / 12;
  const launchSales =
    market.monthlySales *
    (1 + market.growth) ** years *
    (score / 10) ** 2 *
    TUNING.foundingFitSales[fit] *
    (0.6 + f.trust / 100) *
    (1 + boosts(content, f).sales);
  const key = fitKey(p.typeId, p.marketId);
  const newFit = !f.fitKnown[key];
  f.fitKnown[key] = fit;
  const chip: FoundingChip = {
    id: `chip-${state.nextId++}`,
    name: p.name,
    typeId: p.typeId,
    marketId: p.marketId,
    genId: p.genId,
    month: state.week,
    quality,
    score,
    reviews,
    launchSales,
    monthsOnSale: 0,
    totalSales: 0,
  };
  // Who were we behind before this chip?
  const before = f.rivals.filter((r) => r.score > Math.max(0, ...f.chips.map((c) => c.score)));
  f.chips.push(chip);
  f.project = null;
  f.trust = Math.max(0, Math.min(100, f.trust + (score - 5) * 1.5));
  const points = 3 + Math.round(score) + (newFit ? 2 : 0);
  f.researchPoints += points;
  state.hq.morale = Math.max(0, Math.min(100, state.hq.morale + (score - 5)));
  push(state, score >= 5 ? 'good' : 'bad', `${p.name} is out! Reviews average ${score.toFixed(1)}/10. +${points} research points.`);
  const passed = before.filter((r) => score > r.score);
  for (const r of passed) push(state, 'good', `We passed ${fd.rivals.find((x) => x.id === r.id)?.name ?? r.id} on the leaderboard.`);
}

function tickRivals(state: GameState, content: Content): void {
  const f = state.founding!;
  const best = Math.max(0, ...f.chips.map((c) => c.quality));
  for (const rival of f.rivals) {
    if (state.week < rival.nextReleaseMonth) continue;
    const def = content.founding.rivals.find((r) => r.id === rival.id);
    if (!def) continue;
    const anchor = Math.max(best, marketBar(state.week) * 0.9);
    const target = anchor * (1 + def.pace);
    rival.quality += TUNING.rivalPaceCatchUp * Math.max(0, target - rival.quality);
    rival.quality *= 1 + TUNING.rivalPaceDrift;
    rival.score = Math.round(Math.max(1, Math.min(10, scoreFor(rival.quality, state.week) + (rand(state) - 0.5) * 0.6)) * 10) / 10;
    rival.chips += 1;
    const types = content.founding.types.filter((t) => isUnlocked(content, f, 'type', t.id) || rand(state) < 0.3);
    const type = types[randInt(state, 0, types.length - 1)] ?? content.founding.types[0]!;
    rival.lastChip = `${def.name.split(' ')[0]} ${type.name}`;
    rival.nextReleaseMonth = state.week + randInt(state, 6, 10);
    push(state, 'rival', `${def.name} released the ${rival.lastChip}. Reviews: ${rival.score.toFixed(1)}/10.`);
  }
}

function toPending(ev: Content['events'][number]): PendingEvent {
  return { eventId: ev.id, deck: ev.deck, speaker: ev.speaker, title: ev.title, body: ev.body, choices: ev.choices.map((c) => ({ ...c })) };
}

function push(state: GameState, kind: LogKind, text: string): void {
  state.log.push({ week: state.week, kind, text });
  if (state.log.length > TUNING.logLimit) state.log.splice(0, state.log.length - TUNING.logLimit);
}
