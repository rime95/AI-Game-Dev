import type { HqState } from '../types';
import type { Listed, StockOrder } from './stocks';

/**
 * Sand to Mind v2: a real-time chip company. Time is counted in days (a 360-day year of 30-day
 * months, starting January 1991). Everything the player does is a Command; the clock is just
 * another command (`tick`).
 */

export type Stat = 'perf' | 'gfx' | 'eff' | 'feat';
export type Stats = Record<Stat, number>;
export type ProductKind = 'cpu' | 'gpu' | 'console' | 'mobile' | 'accel' | 'server' | 'model';
export type Tier = 'proto' | 'std' | 'refined' | 'flagship';
export type ProjectSize = 'S' | 'M' | 'L' | 'XL';
export type Phase = 'architecture' | 'verification' | 'training' | 'tapeout' | 'ready';
export type Skill = 'design' | 'eng' | 'research';
export type Tone = 'info' | 'good' | 'bad' | 'rival';

export interface Person {
  id: string;
  name: string;
  founder?: boolean;
  skills: Record<Skill, number>;
  traits: string[];
  level: number;
  xp: number;
  /** Per month. */
  salary: number;
  morale: number;
  burnout: number;
  /** A project id, 'research', or null (idle). */
  task: string | null;
  hiredDay: number;
  /** Shown with the shared character model. */
  look: number;
}

export interface Candidate extends Omit<Person, 'task' | 'hiredDay' | 'morale' | 'burnout' | 'xp'> {
  fee: number;
}

export interface Bug {
  id: string;
  severity: number;
  /** Found bugs can be fixed (costs engineering points) or ignored. */
  found: boolean;
  fixLeft?: number;
  ignored?: boolean;
}

export interface Project {
  id: string;
  name: string;
  kind: ProductKind;
  marketId: string;
  size: ProjectSize;
  nodeId: string;
  /** Row-major die board; null = empty cell. */
  board: (string | null)[];
  phase: Phase;
  /** Progress points in the current phase, and what it needs. */
  progress: number;
  need: number;
  /** Extra verification after 100% finds remaining bugs faster. */
  polishDays: number;
  bugs: Bug[];
  crunch: boolean;
  startedDay: number;
  /** Points the team put in (design quality comes from these). */
  designPoints: number;
  /** Sum of design points × the skill that made them (average design skill = skillSum / designPoints). */
  skillSum: number;
  engPoints: number;
  /** Set once the team has been told verification reached 100%. */
  readyNoted?: boolean;
  spent: number;
  /** A revision of an earlier product (a refresh). */
  refreshOf?: string;
  /** PF-days of training an AI model has had. */
  pfDays?: number;
  /** Share of good dies on the first wafers (set at tape-out). */
  yield?: number;
  /** Design wizard choices (missing = Standard, level 0). */
  tier?: Tier;
  memory?: number;
  cooling?: number;
}

export interface Review {
  outlet: string;
  score: number;
  quote: string;
}

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  marketId: string;
  size: ProjectSize;
  nodeId: string;
  board: (string | null)[];
  tier?: Tier;
  memory?: number;
  cooling?: number;
  score: number;
  reviews: Review[];
  price: number;
  unitCost: number;
  /** Share of good dies (chips only; missing on older saves). */
  yield?: number;
  launchDay: number;
  hype: number;
  bugsShipped: number;
  retiredDay?: number;
  /** Lifetime totals. */
  units: number;
  revenue: number;
  profit: number;
  /** Units per day, last tick. */
  rate: number;
}

export interface RivalProduct {
  name: string;
  marketId: string;
  score: number;
  price: number;
  launchDay: number;
}

export interface RivalPlan {
  marketId: string;
  name: string;
  /** Rough expected score, shown on the calendar. */
  estimate: number;
  launchDay: number;
}

export type Mood = 'confident' | 'rattled' | 'desperate' | 'forSale';

export type ExecRole = 'engineer' | 'cmo' | 'cfo' | 'research';

export interface Exec {
  role: ExecRole;
  name: string;
  /** 1–5: how well they do the job. */
  stars: number;
  /** Per month. */
  salary: number;
  /** Autopilot: acts on its own (and answers decision cards in its area). */
  auto: boolean;
  /** What they did lately, newest first. */
  lately: string[];
}

export interface ExecCandidate {
  id: string;
  role: ExecRole;
  name: string;
  stars: number;
  salary: number;
  fee: number;
}

export interface YearReview {
  year: number;
  revenue: number;
  profit: number;
  launches: number;
  bestScore: number;
  /** Markets where we had the biggest share at year end. */
  led: string[];
  headcount: number;
  research: number;
}

