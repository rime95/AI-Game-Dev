import type { Content } from '@stm/content';
import { placementError, stageDef, templateDef } from '../hq';
import type { GameState } from '../types';
import { rand } from '../rng';
import { boardScore, chipCosts, clampScore, evaluateBoard, rawBoardScore } from './board';
import { resolveCard, tickCards } from './cards';
import { BLOCKS, CHAPTERS, kind, KINDS, market, NODES, OUTLETS, QUOTES, SIZES, T, tech, TECHS, type TechDef } from './data';
import { activeProducts, currentScore, initialRivals, monthlyRivals, openMarkets, rivalScore as rivalScoreFor, tickRivals, tickSales } from './markets';
import { capacity, founder, gainXp, hasPerk, makeCandidate, tickStaff, workRate } from './staff';
import type { Bug, CommandV2, GameV2, Person, Product, Project, ResultV2, Snapshot, Stat } from './types';
import { between, clamp, log, money, monthIndex, monthLabel, newId, pick, spend } from './util';

const ROOM_COST_SCALE = 0.25;
const UPKEEP_SCALE = 0.25;
const STAGE_TERMS: Record<string, { moveCost: number; rentPerMonth: number }> = {
  garage: { moveCost: 0, rentPerMonth: 0 },
  office: { moveCost: 100_000, rentPerMonth: 4_000 },
  hqBuilding: { moveCost: 3_000_000, rentPerMonth: 30_000 },
  hqCampus: { moveCost: 40_000_000, rentPerMonth: 250_000 },
};

const ARCH_WORK = 18;
const VERIFY_WORK = 26;

// ---------------------------------------------------------------- New game

export function createGameV2(content: Content, seed: number, companyName: string): GameV2 {
  const pod = content.hq.rooms.find((r) => r.id === 'deskPod')!;
  const bench = content.hq.rooms.find((r) => r.id === 'workbench')!;
  const s: GameV2 = {
    version: 2,
    seed,
    rng: seed >>> 0,
    status: 'playing',
    companyName: companyName.trim() || 'Garage Silicon',
    day: 0,
    cash: T.startCash,
    brand: T.startBrand,
    staff: [],
    candidates: [],
    projects: [],
    products: [],
    research: { points: 0, done: [], doneDay: {}, current: null, progress: 0 },
    markets: [],
    rivals: [],
    notebook: { tastes: {}, best: {} },
    cards: [],
    cardDays: {},
    nextCardDay: T.cardFirstDay,
    modifiers: [],
    hq: {
      stage: 'garage',
      rooms: [
        { id: 'room-0', templateId: pod.id, x: 0, y: 0, rot: 0, floor: 0, tier: 1, spent: 0 },
        { id: 'room-1', templateId: bench.id, x: 2, y: 0, rot: 0, floor: 0, tier: 1, spent: 0 },
      ],
      equipment: [],
      morale: 75,
      moveInWeeks: 0,
      productivity: 1,
      effective: { research: 0, modelEng: 0, hardwareEng: 0, product: 0, ops: 0 },
      seated: { research: 0, modelEng: 0, hardwareEng: 0, product: 0, ops: 0 },
    },
    chapter: { index: 0, done: [] },
    books: [],
    month: emptyMonth(),
    history: { weekly: [], monthly: [] },
    log: [],
    records: { bestScore: 0, bestLaunchUnits: 0, peakCash: T.startCash },
    nextId: 10,
    brokeDays: 0,
    acc: { weekRevenue: 0, weekProfit: 0, totalRevenue: 0 },
  };
  s.staff.push(founder(s));
  s.rivals = initialRivals(s);
  openMarkets(s);
  for (let i = 0; i < 3; i++) s.candidates.push(makeCandidate(s));
  // Rivals start with products on the shelf.
  tickRivals(s);
  log(s, `${s.companyName} opens its garage doors. Design your first chip in the Studio.`, 'good');
  return s;
}

const emptyMonth = () => ({ revenue: 0, cogs: 0, salaries: 0, facilities: 0, projects: 0, marketing: 0, hiring: 0, other: 0 });

// ---------------------------------------------------------------- Availability

