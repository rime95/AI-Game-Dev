import { z } from 'zod';

export const PrecisionSchema = z.enum(['fp16', 'fp8', 'fp4']);
export type Precision = z.infer<typeof PrecisionSchema>;

export const DisciplineSchema = z.enum(['research', 'modelEng', 'hardwareEng', 'product', 'ops']);
export type Discipline = z.infer<typeof DisciplineSchema>;

/** A chip's hardware profile. 0 TFLOPS at a precision = not supported. */
export const ChipSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string(),
  blurb: z.string(),
  tflops: z.object({
    fp16: z.number().positive(),
    fp8: z.number().nonnegative(),
    fp4: z.number().nonnegative(),
  }),
  memGB: z.number().positive(),
  memBwTBs: z.number().positive(),
  interconnectGBs: z.number().positive(),
  watts: z.number().positive(),
  priceUsd: z.number().positive(),
  rentPerWeekUsd: z.number().positive(),
  /** Chips the cloud market will rent to you at week `cloudFromWeek`. */
  cloudSupply: z.number().int().nonnegative(),
  /** Weekly growth of that supply. */
  cloudGrowth: z.number().nonnegative(),
  cloudFromWeek: z.number().int().nonnegative(),
  /** Units the vendor will sell you per week (allocation), and its weekly growth. */
  buyPerWeek: z.number().int().nonnegative(),
  buyGrowth: z.number().nonnegative(),
});
export type Chip = z.infer<typeof ChipSchema>;

/** A model architecture and what it demands from hardware. */
export const ArchSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
  /** Fraction of parameters active per token (MoE < 1). */
  activeParamFraction: z.number().positive().max(1),
  /** Capability gained per training FLOP, relative to dense. */
  computeMultiplier: z.number().positive(),
  /** Memory the arch wants per PFLOPS of fp16 compute (GB / PFLOPS). */
  memNeedGBPerPF: z.number().positive(),
  /** Interconnect the arch wants per TFLOPS of fp16 compute (GB/s / TFLOPS). */
  linkNeedGBsPerTF: z.number().positive(),
});
export type Arch = z.infer<typeof ArchSchema>;

export const RivalSchema = z.object({
  id: z.string(),
  name: z.string(),
  personality: z.string(),
  modelPrefix: z.string(),
  startScore: z.number().min(0).max(100),
  /** Capability (log10 effective compute) gained per release. */
  capabilityGain: z.number().positive(),
  releaseEveryWeeks: z.number().int().positive(),
  apiPrice: z.number().positive(),
});
export type Rival = z.infer<typeof RivalSchema>;

export const EffectsSchema = z.object({
  cash: z.number().optional(),
  reputation: z.number().optional(),
  /** Team morale points (0–100 scale). */
  morale: z.number().optional(),
  staff: z.object({ discipline: DisciplineSchema, delta: z.number().int() }).optional(),
  /** Multiplies your market pull for `boostWeeks` weeks. */
  shareBoost: z.number().positive().optional(),
  boostWeeks: z.number().int().positive().optional(),
  /** Chance of a bad outcome, applied as `riskReputation`. */
  riskChance: z.number().min(0).max(1).optional(),
  riskReputation: z.number().optional(),

  // Training-incident effects, applied to the run in progress:
  /** Weeks of training progress gained (+) or lost (−). */
  runProgressWeeks: z.number().optional(),
  /** Multiplies the run's speed for the rest of the run. */
  runSpeedMult: z.number().positive().optional(),
  /** Change to the model's final capability (log10 effective compute). */
  runCapabilityDelta: z.number().optional(),
  /** A chance of an extra capability loss, decided now. */
  runCapabilityRiskChance: z.number().min(0).max(1).optional(),
  runCapabilityRiskDelta: z.number().optional(),
  /** Cash cost per chip in the training cluster. */
  runCostPerChip: z.number().nonnegative().optional(),
  /** Chance of a reputation scandal when the model is released. */
  runScandalChance: z.number().min(0).max(1).optional(),

  // Fab-incident effects, applied to the affected line (or the whole fab for HBM):
  fabPauseWeeks: z.number().int().nonnegative().optional(),
  fabYieldMult: z.number().positive().optional(),
  fabSpeedMult: z.number().positive().optional(),
  fabHbmMult: z.number().positive().optional(),
  /** How long the yield, speed or HBM multiplier lasts. */
  fabWeeks: z.number().int().positive().optional(),

  // Founding-era effects, applied to the chip project in progress and the company:
  /** Months added to (+) or taken off (−) the current chip project. */
  projectMonths: z.number().int().optional(),
  /** Multiplies the current project's quality. */
  projectQuality: z.number().positive().optional(),
  /** Customer trust points (0–100). */
  trust: z.number().optional(),
  /** Research points. */
  researchPoints: z.number().optional(),
});
export type Effects = z.infer<typeof EffectsSchema>;