export interface Rival {
  id: string;
  name: string;
  ceo: string;
  style: 'premium' | 'priceCutter' | 'copycat' | 'giant';
  brand: number;
  /** The quality they could reach now if nothing held them back. */
  potential: number;
  cash: number;
  markets: string[];
  products: RivalProduct[];
  plans: RivalPlan[];
  strength: number;
  mood: Mood;
  acquired?: boolean;
  /** Techs they have picked up after the player. */
  techs: string[];
  /** No price cuts or poaching against us until this day. */
  truceUntil: number;
  /** Day of the last sale or truce offer (so they don't repeat every month). */
  lastOffer: number;
  acquiredDay?: number;
  farewell?: string;
  /** Products released so far (picks the next product name). */
  released: number;
}

export interface MarketState {
  id: string;
  /** Units a day across all makers. */
  size: number;
  openedDay: number;
  /** Price buyers think is fair for a 6/10 product. */
  basePrice: number;
  /** Share of units last day: "you", each rival id, and "others". */
  shares: Record<string, number>;
}

export interface CardChoice {
  id: string;
  label: string;
  detail: string;
  /** Cash this choice costs up front (it can't be picked without it). */
  cost?: number;
}

export interface PendingCard {
  id: string;
  kind: string;
  title: string;
  body: string;
  speaker?: string;
  choices: CardChoice[];
  /** Context for the card (e.g. which person is being poached). */
  ref?: string;
  day: number;
}

export interface Modifier {
  id: string;
  label: string;
  until: number;
  /** Multipliers. */
  sales?: number;
  speed?: number;
  morale?: number;
  costs?: number;
  /** Added to the hype of the next launch (used up on launch). */
  hype?: number;
}

export interface LogEntry {
  day: number;
  text: string;
  tone: Tone;
}

export interface MonthBook {
  month: number;
  revenue: number;
  /** Cost of the chips sold. */
  cogs: number;
  salaries: number;
  facilities: number;
  projects: number;
  marketing: number;
  hiring: number;
  /** Sales, support, logistics and overhead (a share of revenue; older saves lack it). */
  ops?: number;
  /** The R&D budget (older saves lack it). */
  research?: number;
  /** Corporate tax on the month's profit (older saves lack it). */
  tax?: number;
  other: number;
  profit: number;
  cash: number;
}

export interface Snapshot {
  day: number;
  cash: number;
  revenue: number;
  profit: number;
  headcount: number;
  morale: number;
  /** Our share per market. */
  share: Record<string, number>;
  /** Our best score minus the best rival score, per market. */
  gap: Record<string, number>;
  bestScore: number;
}

/** A data center campus (see compute.ts). */
export interface Campus {
  id: string;
  siteId: string;
  /** 0 small, 1 large, 2 hyperscale. */
  size: number;
  /** Halls running. */
  halls: number;
  /** Halls being built: the day each opens. */
  building: number[];
  chip: { source: 'own' | 'bought'; productId?: string; name: string; pfPerMw: number; unitPrice: number };
  cooling: number;
  power: number;
  network: number;
  openedDay: number;
}

export interface ComputeState {
  campuses: Campus[];
  /** Share of all compute that trains (the rest serves customers). */
  trainShare: number;
  /** AI-model customers who wanted service today. */
  demand?: number;
}

export interface Notebook {
  /** Per market: stats the player has learned buyers care about, in order. */
  tastes: Record<string, Stat[]>;
  /** Best score reached per kind+market. */
  best: Record<string, number>;
  /**
   * Per market: what the press now expects, as die value (see board.ts). Reviewers judge each chip
   * against your own best there, so "beat your last chip" stays the goal all game. Missing = none.
   */
  expect?: Record<string, number>;
}