export const blockUnlocked = (s: GameV2, id: string) => {
  const b = BLOCKS.find((x) => x.id === id);
  return !!b && (!b.tech || s.research.done.includes(b.tech));
};
export const kindUnlocked = (s: GameV2, k: string) => {
  const d = KINDS.find((x) => x.id === k);
  return !!d && (!d.tech || s.research.done.includes(d.tech));
};
export const nodeUnlocked = (s: GameV2, id: string) => {
  const n = NODES.find((x) => x.id === id);
  return !!n && (!n.tech || s.research.done.includes(n.tech));
};
export const bestNode = (s: GameV2) => [...NODES].reverse().find((n) => nodeUnlocked(s, n.id))!;

export function techAvailable(s: GameV2, t: TechDef): boolean {
  return !s.research.done.includes(t.id) && t.requires.every((r) => s.research.done.includes(r));
}

export const facilitiesPerMonth = (s: GameV2, content: Content) => {
  const rent = STAGE_TERMS[s.hq.stage]?.rentPerMonth ?? 0;
  const upkeep = s.hq.rooms.reduce((n, r) => n + (templateDef(content, r.templateId)?.upkeepPerWeek ?? 0) * r.tier * UPKEEP_SCALE * (30 / 7), 0);
  return { rent, upkeep };
};
export const roomPrice = (cost: number) => Math.round(cost * ROOM_COST_SCALE);
export const stageTerms = (id: string) => STAGE_TERMS[id];

export const salaryBill = (s: GameV2) => s.staff.reduce((n, p) => n + p.salary, 0);

// ---------------------------------------------------------------- Projects

export function teamOf(s: GameV2, projectId: string): Person[] {
  return s.staff.filter((p) => p.task === projectId);
}

function avgTeamMorale(team: Person[]): number {
  return team.length ? team.reduce((n, p) => n + p.morale, 0) / team.length : 70;
}

function makeBugs(s: GameV2, pr: Project): Bug[] {
  const team = teamOf(s, pr.id);
  const avgEng = team.length ? team.reduce((n, p) => n + p.skills.eng, 0) / team.length : 5;
  const ev = evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind);
  let rate = 1 - (avgEng - 5) * 0.07;
  if (team.some((p) => p.traits.includes('fast'))) rate *= 1.3;
  if (hasPerk(s, 'tools')) rate *= 0.75;
  if (ev.throttle < 1) rate *= 1.5;
  const n = Math.max(0, Math.round((2 + SIZES[pr.size].work * 2) * rate + between(s, -1, 1)));
  return Array.from({ length: n }, () => ({ id: newId(s, 'bug'), severity: 1 + Math.floor(rand(s) * 3), found: false }));
}

