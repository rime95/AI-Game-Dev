import { hash01, portfolioValue } from './stocks';
import { execOf } from './execs';
import type { GameV2 } from './types';
import { clamp, log, money } from './util';

/**
 * Company finance and the founder's fortune, after Grounds Up: bank loans with a drifting base
 * rate, the HR department, sales offices abroad, the founder's salary and net worth, a fixed rich
 * list to climb, and the IPO. Every number is temporary and lives here.
 */

export const LOANS = { multiple: 3, termMonths: 60, spread: [0.02, 0.06], baseLow: 0.025, baseHigh: 0.04 };

export const HR_LEVELS = [
  { level: 0, cost: 0, monthly: 0, morale: 0, quit: 1, skill: 0 },
  { level: 1, cost: 150_000, monthly: 25_000, morale: 4, quit: 0.75, skill: 0.5 },
  { level: 2, cost: 300_000, monthly: 50_000, morale: 8, quit: 0.55, skill: 1 },
  { level: 3, cost: 600_000, monthly: 85_000, morale: 12, quit: 0.4, skill: 1.5 },
];
export const hrLevel = (s: GameV2) => HR_LEVELS[s.hr]!;

/** Home sells in North America; offices open the rest of the world (the market there is real but you can't reach it). */
export const REGIONS = [
  { id: 'na', name: 'North America', weight: 1, cost: 0, monthly: 0 },
  { id: 'europe', name: 'Europe', weight: 0.6, cost: 250_000, monthly: 20_000 },
  { id: 'japan', name: 'Japan', weight: 0.4, cost: 300_000, monthly: 25_000 },
  { id: 'asia', name: 'Asia-Pacific', weight: 0.5, cost: 300_000, monthly: 25_000 },
];
export const WORLD_WEIGHT = REGIONS.reduce((n, r) => n + r.weight, 0);
/** Share of the world's buyers who can buy from us. */
export const reach = (s: GameV2) => (1 + REGIONS.filter((r) => s.offices.includes(r.id)).reduce((n, r) => n + r.weight, 0)) / WORLD_WEIGHT;
/** A year of sales (prices below keep up with the company, so growing never makes them trivial). */
export const annualSales = (s: GameV2) => s.books.slice(-12).reduce((n, b) => n + b.revenue, 0);
type Region = (typeof REGIONS)[number];
/** Opening an office: at least its base price, or a quarter of a year's sales weighted by the region's size. */
export const officeCost = (s: GameV2, r: Region) => Math.max(r.cost, Math.round((annualSales(s) * r.weight * 0.25) / 10_000) * 10_000);
/** Running an office: at least its base, growing with the sales it supports. */
export const officeMonthly = (s: GameV2, r: Region) => Math.max(r.monthly, Math.round((annualSales(s) * r.weight * 0.0025) / 1000) * 1000);
export const officesMonthly = (s: GameV2) => REGIONS.filter((r) => s.offices.includes(r.id)).reduce((n, r) => n + officeMonthly(s, r), 0);
/** HR costs grow with headcount (priced for 20 people). */
const hrScale = (s: GameV2) => Math.max(1, s.staff.length / 20);
export const hrPrice = (s: GameV2, level: number) => {
  const l = HR_LEVELS[level];
  return l ? { cost: Math.round((l.cost * hrScale(s)) / 1000) * 1000, monthly: Math.round((l.monthly * hrScale(s)) / 1000) * 1000 } : null;
};

/** R&D budget: research points per day for a monthly spend (diminishing returns; $10K a month ≈ one researcher). */
export const rdPointsPerDay = (budget: number) => (budget > 0 ? 0.33 * Math.pow(budget / 10_000, 0.6) : 0);

export const IPO = { quarters: 4, revenue: 50_000_000, shares: 100_000_000, fee: 0.05 };

/** Real people, fixed fortunes (they never move, so the list is a fixed target). Approximate, in USD. */
export const RICH_LIST: { name: string; worth: number }[] = [
  { name: 'Elon Musk', worth: 400e9 },
  { name: 'Larry Ellison', worth: 250e9 },
  { name: 'Mark Zuckerberg', worth: 230e9 },
  { name: 'Jeff Bezos', worth: 230e9 },
  { name: 'Larry Page', worth: 180e9 },
  { name: 'Sergey Brin', worth: 170e9 },
  { name: 'Bernard Arnault', worth: 160e9 },
  { name: 'Jensen Huang', worth: 140e9 },
  { name: 'Steve Ballmer', worth: 140e9 },
  { name: 'Warren Buffett', worth: 145e9 },
  { name: 'Bill Gates', worth: 110e9 },
  { name: 'Michael Dell', worth: 100e9 },
  { name: 'Masayoshi Son', worth: 55e9 },
  { name: 'Lisa Su', worth: 1.3e9 },
  { name: 'A typical tech millionaire', worth: 5e6 },
];

/** Trailing 12 months of operating profit (for the loan limit). */
const trailingProfit = (s: GameV2) => s.books.slice(-12).reduce((n, b) => n + b.profit, 0);
export const debt = (s: GameV2) => s.loans.reduce((n, l) => n + l.left, 0);
export const loanLimit = (s: GameV2) => Math.max(0, LOANS.multiple * trailingProfit(s) - debt(s));
export const loanRate = (s: GameV2) => {
  const lev = trailingProfit(s) > 0 ? debt(s) / trailingProfit(s) : 3;
  return s.baseRate + LOANS.spread[0]! + (LOANS.spread[1]! - LOANS.spread[0]!) * clamp(lev / 3, 0, 1);
};

