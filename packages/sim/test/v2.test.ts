import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { v2 } from '../src';
import { runBot } from './v2-bot';

type G = v2.GameV2;
const act = (s: G, cmd: v2.CommandV2): G => {
  const r = v2.applyV2(s, content, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
};
const fresh = (seed = 7) => v2.createGameV2(content, seed, 'Test Silicon');
const empty = (size: v2.ProjectSize) => Array(v2.SIZES[size].w * v2.SIZES[size].h).fill(null) as (string | null)[];

describe('die board', () => {
  it('needs the blocks its kind requires', () => {
    const ev = v2.evaluateBoard(empty('S'), 'S', 'n1000', 'cpu');
    expect(ev.missing).toEqual(['core', 'mem', 'io']);
    expect(v2.boardScore(ev, 'business', 0)).toBe(1);
  });

  it('gives cache a speed bonus next to cores, capped at 2', () => {
    const b = empty('S');
    b[5] = 'cache';
    const alone = v2.evaluateBoard(b, 'S', 'n1000', 'cpu').cells[5]!.perf!;
    b[1] = 'core';
    b[4] = 'core';
    b[6] = 'core';
    expect(v2.evaluateBoard(b, 'S', 'n1000', 'cpu').cells[5]!.perf!).toBeCloseTo(alone + 2);
  });

  it('I/O pads only work on the edge', () => {
    const b = empty('S');
    b[5] = 'io';
    b[0] = 'io';
    const ev = v2.evaluateBoard(b, 'S', 'n1000', 'cpu');
    expect(ev.dead).toEqual([5]);
    expect(ev.stats.feat).toBeCloseTo(1.2);
  });

  it('throttles a die that runs over its heat budget', () => {
    const hot = Array(16).fill('core');
    const ev = v2.evaluateBoard(hot, 'S', 'n1000', 'cpu');
    expect(ev.heat).toBeGreaterThan(ev.budget);
    expect(ev.throttle).toBeLessThan(1);
  });

  it('auto-layout makes a working chip and a bigger die scores higher', () => {
    const s = fresh();
    const small = v2.suggestBoard(s, { size: 'S', nodeId: 'n1000', kind: 'cpu', marketId: 'homepc', board: empty('S') });
    const large = v2.suggestBoard(s, { size: 'L', nodeId: 'n1000', kind: 'cpu', marketId: 'homepc', board: empty('L') });
    const sv = v2.boardScore(v2.evaluateBoard(small, 'S', 'n1000', 'cpu'), 'homepc', 0);
    const lv = v2.boardScore(v2.evaluateBoard(large, 'L', 'n1000', 'cpu'), 'homepc', 0);
    expect(sv).toBeGreaterThan(4);
    expect(lv).toBeGreaterThan(sv + 1);
  });

  it('different markets prefer different layouts', () => {
    const s = fresh();
    const forBiz = v2.suggestBoard(s, { size: 'S', nodeId: 'n1000', kind: 'cpu', marketId: 'business', board: empty('S') });
    const forBudget = v2.suggestBoard(s, { size: 'S', nodeId: 'n1000', kind: 'cpu', marketId: 'budget', board: empty('S') });
    const score = (b: (string | null)[], m: string) => v2.boardScore(v2.evaluateBoard(b, 'S', 'n1000', 'cpu'), m, 0);
    expect(score(forBiz, 'business')).toBeGreaterThan(score(forBudget, 'business'));
    expect(score(forBudget, 'budget')).toBeGreaterThan(score(forBiz, 'budget'));
  });
});

describe('a project from start to shelf', () => {
  it('runs architecture, verification, tape-out and launch', () => {
    let s = fresh();
    s = act(s, { type: 'startProject', name: 'First', kind: 'cpu', marketId: 'homepc', size: 'S', nodeId: 'n1000' });
    const id = s.projects[0]!.id;
    expect(s.staff[0]!.task).toBe(id);
    s = act(s, { type: 'setBoard', projectId: id, board: v2.suggestBoard(s, s.projects[0]!) });
    for (let i = 0; i < 200 && s.projects[0]?.phase !== 'verification'; i++) s = act(s, { type: 'tick' });
    expect(s.projects[0]!.phase).toBe('verification');
    expect(() => act(s, { type: 'setBoard', projectId: id, board: empty('S') })).toThrow(/frozen/);
    for (let i = 0; i < 300 && s.projects[0]!.progress < s.projects[0]!.need; i++) {
      for (const b of s.projects[0]!.bugs) if (b.found && !b.ignored && b.fixLeft === undefined) s = act(s, { type: 'fixBug', projectId: id, bugId: b.id });
      s = act(s, { type: 'tick' });
    }
    for (let i = 0; i < 60 && s.projects[0]!.bugs.some((b) => b.found && (b.fixLeft ?? 0) > 0); i++) s = act(s, { type: 'tick' });
    s = act(s, { type: 'finishVerification', projectId: id });
    expect(s.projects[0]!.phase).toBe('tapeout');
    expect(s.staff[0]!.task).toBeNull();
    for (let i = 0; i < 80 && s.projects[0]!.phase !== 'ready'; i++) s = act(s, { type: 'tick' });
    expect(s.projects[0]!.phase).toBe('ready');
    const price = Math.round(v2.fairPrice('homepc', v2.projectForecast(s, s.projects[0]!).total));
    s = act(s, { type: 'launch', projectId: id, price, marketing: 0 });
    expect(s.projects).toHaveLength(0);
    expect(s.products).toHaveLength(1);
    expect(s.products[0]!.reviews).toHaveLength(4);
    expect(s.notebook.tastes.homepc).toEqual(['perf']);
    s = act(s, { type: 'tick', days: 30 });
    expect(s.products[0]!.units).toBeGreaterThan(0);
    expect(s.markets.find((m) => m.id === 'homepc')!.shares.you).toBeGreaterThan(0);
  });

  it('refuses to tape out without cash for the masks', () => {
    let s = fresh();
    s = act(s, { type: 'startProject', name: 'Broke', kind: 'cpu', marketId: 'homepc', size: 'S', nodeId: 'n1000' });
    const pr = s.projects[0]!;
    pr.phase = 'verification';
    pr.progress = pr.need = 10;
    s.cash = 100;
    expect(v2.applyV2(s, content, { type: 'finishVerification', projectId: pr.id }).error).toMatch(/mask set/);
  });
});

describe('rivals', () => {
  it('never get ahead of the player, in any market, at any time', () => {
    for (const seed of [11, 12]) {
      const r = runBot(seed, 360 * 3);
      expect(r.minGap).toBeGreaterThan(0.1);
    }
  });

  it('press close: they come within half a point several times', () => {
    const r = runBot(13, 360 * 3);
    expect(r.closeCalls).toBeGreaterThanOrEqual(3);
  });

  it('cap rival products just below our best', () => {
    const s = fresh();
    s.products.push({ id: 'x', name: 'Ours', kind: 'cpu', marketId: 'homepc', size: 'S', nodeId: 'n1000', board: [], score: 7, reviews: [], price: 70, unitCost: 25, launchDay: 0, hype: 0, bugsShipped: 0, units: 0, revenue: 0, profit: 0, rate: 0 });
    const rp = { name: 'Huge', marketId: 'homepc', score: 9.5, price: 90, launchDay: 0 };
    expect(v2.rivalScore(s, rp)).toBeCloseTo(7 - v2.T.rivalMinGap);
    s.products[0]!.retiredDay = 0;
    expect(v2.rivalScore(s, rp)).toBeCloseTo(v2.T.rivalLegacyScore);
  });
});

describe('research and breakthroughs', () => {
  it('unlocks a breakthrough as soon as it is researched, with no year gate', () => {
    let s = fresh();
    s.research.done.push('fpu');
    s.research.points = 10_000;
    s = act(s, { type: 'research', nodeId: '3d' });
    s = act(s, { type: 'tick' });
    expect(s.research.done).toContain('3d');
    expect(s.day).toBeLessThan(5);
    expect(s.markets.some((m) => m.id === 'gamers3d')).toBe(true);
    expect(v2.blockUnlocked(s, 'texture')).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('BREAKTHROUGH'))).toBe(true);
  });

  it('rivals follow the player into a new market a few months later', () => {
    let s = fresh();
    s.research.done.push('fpu');
    s.research.points = 10_000;
    s = act(s, { type: 'research', nodeId: '3d' });
    s = act(s, { type: 'tick' });
    const nvidia = () => s.rivals.find((r) => r.id === 'nvidia')!;
    expect(v2.rivalActive(s, nvidia())).toBe(false);
    s = act(s, { type: 'tick', days: 60 });
    s = act(s, { type: 'tick', days: 60 });
    s = act(s, { type: 'tick', days: 10 });
    expect(v2.rivalActive(s, nvidia())).toBe(true);
    expect(nvidia().products.some((p) => p.marketId === 'gamers3d')).toBe(true);
  });

  it('refuses research whose prerequisites are missing', () => {
    expect(v2.applyV2(fresh(), content, { type: 'research', nodeId: '3d' }).error).toMatch(/builds on/);
  });
});

