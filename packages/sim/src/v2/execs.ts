import { rand } from '../rng';
import { boardScore, chipCosts, evaluateBoard, expectOf, specOf } from './board';
import { FIRST_NAMES, LAST_NAMES, TECHS, T } from './data';
import { activeProducts, currentScore, fairPrice } from './markets';
import { maskCostMult } from './facilities';
import type { Exec, ExecCandidate, ExecRole, GameV2 } from './types';
import { clamp, log, money, newId, pick } from './util';

/**
 * Executives take repeated work off your hands as the company grows (the Grounds Up rule: every
 * system must be automatable at scale). Each has a 1–5 star rating and an autopilot switch; only
 * a hired executive with autopilot on acts, and better stars mean better-judged decisions.
 */

export const EXEC_ROLES: { role: ExecRole; title: string; does: string; base: number }[] = [
  { role: 'engineer', title: 'Chief Engineer', does: 'Staffs projects, keeps testing until the chip is clean enough, tapes out and lays out empty dies.', base: 9_000 },
  { role: 'cmo', title: 'Chief Marketing Officer', does: 'Keeps prices near fair value and launches finished chips with a sensible push.', base: 8_000 },
  { role: 'cfo', title: 'Chief Financial Officer', does: 'Forecasts cash, warns before trouble, and answers money cards.', base: 8_500 },
  { role: 'research', title: 'Head of Research', does: 'Keeps the lab busy, picking the next technology when one finishes.', base: 8_000 },
];
export const roleInfo = (r: ExecRole) => EXEC_ROLES.find((x) => x.role === r)!;
export const execOf = (s: GameV2, r: ExecRole): Exec | undefined => s.execs.find((e) => e.role === r);
export const execActive = (s: GameV2, r: ExecRole) => !!execOf(s, r)?.auto;

/** Which executive answers which decision card on autopilot, and what they pick. */
export const CARD_OWNER: Record<string, { role: ExecRole; pick: string }> = {
  bigorder: { role: 'cmo', pick: 'yes' },
  tradeshow: { role: 'cmo', pick: 'no' },
  interview: { role: 'cmo', pick: 'yes' },
  foundryrush: { role: 'engineer', pick: 'no' },
  restweek: { role: 'engineer', pick: 'rest' },
  breakthrough2am: { role: 'engineer', pick: 'thanks' },
  waferspike: { role: 'cfo', pick: 'lock' },
  angel: { role: 'cfo', pick: 'no' },
  university: { role: 'research', pick: 'yes' },
};

export function refreshExecPool(s: GameV2): void {
  s.execPool = [];
  for (const r of EXEC_ROLES) {
    for (let i = 0; i < 2; i++) {
      const stars = clamp(1 + Math.floor(rand(s) * 3 + rand(s) * 2.2), 1, 5);
      const salary = Math.round((r.base * (0.6 + stars * 0.25) * (1 + s.day / 3600)) / 100) * 100;
      s.execPool.push({ id: newId(s, 'exec'), role: r.role, name: `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`, stars, salary, fee: salary * 2 });
    }
  }
}

function note(s: GameV2, e: Exec, text: string): void {
  e.lately.unshift(`${s.day}|${text}`);
  if (e.lately.length > 8) e.lately.pop();
}

/** Cash forecast from the last three months' average result (the CFO's view; exact at 5 stars). */
export function cashForecast(s: GameV2): { in3: number; in6: number; monthly: number; confidence: number } | null {
  const cfo = execOf(s, 'cfo');
  if (!cfo) return null;
  const recent = s.books.slice(-3);
  if (!recent.length) return { in3: s.cash, in6: s.cash, monthly: 0, confidence: cfo.stars };
  const monthly = recent.reduce((n, b) => n + b.profit, 0) / recent.length;
  return { in3: s.cash + monthly * 3, in6: s.cash + monthly * 6, monthly, confidence: cfo.stars };
}