/** What the company is worth: market value after the IPO, else ten years of profit plus cash, less debt. */
export function companyValue(s: GameV2): number {
  if (s.ipo) return s.ipo.shares * s.ipo.price;
  const annual = s.books.slice(-12).reduce((n, b) => n + b.profit, 0);
  return Math.max(0, s.cash + Math.max(0, annual) * 10 - debt(s));
}
export const ownership = (s: GameV2) => s.ipo?.ownership ?? s.stake ?? 1;
export const netWorth = (s: GameV2) => s.personal.cash + portfolioValue(s) + ownership(s) * companyValue(s);
export const richRank = (s: GameV2) => RICH_LIST.filter((p) => p.worth > netWorth(s)).length + 1;
export const salaryCap = (s: GameV2) => Math.max(10_000, (s.books[s.books.length - 1]?.revenue ?? 0) * 0.01);

export function ipoCheck(s: GameV2): string | null {
  if (s.ipo) return 'Already public.';
  if (!execOf(s, 'cfo')) return 'An IPO needs a CFO.';
  const q = [0, 1, 2, 3].map((i) => s.books.slice(-(i + 1) * 3, s.books.length - i * 3).reduce((n, b) => n + b.profit, 0));
  if (s.books.length < 12 || q.some((p) => p <= 0)) return `An IPO needs ${IPO.quarters} profitable quarters in a row.`;
  const rev = s.books.slice(-12).reduce((n, b) => n + b.revenue, 0);
  if (rev < IPO.revenue) return `An IPO needs ${money(IPO.revenue)} a year in sales (you have ${money(rev)}).`;
  return null;
}

/** Valuation at the IPO: earnings at a P/E that follows the company's growth. */
export function ipoValuation(s: GameV2): number {
  const annual = s.books.slice(-12).reduce((n, b) => n + b.profit, 0);
  const prev = s.books.slice(-24, -12).reduce((n, b) => n + b.revenue, 0);
  const rev = s.books.slice(-12).reduce((n, b) => n + b.revenue, 0);
  const growth = prev > 0 ? rev / prev - 1 : 0.3;
  const pe = clamp(15 + growth * 60, 10, 60);
  return Math.max(0, annual) * pe + s.cash;
}

export function goPublic(s: GameV2, percent: number): void {
  const val = ipoValuation(s);
  const raised = val * percent * (1 - IPO.fee);
  // Half new shares (cash to the company), half the founder's own shares (cash to you).
  s.cash += raised / 2;
  s.personal.cash += raised / 2;
  s.ipo = { day: s.day, ownership: (s.stake ?? 1) * (1 - percent), shares: IPO.shares, price: Math.round((val / IPO.shares) * 100) / 100, sentiment: 1, payout: 0, history: [] };
  log(s, `${s.companyName} is public! Sold ${Math.round(percent * 100)}% at a ${money(val)} valuation, raising ${money(raised)}.`, 'good');
}

/** Monthly: loan payments, base rate drift, HR and office costs, the founder's salary, rich-list milestones. */
export function monthlyFinance(s: GameV2): void {
  const month = Math.floor(s.day / 30);
  if (month % 3 === 0) s.baseRate = LOANS.baseLow + hash01(s.seed, 'base', month) * (LOANS.baseHigh - LOANS.baseLow);
  for (const l of [...s.loans]) {
    const interest = (l.left * l.rate) / 12;
    const principal = Math.min(l.left, l.monthly - interest);
    s.cash -= interest + principal;
    s.month.other += interest + principal;
    l.left -= principal;
    l.monthsLeft--;
    if (l.left <= 1 || l.monthsLeft <= 0) {
      s.loans = s.loans.filter((x) => x !== l);
      log(s, 'A loan was paid off.', 'good');
    }
  }
  const fixed = (hrPrice(s, s.hr)?.monthly ?? 0) + officesMonthly(s);
  s.cash -= fixed;
  s.month.facilities += fixed;
  const pay = s.personal.salary;
  if (pay > 0 && s.cash > pay) {
    s.cash -= pay;
    s.month.salaries += pay;
    s.personal.cash += pay;
  }
  const worth = netWorth(s);
  for (const p of RICH_LIST) {
    if (worth > p.worth && !s.personal.passed.includes(p.name)) {
      s.personal.passed.push(p.name);
      log(s, `Your fortune (${money(worth)}) just passed ${p.name}'s.`, 'good');
    }
  }
}

/** Weekly after the IPO: the share price follows earnings × P/E and its own sentiment; quarterly dividends. */
export function weeklyIpo(s: GameV2): void {
  const ipo = s.ipo;
  if (!ipo) return;
  const week = Math.floor(s.day / 7);
  const annual = s.books.slice(-12).reduce((n, b) => n + b.profit, 0);
  const fair = Math.max(0.5, (Math.max(0, annual) * 20 + s.cash - debt(s)) / ipo.shares);
  ipo.sentiment = clamp(ipo.sentiment + 0.08 * (1 - ipo.sentiment) + (hash01(s.seed, 'you', week) * 2 - 1) * 0.05, 0.5, 1.8);
  ipo.price = Math.round(fair * ipo.sentiment * 100) / 100;
  ipo.history.push(ipo.price);
  if (ipo.history.length > 104) ipo.history.shift();
  if (s.day % 90 < 7 && ipo.payout > 0) {
    const q = s.books.slice(-3).reduce((n, b) => n + b.profit, 0);
    if (q > 0) {
      const total = q * ipo.payout;
      s.cash -= total;
      s.month.other += total;
      s.personal.cash += total * ipo.ownership;
      log(s, `Paid ${money(total)} in dividends (${money(total * ipo.ownership)} to you).`);
    }
  }
}
