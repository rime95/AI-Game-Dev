import { rand } from '../rng';
import { T } from './data';
import { activeProducts, RIVALRY, takeoverPrice } from './markets';
import { resolveInvestorCard } from './facilities';
import type { CardChoice, GameV2, PendingCard } from './types';
import { between, clamp, log, money, newId, spend } from './util';

/**
 * Decision cards: chip-world moments with real trade-offs. Every choice states its numbers.
 * Cards wait for the player (no timers). At most one of each kind is pending, and a kind
 * doesn't repeat within T.cardNoRepeatDays.
 */

interface CardDef {
  kind: string;
  when: (s: GameV2) => boolean;
  make: (s: GameV2) => Omit<PendingCard, 'id' | 'kind' | 'day'>;
  resolve: (s: GameV2, choice: string, card: PendingCard) => void;
}

/** The angel investor's slice. */
export const ANGEL_SHARE = 0.15;

/** Research points the lab makes per day right now. */
const researchPerDay = (s: GameV2) => s.staff.filter((p) => p.task === 'research').reduce((n, p) => n + (T.researchPerDay * p.skills.research) / 5, 0);

const monthlySales = (s: GameV2) => activeProducts(s).reduce((n, p) => n + p.rate * p.price, 0) * 30;
const bestPerson = (s: GameV2) => [...s.staff].filter((p) => !p.founder).sort((a, b) => b.level - a.level)[0];