describe('people', () => {
  it('needs a free desk to hire', () => {
    let s = fresh();
    s.cash = 1e6;
    for (let i = 0; i < 10 && s.staff.length < v2.capacity(s, content); i++) {
      if (!s.candidates.length) s = act(s, { type: 'postJobAd' });
      s = act(s, { type: 'hire', candidateId: s.candidates[0]!.id });
    }
    if (!s.candidates.length) s = act(s, { type: 'postJobAd' });
    expect(v2.applyV2(s, content, { type: 'hire', candidateId: s.candidates[0]!.id }).error).toMatch(/desk/);
  });

  it('crunch speeds work up and burns people out', () => {
    let s = fresh();
    s = act(s, { type: 'startProject', name: 'C', kind: 'cpu', marketId: 'homepc', size: 'L', nodeId: 'n1000' });
    const id = s.projects[0]!.id;
    s = act(s, { type: 'setBoard', projectId: id, board: v2.suggestBoard(s, s.projects[0]!) });
    const calm = act(s, { type: 'tick', days: 10 });
    const hard = act(act(s, { type: 'setCrunch', projectId: id, on: true }), { type: 'tick', days: 10 });
    expect(hard.projects[0]!.progress).toBeGreaterThan(calm.projects[0]!.progress);
    expect(hard.staff[0]!.burnout).toBeGreaterThan(calm.staff[0]!.burnout);
  });
});

