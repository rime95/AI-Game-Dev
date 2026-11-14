import type { AcquisitionGains, Deck, Discipline, Effects, Precision, TrackId } from '@stm/content';

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
  /** Multiplier on training speed (power curtailment, incidents). */
  speedFactor: number;
  /** Capability change from incidents, applied on release. */
  capabilityDelta: number;
  /** Chance of a contamination scandal on release. */
  scandalChance: number;
  incidents: number;
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
  /** Total product revenue (API + consumer + enterprise, after SLA penalties). */
  revenue: number;
  apiRevenue: number;
  consumerRevenue: number;
  enterpriseRevenue: number;
  slaPenalty: number;
  salaries: number;
  rent: number;
  /** HQ rent plus room upkeep. */
  facilities: number;
  /** Rack space rented for owned chips we have no room for. */
  colocation: number;
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

export type VictoryKind = 'safeFrontier' | 'recklessFrontier' | 'marketLeader' | 'fullStack';

export interface AgiProgram {
  chipId: string;
  chipCount: number;
  weeksLeft: number;
  totalWeeks: number;
  startedWeek: number;
}

export interface Integration {
  dealId: string;
  name: string;
  gives: AcquisitionGains;
  /** Set when the target is a rival lab: it leaves the race on completion. */
  rivalId?: string;
  price: number;
  weeksLeft: number;
  totalWeeks: number;
  antitrustChance: number;
  clashChance: number;
}

export interface ConsumerApp {
  launched: boolean;
  /** Monthly subscription price, $. */
  subPrice: number;
  /** Monthly active users of the app (free + paid). */
  users: number;
}

export interface EnterpriseOffer {
  id: string;
  client: string;
  sector: string;
  seats: number;
  /** $ per seat per week. */
  pricePerSeat: number;
  termWeeks: number;
  minTier: number;
  minSafety: number;
  minCompliance: number;
  expiresWeek: number;
}

export interface Contract {
  id: string;
  client: string;
  sector: string;
  seats: number;
  pricePerSeat: number;
  termWeeks: number;
  weeksLeft: number;
}

/** A room placed on the HQ grid. */
export interface PlacedRoom {
  id: string;
  templateId: string;
  /** Top-left tile. */
  x: number;
  y: number;
  /** Rotation in 90° steps (0–3). */
  rot: number;
  tier: number;
  /** Cash put into the room so far (build + upgrades); demolishing refunds part of it. */
  spent: number;
}

/** Equipment placed inside a server room. */
export interface PlacedEquipment {
  id: string;
  equipId: string;
  roomId: string;
  x: number;
  y: number;
  rot: number;
  spent: number;
}

export interface HqState {
  /** HQ stage id (garage, office, ...). */
  stage: string;
  rooms: PlacedRoom[];
  equipment: PlacedEquipment[];
  /** Team morale, 0–100. */
  morale: number;
  /** Weeks of reduced productivity left after a move. */
  moveInWeeks: number;
  /** Cached: crowding × morale × move-in. Refreshed after every command and week. */
  productivity: number;
  /** Cached: researchers seated in labs × lab multipliers × productivity. */
  research: number;
}

export interface GameState {
  version: 12;
  companyName: string;
  hq: HqState;
  consumer: ConsumerApp;
  offers: EnterpriseOffer[];
  contracts: Contract[];
  /** Completed deal ids (startup ids, or `rival:<id>`). */
  acquired: string[];
  integrations: Integration[];
  /** Effective-compute bonus from acquired IP (0.1 = +10%). */
  ipBonus: number;
  /** Site power added by acquisitions, on top of the License to Scale level. */
  extraPowerMW: number;
  /** First victory reached (the player may keep playing afterwards). */
  victory: { kind: VictoryKind; week: number } | null;
  /** Consecutive weeks with the largest user share of any lab. */
  leaderStreak: number;
  agi: AgiProgram | null;
  /** Founders' share of the company (1 = 100%). */
  ownership: number;
  /** How many funding rounds have closed (index of the next one). */
  roundsRaised: number;
  suite: EvalSuite;
  seed: number;
  rng: number;
  week: number;
  status: 'playing' | 'bankrupt' | 'won' | 'catastrophe';
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
  /** Units bought this week per chip, against the weekly allocation. */
  purchasedThisWeek: Record<string, number>;
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
  | { type: 'raiseFunding' }
  | { type: 'startAgiProgram'; chipId: string; chipCount: number }
  | { type: 'continuePlaying' }
  | { type: 'acquire'; dealId: string }
  | { type: 'releaseCheckpoint' }
  | { type: 'launchConsumerApp' }
  | { type: 'setSubPrice'; price: number }
  | { type: 'acceptOffer'; offerId: string }
  | { type: 'declineOffer'; offerId: string }
  | { type: 'placeRoom'; templateId: string; x: number; y: number; rot: number }
  | { type: 'demolishRoom'; roomId: string }
  | { type: 'upgradeRoom'; roomId: string }
  | { type: 'moveHq' }
  | { type: 'placeEquipment'; equipId: string; x: number; y: number; rot: number }
  | { type: 'demolishEquipment'; equipmentId: string }
  | { type: 'resolveEvent'; choiceId: string };

export interface CommandResult {
  state: GameState;
  error?: string;
}
