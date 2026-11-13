import type { Deck, Discipline, Effects, Precision, TrackId } from '@stm/content';

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
  /** Capability the run will reach (log10 effective compute). */
  projectedCapability: number;
  /** That capability's score on the current eval suite (re-baselined when a suite retires). */
  projectedScore: number;
  /** Capability tier of this run (License to Scale). */
  tier: number;
  /** Levels missing per track when the run started; consequences roll on release. */
  gaps: Record<TrackId, number>;
  /** Multiplier on training speed (power curtailment). */
  speedFactor: number;
}

export interface LicenseTrackState {
  level: number;
  upgrade: { weeksLeft: number; totalWeeks: number } | null;
}

export interface ReleasedModel {
  id: string;
  name: string;
  archId: string;
  paramsB: number;
  tokensB: number;
  precision: Precision;
  capability: number;
  /** Score on the current eval suite. */
  score: number;
  releasedWeek: number;
}

export interface EvalSuite {
  version: number;
  /** Capability that scores 50 on this suite. */
  mid: number;
  startedWeek: number;
}

/** Share of the die given to each block. Normalized to sum to 1 when derived. */
export interface DieSplit {
  compute: number;
  sram: number;
  memory: number;
  interconnect: number;
}

export interface ChipDesign {
  name: string;
  nodeId: string;
  split: DieSplit;
  fp8: boolean;
  fp4: boolean;
}

export interface ChipProject {
  design: ChipDesign;
  startedWeek: number;
  weeksLeft: number;
  totalWeeks: number;
  respun: boolean;
}

export interface RivalState {
  id: string;
  capability: number;
  /** Score on the current eval suite. */
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
  licenseUpkeep: number;
  licenseRevenue: number;
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

import type { Chip } from '@stm/content';

export interface GameState {
  version: 4;
  suite: EvalSuite;
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
  /** Chips you designed and taped out. Same shape as vendor chips, so every formula works on them. */
  customChips: Chip[];
  chipProject: ChipProject | null;
  license: Record<TrackId, LicenseTrackState>;
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
  | { type: 'startTapeout'; design: ChipDesign }
  | { type: 'upgradeLicense'; track: TrackId }
  | { type: 'resolveEvent'; choiceId: string };

export interface CommandResult {
  state: GameState;
  error?: string;
}