function tickProject(s: GameV2, pr: Project): void {
  const team = teamOf(s, pr.id);
  const morale = avgTeamMorale(team);
  const mentor = team.some((p) => p.traits.includes('mentor')) ? 1.3 : 1;
  for (const p of team) pr.spent += p.salary / 30;
  if (pr.phase === 'architecture') {
    let pts = 0;
    for (const p of team) {
      const r = workRate(s, p, 'design', pr.crunch, morale);
      pts += r;
      pr.skillSum += r * (p.skills.design + (p.traits.includes('diva') ? 1 : 0));
      gainXp(s, p, r * (p.founder ? 1 : mentor), 'design');
    }
    pr.designPoints += pts;
    pr.progress = Math.min(pr.need, pr.progress + pts);
    if (pr.progress >= pr.need) {
      const ev = evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind);
      if (ev.missing.length || ev.used === 0) {
        if (!pr.readyNoted) log(s, `${pr.name}: architecture done, but the die layout is missing ${ev.missing.length ? ev.missing.join(', ') : 'everything'}.`, 'bad');
        pr.readyNoted = true;
        return;
      }
      pr.phase = 'verification';
      pr.progress = 0;
      pr.need = VERIFY_WORK * SIZES[pr.size].work;
      pr.readyNoted = false;
      pr.bugs = makeBugs(s, pr);
      log(s, `${pr.name} moved to verification. Hunting for bugs.`);
    }
  } else if (pr.phase === 'verification') {
    let pts = 0;
    let engSum = 0;
    for (const p of team) {
      const r = workRate(s, p, 'eng', pr.crunch, morale);
      pts += r;
      engSum += p.skills.eng;
      gainXp(s, p, r * (p.founder ? 1 : mentor), 'eng');
    }
    pr.engPoints += pts;
    // Fixing found bugs comes first.
    for (const b of pr.bugs) {
      if (pts <= 0) break;
      if (b.found && !b.ignored && (b.fixLeft ?? 0) > 0) {
        const used = Math.min(pts, b.fixLeft!);
        b.fixLeft! -= used;
        pts -= used;
        if (b.fixLeft! <= 0) log(s, `${pr.name}: a bug was fixed.`, 'good');
      }
    }
    pr.progress = Math.min(pr.need, pr.progress + pts);
    const done = pr.progress >= pr.need;
    if (done) pr.polishDays += 1;
    if (team.length) {
      const engF = engSum / team.length / 5;
      let find = 0.035 * engF * (hasPerk(s, 'testlab') ? 1.5 : 1) * (team.some((p) => p.traits.includes('perfectionist')) ? 1.6 : 1) * (done ? 2 : 1);
      if (pr.crunch) find *= 1.1;
      for (const b of pr.bugs) {
        if (!b.found && rand(s) < find) {
          b.found = true;
          b.fixLeft = b.severity * 4 * SIZES[pr.size].work;
          log(s, `${pr.name}: found a ${['minor', 'serious', 'nasty'][b.severity - 1]} bug. Fix it or ship with it?`, 'bad');
        }
      }
    }
    if (done && !pr.readyNoted) {
      pr.readyNoted = true;
      log(s, `${pr.name} passed verification. Tape out now, or keep testing to catch more bugs.`, 'good');
    }
  } else if (pr.phase === 'tapeout') {
    pr.progress = Math.min(pr.need, pr.progress + 1);
    if (pr.progress >= pr.need) {
      pr.phase = 'ready';
      log(s, `${pr.name} is back from the fab and works. Set its price and launch it.`, 'good');
    }
  }
}

/** Expected review for a project as things stand (the Studio shows this live). */
export function projectForecast(s: GameV2, pr: Project, day = s.day): { board: number; team: number; polish: number; bugs: number; total: number } {
  const ev = evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind);
  const boardPart = boardScore(ev, pr.marketId, day);
  const avgSkill = pr.designPoints > 0 ? pr.skillSum / pr.designPoints : avgSkillOf(teamOf(s, pr.id), 'design');
  const team = clamp((avgSkill - 5) * 0.15, -0.6, 0.75);
  const polish = Math.min(0.4, pr.polishDays * 0.012);
  const m = market(pr.marketId);
  const bugs = pr.bugs.filter((b) => !b.found || b.ignored || (b.fixLeft ?? 0) > 0).reduce((n, b) => n + b.severity * 0.22 * m.bugPenalty, 0);
  return { board: boardPart, team, polish, bugs, total: clampScore(boardPart + team + polish - bugs) };
}

const avgSkillOf = (team: Person[], k: 'design' | 'eng' | 'research') => (team.length ? team.reduce((n, p) => n + p.skills[k], 0) / team.length : 5);