export const DeckSchema = z.enum(['press', 'board', 'talent', 'supply', 'regulation', 'incident']);
export type Deck = z.infer<typeof DeckSchema>;

export const EventSchema = z.object({
  id: z.string(),
  deck: DeckSchema,
  trigger: z.enum(['rivalRelease', 'random', 'training', 'fab', 'founding']),
  /** Founding events: only while a chip project is in progress. */
  requiresProject: z.boolean().default(false),
  /** For fab incidents: which kind. */
  fabIncident: z.enum(['cleanroom', 'litho', 'hbm']).optional(),
  /** For training incidents: which risk this event represents. */
  incident: z.enum(['hardware', 'lossSpike', 'contamination']).optional(),
  requiresLiveModel: z.boolean().default(false),
  weight: z.number().positive().default(1),
  speaker: z.string(),
  title: z.string(),
  body: z.string(),
  choices: z
    .array(z.object({ id: z.string(), label: z.string(), detail: z.string(), effects: EffectsSchema }))
    .min(2),
});
export type GameEvent = z.infer<typeof EventSchema>;

/** A foundry process node for custom chips. */
export const NodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  availableFromWeek: z.number().int().nonnegative(),
  minHardwareEng: z.number().int().positive(),
  dieAreaMm2: z.number().positive(),
  /** FP16 TFLOPS per mm² of compute area. */
  tflopsPerMm2: z.number().positive(),
  wattsPerTflop: z.number().positive(),
  hbmGBPerStack: z.number().positive(),
  hbmTBsPerStack: z.number().positive(),
  linkGBsPerMm2: z.number().positive(),
  costPerMm2: z.number().positive(),
  hbmStackCost: z.number().positive(),
  tapeoutCost: z.number().positive(),
  tapeoutWeeks: z.number().int().positive(),
  bugChance: z.number().min(0).max(1),
  baseYield: z.number().min(0).max(1),
});
export type ProcessNode = z.infer<typeof NodeSchema>;

export const TrackIdSchema = z.enum(['power', 'safety', 'compliance', 'environmental']);
export type TrackId = z.infer<typeof TrackIdSchema>;

/** One upgrade level on a License to Scale track. Level 1 is the free starting level. */
export const LicenseLevelSchema = z.object({
  name: z.string(),
  blurb: z.string(),
  cost: z.number().nonnegative(),
  weeks: z.number().int().nonnegative(),
  upkeep: z.number().nonnegative(),
  /** Power track only: the site power cap this level provides. */
  powerCapMW: z.number().positive().optional(),
  /** Environmental track: e.g. selling waste heat. */
  weeklyRevenue: z.number().nonnegative().optional(),
});
export type LicenseLevel = z.infer<typeof LicenseLevelSchema>;