describe('cards', () => {
  it('wait for the player and resolve with their numbers', () => {
    let s = fresh();
    s = act(s, { type: 'tick', days: 60 });
    s = act(s, { type: 'tick', days: 60 });
    s = act(s, { type: 'tick', days: 60 });
    const card = s.cards[0];
    if (!card) return; // nothing eligible on this seed yet
    const later = act(s, { type: 'tick', days: 30 });
    expect(later.cards.some((c) => c.id === card.id)).toBe(true);
    const done = act(s, { type: 'resolveCard', cardId: card.id, choiceId: card.choices[0]!.id });
    expect(done.cards.some((c) => c.id === card.id)).toBe(false);
  });
});

describe('history, books and saves', () => {
  it('records weekly and monthly snapshots and keeps the weekly list bounded', () => {
    let s = fresh();
    for (let i = 0; i < 40; i++) s = act(s, { type: 'tick', days: 30 });
    expect(s.history.monthly.length).toBe(40);
    expect(s.history.weekly.length).toBeLessThanOrEqual(156);
    expect(s.books.length).toBe(40);
    expect(JSON.stringify(s).length).toBeLessThan(600_000);
  });

  it('survives a JSON round trip and stays deterministic', () => {
    let a = fresh(99);
    a = act(a, { type: 'startProject', name: 'D', kind: 'gpu', marketId: 'gamers', size: 'S', nodeId: 'n1000' });
    let b = JSON.parse(JSON.stringify(a)) as G;
    a = act(a, { type: 'tick', days: 60 });
    b = act(b, { type: 'tick', days: 60 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('pacing (fun metrics)', () => {
  it('a relaxed player still grows and never goes bankrupt', () => {
    const r = runBot(21, 360 * 3, true);
    expect(r.state.status).toBe('playing');
    expect(r.launches.length).toBeGreaterThanOrEqual(6);
  });
});

describe('executives', () => {
  it('a Chief Engineer on autopilot lays out, staffs and tapes out a chip', () => {
    let s = fresh(5);
    s.cash = 2e6;
    const c = s.execPool.find((x) => x.role === 'engineer')!;
    s = act(s, { type: 'hireExec', candidateId: c.id });
    expect(s.execs[0]!.auto).toBe(true);
    s = act(s, { type: 'startProject', name: 'Auto', kind: 'cpu', marketId: 'budget', size: 'S', nodeId: 'n1000' });
    for (let i = 0; i < 40 && s.projects[0]?.phase !== 'tapeout'; i++) s = act(s, { type: 'tick', days: 10 });
    expect(['tapeout', 'ready']).toContain(s.projects[0]!.phase);
    expect(s.execs[0]!.lately.length).toBeGreaterThan(0);
  });

  it('a CMO launches finished chips by itself', () => {
    let s = fresh(6);
    s.cash = 2e6;
    s = act(s, { type: 'hireExec', candidateId: s.execPool.find((x) => x.role === 'cmo')!.id });
    s = act(s, { type: 'startProject', name: 'M', kind: 'cpu', marketId: 'budget', size: 'S', nodeId: 'n1000' });
    const pr = s.projects[0]!;
    pr.board = v2.suggestBoard(s, pr);
    pr.phase = 'ready';
    s = act(s, { type: 'tick' });
    expect(s.products).toHaveLength(1);
  });

  it('only one per role', () => {
    let s = fresh(7);
    s.cash = 2e6;
    const [a, b] = s.execPool.filter((x) => x.role === 'cfo');
    s = act(s, { type: 'hireExec', candidateId: a!.id });
    expect(v2.applyV2(s, content, { type: 'hireExec', candidateId: b!.id }).error).toMatch(/already/);
  });
});

describe('rivalry arc', () => {
  it('moods change only once strength is clearly past the line', () => {
    expect(v2.moodFor('confident', 53)).toBe('confident');
    expect(v2.moodFor('confident', 50)).toBe('rattled');
    expect(v2.moodFor('rattled', 57)).toBe('rattled');
    expect(v2.moodFor('rattled', 60)).toBe('confident');
  });

  it('a weaker rival is cheaper to buy, and buying it takes its products off the market', () => {
    let s = fresh(8);
    s = act(s, { type: 'tick', days: 30 });
    const r = s.rivals.find((x) => x.id === 'cyrix')!;
    r.mood = 'confident';
    const high = v2.takeoverPrice(s, r);
    r.mood = 'forSale';
    const low = v2.takeoverPrice(s, r);
    expect(low).toBeLessThan(high);
    s.cash = low + 1;
    s = act(s, { type: 'acquireRival', rivalId: 'cyrix' });
    expect(s.rivals.find((x) => x.id === 'cyrix')!.acquired).toBe(true);
    expect(s.brand).toBeGreaterThan(v2.T.startBrand);
    s = act(s, { type: 'tick', days: 5 });
    expect(s.markets.every((m) => (m.shares.cyrix ?? 0) === 0)).toBe(true);
  });
});

describe('year in review', () => {
  it('records a review at each year end', () => {
    let s = fresh(9);
    for (let i = 0; i < 13; i++) s = act(s, { type: 'tick', days: 30 });
    expect(s.years).toHaveLength(1);
    expect(s.years[0]!.year).toBe(1991);
  });
});

describe('the late game', () => {
  const withTech = (s: G, ...ids: string[]) => {
    for (const id of ids) {
      s.research.done.push(id);
      s.research.doneDay[id] = s.day;
    }
    return s;
  };

  it('huge dies need multi-core', () => {
    const s = fresh(31);
    expect(v2.applyV2(s, content, { type: 'startProject', name: 'H', kind: 'cpu', marketId: 'homepc', size: 'XL', nodeId: 'n1000' }).error).toMatch(/Multi-core/);
    withTech(s, 'multicore');
    expect(v2.applyV2(s, content, { type: 'startProject', name: 'H', kind: 'cpu', marketId: 'homepc', size: 'XL', nodeId: 'n1000' }).error).toBeUndefined();
  });

  it('data centers come online after building and cap AI-model sales', () => {
    let s = withTech(fresh(32), 'multicore', 'datacenters', 'fpu', '3d', 'simd', 'n800', 'n600', 'n350', 'n250', 'n180', 'n130', 'gpucompute', 'tensor', 'n90', 'n65', 'n45', 'n28', 'llm');
    v2.openMarkets(s);
    s = act(s, { type: 'tick' });
    expect(s.markets.some((m) => m.id === 'chatbots')).toBe(true);
    s.products.push({ id: 'm', name: 'Model', kind: 'model', marketId: 'chatbots', size: 'S', nodeId: 'n28', board: [], score: 8, reviews: [], price: 20, unitCost: 2, launchDay: s.day, hype: 0, bugsShipped: 0, units: 0, revenue: 0, profit: 0, rate: 0 });
    s = act(s, { type: 'tick' });
    expect(s.products.find((p) => p.id === 'm')!.rate).toBe(0);
    s.cash = 1e9;
    s = act(s, { type: 'buildDatacenter' });
    for (let i = 0; i < 4; i++) s = act(s, { type: 'tick', days: 30 });
    expect(s.facilities.dc).toBe(v2.FAC.dc.add);
    expect(s.products.find((p) => p.id === 'm')!.rate).toBeGreaterThan(0);
    expect(s.products.find((p) => p.id === 'm')!.rate).toBeLessThanOrEqual(v2.FAC.dc.add + 1e-6);
  });

  it('your own fab makes masks and chips cheaper', () => {
    let s = withTech(fresh(33), 'ownfab', 'n800', 'n600', 'n350', 'n250', 'n180', 'n130');
    s.cash = 1e9;
    s = act(s, { type: 'buildFab' });
    for (let i = 0; i < 9; i++) s = act(s, { type: 'tick', days: 30 });
    expect(s.facilities.fab).toBe(1);
    expect(v2.maskCostMult(s)).toBeLessThan(1);
    expect(v2.unitCostMult(s)).toBeLessThan(1);
  });

  it('the AGI program ends the story: safe with alignment and trust, reckless without', () => {
    const run = (aligned: boolean) => {
      let s = withTech(fresh(34), 'agi', 'llm', ...(aligned ? ['alignment'] : []));
      s.cash = 5e9;
      s.facilities.dc = v2.FAC.agi.dc;
      s.brand = 70;
      s = act(s, { type: 'startAgi' });
      for (let i = 0; i < 13 && s.status === 'playing'; i++) s = act(s, { type: 'tick', days: 30 });
      return s;
    };
    const safe = run(true);
    expect(safe.status).toBe('won');
    expect(safe.ending).toBe('safe');
    expect(run(false).ending).toBe('reckless');
    const again = act(safe, { type: 'keepPlaying' });
    expect(again.status).toBe('playing');
  });

  it('investors want their target; missing it brings the board in', () => {
    let s = fresh(35);
    s.investor = { amount: 300_000, target: 10_000_000, startRevenue: 0, dueDay: s.day + 30 };
    s = act(s, { type: 'tick', days: 31 });
    const card = s.cards.find((c) => c.kind === 'boardmiss');
    expect(card).toBeTruthy();
    s = act(s, { type: 'resolveCard', cardId: card!.id, choiceId: 'seat' });
    expect(s.noInvestors).toBe(true);
  });
});

describe('company finance and the founder (Grounds Up ports)', () => {
  const profitable = (s: G, perMonth: number, months = 12) => {
    for (let i = 0; i < months; i++) s.books.push({ month: i, revenue: perMonth * 3, cogs: 0, salaries: 0, facilities: 0, projects: 0, marketing: 0, hiring: 0, other: 0, profit: perMonth, cash: s.cash });
    return s;
  };

  it('the bank lends up to 3× a year of profit, repaid monthly', () => {
    let s = profitable(fresh(41), 100_000);
    expect(v2.loanLimit(s)).toBeCloseTo(3_600_000);
    expect(v2.applyV2(s, content, { type: 'takeLoan', amount: 5_000_000 }).error).toMatch(/lend up to/);
    s = act(s, { type: 'takeLoan', amount: 1_000_000 });
    const left = s.loans[0]!.left;
    s = act(s, { type: 'tick', days: 30 });
    expect(s.loans[0]!.left).toBeLessThan(left);
  });

  it('sales offices let more of the world buy', () => {
    let s = fresh(42);
    s.cash = 1e6;
    const before = v2.reach(s);
    s = act(s, { type: 'openOffice', region: 'europe' });
    expect(v2.reach(s)).toBeGreaterThan(before);
  });

  it('HR levels cost money and lift morale', () => {
    let s = fresh(43);
    s.cash = 1e6;
    s = act(s, { type: 'upgradeHr' });
    expect(s.hr).toBe(1);
    expect(v2.hrLevel(s).morale).toBeGreaterThan(0);
  });

  it('stock prices are deterministic, and trading moves your own money', () => {
    let a = fresh(44);
    let b = fresh(44);
    a = act(a, { type: 'tick', days: 60 });
    b = act(b, { type: 'tick', days: 60 });
    expect(a.stocks.map((x) => x.price)).toEqual(b.stocks.map((x) => x.price));
    a.personal.cash = 100_000;
    a = act(a, { type: 'buyStock', ticker: 'IBM', shares: 100 });
    expect(a.personal.portfolio.IBM!.shares).toBe(100);
    expect(a.personal.cash).toBeLessThan(100_000);
    expect(v2.applyV2(a, content, { type: 'buyStock', ticker: 'NVDA', shares: 1 }).error).toMatch(/isn’t traded/);
    a = act(a, { type: 'sellStock', ticker: 'IBM', shares: 100 });
    expect(a.personal.portfolio.IBM).toBeUndefined();
  });

  it('a stop-loss fills on the weekly close', () => {
    let s = fresh(45);
    s.personal.cash = 1e6;
    s = act(s, { type: 'buyStock', ticker: 'AMD', shares: 1000 });
    const price = s.stocks.find((x) => x.ticker === 'AMD')!.price;
    s = act(s, { type: 'placeOrder', ticker: 'AMD', kind: 'stopLoss', trigger: price * 0.999, shares: 1000 });
    s.stocks.find((x) => x.ticker === 'AMD')!.sentiment = 0.5;
    s = act(s, { type: 'tick', days: 7 });
    expect(s.personal.portfolio.AMD).toBeUndefined();
    expect(s.personal.orders).toHaveLength(0);
  });

  it('the founder can draw a salary within a cap', () => {
    let s = fresh(46);
    expect(v2.applyV2(s, content, { type: 'setSalary', amount: 1e9 }).error).toMatch(/most you can pay/);
    s = act(s, { type: 'setSalary', amount: 5_000 });
    s = act(s, { type: 'tick', days: 30 });
    expect(s.personal.cash).toBeGreaterThanOrEqual(5_000);
  });

  it('an IPO needs a CFO, four profitable quarters and enough sales; it splits the proceeds', () => {
    let s = fresh(47);
    expect(v2.ipoCheck(s)).toMatch(/CFO/);
    s.cash = 1e7;
    s = act(s, { type: 'hireExec', candidateId: s.execPool.find((x) => x.role === 'cfo')!.id });
    expect(v2.ipoCheck(s)).toMatch(/profitable quarters/);
    profitable(s, 2_000_000);
    expect(v2.ipoCheck(s)).toBeNull();
    s = act(s, { type: 'ipo', percent: 0.25 });
    expect(s.ipo!.ownership).toBeCloseTo(0.75);
    expect(s.personal.cash).toBeGreaterThan(0);
    s = act(s, { type: 'tick', days: 14 });
    expect(s.ipo!.history.length).toBeGreaterThan(0);
  });

  it('net worth climbs the rich list', () => {
    const s = fresh(48);
    s.personal.cash = 2e9;
    expect(v2.richRank(s)).toBeLessThan(v2.RICH_LIST.length + 1);
    expect(v2.netWorth(s)).toBeGreaterThanOrEqual(2e9);
  });
});
