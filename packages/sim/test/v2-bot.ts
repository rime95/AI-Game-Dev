import { content } from '@stm/content';
import { v2 } from '../src';

type G = v2.GameV2;

/**
 * A simple bot that plays v2 the way a reasonable player would: always keeps a project going
 * with an auto-layout, fixes every bug it finds, tapes out after a little polish, launches at
 * the fair price with a small push, hires when there's a desk and the cash, researches the
 * cheapest tech, builds desks and moves to the office when it can.
 * `lazy` makes it act only every other week (the "no forced hurry" check).
 */
export interface BotResult {
  state: G;
  /** Days on which the bot had nothing it could do. */
  idleDays: number;
  /** Lowest our-best-minus-rival-best gap seen in any market (must stay > 0). */
  minGap: number;
  /** Times a rival came within 0.5. */
  closeCalls: number;
  /** Times cash dipped below 3 months of costs before the office. */
  tightCash: number;
  launches: { day: number; name: string; score: number }[];
  officeDay: number | null;
}

const act = (s: G, cmd: v2.CommandV2): G => {
  const r = v2.applyV2(s, content, cmd);
  return r.error ? s : r.state;
};

export function runBot(seed: number, days: number, lazy = false, keepPlaying = false): BotResult {
  let s = v2.createGameV2(content, seed, 'Bot Silicon');
  let idleDays = 0;
  let minGap = Infinity;
  let closeCalls = 0;
  let tightCash = 0;
  let wasTight = false;
  let wasClose = new Set<string>();
  const launches: BotResult['launches'] = [];
  let officeDay: number | null = null;
  let n = 0;
  while (s.day < days && s.status === 'playing') {
    const acting = !lazy || s.day % 14 < 7;
    let didSomething = false;
    if (acting) {
      // Cards: take the first choice.
      for (const c of s.cards) {
        s = act(s, { type: 'resolveCard', cardId: c.id, choiceId: (c.choices.find((ch) => !ch.cost || ch.cost <= s.cash) ?? c.choices[c.choices.length - 1]!).id });
        didSomething = true;
      }
      // Projects.
      for (const pr of s.projects) {
        if (pr.phase === 'architecture' && pr.board.every((c) => c === null)) {
          s = act(s, { type: 'setBoard', projectId: pr.id, board: v2.suggestBoard(s, pr) });
          didSomething = true;
        }
        for (const b of pr.bugs) if (b.found && !b.ignored && b.fixLeft === undefined) didSomething = true;
        if ((pr.phase === 'verification' || pr.phase === 'training') && pr.progress >= pr.need && pr.polishDays >= 6 && !pr.bugs.some((b) => b.found && !b.ignored && (b.fixLeft ?? 0) > 0)) {
          s = act(s, { type: 'finishVerification', projectId: pr.id });
          didSomething = true;
        }
        if (pr.phase === 'ready') {
          const f = v2.projectForecast(s, pr);
          const unit = v2.chipCosts(pr.size, pr.nodeId, v2.usedTiles(pr.board), v2.specOf(pr)).unitCost;
          const price = Math.round(Math.max(v2.fairPrice(pr.marketId, f.total), unit * 1.3));
          s = act(s, { type: 'launch', projectId: pr.id, price, marketing: s.cash > 60_000 ? 1 : 0 });
          const p = s.products[s.products.length - 1]!;
          launches.push({ day: s.day, name: p.name, score: p.score });
          didSomething = true;
        }
      }
      // Idle people start a project or research.
      const idle = s.staff.filter((p) => p.task === null);
      const working = s.projects.filter((p) => p.phase === 'architecture' || p.phase === 'verification' || p.phase === 'training');
      if (idle.length && working.length === 0) {
        const markets = s.markets.map((m) => v2.market(m.id)).filter((m) => v2.kindUnlocked(s, m.kind));
        // Pick the market where we are weakest relative to its size.
        const target = markets.sort((a, b) => (v2.playerBest(s, a.id) ?? 0) - (v2.playerBest(s, b.id) ?? 0) || b.startSize - a.startSize)[0]!;
        const size: v2.ProjectSize = s.staff.length >= 5 ? 'L' : s.staff.length >= 3 ? 'M' : 'S';
        const nodeId = [...v2.NODES].reverse().find((nd) => v2.nodeUnlocked(s, nd.id) && v2.chipCosts(size, nd.id).maskCost <= s.cash * 0.35)?.id ?? 'n1000';
        s = act(s, { type: 'startProject', name: `Chip ${++n}`, kind: target.kind, marketId: target.id, size, nodeId });
        didSomething = true;
      } else if (idle.length) {
        const pr = working[0];
        for (const p of idle) s = act(s, { type: 'assign', personId: p.id, task: s.staff.length >= 3 && p === idle[0] ? 'research' : pr!.id });
        didSomething = true;
      }
      if (!s.research.current) {
        const t = v2.TECHS.filter((x) => v2.techAvailable(s, x)).sort((a, b) => a.cost - b.cost)[0];
        if (t) {
          s = act(s, { type: 'research', nodeId: t.id });
          didSomething = true;
        }
      }
      // Hiring.
      const cap = v2.capacity(s, content);
      const monthlyCost = v2.salaryBill(s) + 3000;
      const revenue30 = s.products.reduce((n2, p) => n2 + p.rate * (p.price - p.unitCost), 0) * 30;
      if (s.staff.length < cap && s.candidates.length && s.products.length > 0 && s.cash > monthlyCost * 5 && revenue30 > monthlyCost * 1.1 && (s.books[s.books.length - 1]?.profit ?? 0) > 0) {
        const c = [...s.candidates].sort((a, b) => b.skills.design + b.skills.eng - (a.skills.design + a.skills.eng))[0]!;
        s = act(s, { type: 'hire', candidateId: c.id });
        didSomething = true;
      } else if (s.staff.length >= cap && s.cash > 150_000 && s.hq.stage !== 'garage') {
        for (let y = 0; y < 10; y++)
          for (let x = 0; x < 14; x++) {
            const r = v2.applyV2(s, content, { type: 'placeRoom', templateId: 'deskPod', x, y, rot: 0 });
            if (!r.error) {
              s = r.state;
              y = 99;
              break;
            }
          }
      }
      // Late game: data centers once models exist, a fab when rich, then the AGI program.
      if (!v2.buildError(s, 'agi')) s = act(s, { type: 'startAgi' });
      if (s.research.done.includes('llm') && !v2.buildError(s, 'dc') && s.cash > v2.FAC.dc.cost * 3) s = act(s, { type: 'buildDatacenter' });
      if (!v2.buildError(s, 'fab') && s.cash > (v2.FAC.fab[s.facilities.fab]?.cost ?? Infinity) * 2) s = act(s, { type: 'buildFab' });
      // Refit campuses when one of our own chips is clearly better than what is installed.
      const best = v2.ownChips(s)[0];
      if (best)
        for (const c of s.compute?.campuses ?? []) {
          const chip = v2.ownChip(best);
          const q = v2.upgradeQuote(s, c, 'chips', best.id);
          if (chip.pfPerMw > c.chip.pfPerMw * 1.3 && !q.error && s.cash > q.cost * 3) s = act(s, { type: 'upgradeCampus', campusId: c.id, part: 'chips', option: best.id });
        }
      if (s.hq.stage === 'office' && s.cash > 30_000_000) s = act(s, { type: 'moveHq' });
      // Book foundry capacity when demand outruns it, and open offices when they pay for themselves.
      const fd = s.foundry;
      if (fd && fd.demand > fd.capacity * 1.1) {
        const want = Math.round(Math.min(fd.demand - fd.capacity, (s.cash * 0.3) / v2.T.foundry.pricePerChip));
        if (want >= 100) s = act(s, { type: 'bookCapacity', chips: want });
      }
      for (const r of v2.REGIONS) if (r.id !== 'na' && !s.offices.includes(r.id) && s.cash > v2.officeCost(s, r) * 3 && s.products.length >= 3) s = act(s, { type: 'openOffice', region: r.id });
      if (s.hq.stage === 'garage' && s.cash > 1_200_000) {
        s = act(s, { type: 'moveHq' });
        if (s.hq.stage !== 'garage') {
          officeDay = s.day;
          didSomething = true;
        }
      }
    }
    if (acting && !didSomething && s.projects.length === 0 && s.staff.every((p) => p.task !== null)) idleDays++;
    s = act(s, { type: 'tick', days: 1 });
    for (const m of s.markets) {
      const ours = v2.playerBest(s, m.id);
      if (ours === null) continue;
      let rb = 0;
      for (const r of s.rivals) for (const rp of r.products) if (rp.marketId === m.id) rb = Math.max(rb, v2.rivalScore(s, rp));
      const gap = ours - rb;
      minGap = Math.min(minGap, gap);
      const close = gap < 0.5;
      if (close && !wasClose.has(m.id)) closeCalls++;
      if (close) wasClose.add(m.id);
      else wasClose.delete(m.id);
    }
    const costsPerMonth = v2.salaryBill(s) + 1000;
    // Optionally play on past the market-leader ending (to reach the AGI run).
    if (keepPlaying && s.status === 'won' && s.ending === 'leader') s = act(s, { type: 'keepPlaying' });
    const tight = s.hq.stage === 'garage' && s.cash < costsPerMonth * 3;
    if (tight && !wasTight) tightCash++;
    wasTight = tight;
  }
  return { state: s, idleDays, minGap, closeCalls, tightCash, launches, officeDay };
}