export const LicenseSchema = z.object({
  /** Chance per missing level that a track's consequence hits on release. */
  riskPerGap: z.number().min(0).max(1),
  /** Training slowdown per missing power level. */
  powerSlowdownPerGap: z.number().min(0).max(1),
  tiers: z.array(z.object({ tier: z.number().int().positive(), name: z.string(), minCapability: z.number() })).min(1),
  tracks: z
    .array(z.object({ id: TrackIdSchema, name: z.string(), missing: z.string(), levels: z.array(LicenseLevelSchema).min(1) }))
    .length(4),
});
export type License = z.infer<typeof LicenseSchema>;

export const FundingRoundSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
  cash: z.number().positive(),
  /** Share of the company sold, taken from your remaining ownership. */
  equity: z.number().positive().max(1),
  minUsers: z.number().nonnegative(),
  /** Best released model's License to Scale tier. */
  minTier: z.number().int().positive(),
  /** Last week's net must be positive. */
  requiresProfit: z.boolean().default(false),
});
export type FundingRound = z.infer<typeof FundingRoundSchema>;

/** What an acquisition delivers once integrated. */
export const AcquisitionGainsSchema = z.object({
  staff: z.array(z.object({ discipline: DisciplineSchema, count: z.number().int().positive() })).optional(),
  dataTokensB: z.number().positive().optional(),
  users: z.number().positive().optional(),
  /** Added to the effective-compute multiplier on every future training run. */
  ipBonus: z.number().positive().optional(),
  powerMW: z.number().positive().optional(),
  chips: z.object({ chipId: z.string(), count: z.number().int().positive() }).optional(),
});
export type AcquisitionGains = z.infer<typeof AcquisitionGainsSchema>;

export const StartupSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['team', 'ip', 'data', 'infra', 'customers']),
  blurb: z.string(),
  /** Price when it first appears; grows with the AI boom. */
  price: z.number().positive(),
  availableFromWeek: z.number().int().nonnegative(),
  integrationWeeks: z.number().int().positive(),
  gives: AcquisitionGainsSchema,
});
export type Startup = z.infer<typeof StartupSchema>;

/** An enterprise customer sector: requirements and pricing for its contract offers. */
export const ClientSectorSchema = z.object({
  sector: z.string(),
  names: z.array(z.string()).min(1),
  minSafety: z.number().int().positive(),
  minCompliance: z.number().int().positive(),
  priceFactor: z.number().positive(),
});
export type ClientSector = z.infer<typeof ClientSectorSchema>;

/** A room template for the HQ grid (world-and-facilities §4). */
export const RoomTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
  kind: z.enum(['desks', 'lab', 'break', 'server', 'special']),
  /** Footprint in tiles before rotation. */
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  cost: z.number().nonnegative(),
  upkeepPerWeek: z.number().nonnegative(),
  /** Generic desks. */
  desks: z.number().int().nonnegative().default(0),
  /** Specialist seats: staff of this discipline only do their specialist work while seated here. */
  seats: z.object({ discipline: DisciplineSchema, count: z.number().int().positive() }).optional(),
  /** Staff a break room serves. */
  serves: z.number().int().nonnegative().default(0),
  /** Effect multiplier per tier (index 0 = tier 1). Upgrading to tier n costs cost × (n − 1). */
  tierEffect: z.array(z.number().positive()).min(1),
  /** Something this room unlocks: a License to Scale level, or a funding round (index into funding). */
  requiredFor: z
    .object({ track: TrackIdSchema.optional(), level: z.number().int().positive().optional(), fundingRound: z.number().int().nonnegative().optional() })
    .optional(),
  /** First HQ stage (index) where it can be built. */
  minStage: z.number().int().nonnegative().default(0),
});
export type RoomTemplate = z.infer<typeof RoomTemplateSchema>;

