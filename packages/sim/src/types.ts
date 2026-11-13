import type { Deck, Discipline, Effects, Precision } from '@stm/content';

export interface FleetEntry {
  id: string;
  chipId: string;
  count: number;
  owned: boolean;
}

export interface TrainingSpec {
  name: string;
  archId: string;
  /** Total parameters, billions. */
  paramsB: number;
  /** Training tokens, billions. */
  tokensB: number;
  precision: Precision;
  chipId: string;
  chipCount: number;
}

export interface TrainingRun {
  spec: TrainingSpec;
  flopsTotal: number;
  flopsDone: number;
  startedWeek: number;
  projectedScore: number;
}

export interface ReleasedModel {
  id: string;
  name: string;
  archId: string;
  paramsB: number;
  tokensB: number;
  precision: Precision;
  score: number;
  releasedWeek: number;
}

export interface RivalState {
  id: string;
  score: number;
  version: number;
  nextReleaseWeek: number;
}

export interface Modifier {
  shareBoost: number;
  weeksLeft: number;
}

export interface PendingEvent {
  eventId: string;
  deck: Deck;
  speaker: string;
  title: string;
  body: string;
  choices: { id: string; label: string; detail: string; effects: Effects }[];
}

export type LogKind = 'info' | 'good' | 'bad' | 'rival';

export interface LogEntry {
  week: number;
  kind: LogKind;
  text: string;
}

export interface WeekReport {
  revenue: number;
  salaries: number;
  rent: number;
  power: number;
  demandTokens: number;
  servedTokens: number;
  servingCapacityTokens: number;
  targetUsers: number;
}

export interface HistoryPoint {
  week: number;
  cash: number;
  users: number;
  bestScore: number;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  week: number;
  status: 'playing' | 'bankrupt';
  weeksNegative: number;
  cash: number;
  reputation: number;
  users: number;
  apiPrice: number;
  dataTokensB: number;
  powerCapMW: number;
  staff: Record<Discipline, number>;
  fleet: FleetEntry[];
  nextId: number;
  training: TrainingRun | null;
  models: ReleasedModel[];
  liveModelId: string | null;
  rivals: RivalState[];
  modifiers: Modifier[];
  pendingEvent: PendingEvent | null;
  log: LogEntry[];
  history: HistoryPoint[];
  lastWeek: WeekReport | null;
}

export type Command =
  | { type: 'advanceWeek' }
  | { type: 'rentChips'; chipId: string; count: number }
  | { type: 'buyChips'; chipId: string; count: number }
  | { type: 'releaseChips'; fleetId: string; count: number }
  | { type: 'hire'; discipline: Discipline }
  | { type: 'buyData'; billions: number }
  | { type: 'startTraining'; spec: TrainingSpec }
  | { type: 'setApiPrice'; price: number }
  | { type: 'setLiveModel'; modelId: string }
  | { type: 'resolveEvent'; choiceId: string };

export interface CommandResult {
  state: GameState;
  error?: string;
}