function launch(s: GameV2, pr: Project, price: number, level: 0 | 1 | 2 | 3): Product {
  const f = projectForecast(s, pr);
  const score = clampScore(f.total + between(s, -0.25, 0.25));
  const push = T.marketing[level];
  const pushCost = Math.round(push.costShare * pr.spent * (hasPerk(s, 'marketing') ? 0.7 : 1));
  if (pushCost > 0) spend(s, 'marketing', pushCost);
  let hype = push.hype;
  for (const m of s.modifiers) if (m.hype) {
    hype += m.hype;
    m.hype = 0;
    m.until = s.day;
  }
  const clash = s.rivals.some(
    (r) => r.products.some((p) => p.marketId === pr.marketId && p.launchDay > 0 && s.day - p.launchDay <= 15) || r.plans.some((p) => p.marketId === pr.marketId && p.launchDay - s.day <= 15),
  );
  if (clash && hype > 0) {
    hype *= 0.5;
    log(s, `A rival launched in ${market(pr.marketId).name} the same fortnight: half the buzz got lost.`, 'bad');
  }
  const outlets = OUTLETS[pr.kind];
  const reviews = outlets.map((outlet) => {
    const sc = Math.round(clampScore(score + between(s, -0.6, 0.6)) * 2) / 2;
    const lines = QUOTES.find((q) => sc >= q.min)!.lines;
    return { outlet, score: sc, quote: pick(s, lines) };
  });
  const avg = Math.round((reviews.reduce((n, r) => n + r.score, 0) / reviews.length) * 10) / 10;
  const costs = chipCosts(pr.size, pr.nodeId);
  let costMod = 1;
  for (const m of s.modifiers) if (m.costs && m.until > s.day) costMod *= m.costs;
  const bugsShipped = pr.bugs.filter((b) => !b.found || b.ignored || (b.fixLeft ?? 0) > 0).length;
  const product: Product = {
    id: newId(s, 'prod'),
    name: pr.name,
    kind: pr.kind,
    marketId: pr.marketId,
    size: pr.size,
    nodeId: pr.nodeId,
    board: [...pr.board],
    score: avg,
    reviews,
    price,
    unitCost: Math.round(costs.unitCost * costMod * 10) / 10,
    launchDay: s.day,
    hype,
    bugsShipped,
    units: 0,
    revenue: 0,
    profit: 0,
    rate: 0,
  };
  s.products.push(product);
  s.projects = s.projects.filter((p) => p !== pr);
  for (const p of s.staff) if (p.task === pr.id) p.task = null;
  s.brand = clamp(s.brand + (avg - 6) * 1.2, 0, 100);
  s.research.points += T.launchResearch.base + T.launchResearch.perScore * avg;
  // The press tells us what this market cares about, one thing per launch.
  const known = (s.notebook.tastes[pr.marketId] ??= []);
  const order = (Object.entries(market(pr.marketId).taste) as [Stat, number][]).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const next = order.find((k) => !known.includes(k));
  if (next) known.push(next);
  const key = `${pr.kind}:${pr.marketId}`;
  s.notebook.best[key] = Math.max(s.notebook.best[key] ?? 0, avg);
  s.records.bestScore = Math.max(s.records.bestScore, avg);
  log(s, `${pr.name} launched at ${money(price)}. The press gives it ${avg.toFixed(1)}.`, avg >= 6 ? 'good' : 'bad');
  return product;
}

// ---------------------------------------------------------------- Research

function tickResearch(s: GameV2): void {
  let pts = 0;
  for (const p of s.staff) {
    if (p.task !== 'research') continue;
    const r = T.researchPerDay * (p.skills.research / 5) * s.hq.productivity * (p.burnout > 75 ? 0.65 : 1);
    pts += r;
    gainXp(s, p, r * 4, 'research');
  }
  s.research.points += pts;
  const cur = s.research.current;
  if (!cur) return;
  const t = tech(cur);
  const take = Math.min(s.research.points, t.cost - s.research.progress);
  s.research.points -= take;
  s.research.progress += take;
  if (s.research.progress >= t.cost - 1e-9) finishTech(s, t);
}

function finishTech(s: GameV2, t: TechDef): void {
  s.research.done.push(t.id);
  s.research.doneDay[t.id] = s.day;
  s.research.current = null;
  s.research.progress = 0;
  if (t.breakthrough) log(s, `BREAKTHROUGH: ${t.name}. ${t.breakthrough} begins.`, 'good');
  else log(s, `Research done: ${t.name} (${t.effects.join(', ')}).`, 'good');
  openMarkets(s);
}

// ---------------------------------------------------------------- Chapters

export function goalMet(s: GameV2, content: Content, id: string): boolean {
  const revenue = s.acc.totalRevenue;
  switch (id) {
    case 'ship1':
      return s.products.length >= 1;
    case 'ship3':
      return s.products.length >= 3;
    case 'score6':
      return s.products.some((p) => p.score >= 6);
    case 'score8':
      return s.products.some((p) => p.score >= 8);
    case 'rev100k':
      return revenue >= 100_000;
    case 'rev10m':
      return revenue >= 10_000_000;
    case 'staff4':
      return s.staff.length >= 4;
    case 'research3':
      return s.research.done.length >= 3;
    case 'office':
      return content.hq.stages.findIndex((x) => x.id === s.hq.stage) >= 1;
    case 'lead':
      return s.markets.some((m) => (m.shares.you ?? 0) > 0 && Object.entries(m.shares).every(([k, v]) => k === 'you' || k === 'others' || v <= (m.shares.you ?? 0)));
    case 'bt1':
      return s.research.done.some((d) => !!tech(d).breakthrough);
    case 'markets3':
      return new Set(activeProducts(s).map((p) => p.marketId)).size >= 3;
    default:
      return false;
  }
}

