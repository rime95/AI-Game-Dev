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
  /** Share of the remaining gap to 100 closed per release. */
  releaseGain: z.number().positive().max(1),
  releaseEveryWeeks: z.number().int().positive(),
  apiPrice: z.number().positive(),
});
export type Rival = z.infer<typeof RivalSchema>;

export const EffectsSchema = z.object({
  cash: z.number().optional(),
  reputation: z.number().optional(),
  staff: z.object({ discipline: DisciplineSchema, delta: z.number().int() }).optional(),
  /** Multiplies your market pull for `boostWeeks` weeks. */
  shareBoost: z.number().positive().optional(),
  boostWeeks: z.number().int().positive().optional(),
  /** Chance of a bad outcome, applied as `riskReputation`. */
  riskChance: z.number().min(0).max(1).optional(),
  riskReputation: z.number().optional(),
});
export type Effects = z.infer<typeof EffectsSchema>;

export const DeckSchema = z.enum(['press', 'board', 'talent', 'supply', 'regulation', 'incident']);
export type Deck = z.infer<typeof DeckSchema>;

export const EventSchema = z.object({
  id: z.string(),
  deck: DeckSchema,
  trigger: z.enum(['rivalRelease', 'random']),
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

export const ContentSchema = z.object({
  chips: z.array(ChipSchema).min(1),
  nodes: z.array(NodeSchema).min(1),
  archs: z.array(ArchSchema).min(1),
  rivals: z.array(RivalSchema).min(1),
  events: z.array(EventSchema),
});
export type Content = z.infer<typeof ContentSchema>;
