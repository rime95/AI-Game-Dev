import type { HqState } from '../types';

/**
 * Sand to Mind v2: a real-time chip company. Time is counted in days (a 360-day year of 30-day
 * months, starting January 1991). Everything the player does is a Command; the clock is just
 * another command (`tick`).
 */

export type Stat = 'perf' | 'gfx' | 'eff' | 'feat';
export type Stats = Record<Stat, number>;
export type ProductKind = 'cpu' | 'gpu' | 'console' | 'mobile' | 'accel';
export type ProjectSize = 'S' | 'M' | 'L';
export type Phase = 'architecture' | 'verification' | 'tapeout' | 'ready';
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
  score: number;
  reviews: Review[];
  price: number;
  unitCost: number;
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

export interface Notebook {
  /** Per market: stats the player has learned buyers care about, in order. */
  tastes: Record<string, Stat[]>;
  /** Best score reached per kind+market. */
  best: Record<string, number>;
}

export interface GameV2 {
  version: 2;
  seed: number;
  rng: number;
  status: 'playing' | 'bankrupt';
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
  /** Running totals for the week (for weekly snapshots). */
  acc: { weekRevenue: number; weekProfit: number; totalRevenue: number };
  /** Days in a row with cash below zero. */
  brokeDays: number;
}

export type CommandV2 =
  | { type: 'tick'; days?: number }
  | { type: 'startProject'; name: string; kind: ProductKind; marketId: string; size: ProjectSize; nodeId: string; refreshOf?: string }
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
  | { type: 'moveHq' };

export interface ResultV2 {
  state: GameV2;
  error?: string;
}