function tickChapters(s: GameV2, content: Content): void {
  const ch = CHAPTERS[s.chapter.index];
  if (!ch) return;
  for (const g of ch.goals) if (!s.chapter.done.includes(g.id) && goalMet(s, content, g.id)) s.chapter.done.push(g.id);
  if (ch.goals.every((g) => s.chapter.done.includes(g.id))) {
    if (ch.reward.cash) s.cash += ch.reward.cash;
    if (ch.reward.research) s.research.points += ch.reward.research;
    if (ch.reward.brand) s.brand = clamp(s.brand + ch.reward.brand, 0, 100);
    log(s, `Chapter complete: ${ch.name}.`, 'good');
    s.chapter = { index: s.chapter.index + 1, done: [] };
  }
}

// ---------------------------------------------------------------- History

function snapshot(s: GameV2, revenue: number, profit: number): Snapshot {
  const share: Record<string, number> = {};
  const gap: Record<string, number> = {};
  for (const m of s.markets) {
    share[m.id] = m.shares.you ?? 0;
    const ours = activeProducts(s, m.id);
    if (!ours.length) continue;
    const best = Math.max(...ours.map((p) => currentScore(p, s.day)));
    let rivalBest = 0;
    for (const r of s.rivals) for (const rp of r.products) if (rp.marketId === m.id) rivalBest = Math.max(rivalBest, rivalScoreFor(s, rp));
    gap[m.id] = best - rivalBest;
  }
  return {
    day: s.day,
    cash: s.cash,
    revenue,
    profit,
    headcount: s.staff.length,
    morale: s.hq.morale,
    share,
    gap,
    bestScore: Math.max(0, ...activeProducts(s).map((p) => currentScore(p, s.day))),
  };
}


// ---------------------------------------------------------------- The day

function tickDay(s: GameV2, content: Content): void {
  s.day += 1;
  const pay = tickStaff(s, content);
  spend(s, 'salaries', pay);
  const fac = facilitiesPerMonth(s, content);
  spend(s, 'facilities', (fac.rent + fac.upkeep) / 30);
  for (const pr of [...s.projects]) tickProject(s, pr);
  tickResearch(s);
  const { revenue, cogs } = tickSales(s);
  s.cash += revenue - cogs;
  s.month.revenue += revenue;
  s.month.cogs += cogs;
  s.acc.totalRevenue += revenue;
  s.acc.weekRevenue += revenue;
  s.acc.weekProfit += revenue - cogs - pay - (fac.rent + fac.upkeep) / 30;
  tickRivals(s);
  tickCards(s);
  s.modifiers = s.modifiers.filter((m) => m.until > s.day);
  if (s.day % 30 === 0) {
    const m = s.month;
    const costs = m.cogs + m.salaries + m.facilities + m.projects + m.marketing + m.hiring + m.other;
    s.books.push({ month: monthIndex(s.day) - 1, ...m, profit: m.revenue - costs, cash: s.cash });
    s.month = emptyMonth();
    monthlyRivals(s);
    s.history.monthly.push(snapshot(s, s.books[s.books.length - 1]!.revenue, s.books[s.books.length - 1]!.profit));
    if (s.day % 90 === 0) for (let i = 0; i < 2; i++) s.candidates.push(makeCandidate(s));
    if (s.candidates.length > 6) s.candidates.splice(0, s.candidates.length - 6);
  }
  if (s.day % 7 === 0) {
    s.history.weekly.push(snapshot(s, s.acc.weekRevenue, s.acc.weekProfit));
    if (s.history.weekly.length > 156) s.history.weekly.shift();
    s.acc.weekRevenue = 0;
    s.acc.weekProfit = 0;
  }
  tickChapters(s, content);
  s.records.peakCash = Math.max(s.records.peakCash, s.cash);
  s.brokeDays = s.cash < 0 ? s.brokeDays + 1 : 0;
  if (s.brokeDays > T.bankruptAfterDays) {
    s.status = 'bankrupt';
    log(s, `${s.companyName} ran out of money. The bank closed the doors.`, 'bad');
  }
}

