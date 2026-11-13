/** Balance knobs in one place. Placeholder values; tune with the headless balance runner. */
export const TUNING = {
  startCash: 8_000_000,
  /** Founders own 80% after the seed round that funded the starting cash. */
  startOwnership: 0.8,
  startReputation: 40,
  startDataTokensB: 300,
  startPowerCapMW: 5,
  startApiPrice: 10,

  salaryPerWeek: 4_000,
  hireCost: 20_000,
  dataCostPerBillionTokens: 5_000,
  /** Largest training cluster one model engineer can orchestrate. */
  chipsPerModelEngineer: 256,

  /** Best-case share of peak FLOPS a well-matched cluster achieves. */
  baseUtilization: 0.45,
  /** Cluster size at which fabric scaling efficiency halves. */
  fabricHalfEfficiencyChips: 50_000,
  /** Each researcher adds this much effective compute, up to the cap. */
  researcherComputeBonus: 0.03,
  researcherComputeBonusCap: 0.6,

  /**
   * Capability = log10(effective compute). A suite's score = 100 / (1 + exp(-(capability - mid) / scale)).
   * capabilityMid is suite v1's midpoint; each retired suite moves the midpoint up by suiteStep.
   */
  capabilityMid: 24.2,
  capabilityScale: 1.2,
  suiteSaturationScore: 90,
  suiteStep: 2.5,
  /** Rival release gain multiplier per capability unit behind the leader. */
  rivalCatchUp: 0.6,
  /** Market pull: capability units per e-fold of user preference. */
  capabilitySoftness: 0.3,

  pue: 1.3,
  powerPricePerMWh: 80,
  secondsPerWeek: 604_800,
  servingBatch: 64,
  servingComputeUtilization: 0.3,
  /** Chips per server; a model's weights must fit in one server's memory. */
  chipsPerServer: 8,
  tokensPerUserPerWeek: 50_000,

  marketStartUsers: 100_000_000,
  marketGrowthPerWeek: 0.008,
  marketCapUsers: 4_000_000_000,
  priceElasticity: 1.3,
  referencePrice: 8,
  userConvergencePerWeek: 0.15,
  underServedReputationLoss: 0.5,

  /** Endgame: the AGI Program. */
  agiCapability: 27,
  agiCost: 20_000_000_000,
  agiMinChips: 50_000,
  agiWeeks: 52,
  /** Catastrophe chance per safety level below the top. */
  agiCatastrophePerMissingSafety: 0.25,
  /** Market Leader victory: weeks in a row with the biggest user share. */
  marketLeaderWeeks: 104,
  /** Full Stack victory: share of owned fleet on custom chips. */
  fullStackCustomShare: 0.5,

  randomEventChance: 0.06,
  rivalPressEventChance: 0.6,
  bankruptAfterNegativeWeeks: 4,
  logLimit: 200,
} as const;