/** A stage on the HQ track: garage, office, ... */
export const HqStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  rentPerWeek: z.number().nonnegative(),
  moveCost: z.number().nonnegative(),
  /** Unlocked by closing this many funding rounds, or by holding this much cash. */
  requiresRounds: z.number().int().nonnegative().default(0),
  orCash: z.number().nonnegative().optional(),
  /** Floors (each w×h). Campus floors can be named by building. */
  floors: z.number().int().positive().default(1),
  floorNames: z.array(z.string()).optional(),
  /** Server room limits from the building's power and cooling (world-and-facilities §2.5). */
  maxRacks: z.number().int().nonnegative(),
  maxServerKW: z.number().nonnegative(),
  /** Founding-era terms (1990s money): move cost, monthly rent, and what unlocks the move. */
  founding: z
    .object({
      moveCost: z.number().nonnegative(),
      rentPerMonth: z.number().nonnegative(),
      chipsShipped: z.number().int().nonnegative(),
      orCash: z.number().nonnegative(),
    })
    .optional(),
});
export type HqStage = z.infer<typeof HqStageSchema>;

/** Equipment placed inside a server room (world-and-facilities §6). */
export const EquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
  kind: z.enum(['rack', 'cooling', 'power']),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  cost: z.number().nonnegative(),
  upkeepPerWeek: z.number().nonnegative(),
  /** Chips it holds (racks, immersion tanks). One chip type per unit. */
  chips: z.number().int().nonnegative().default(0),
  /** Heat it removes, kW. */
  coolingKW: z.number().nonnegative().default(0),
  /** Power it distributes, kW. */
  powerKW: z.number().nonnegative().default(0),
  /** Power usage effectiveness of the room when this unit does the cooling. */
  pue: z.number().min(1).optional(),
  /** Power license level needed to install it. */
  requiresPowerLevel: z.number().int().positive().default(1),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const HqSchema = z.object({
  stages: z.array(HqStageSchema).min(1),
  rooms: z.array(RoomTemplateSchema).min(1),
  equipment: z.array(EquipmentSchema),
});

export const ClimateSchema = z.enum(['cold', 'temperate', 'hot']);
export const WaterSchema = z.enum(['plentiful', 'limited', 'scarce']);

/** A place we can build a data center campus (world-and-facilities §2.2). */
export const SiteLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  lon: z.number(),
  lat: z.number(),
  climate: ClimateSchema,
  water: WaterSchema,
  powerPricePerMWh: z.number().positive(),
  buildCost: z.number().positive(),
  buildWeeks: z.number().int().positive(),
  blurb: z.string(),
});
export type SiteLocation = z.infer<typeof SiteLocationSchema>;

const ClimateEffect = z.object({ label: z.string(), coolingMult: z.number().positive(), pueDelta: z.number() });
const WaterRule = z.object({ label: z.string(), envLevel: z.number().int().positive() });

export const SitesSchema = z.object({
  requiresPowerLevel: z.number().int().positive(),
  startHalls: z.number().int().positive(),
  maxHalls: z.number().int().positive(),
  siteUpkeepPerWeek: z.number().nonnegative(),
  hall: z.object({ w: z.number().int().positive(), h: z.number().int().positive(), cost: z.number(), weeks: z.number().int().positive(), upkeepPerWeek: z.number() }),
  opsCenter: z.object({ cost: z.number(), upkeepPerWeek: z.number(), failureMult: z.number().positive() }),
  unattendedFailureMult: z.number().positive(),
  climates: z.object({ cold: ClimateEffect, temperate: ClimateEffect, hot: ClimateEffect }),
  water: z.object({ plentiful: WaterRule, limited: WaterRule, scarce: WaterRule }),
  locations: z.array(SiteLocationSchema).min(1),
});
export type Sites = z.infer<typeof SitesSchema>;

const FabStage = z.object({ name: z.string(), wafersPerLevel: z.number().positive().optional(), chipsPerLevel: z.number().positive().optional() });

