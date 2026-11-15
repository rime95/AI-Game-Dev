import { rand } from '../rng';
import { activeProducts } from './markets';
import { agiNeed, ensureCompute, totalMw } from './compute';
import type { GameV2 } from './types';
import { log, money, newId } from './util';

/**
 * Late-game strategic builds: data centers (needed to serve AI models), your own fab (cheaper
 * chips and masks), and the AGI program, the final chapter. Plus the endings and investors.
 */

export const FAC = {
  dc: { cost: 40_000_000, days: 90, add: 1500, upkeep: 1_000_000 },
  fab: [
    { level: 1, cost: 150_000_000, days: 240, unit: 0.7, mask: 0.7, upkeep: 2_000_000 },
    { level: 2, cost: 600_000_000, days: 300, unit: 0.55, mask: 0.5, upkeep: 6_000_000 },
  ],
  /** The AGI run: a program cost, monthly upkeep, and the MW of campuses it needs before it can start. */
  agi: { cost: 300_000_000, days: 360, mw: 200, upkeep: 10_000_000 },
  leaderMarkets: 9,
  leaderDays: 1440,
};

export const fabLevel = (s: GameV2) => (s.facilities.fab ? FAC.fab[s.facilities.fab - 1]! : null);
export const unitCostMult = (s: GameV2) => fabLevel(s)?.unit ?? 1;
export const maskCostMult = (s: GameV2) => fabLevel(s)?.mask ?? 1;
export const facilitiesUpkeep = (s: GameV2) =>
  (fabLevel(s)?.upkeep ?? 0) + (agiRunning(s) ? FAC.agi.upkeep : 0);

/** The AGI run is going (started, and no AGI ending yet; a market-leader ending doesn't stop it). */
export const agiRunning = (s: GameV2) => !!s.agi && s.ending !== 'safe' && s.ending !== 'reckless';

export function buildError(s: GameV2, what: 'dc' | 'fab' | 'agi'): string | null {
  const done = s.research.done;
  if (what === 'dc') {
    if (!done.includes('datacenters')) return 'Research data center engineering first.';
    if (s.cash < FAC.dc.cost) return `A data center costs ${money(FAC.dc.cost)}.`;
    return null;
  }
  if (what === 'fab') {
    if (!done.includes('ownfab')) return 'Research fab engineering first.';
    if (s.facilities.fabBuild) return 'A fab is already being built.';
    const next = FAC.fab[s.facilities.fab];
    if (!next) return 'Your fab is already the best there is.';
    if (s.cash < next.cost) return `The next fab costs ${money(next.cost)}.`;
    return null;
  }
  if (!done.includes('agi')) return 'Research towards general intelligence first.';
  if (s.agi) return 'The AGI program is already running.';
  if (totalMw(s) < FAC.agi.mw) return `The AGI run needs ${FAC.agi.mw} MW of campuses (you have ${totalMw(s)} MW).`;
  if (s.cash < FAC.agi.cost) return `The AGI program costs ${money(FAC.agi.cost)}.`;
  return null;
}

export function build(s: GameV2, what: 'dc' | 'fab' | 'agi'): void {
  if (what === 'dc') {
    s.cash -= FAC.dc.cost;
    s.month.other += FAC.dc.cost;
    s.facilities.dcBuilds.push({ doneDay: s.day + FAC.dc.days, add: FAC.dc.add });
    log(s, `Breaking ground on a data center (${money(FAC.dc.cost)}, ready in ${FAC.dc.days} days).`);
  } else if (what === 'fab') {
    const next = FAC.fab[s.facilities.fab]!;
    s.cash -= next.cost;
    s.month.other += next.cost;
    s.facilities.fabBuild = { doneDay: s.day + next.days, level: next.level };
    log(s, `Building a level ${next.level} fab (${money(next.cost)}, ready in ${next.days} days).`);
  } else {
    s.cash -= FAC.agi.cost;
    s.month.other += FAC.agi.cost;
    ensureCompute(s);
    s.agi = { startDay: s.day, doneDay: s.day + FAC.agi.days, pfDays: 0, need: agiNeed(s) };
    log(s, `The AGI run begins. It shares your training compute until it has had ${Math.round(s.agi.need!).toLocaleString('en-US')} PF-days.`, 'good');
  }
}

