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
