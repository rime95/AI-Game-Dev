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
  /** Each data center campus we run adds this much to the half-efficiency cluster size (our own fabric). */
  fabricHalfPerCampus: 50_000,
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
  /** Rivals close this share of the gap to their target (just behind our best model) per release. */
  rivalCatchUpShare: 0.5,
  /** Before we release anything, rivals hover around this score. */
  rivalBaselineScore: 14,
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
  userConvergencePerWeek: 0.08,
  underServedReputationLoss: 0.5,
  /** Weekly reputation recovery while demand is fully served, up to the ceiling below. */
  reputationRecoveryPerWeek: 0.25,
  reputationRecoveryBase: 50,
  /** Extra recovery ceiling per Safety or Compliance level above 1. */
  reputationPerTrustLevel: 5,

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

  /** Training incidents: weekly base chances. */
  hardwareFailureBase: 0.02,
  /** Extra hardware risk per doubling of cluster size above 1024 chips. */
  hardwareFailurePerDoubling: 0.5,
  /** First-generation custom silicon is flakier. */
  customChipFailureMult: 1.5,
  /** Each ops engineer cuts hardware failures by this factor. */
  hardwareFailureOpsFactor: 0.9,
  lossSpikeBase: 0.02,
  contaminationBase: 0.012,
  /** Release a run early from a checkpoint once it's at least this far along. */
  checkpointMinProgress: 0.5,

  /** Consumer app. */
  consumerLaunchCost: 5_000_000,
  consumerMarketMultiplier: 2,
  consumerTokensPerUser: 20_000,
  referenceSubPrice: 20,
  startSubPrice: 20,
  baseConversion: 0.03,
  conversionPerProductManager: 0.005,
  maxConversion: 0.08,
  /** App users grow slower than developers: a consumer brand takes time. */
  consumerConvergencePerWeek: 0.05,

  /** Enterprise. */
  enterpriseTokensPerSeat: 100_000,
  baseSeatPricePerWeek: 8,
  contractsPerProductManager: 2,
  offerChancePerWeek: 0.25,
  maxOpenOffers: 3,
  offerLifetimeWeeks: 6,
  slaThreshold: 0.95,
  slaPenaltyShare: 0.1,
  slaCancelChance: 0.15,

  /** Acquisitions. */
  startupPriceGrowthPerWeek: 0.01,
  cultureClashBase: 0.35,
  /** Each ops engineer cuts culture-clash risk by this factor. */
  cultureClashOpsFactor: 0.85,
  /** Antitrust reviews start when your user share exceeds this (rival deals: the lower one). */
  antitrustShare: 0.25,
  antitrustShareRivalDeal: 0.15,
  /** Rival labs become buyable when their share drops below this, after this week. */
  strugglingRivalShare: 0.03,
  strugglingRivalFromWeek: 52,
  blockedDealRefund: 0.8,

  /** HQ: morale and productivity (world-and-facilities §5). */
  startMorale: 70,
  /** Morale with no break space and no crowding. */
  moraleBase: 50,
  /** Extra morale target when break rooms cover everyone. */
  moraleFromBreakSpace: 35,
  moraleCrowdedPenalty: 15,
  /** Share of the gap to the morale target closed each week. */
  moraleDrift: 0.2,
  moraleCrowdedPerWeek: 2,
  moraleFactorMin: 0.8,
  moraleFactorMax: 1.1,
  moraleOnRelease: 4,
  moraleOnIncident: -3,
  /** Productivity during the week after moving HQ. */
  moveInProductivity: 0.7,
  moveInWeeks: 1,
  labNextToBreakBonus: 0.05,
  demolishRefund: 0.5,
  /** Colocation: rented rack space for owned chips with no room at HQ, $ per chip per week. */
  colocationPerChipWeek: 80,

  randomEventChance: 0.04,
  rivalPressEventChance: 0.4,
  /** At least this many weeks between press and random events. */
  eventCooldownWeeks: 8,
  /** Even small training runs take about two months. */
  minTrainingWeeks: 8,
  /** One turn on the clock. */
  weeksPerTurn: 4,
  /** Investors wait about half a year between rounds. */
  minWeeksBetweenRounds: 26,
  bankruptAfterNegativeWeeks: 4,
  logLimit: 200,

  // Chip-company years (1991 → AI): monthly turns, 1990s money.
  /** Room build and upkeep costs are scaled by this in the chip-company years. */
  foundingCostScale: 0.25,
  foundingSalaryPerMonth: 4000,
  foundingHireCost: 5000,
  foundingStartTrust: 30,
  foundingEventCooldown: 3,
  foundingEventChance: 0.25,
  foundingBankruptMonths: 3,
  /** Performance an average new chip has in January 1991, and how fast that rises each month. */
  chipBarStart: 36,
  chipBarGrowth: 0.022,
  /** Default price: unit cost × this. Buyers judge price against it. */
  chipMarkup: 2.2,
  /** Research points a month from each seated researcher. */
  researchPointsPerResearcher: 0.3,
  /** Each extra chip of ours in a segment adds this much of its pull (the rest just splits our sales). */
  chipShelfOverlap: 0.25,
  /** Rival makers' brand loyalty: their pull × this. */
  rivalBrand: 1.8,
} as const;