/** Our own fab (world-and-facilities §7). */
export const FabSchema = z.object({
  requiresRounds: z.number().int().nonnegative(),
  requiresPowerLevel: z.number().int().positive(),
  requiresEnvironmentalLevel: z.number().int().positive(),
  requiresHardwareEng: z.number().int().nonnegative(),
  buildCost: z.number().positive(),
  buildWeeks: z.number().int().positive(),
  upkeepPerWeek: z.number().nonnegative(),
  basePowerMW: z.number().nonnegative(),
  bays: z.number().int().positive(),
  line: z.object({
    costByNode: z.record(z.string(), z.number().positive()),
    weeks: z.number().int().positive(),
    upkeepPerWeek: z.number().nonnegative(),
    powerMW: z.number().nonnegative(),
    retoolShare: z.number().positive(),
    retoolWeeks: z.number().int().positive(),
    maxStageLevel: z.number().int().positive(),
    stageUpgradeShare: z.number().positive(),
  }),
  stages: z.object({ litho: FabStage, etch: FabStage, test: FabStage, packaging: FabStage }),
  waferAreaMm2: z.number().positive(),
  edgeLoss: z.number().positive().max(1),
  startYield: z.number().positive().max(1),
  yieldLearningWafers: z.number().positive(),
  dieCostShare: z.number().positive(),
  hbm: z.object({ stacksPerWeek: z.number().positive(), growthPerWeek: z.number().nonnegative() }),
  market: z.object({ priceMarkup: z.number().positive(), chipsPerWeek: z.number().positive(), growthPerWeek: z.number().nonnegative() }),
  incidentChancePerLine: z.number().min(0).max(1),
});
export type FabRules = z.infer<typeof FabSchema>;

/** The founding era (1991–1998): a chip startup in a garage. */
const Fit = z.enum(['great', 'ok', 'poor']);
export type FitLevel = z.infer<typeof Fit>;
export const FoundingSchema = z.object({
  startYear: z.number().int(),
  endYear: z.number().int(),
  startCash: z.number().positive(),
  /** Rooms that exist in the 1990s. */
  rooms: z.array(z.string()),
  types: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        blurb: z.string(),
        /** Base project length in months. */
        months: z.number().int().positive(),
        /** Share of quality that comes from design work (the rest is polish). */
        design: z.number().min(0).max(1),
        unlocked: z.boolean().default(false),
      }),
    )
    .min(1),
  markets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        blurb: z.string(),
        /** Launch-month sales of a perfect chip in the first year, in dollars. */
        monthlySales: z.number().positive(),
        /** Yearly growth of the market. */
        growth: z.number(),
        unlocked: z.boolean().default(false),
      }),
    )
    .min(1),
  fit: z.record(z.string(), z.record(z.string(), Fit)),
  generations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        year: z.number().int(),
        quality: z.number().positive(),
        devCost: z.number().nonnegative(),
        unlocked: z.boolean().default(false),
      }),
    )
    .min(1),
  research: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      blurb: z.string(),
      cost: z.number().int().positive(),
      year: z.number().int().optional(),
      unlocks: z.object({ type: z.string().optional(), market: z.string().optional(), generation: z.string().optional() }).optional(),
      boost: z.object({ design: z.number().optional(), polish: z.number().optional(), sales: z.number().optional() }).optional(),
    }),
  ),
  rivals: z.array(z.object({ id: z.string(), name: z.string(), personality: z.string(), pace: z.number() })).min(1),
  reviewers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        quotes: z.object({ low: z.array(z.string()).min(1), mid: z.array(z.string()).min(1), high: z.array(z.string()).min(1) }),
      }),
    )
    .min(1),
});
export type Founding = z.infer<typeof FoundingSchema>;

export const ContentSchema = z.object({
  founding: FoundingSchema,
  fab: FabSchema,
  sites: SitesSchema,
  hq: HqSchema,
  chips: z.array(ChipSchema).min(1),
  clients: z.array(ClientSectorSchema).min(1),
  startups: z.array(StartupSchema),
  funding: z.array(FundingRoundSchema),
  nodes: z.array(NodeSchema).min(1),
  license: LicenseSchema,
  archs: z.array(ArchSchema).min(1),
  rivals: z.array(RivalSchema).min(1),
  events: z.array(EventSchema),
});
export type Content = z.infer<typeof ContentSchema>;