// Run directly: npx tsx packages/sim/test/v2-bot.ts
if (process.argv[1]?.endsWith('v2-bot.ts') && process.argv[2] === 'long') {
  for (const seed of [1, 2]) {
    const r = runBot(seed, 360 * 30, false, true);
    const s = r.state;
    const when = (id: string) => (s.research.doneDay[id] !== undefined ? v2.monthLabelV2(s.research.doneDay[id]!) : '-');
    console.log(
      `seed ${seed}: ${v2.monthLabelV2(s.day)} ${s.status} ending ${s.ending ?? '-'} cash ${v2.moneyV2(s.cash)} staff ${s.staff.length} stage ${s.hq.stage} launches ${r.launches.length} ` +
        `research ${s.research.done.length}/${v2.TECHS.length} 3d ${when('3d')} multicore ${when('multicore')} llm ${when('llm')} agi ${when('agi')} agiRun ${s.agi ? v2.monthLabelV2(s.agi.startDay) : '-'} campuses ${s.compute?.campuses.length ?? 0} PF ${Math.round(v2.totalPf(s))} fab ${s.facilities.fab} minGap ${r.minGap.toFixed(2)} chapter ${s.chapter.index}`,
    );
  }
} else if (process.argv[1]?.endsWith('v2-bot.ts')) {
  for (const seed of [1, 2, 3, 4]) {
    for (const lazy of [false, true]) {
      const r = runBot(seed, 360 * 6, lazy);
      const s = r.state;
      console.log(
        `seed ${seed}${lazy ? ' lazy' : ''}: day ${s.day} (${v2.monthLabelV2(s.day)}) ${s.status} cash ${v2.moneyV2(s.cash)} staff ${s.staff.length} stage ${s.hq.stage} ` +
          `launches ${r.launches.length} best ${s.records.bestScore.toFixed(1)} research ${s.research.done.length} office ${r.officeDay ?? '-'} ` +
          `minGap ${r.minGap.toFixed(2)} close ${r.closeCalls} tight ${r.tightCash} idle ${r.idleDays} chapter ${s.chapter.index}`,
      );
      if (seed === 1 && !lazy) {
        console.log('  launches:', r.launches.slice(0, 12).map((l) => `${v2.monthLabelV2(l.day)} ${l.score}`).join(' | '));
        console.log('  books (first 14 months):', s.books.slice(0, 14).map((b) => `${Math.round(b.revenue / 1000)}k/${Math.round(b.profit / 1000)}k`).join(' '));
        console.log('  shares:', s.markets.map((m) => `${m.id} ${(100 * (m.shares.you ?? 0)).toFixed(1)}%`).join(', '));
      }
    }
  }
}