// ---------------------------------------------------------------- Commands

export function applyV2(prev: GameV2, content: Content, cmd: CommandV2): ResultV2 {
  const s = structuredClone(prev);
  const err = run(s, content, cmd);
  return err ? { state: prev, error: err } : { state: s };
}

function run(s: GameV2, content: Content, cmd: CommandV2): string | null {
  if (s.status !== 'playing' && cmd.type !== 'tick') return 'The game is over.';
  switch (cmd.type) {
    case 'tick': {
      const n = Math.max(1, Math.min(60, Math.floor(cmd.days ?? 1)));
      for (let i = 0; i < n && s.status === 'playing'; i++) tickDay(s, content);
      return null;
    }
    case 'startProject': {
      if (!cmd.name.trim()) return 'Give the chip a name.';
      if (!kindUnlocked(s, cmd.kind)) return 'That kind of chip needs research first.';
      const m = s.markets.find((x) => x.id === cmd.marketId);
      if (!m) return 'That market does not exist yet.';
      if (market(cmd.marketId).kind !== cmd.kind) return `${market(cmd.marketId).name} buys ${kind(market(cmd.marketId).kind).name.toLowerCase()}s.`;
      if (!nodeUnlocked(s, cmd.nodeId)) return 'That process needs research first.';
      if (!SIZES[cmd.size]) return 'Unknown size.';
      const { w, h } = SIZES[cmd.size];
      const base = cmd.refreshOf ? s.products.find((p) => p.id === cmd.refreshOf) : undefined;
      const pr: Project = {
        id: newId(s, 'proj'),
        name: cmd.name.trim().slice(0, 40),
        kind: cmd.kind,
        marketId: cmd.marketId,
        size: cmd.size,
        nodeId: cmd.nodeId,
        board: base && base.size === cmd.size ? [...base.board] : Array.from({ length: w * h }, () => null),
        phase: 'architecture',
        progress: 0,
        need: ARCH_WORK * SIZES[cmd.size].work * (base ? 0.6 : 1),
        polishDays: 0,
        bugs: [],
        crunch: false,
        startedDay: s.day,
        designPoints: 0,
        skillSum: 0,
        engPoints: 0,
        spent: 0,
        refreshOf: base?.id,
      };
      s.projects.push(pr);
      for (const p of s.staff) if (p.task === null) p.task = pr.id;
      log(s, `Started ${pr.name}: a ${SIZES[pr.size].name.toLowerCase()} ${kind(pr.kind).name.toLowerCase()} for ${market(pr.marketId).name}.`);
      return null;
    }
    case 'setBoard': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      if (!pr) return 'No such project.';
      if (pr.phase !== 'architecture') return 'The layout is frozen once verification starts.';
      const { w, h } = SIZES[pr.size];
      if (cmd.board.length !== w * h) return 'Wrong board size.';
      for (const c of cmd.board) if (c !== null && !blockUnlocked(s, c)) return `Block ${c} needs research first.`;
      pr.board = [...cmd.board];
      pr.readyNoted = false;
      return null;
    }
    case 'assign': {
      const p = s.staff.find((x) => x.id === cmd.personId);
      if (!p) return 'No such person.';
      if (cmd.task !== null && cmd.task !== 'research') {
        const pr = s.projects.find((x) => x.id === cmd.task);
        if (!pr) return 'No such project.';
        if (pr.phase === 'tapeout' || pr.phase === 'ready') return 'That chip is at the fab; nobody can work on it now.';
      }
      p.task = cmd.task;
      return null;
    }
    case 'setCrunch': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      if (!pr) return 'No such project.';
      pr.crunch = cmd.on;
      return null;
    }
    case 'fixBug':
    case 'ignoreBug': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      const b = pr?.bugs.find((x) => x.id === cmd.bugId);
      if (!pr || !b || !b.found) return 'No such bug.';
      b.ignored = cmd.type === 'ignoreBug';
      return null;
    }
    case 'finishVerification': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      if (!pr || pr.phase !== 'verification') return 'Nothing to tape out.';
      if (pr.progress < pr.need) return 'Verification isn’t finished yet.';
      const costs = chipCosts(pr.size, pr.nodeId);
      if (s.cash < costs.maskCost) return `The mask set costs ${money(costs.maskCost)}. Earn or raise the cash first (or keep testing meanwhile).`;
      spend(s, 'projects', costs.maskCost);
      pr.spent += costs.maskCost;
      pr.phase = 'tapeout';
      pr.progress = 0;
      pr.need = costs.fabDays;
      for (const p of s.staff) if (p.task === pr.id) p.task = null;
      log(s, `${pr.name} taped out (${money(costs.maskCost)} for the masks). The foundry needs ${costs.fabDays} days.`);
      return null;
    }
    case 'launch': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      if (!pr || pr.phase !== 'ready') return 'That chip isn’t ready to launch.';
      if (!(cmd.price > 0)) return 'Set a price.';
      launch(s, pr, Math.round(cmd.price), cmd.marketing);
      return null;
    }
    case 'cancelProject': {
      const pr = s.projects.find((p) => p.id === cmd.projectId);
      if (!pr) return 'No such project.';
      s.projects = s.projects.filter((p) => p !== pr);
      for (const p of s.staff) if (p.task === pr.id) p.task = null;
      log(s, `Cancelled ${pr.name}.`);
      return null;
    }
    case 'setPrice': {
      const p = s.products.find((x) => x.id === cmd.productId && x.retiredDay === undefined);
      if (!p) return 'No such product on sale.';
      if (!(cmd.price > 0)) return 'Set a price above zero.';
      p.price = Math.round(cmd.price);
      return null;
    }
    case 'retireProduct': {
      const p = s.products.find((x) => x.id === cmd.productId && x.retiredDay === undefined);
      if (!p) return 'No such product on sale.';
      p.retiredDay = s.day;
      log(s, `${p.name} was retired after selling ${Math.round(p.units).toLocaleString('en-US')} units.`);
      return null;
    }
    case 'postJobAd': {
      if (s.cash < T.jobAdCost) return 'Not enough cash for a job ad.';
      spend(s, 'hiring', T.jobAdCost);
      s.candidates = Array.from({ length: 3 }, () => makeCandidate(s));
      return null;
    }
    case 'hire': {
      const c = s.candidates.find((x) => x.id === cmd.candidateId);
      if (!c) return 'That candidate took another job.';
      if (s.staff.length >= capacity(s, content)) return 'No free desk. Build a desk pod in the HQ first.';
      if (s.cash < c.fee) return 'Not enough cash for the hiring fee.';
      spend(s, 'hiring', c.fee);
      s.candidates = s.candidates.filter((x) => x !== c);
      const { fee: _fee, ...rest } = c;
      s.staff.push({ ...rest, id: newId(s, 'p'), xp: 0, morale: 72, burnout: 0, task: null, hiredDay: s.day });
      log(s, `${c.name} joined the team.`, 'good');
      return null;
    }
    case 'fire': {
      const p = s.staff.find((x) => x.id === cmd.personId);
      if (!p || p.founder) return 'You can’t fire that person.';
      spend(s, 'salaries', p.salary);
      s.staff = s.staff.filter((x) => x !== p);
      for (const o of s.staff) o.morale = clamp(o.morale - 4, 0, 100);
      log(s, `${p.name} was let go (one month’s pay).`, 'bad');
      return null;
    }
    case 'train': {
      const p = s.staff.find((x) => x.id === cmd.personId);
      if (!p) return 'No such person.';
      if (p.skills[cmd.skill] >= 10) return 'Already at the top.';
      const cost = T.trainingCost * p.skills[cmd.skill];
      if (s.cash < cost) return 'Not enough cash for training.';
      spend(s, 'other', cost);
      p.skills[cmd.skill] += 1;
      return null;
    }
    case 'research': {
      if (cmd.nodeId === null) {
        s.research.current = null;
        return null;
      }
      const t = TECHS.find((x) => x.id === cmd.nodeId);
      if (!t) return 'Unknown technology.';
      if (!techAvailable(s, t)) return s.research.done.includes(t.id) ? 'Already researched.' : 'Research what it builds on first.';
      if (s.research.current && s.research.current !== t.id) s.research.points += s.research.progress;
      s.research.current = t.id;
      s.research.progress = 0;
      return null;
    }
    case 'resolveCard':
      return resolveCard(s, cmd.cardId, cmd.choiceId);
    case 'placeRoom': {
      const t = templateDef(content, cmd.templateId);
      if (!t) return 'Unknown room.';
      if (t.kind === 'server') return 'Server rooms come later.';
      const e = placementError(s as unknown as GameState, content, cmd.templateId, cmd.x, cmd.y, cmd.rot, cmd.floor ?? 0);
      if (e) return e;
      const price = roomPrice(t.cost);
      if (s.cash < price) return 'Not enough cash.';
      spend(s, 'other', price);
      s.hq.rooms.push({ id: newId(s, 'room'), templateId: t.id, x: cmd.x, y: cmd.y, rot: cmd.rot, floor: cmd.floor ?? 0, tier: 1, spent: price });
      log(s, `Built a ${t.name.toLowerCase()} (${money(price)}).`);
      return null;
    }
    case 'moveRoom': {
      const r = s.hq.rooms.find((x) => x.id === cmd.roomId);
      if (!r) return 'No such room.';
      const e = placementError(s as unknown as GameState, content, r.templateId, cmd.x, cmd.y, cmd.rot, cmd.floor ?? r.floor, r.id);
      if (e) return e;
      Object.assign(r, { x: cmd.x, y: cmd.y, rot: cmd.rot, floor: cmd.floor ?? r.floor });
      return null;
    }
    case 'demolishRoom': {
      const r = s.hq.rooms.find((x) => x.id === cmd.roomId);
      if (!r) return 'No such room.';
      s.hq.rooms = s.hq.rooms.filter((x) => x !== r);
      s.cash += Math.round(r.spent * 0.5);
      return null;
    }
    case 'moveHq': {
      const i = content.hq.stages.findIndex((x) => x.id === s.hq.stage);
      const next = content.hq.stages[i + 1];
      if (!next) return 'This is the biggest HQ there is.';
      const terms = STAGE_TERMS[next.id]!;
      if (s.cash < terms.moveCost) return `Moving to the ${next.name.toLowerCase()} costs ${money(terms.moveCost)}.`;
      spend(s, 'other', terms.moveCost);
      s.hq.stage = next.id;
      log(s, `${s.companyName} moved into the ${stageDef(content, next.id).name.toLowerCase()}.`, 'good');
      return null;
    }
  }
}