const DEFS: CardDef[] = [
  {
    kind: 'bigorder',
    when: (s) => monthlySales(s) > 5_000,
    make: (s) => {
      const amount = Math.round((monthlySales(s) * 1.5) / 1000) * 1000;
      return {
        title: 'A volume order from Compaq',
        speaker: 'Compaq purchasing',
        body: `Compaq wants to put our chips in a new line of PCs, if we cut the price for them. They'd pay ${money(amount)} up front.`,
        choices: [
          { id: 'yes', label: `Take it (+${money(amount)} now)`, detail: 'Sales elsewhere dip 10% for 2 months while the line ramps.' },
          { id: 'no', label: 'Decline', detail: 'Nothing changes.' },
        ],
        ref: String(amount),
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      s.cash += Number(card.ref);
      s.month.revenue += Number(card.ref);
      s.modifiers.push({ id: newId(s, 'mod'), label: 'Compaq ramp', until: s.day + 60, sales: 0.9 });
    },
  },
  {
    kind: 'foundryrush',
    when: (s) => s.projects.some((p) => p.phase === 'tapeout' && p.need - p.progress > 20),
    make: (s) => {
      const p = s.projects.find((x) => x.phase === 'tapeout')!;
      const cost = Math.round(Math.max(8_000, p.spent * 0.25) / 1000) * 1000;
      return {
        title: 'TSMC offers a rush slot',
        speaker: 'TSMC sales',
        body: `A customer cancelled. We can have the ${p.name} wafers 20 days sooner for ${money(cost)}.`,
        choices: [
          { id: 'yes', label: `Pay ${money(cost)}: 20 days sooner`, detail: 'The chip reaches you faster.', cost },
          { id: 'no', label: 'No thanks', detail: 'The normal schedule holds.' },
        ],
        ref: `${p.id}|${cost}`,
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      const [pid, cost] = card.ref!.split('|');
      const p = s.projects.find((x) => x.id === pid);
      if (!p || p.phase !== 'tapeout') return;
      spend(s, 'projects', Number(cost));
      p.progress = Math.min(p.need, p.progress + 20);
    },
  },
  {
    kind: 'interview',
    when: (s) => s.products.length > 0,
    make: () => ({
      title: 'BYTE wants an interview',
      speaker: 'BYTE magazine',
      body: 'A feature on the young chip company everyone is talking about. It takes a week of your time.',
      choices: [
        { id: 'yes', label: 'Do it (+4 brand)', detail: 'You lose a week of work on your project.' },
        { id: 'no', label: 'Too busy', detail: 'Nothing changes.' },
      ],
    }),
    resolve: (s, c) => {
      if (c !== 'yes') return;
      s.brand = clamp(s.brand + 4, 0, 100);
      s.modifiers.push({ id: newId(s, 'mod'), label: 'Interview week', until: s.day + 7, speed: 0.85 });
    },
  },
  {
    kind: 'tradeshow',
    when: (s) => s.projects.length > 0 && s.cash > 30_000,
    make: (s) => {
      const cost = Math.round(Math.max(15_000, s.cash * 0.08) / 1000) * 1000;
      return {
        title: 'A booth at COMDEX',
        speaker: 'Show organisers',
        body: 'A last-minute booth opened up at the biggest computer show of the year.',
        choices: [
          { id: 'yes', label: `Book it (${money(cost)})`, detail: 'Your next launch sells about 60% more at first, fading over six weeks.', cost },
          { id: 'no', label: 'Skip this year', detail: 'Nothing changes.' },
        ],
        ref: String(cost),
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      spend(s, 'marketing', Number(card.ref));
      s.modifiers.push({ id: newId(s, 'mod'), label: 'COMDEX buzz', until: s.day + 365, hype: 0.6 });
    },
  },
  {
    kind: 'waferspike',
    when: (s) => s.products.length > 0,
    make: (s) => {
      const lock = Math.round(Math.max(10_000, monthlySales(s) * 0.4) / 1000) * 1000;
      return {
        title: 'Wafer prices are climbing',
        speaker: 'Your foundry rep',
        body: 'Silicon is short this year. Lock in today’s price, or ride it out.',
        choices: [
          { id: 'lock', label: `Lock in (${money(lock)} now)`, detail: 'Chip costs stay where they are.', cost: lock },
          { id: 'ride', label: 'Ride it out', detail: 'Chip costs +20% for 4 months.' },
        ],
        ref: String(lock),
      };
    },
    resolve: (s, c, card) => {
      if (c === 'lock') spend(s, 'other', Number(card.ref));
      else s.modifiers.push({ id: newId(s, 'mod'), label: 'Wafer shortage', until: s.day + 120, costs: 1.2 });
    },
  },
  {
    kind: 'breakthrough2am',
    when: (s) => s.staff.length >= 2 && s.projects.length > 0,
    make: (s) => {
      const bonus = s.staff.length * 1_000;
      return {
        title: 'A breakthrough at 2 a.m.',
        speaker: 'Your team',
        body: 'Half the team stayed up all night and cracked a hard timing problem.',
        choices: [
          { id: 'bonus', label: `Pay a bonus (${money(bonus)})`, detail: 'Everyone’s morale +12.', cost: bonus },
          { id: 'thanks', label: 'Say thanks', detail: 'Morale +3.' },
        ],
        ref: String(bonus),
      };
    },
    resolve: (s, c, card) => {
      if (c === 'bonus') spend(s, 'salaries', Number(card.ref));
      for (const p of s.staff) p.morale = clamp(p.morale + (c === 'bonus' ? 12 : 3), 0, 100);
    },
  },
  {
    kind: 'university',
    when: (s) => s.day > 120,
    make: (s) => {
      // About six weeks of your lab's output, at a fair price for it.
      const pts = Math.round(Math.max(8, 45 * researchPerDay(s)));
      const cost = Math.round((pts * 700) / 1000) * 1000;
      return {
        title: 'Stanford proposes a partnership',
        speaker: 'Stanford EE department',
        body: 'A professor wants to collaborate on next-generation circuits, with your funding.',
        choices: [
          { id: 'yes', label: `Fund it (${money(cost)})`, detail: `+${pts} research points (about six weeks of your lab's work).`, cost },
          { id: 'no', label: 'Not now', detail: 'Nothing changes.' },
        ],
        ref: `${pts}:${cost}`,
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      const [pts, cost] = (card.ref ?? '8:20000').split(':').map(Number);
      spend(s, 'other', cost!);
      s.research.points += pts!;
    },
  },
  {
    kind: 'angel',
    when: (s) => s.cash < 60_000 && s.day > 60,
    make: (s) => {
      const amount = Math.round(Math.max(120_000, s.staff.length * 40_000) / 1000) * 1000;
      return {
        title: 'An angel investor calls',
        speaker: 'A Sand Hill Road investor',
        body: `${money(amount)} for ${Math.round(ANGEL_SHARE * 100)}% of the company. Cash today, a smaller fortune later.`,
        choices: [
          { id: 'yes', label: `Take ${money(amount)}`, detail: `You give up ${Math.round(ANGEL_SHARE * 100)}% of the company for good: your net worth and IPO take shrink with it.` },
          { id: 'no', label: 'Stay independent', detail: 'You keep everything. Find the cash some other way.' },
        ],
        ref: String(amount),
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      s.cash += Number(card.ref);
      s.stake = (s.stake ?? 1) * (1 - ANGEL_SHARE);
    },
  },
  {
    kind: 'restweek',
    when: (s) => s.staff.length >= 2 && s.staff.reduce((n, p) => n + p.burnout, 0) / s.staff.length > 45,
    make: () => ({
      title: 'The team is exhausted',
      speaker: 'Your lead engineer',
      body: 'People are running on fumes. A week off would reset everyone.',
      choices: [
        { id: 'rest', label: 'Give everyone a week off', detail: 'All work stops for 7 days. Burnout −35 for everyone.' },
        { id: 'push', label: 'Push on', detail: 'Morale −6.' },
      ],
    }),
    resolve: (s, c) => {
      if (c === 'rest') {
        s.modifiers.push({ id: newId(s, 'mod'), label: 'Team week off', until: s.day + 7, speed: 0 });
        for (const p of s.staff) p.burnout = clamp(p.burnout - 35, 0, 100);
      } else for (const p of s.staff) p.morale = clamp(p.morale - 6, 0, 100);
    },
  },
  {
    kind: 'poach',
    when: (s) => {
      const p = bestPerson(s);
      return !!p && p.level >= 2 && !p.traits.includes('loyal') && s.rivals.some((r) => !r.acquired && r.products.length > 0 && r.truceUntil <= s.day);
    },
    make: (s) => {
      const p = bestPerson(s)!;
      const pool = s.rivals.filter((x) => !x.acquired && x.products.length > 0 && x.truceUntil <= s.day);
      const r = pool[Math.floor(rand(s) * pool.length)]!;
      const raise = Math.round((p.salary * 0.3) / 50) * 50;
      return {
        title: `${r.name} wants ${p.name}`,
        speaker: `${r.name} recruiting`,
        body: `${r.name} offered ${p.name} (level ${p.level}) a big raise to join them.`,
        choices: [
          { id: 'counter', label: `Counter (+${money(raise)}/month)`, detail: `${p.name} stays, morale +10.` },
          { id: 'let', label: 'Let them go', detail: `${p.name} leaves for ${r.name}.` },
        ],
        ref: `${p.id}|${raise}|${r.name}`,
      };
    },
    resolve: (s, c, card) => {
      const [pid, raise, rival] = card.ref!.split('|');
      const p = s.staff.find((x) => x.id === pid);
      if (!p) return;
      if (c === 'counter') {
        p.salary += Number(raise);
        p.morale = clamp(p.morale + 10, 0, 100);
      } else {
        s.staff.splice(s.staff.indexOf(p), 1);
        log(s, `${p.name} left for ${rival}.`, 'bad');
      }
    },
  },
];

// Rival offers: posted directly by the rivalry arc, never drawn at random.
const OFFERS: CardDef[] = [
  {
    kind: 'truce',
    when: () => false,
    make: (s) => {
      const r = s.rivals.find((x) => x.id === offerRival)!;
      return {
        title: `${r.name} proposes a truce`,
        speaker: `${r.ceo}, ${r.name}`,
        body: `${r.name} is rattled. They offer to stop price cuts and stop poaching your people for 6 months.`,
        choices: [
          { id: 'yes', label: 'Accept the truce', detail: 'No price cuts or poaching from them for 6 months.' },
          { id: 'no', label: 'Refuse', detail: 'Keep the pressure on.' },
        ],
        ref: r.id,
      };
    },
    resolve: (s, c, card) => {
      const r = s.rivals.find((x) => x.id === card.ref);
      if (r && c === 'yes') r.truceUntil = s.day + RIVALRY.truceDays;
    },
  },
  {
    kind: 'forsale',
    when: () => false,
    make: (s) => {
      const r = s.rivals.find((x) => x.id === offerRival)!;
      const price = takeoverPrice(s, r);
      return {
        title: `${r.name} is for sale`,
        speaker: `${r.name} board of directors`,
        body: `Beaten in the market, ${r.name}'s board wants out. They'd sell the whole company for ${money(price)}.`,
        choices: [
          { id: 'yes', label: `Buy ${r.name} (${money(price)})`, detail: `+${RIVALRY.defeatBrand} brand. Their products leave the market.`, cost: price },
          { id: 'no', label: 'Not now', detail: 'You can still buy them later from the Markets tab.' },
        ],
        ref: `${r.id}|${price}`,
      };
    },
    resolve: (s, c, card) => {
      if (c !== 'yes') return;
      const [id, price] = card.ref!.split('|');
      if (s.cash < Number(price)) {
        log(s, 'Not enough cash for the takeover.', 'bad');
        return;
      }
      acquire(s, id!, Number(price));
    },
  },
];
let offerRival = '';

/** Monthly: rattled rivals may offer a truce, beaten ones offer themselves for sale. */
export function rivalOffers(s: GameV2): void {
  for (const r of s.rivals) {
    if (r.acquired || s.day - r.lastOffer < RIVALRY.offerCooldownDays) continue;
    const kind = r.mood === 'forSale' ? 'forsale' : r.mood === 'rattled' && r.truceUntil <= s.day && rand(s) < 0.25 ? 'truce' : null;
    if (!kind || s.cards.some((c) => c.kind === kind)) continue;
    offerRival = r.id;
    const d = OFFERS.find((x) => x.kind === kind)!;
    s.cards.push({ id: newId(s, 'card'), kind, day: s.day, ...d.make(s) });
    r.lastOffer = s.day;
  }
}

const FAREWELLS = ['It was a good fight.', 'Take care of our engineers.', 'We never saw you coming.', 'The best company won.'];

/** Buy a rival outright: their products leave the market and their name goes on your trophy wall. */
export function acquire(s: GameV2, rivalId: string, price: number): void {
  const r = s.rivals.find((x) => x.id === rivalId);
  if (!r || r.acquired) return;
  s.cash -= price;
  s.month.other += price;
  r.acquired = true;
  r.acquiredDay = s.day;
  r.plans = [];
  r.farewell = FAREWELLS[Math.floor(rand(s) * FAREWELLS.length)]!;
  s.brand = clamp(s.brand + RIVALRY.defeatBrand, 0, 100);
  log(s, `You bought ${r.name} for ${money(price)}. ${r.ceo}: “${r.farewell}”`, 'good');
}

/** Daily: maybe draw a new card. */
export function tickCards(s: GameV2): PendingCard | null {
  if (s.day < s.nextCardDay) return null;
  s.nextCardDay = s.day + Math.round(between(s, T.cardGap[0], T.cardGap[1]));
  const ok = DEFS.filter(
    (d) => d.when(s) && !s.cards.some((c) => c.kind === d.kind) && (s.cardDays[d.kind] === undefined || s.day - s.cardDays[d.kind]! >= T.cardNoRepeatDays),
  );
  if (!ok.length) return null;
  const d = ok[Math.floor(rand(s) * ok.length)]!;
  const card: PendingCard = { id: newId(s, 'card'), kind: d.kind, day: s.day, ...d.make(s) };
  s.cards.push(card);
  s.cardDays[d.kind] = s.day;
  return card;
}

export function resolveCard(s: GameV2, cardId: string, choiceId: string): string | null {
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return 'That card is gone.';
  const choice = card.choices.find((c: CardChoice) => c.id === choiceId);
  if (!choice) return 'Unknown choice.';
  if (choice.cost && s.cash < choice.cost) return `That needs ${money(choice.cost)} in the bank.`;
  const def = DEFS.find((d) => d.kind === card.kind) ?? OFFERS.find((d) => d.kind === card.kind);
  s.cards = s.cards.filter((c) => c !== card);
  if (def) def.resolve(s, choiceId, card);
  else resolveInvestorCard(s, card.kind, choiceId, card.ref ?? '');
  const label = card.choices.find((c) => c.id === choiceId)!.label;
  log(s, `${card.title}: ${label}.`);
  return null;
}