/** Daily: builds finish, upkeep is paid, the endings are checked. */
export function tickFacilities(s: GameV2): void {
  for (const b of [...s.facilities.dcBuilds])
    if (s.day >= b.doneDay) {
      s.facilities.dc += b.add;
      s.facilities.dcBuilds = s.facilities.dcBuilds.filter((x) => x !== b);
      log(s, `A data center came online: you can now serve ${s.facilities.dc.toLocaleString('en-US')} AI customers a day.`, 'good');
    }
  const fb = s.facilities.fabBuild;
  if (fb && s.day >= fb.doneDay) {
    s.facilities.fab = fb.level;
    s.facilities.fabBuild = null;
    log(s, `Your level ${fb.level} fab is running: chips and masks cost less from now on.`, 'good');
  }
  const up = facilitiesUpkeep(s) / 30;
  s.cash -= up;
  s.month.facilities += up;

  if (s.ending === 'safe' || s.ending === 'reckless') return;
  // AGI can still arrive after a market-leader ending, if the player kept playing.
  if (s.agi && (s.agi.need !== undefined ? (s.agi.pfDays ?? 0) >= s.agi.need : s.day >= s.agi.doneDay)) {
    const safe = s.research.done.includes('alignment') && s.brand >= 55;
    s.ending = safe ? 'safe' : 'reckless';
    s.status = 'won';
    log(s, safe ? 'AGI arrives, safely. The world exhales.' : 'AGI arrives, untamed. The world will never be the same.', safe ? 'good' : 'bad');
    return;
  }
  if (s.ending) return;
  const led = s.markets.filter((m) => (m.shares.you ?? 0) > 0 && Object.entries(m.shares).every(([k, v]) => k === 'you' || k === 'others' || v <= (m.shares.you ?? 0))).length;
  s.leadDays = led >= FAC.leaderMarkets ? s.leadDays + 1 : 0;
  if (s.leadDays >= FAC.leaderDays) {
    s.ending = 'leader';
    s.status = 'won';
    log(s, `Four years leading ${FAC.leaderMarkets}+ markets: ${s.companyName} is the undisputed leader of the industry.`, 'good');
  }
}

/** Monthly: struggling companies may get an investor's call; targets are checked when due. */
export function monthlyInvestor(s: GameV2): void {
  const inv = s.investor;
  if (inv && s.day >= inv.dueDay) {
    const made = s.acc.totalRevenue - inv.startRevenue;
    s.investor = null;
    if (made >= inv.target) log(s, `You hit the investors' target (${money(made)} in sales). They're delighted.`, 'good');
    else
      s.cards.push({
        id: newId(s, 'card'),
        kind: 'boardmiss',
        day: s.day,
        title: 'The investors are unhappy',
        speaker: 'Your board',
        body: `You promised ${money(inv.target)} in sales this year and made ${money(made)}. They want something back.`,
        choices: [
          { id: 'buyout', label: `Buy them out (${money(Math.round(inv.amount * 1.3))})`, detail: 'Pay back their money with interest.' },
          { id: 'seat', label: 'Give them a board seat', detail: 'Brand −4, and no more investor offers.' },
        ],
        ref: String(Math.round(inv.amount * 1.3)),
      });
    return;
  }
  if (inv || s.noInvestors || s.day < 300 || s.cards.some((c) => c.kind === 'investor')) return;
  const monthly = s.books.slice(-3).reduce((n, b) => n + (b.revenue - b.profit), 0) / 3;
  if (s.cash > monthly * 4 || rand(s) > 0.35) return;
  const last12 = s.books.slice(-12).reduce((n, b) => n + b.revenue, 0);
  const amount = Math.round(Math.max(300_000, last12 * 0.5) / 10_000) * 10_000;
  const target = Math.round(Math.max(amount * 2, last12 * 1.4) / 10_000) * 10_000;
  s.cards.push({
    id: newId(s, 'card'),
    kind: 'investor',
    day: s.day,
    title: 'An investor wants in',
    speaker: 'A venture fund',
    body: `${money(amount)} now, if you promise ${money(target)} in sales over the next 12 months.`,
    choices: [
      { id: 'yes', label: `Take ${money(amount)}`, detail: `Target: ${money(target)} in sales within a year.` },
      { id: 'no', label: 'No thanks', detail: 'Stay independent.' },
    ],
    ref: `${amount}|${target}`,
  });
}

export function resolveInvestorCard(s: GameV2, kind: string, choice: string, ref: string): boolean {
  if (kind === 'investor') {
    if (choice === 'yes') {
      const [amount, target] = ref.split('|').map(Number);
      s.cash += amount!;
      s.investor = { amount: amount!, target: target!, startRevenue: s.acc.totalRevenue, dueDay: s.day + 360 };
    }
    return true;
  }
  if (kind === 'boardmiss') {
    if (choice === 'buyout' && s.cash >= Number(ref)) {
      s.cash -= Number(ref);
      s.month.other += Number(ref);
    } else {
      s.brand = Math.max(0, s.brand - 4);
      s.noInvestors = true;
    }
    return true;
  }
  return false;
}


export const modelProducts = (s: GameV2) => activeProducts(s).filter((p) => p.kind === 'model');