/** Daily: each executive on autopilot does its part. */
export function tickExecs(s: GameV2, launch: (projectId: string, price: number, push: 0 | 1 | 2 | 3) => void, suggest: (pr: GameV2['projects'][number]) => (string | null)[]): void {
  let pay = 0;
  for (const e of s.execs) pay += e.salary / 30;
  s.cash -= pay;
  s.month.salaries += pay;

  const eng = execOf(s, 'engineer');
  if (eng?.auto && s.day % 3 === 0) {
    // Idle people join the busiest-looking project that has the fewest hands.
    const open = s.projects.filter((p) => p.phase === 'architecture' || p.phase === 'verification' || p.phase === 'training');
    for (const p of s.staff.filter((x) => x.task === null)) {
      if (!open.length) break;
      const target = [...open].sort((a, b) => s.staff.filter((x) => x.task === a.id).length - s.staff.filter((x) => x.task === b.id).length)[0]!;
      p.task = target.id;
      note(s, eng, `Put ${p.name} on the ${target.name}.`);
    }
    for (const pr of open) {
      if (pr.phase === 'architecture' && pr.board.every((c) => c === null) && s.day - pr.startedDay >= 5) {
        pr.board = suggest(pr);
        note(s, eng, `Laid out the ${pr.name} die (expected ${boardScore(evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind, specOf(pr)), pr.marketId, s.day, expectOf(s, pr.marketId)).toFixed(1)}).`);
      }
      // Better engineers ignore only minor bugs that cost a lot of time; weaker ones fix everything.
      // A trained model ships once its evals are fixed and it has had a little extra training.
      if (pr.phase === 'training' && pr.progress >= pr.need && pr.polishDays >= 2 + eng.stars * 2 && !pr.bugs.some((b) => b.found && !b.ignored && (b.fixLeft ?? 0) > 0)) {
        pr.phase = 'ready';
        for (const p of s.staff) if (p.task === pr.id) p.task = null;
        note(s, eng, `Finished training the ${pr.name}.`);
        continue;
      }
      if (pr.phase === 'verification') {
        for (const b of pr.bugs) if (b.found && !b.ignored && b.severity === 1 && (b.fixLeft ?? 0) > 6 && eng.stars >= 4) {
          b.ignored = true;
          note(s, eng, `Shipping the ${pr.name} with a minor bug rather than lose a week.`);
        }
        const fixing = pr.bugs.some((b) => b.found && !b.ignored && (b.fixLeft ?? 0) > 0);
        const mask = Math.round(chipCosts(pr.size, pr.nodeId).maskCost * maskCostMult(s));
        if (pr.progress >= pr.need && !fixing && pr.polishDays >= 2 + eng.stars * 2 && s.cash > mask * 1.2) {
          s.cash -= mask;
          s.month.projects += mask;
          pr.spent += mask;
          pr.phase = 'tapeout';
          pr.progress = 0;
          pr.need = chipCosts(pr.size, pr.nodeId).fabDays;
          for (const p of s.staff) if (p.task === pr.id) p.task = null;
          note(s, eng, `Taped out the ${pr.name} (${money(mask)} for masks).`);
          log(s, `${eng.name} taped out the ${pr.name}.`);
        }
      }
    }
  }

  const cmo = execOf(s, 'cmo');
  if (cmo?.auto) {
    for (const pr of s.projects.filter((p) => p.phase === 'ready')) {
      const ev = evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind, specOf(pr));
      const est = boardScore(ev, pr.marketId, s.day, expectOf(s, pr.marketId));
      const err = (5 - cmo.stars) * 0.04;
      const price = Math.round(fairPrice(pr.marketId, est) * (1 + (rand(s) * 2 - 1) * err));
      const push: 0 | 1 | 2 | 3 = s.cash > pr.spent * 4 ? 2 : s.cash > pr.spent * 1.5 ? 1 : 0;
      note(s, cmo, `Launched the ${pr.name} at ${money(price)} with ${T.marketing[push].label.toLowerCase()}.`);
      launch(pr.id, price, push);
    }
    // Monthly: retire chips a newer one of ours has replaced in the same market and that hardly sell.
    if (s.day % 30 === 20)
      for (const p of activeProducts(s)) {
        const newer = activeProducts(s, p.marketId).find((q) => q !== p && q.launchDay > p.launchDay && currentScore(q, s.day) > currentScore(p, s.day));
        if (newer && p.rate < newer.rate * 0.15) {
          p.retiredDay = s.day;
          note(s, cmo, `Retired the ${p.name}: the ${newer.name} replaced it.`);
        }
      }
    if (s.day % 30 === 15)
      for (const p of activeProducts(s)) {
        const fair = fairPrice(p.marketId, currentScore(p, s.day));
        const band = 0.12 - cmo.stars * 0.02;
        if (p.price > fair * (1 + band) || p.price < fair * (1 - band)) {
          const to = Math.round(fair);
          note(s, cmo, `Repriced the ${p.name} from ${money(p.price)} to ${money(to)}.`);
          p.price = to;
        }
      }
  }

  const res = execOf(s, 'research');
  if (res?.auto && !s.research.current) {
    const avail = TECHS.filter((t) => !s.research.done.includes(t.id) && t.requires.every((r) => s.research.done.includes(r)));
    // Better heads aim for breakthroughs; weaker ones take the cheapest thing.
    const choice = res.stars >= 3 ? [...avail].sort((a, b) => (b.breakthrough ? 1 : 0) - (a.breakthrough ? 1 : 0) || a.cost - b.cost)[0] : [...avail].sort((a, b) => a.cost - b.cost)[0];
    if (choice) {
      s.research.current = choice.id;
      s.research.progress = 0;
      note(s, res, `Started researching ${choice.name}.`);
    }
  }

  const cfo = execOf(s, 'cfo');
  if (cfo && s.day % 30 === 1) {
    const f = cashForecast(s);
    if (f && f.in3 < 0) {
      note(s, cfo, `Warned: at this rate cash runs out within 3 months (${money(f.monthly)}/month).`);
      log(s, `${cfo.name} (CFO): at this rate we run out of cash within 3 months.`, 'bad');
    }
  }
}