// ---------------------------------------------------------------- Layout helper

/**
 * A decent die layout for a market, by hill climbing: try every unlocked block in every cell and
 * keep what raises the score. Used by "Auto-layout" in the Studio and by the balance bot. It is
 * deliberately not perfect, so a thoughtful player can beat it.
 */
export function suggestBoard(s: GameV2, pr: Pick<Project, 'size' | 'nodeId' | 'kind' | 'marketId' | 'board'>, passes = 2): (string | null)[] {
  const { w, h } = SIZES[pr.size];
  const board = [...pr.board];
  const blocks = BLOCKS.filter((b) => blockUnlocked(s, b.id)).map((b) => b.id);
  const score = (b: (string | null)[]) => {
    const ev = evaluateBoard(b, pr.size, pr.nodeId, pr.kind);
    return ev.missing.length ? -20 + (kind(pr.kind).needs.length - ev.missing.length) : rawBoardScore(ev, pr.marketId, s.day) + Math.min(0, ev.budget - ev.heat) * 0.05;
  };
  let best = score(board);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < w * h; i++) {
      const keep = board[i];
      let bestId = keep;
      for (const id of [null, ...blocks]) {
        board[i] = id;
        const v = score(board);
        if (v > best + 1e-9) {
          best = v;
          bestId = id;
        }
      }
      board[i] = bestId;
    }
  }
  return board;
}

export { monthLabel };