export interface GameV2 {
  version: 2;
  seed: number;
  rng: number;
  status: 'playing' | 'bankrupt' | 'won';
  /** How the story ended (safe or reckless frontier, market leader), if it has. */
  ending: 'safe' | 'reckless' | 'leader' | null;
  facilities: {
    /** AI-model customers a day the data centers can serve. */
    dc: number;
    dcBuilds: { doneDay: number; add: number }[];
    /** Own fab level (0 = none). */
    fab: number;
    fabBuild: { doneDay: number; level: number } | null;
  };
  /** The AGI run: compute poured in so far and what it needs (older saves only have the days). */
  agi: { startDay: number; doneDay: number; pfDays?: number; need?: number } | null;
  /** Chips a day your foundry allotment can make (missing on older saves: set on first use). */
  foundry?: { capacity: number; demand: number };
  /** Data center campuses (created on first use; older saves convert their data centers). */
  compute?: ComputeState;
  /** Days in a row leading 5+ markets (the market-leader ending). */
  leadDays: number;
  investor: { amount: number; target: number; startRevenue: number; dueDay: number } | null;
  /** The founder's own money, separate from the company's. */
  personal: { cash: number; salary: number; portfolio: Record<string, { shares: number; cost: number }>; orders: StockOrder[]; dividends: number; passed: string[] };
  stocks: Listed[];
  loans: { id: string; principal: number; left: number; rate: number; monthly: number; monthsLeft: number }[];
  baseRate: number;
  /** HR department level, 0–3. */
  hr: number;
  /** Sales offices opened (regions besides home). */
  offices: string[];
  /** After the IPO: share of the company the founder still owns, shares, price and dividend payout. */
  /** The founder's share of the company before any IPO (angel investors take a slice). Missing = 100%. */
  stake?: number;
  /** Monthly R&D budget: cash turned into research points (missing = 0). */
  rdBudget?: number;
  ipo: { day: number; ownership: number; shares: number; price: number; sentiment: number; payout: number; history: number[] } | null;
  /** Investors stopped calling (after the board took a seat). */
  noInvestors?: boolean;
  companyName: string;
  day: number;
  cash: number;
  /** Customer trust in our brand, 0–100. */
  brand: number;
  staff: Person[];
  candidates: Candidate[];
  projects: Project[];
  products: Product[];
  research: { points: number; done: string[]; doneDay: Record<string, number>; current: string | null; progress: number };
  markets: MarketState[];
  rivals: Rival[];
  notebook: Notebook;
  cards: PendingCard[];
  cardDays: Record<string, number>;
  nextCardDay: number;
  modifiers: Modifier[];
  hq: HqState;
  chapter: { index: number; done: string[] };
  books: MonthBook[];
  /** Running totals for the current month. */
  month: Omit<MonthBook, 'month' | 'profit' | 'cash'>;
  history: { weekly: Snapshot[]; monthly: Snapshot[] };
  log: LogEntry[];
  records: { bestScore: number; bestLaunchUnits: number; peakCash: number };
  nextId: number;
  execs: Exec[];
  execPool: ExecCandidate[];
  years: YearReview[];
  /** Running totals for the week (for weekly snapshots). */
  acc: { weekRevenue: number; weekProfit: number; totalRevenue: number };
  /** Days in a row with cash below zero. */
  brokeDays: number;
}

export type CommandV2 =
  | { type: 'tick'; days?: number }
  | {
      type: 'startProject';
      name: string;
      kind: ProductKind;
      marketId: string;
      size: ProjectSize;
      nodeId: string;
      refreshOf?: string;
      tier?: Tier;
      memory?: number;
      cooling?: number;
      /** A layout drafted in the wizard. */
      board?: (string | null)[];
    }
  | { type: 'setBoard'; projectId: string; board: (string | null)[] }
  | { type: 'assign'; personId: string; task: string | null }
  | { type: 'setCrunch'; projectId: string; on: boolean }
  | { type: 'fixBug'; projectId: string; bugId: string }
  | { type: 'ignoreBug'; projectId: string; bugId: string }
  | { type: 'finishVerification'; projectId: string }
  | { type: 'launch'; projectId: string; price: number; marketing: 0 | 1 | 2 | 3 }
  | { type: 'cancelProject'; projectId: string }
  | { type: 'setPrice'; productId: string; price: number }
  | { type: 'retireProduct'; productId: string }
  | { type: 'postJobAd' }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; personId: string }
  | { type: 'train'; personId: string; skill: Skill }
  | { type: 'research'; nodeId: string | null }
  | { type: 'resolveCard'; cardId: string; choiceId: string }
  | { type: 'placeRoom'; templateId: string; x: number; y: number; rot: number; floor?: number }
  | { type: 'moveRoom'; roomId: string; x: number; y: number; rot: number; floor?: number }
  | { type: 'demolishRoom'; roomId: string }
  | { type: 'moveHq' }
  | { type: 'hireExec'; candidateId: string }
  | { type: 'fireExec'; role: ExecRole }
  | { type: 'setExecAuto'; role: ExecRole; on: boolean }
  | { type: 'acquireRival'; rivalId: string }
  | { type: 'buildDatacenter' }
  | { type: 'buildFab' }
  | { type: 'startAgi' }
  | { type: 'keepPlaying' }
  | { type: 'setSalary'; amount: number }
  | { type: 'buyStock'; ticker: string; shares: number }
  | { type: 'sellStock'; ticker: string; shares: number }
  | { type: 'placeOrder'; ticker: string; kind: 'stopLoss' | 'takeProfit' | 'buyBelow'; trigger: number; shares: number }
  | { type: 'cancelOrder'; id: string }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; id: string }
  | { type: 'upgradeHr' }
  | { type: 'setRdBudget'; amount: number }
  | { type: 'bookCapacity'; chips: number }
  | { type: 'buildCampus'; siteId: string }
  | { type: 'upgradeCampus'; campusId: string; part: 'hall' | 'chips' | 'cooling' | 'power' | 'network' | 'size'; option?: number | string }
  | { type: 'setTrainShare'; share: number }
  | { type: 'openOffice'; region: string }
  | { type: 'ipo'; percent: number }
  | { type: 'setPayout'; payout: number }
  | { type: 'injectCash'; amount: number };

export interface ResultV2 {
  state: GameV2;
  error?: string;
}
