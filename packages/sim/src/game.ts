import type { Content, Discipline, Effects, GameEvent } from '@stm/content';
import type { Command, CommandResult, GameState, LogKind, PendingEvent } from './types';
import { TUNING } from './tuning';
import { pickWeighted, rand, randInt } from './rng';
import { clusterFlopsPerSecond, powerDrawMW, weeklyPowerCost } from './formulas';
import { bugChance, deriveChip, previewChip, RESPIN_COST_SHARE, RESPIN_TIME_SHARE } from './chipDesign';
import {
  initialLicense,
  levelDef,
  licenseRevenue,
  licenseUpkeep,
  nextUpgrade,
  tierName,
  trackDef,
  TRACK_IDS,
} from './license';
import type { TrackId } from '@stm/content';
import {
  bestScore,
  cloudSupply,
  rentedChips,
  freeChips,
  getArch,
  getChip,
  liveModel,
  marketSize,
  ownedPowerMW,
  previewTraining,
  scoreNow,
  servingCapacityTokens,
} from './selectors';
import { capabilityForScore } from './formulas';

export function createGame(content: Content, seed: number): GameState {
  const state: GameState = {
    version: 4,
    suite: { version: 1, mid: TUNING.capabilityMid, startedWeek: 0 },
    seed,
    rng: seed | 0,
    week: 0,
    status: 'playing',
    weeksNegative: 0,
    cash: TUNING.startCash,
    reputation: TUNING.startReputation,
    users: 0,
    apiPrice: TUNING.startApiPrice,
    dataTokensB: TUNING.startDataTokensB,
    powerCapMW: TUNING.startPowerCapMW,
    staff: { research: 1, modelEng: 1, hardwareEng: 0, product: 1, ops: 0 },
    fleet: [],
    customChips: [],
    chipProject: null,
    license: initialLicense(),
    nextId: 1,
    training: null,
    models: [],
    liveModelId: null,
    rivals: [],
    modifiers: [],
    pendingEvent: null,
    log: [],
    history: [],
    lastWeek: null,
  };
  for (const r of content.rivals) {
    state.rivals.push({
      id: r.id,
      capability: capabilityForScore(r.startScore, TUNING.capabilityMid),
      score: r.startScore,
      version: 1,
      nextReleaseWeek: randInt(state, 3, r.releaseEveryWeeks),
    });
  }
  log(state, 'info', 'Three people, a garage and $8M of seed money. Rent some chips and train a first model.');
  state.history.push({ week: 0, cash: state.cash, users: 0, bestScore: 0 });
  return state;
}

/** Apply one player command. Never mutates the input state. */
export function applyCommand(prev: GameState, content: Content, cmd: Command): CommandResult {
  if (prev.status !== 'playing') return { state: prev, error: 'The game is over.' };
  const state = structuredClone(prev);
  const fail = (error: string): CommandResult => ({ state: prev, error });

  switch (cmd.type) {
    case 'advanceWeek': {
      if (state.pendingEvent) return fail('Decide on the open event first.');
      advanceWeek(state, content);
      return { state };
    }

    case 'rentChips': {
      const chip = getChip(content, cmd.chipId, state);
      if (!chip) return fail('Unknown chip.');
      if (!(cmd.count > 0)) return fail('Count must be positive.');
      if (state.customChips.some((c) => c.id === chip.id)) return fail(`Nobody rents out ${chip.name}: it's ours. Buy units from the foundry.`);
      const supply = cloudSupply(chip, state.week);
      const available = supply - rentedChips(state, chip.id);
      if (supply === 0) return fail(`${chip.name} isn't available to rent until week ${chip.cloudFromWeek}.`);
      if (Math.floor(cmd.count) > available)
        return fail(`The cloud can only rent you ${Math.max(0, available)} more ${chip.name} this week (supply grows over time).`);
      addFleet(state, chip.id, Math.floor(cmd.count), false);
      log(state, 'info', `Rented ${Math.floor(cmd.count)} × ${chip.name}.`);
      return { state };
    }

    case 'buyChips': {
      const chip = getChip(content, cmd.chipId, state);
      if (!chip) return fail('Unknown chip.');
      const count = Math.floor(cmd.count);
      if (!(count > 0)) return fail('Count must be positive.');
      const cost = chip.priceUsd * count;
      if (cost > state.cash) return fail('Not enough cash.');
      const newDraw = ownedPowerMW(state, content) + powerDrawMW(chip, count);
      if (newDraw > state.powerCapMW) {
        return fail(`Not enough site power: needs ${newDraw.toFixed(2)} MW of ${state.powerCapMW} MW.`);
      }
      state.cash -= cost;
      addFleet(state, chip.id, count, true);
      log(state, 'info', `Bought ${count} × ${chip.name}.`);
      return { state };
    }

    case 'releaseChips': {
      const entry = state.fleet.find((f) => f.id === cmd.fleetId);
      if (!entry) return fail('Unknown fleet entry.');
      const count = Math.min(entry.count, Math.floor(cmd.count));
      if (count > freeChips(state, entry.chipId)) return fail('Those chips are busy training.');
      const chip = getChip(content, entry.chipId, state);
      entry.count -= count;
      if (entry.owned && chip) state.cash += chip.priceUsd * count * 0.5; // resale at half price
      state.fleet = state.fleet.filter((f) => f.count > 0);
      log(state, 'info', `${entry.owned ? 'Sold' : 'Returned'} ${count} × ${chip?.name ?? entry.chipId}.`);
      return { state };
    }

    case 'hire': {
      if (state.cash < TUNING.hireCost) return fail('Not enough cash.');
      state.cash -= TUNING.hireCost;
      state.staff[cmd.discipline] += 1;
      log(state, 'info', `Hired a ${DISCIPLINE_LABEL[cmd.discipline]}.`);
      return { state };
    }

    case 'buyData': {
      const b = Math.floor(cmd.billions);
      if (!(b > 0)) return fail('Amount must be positive.');
      const cost = b * TUNING.dataCostPerBillionTokens;
      if (cost > state.cash) return fail('Not enough cash.');
      state.cash -= cost;
      state.dataTokensB += b;
      log(state, 'info', `Licensed ${b}B tokens of training data.`);
      return { state };
    }

    case 'startTraining': {
      const preview = previewTraining(state, content, cmd.spec);
      if (preview.errors.length) return fail(preview.errors[0]!);
      state.training = {
        spec: { ...cmd.spec, name: cmd.spec.name.trim() },
        flopsTotal: preview.flops,
        flopsDone: 0,
        startedWeek: state.week,
        projectedCapability: preview.projectedCapability,
        projectedScore: preview.projectedScore,
        tier: preview.tier,
        gaps: Object.fromEntries(preview.requirements.map((r) => [r.track, r.gap])) as Record<TrackId, number>,
        speedFactor: preview.speedFactor,
      };
      const missing = preview.requirements.filter((r) => r.gap > 0).length;
      log(
        state,
        missing ? 'bad' : 'info',
        `Training started: ${cmd.spec.name.trim()} (${tierName(content, preview.tier)}, ~${preview.weeks} wk)` +
          (missing ? ` with ${missing} License to Scale requirement${missing > 1 ? 's' : ''} unmet.` : '.'),
      );
      return { state };
    }

    case 'upgradeLicense': {
      const t = state.license[cmd.track];
      if (!t) return fail('Unknown track.');
      if (t.upgrade) return fail('That upgrade is already underway.');
      const next = nextUpgrade(state, content, cmd.track);
      if (!next) return fail('Already at the highest level.');
      if (next.cost > state.cash) return fail('Not enough cash.');
      state.cash -= next.cost;
      t.upgrade = { weeksLeft: next.weeks, totalWeeks: next.weeks };
      log(state, 'info', `Started: ${next.name} (${next.weeks} wk).`);
      return { state };
    }

    case 'setApiPrice': {
      if (!(cmd.price > 0) || cmd.price > 1000) return fail('Price must be between $0 and $1,000 per 1M tokens.');
      state.apiPrice = cmd.price;
      return { state };
    }

    case 'startTapeout': {
      const preview = previewChip(state, content, cmd.design);
      if (preview.errors.length || !preview.node) return fail(preview.errors[0] ?? 'Invalid design.');
      state.cash -= preview.tapeoutCost;
      state.chipProject = {
        design: { ...cmd.design, name: cmd.design.name.trim() },
        startedWeek: state.week,
        weeksLeft: preview.tapeoutWeeks,
        totalWeeks: preview.tapeoutWeeks,
        respun: false,
      };
      log(state, 'info', `Taped out ${cmd.design.name.trim()} on ${preview.node.name}. First silicon in ${preview.tapeoutWeeks} wk.`);
      return { state };
    }

    case 'setLiveModel': {
      if (!state.models.some((m) => m.id === cmd.modelId)) return fail('Unknown model.');
      state.liveModelId = cmd.modelId;
      return { state };
    }

    case 'resolveEvent': {
      const ev = state.pendingEvent;
      if (!ev) return fail('No open event.');
      const choice = ev.choices.find((c) => c.id === cmd.choiceId);
      if (!choice) return fail('Unknown choice.');
      applyEffects(state, choice.effects);
      log(state, 'info', `${ev.title}: ${choice.label}.`);
      state.pendingEvent = null;
      return { state };
    }
  }
}

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  research: 'researcher',
  modelEng: 'model engineer',
  hardwareEng: 'hardware engineer',
  product: 'product manager',
  ops: 'ops engineer',
};

function advanceWeek(state: GameState, content: Content): void {
  // 1. Training progress
  const run = state.training;
  if (run) {
    const arch = getArch(content, run.spec.archId);
    const chip = getChip(content, run.spec.chipId, state);
    if (arch && chip) {
      run.flopsDone +=
        clusterFlopsPerSecond(chip, arch, run.spec.precision, run.spec.chipCount) * TUNING.secondsPerWeek * run.speedFactor;
    }
    if (run.flopsDone >= run.flopsTotal) {
      const id = `m${state.nextId++}`;
      state.models.push({
        id,
        name: run.spec.name,
        archId: run.spec.archId,
        paramsB: run.spec.paramsB,
        tokensB: run.spec.tokensB,
        precision: run.spec.precision,
        capability: run.projectedCapability,
        score: round1(scoreNow(state, run.projectedCapability)),
        releasedWeek: state.week + 1,
      });
      const live = liveModel(state);
      if (!live || run.projectedCapability > live.capability) state.liveModelId = id;
      log(
        state,
        'good',
        `${run.spec.name} released: scores ${round1(scoreNow(state, run.projectedCapability))} on Suite v${state.suite.version}.`,
      );
      rollLicenseConsequences(state, content, run.tier, run.gaps, run.spec.name);
      state.training = null;
    }
  }

  // 1a. License to Scale upgrades
  for (const track of TRACK_IDS) {
    const t = state.license[track];
    if (!t.upgrade) continue;
    t.upgrade.weeksLeft -= 1;
    if (t.upgrade.weeksLeft <= 0) {
      t.level += 1;
      t.upgrade = null;
      const lvl = levelDef(content, track, t.level);
      if (lvl?.powerCapMW) state.powerCapMW = lvl.powerCapMW;
      log(state, 'good', `${trackDef(content, track).name} is now level ${t.level}: ${lvl?.name ?? ''}.`);
    }
  }

  // 1b. Chip tape-out progress
  const project = state.chipProject;
  if (project) {
    project.weeksLeft -= 1;
    const node = content.nodes.find((n) => n.id === project.design.nodeId);
    if (project.weeksLeft <= 0 && node) {
      if (!project.respun && rand(state) < bugChance(node, state.staff.hardwareEng)) {
        const extra = Math.ceil(node.tapeoutWeeks * RESPIN_TIME_SHARE);
        const cost = node.tapeoutCost * RESPIN_COST_SHARE;
        project.respun = true;
        project.weeksLeft = extra;
        project.totalWeeks += extra;
        state.cash -= cost;
        log(state, 'bad', `First silicon of ${project.design.name} has a bug. Respin: ${extra} more weeks, ${formatM(cost)}.`);
      } else {
        const yieldRate = Math.max(0.3, Math.min(0.95, node.baseYield + (rand(state) - 0.5) * 0.2 + state.staff.hardwareEng * 0.01));
        const chip = deriveChip(node, project.design, `custom-${state.nextId++}`, yieldRate);
        state.customChips.push(chip);
        state.chipProject = null;
        log(state, 'good', `${chip.name} works! Yield ${Math.round(yieldRate * 100)}%, unit cost $${Math.round(chip.priceUsd).toLocaleString('en-US')}. Buy units in Compute.`);
      }
    }
  }

  // 2. Serving and revenue
  const capacity = servingCapacityTokens(state, content);
  const demand = state.users * TUNING.tokensPerUserPerWeek;
  const served = Math.min(capacity, demand);
  const revenue = (served / 1e6) * state.apiPrice;

  // 3. Costs
  const salaries = Object.values(state.staff).reduce((n, c) => n + c, 0) * TUNING.salaryPerWeek;
  let rent = 0;
  let power = 0;
  for (const f of state.fleet) {
    const chip = getChip(content, f.chipId, state);
    if (!chip) continue;
    if (f.owned) power += weeklyPowerCost(chip, f.count);
    else rent += chip.rentPerWeekUsd * f.count;
  }
  const upkeep = licenseUpkeep(state, content);
  const licenseIncome = licenseRevenue(state, content);
  state.cash += revenue + licenseIncome - salaries - rent - power - upkeep;

  // 4. Users move toward the market share our model + price earn
  const target = targetUsers(state, content);
  const servedRatio = demand > 0 ? served / demand : 1;
  const adjustedTarget = target * Math.min(1, servedRatio + 0.1);
  state.users = Math.max(0, state.users + (adjustedTarget - state.users) * TUNING.userConvergencePerWeek);
  if (servedRatio < 0.95 && demand > 0) {
    state.reputation = clampRep(state.reputation - TUNING.underServedReputationLoss);
    if (servedRatio < 0.8) log(state, 'bad', `Serving capacity covers only ${Math.round(servedRatio * 100)}% of demand.`);
  }

  // 5. Rivals
  for (const rival of state.rivals) {
    if (state.week + 1 < rival.nextReleaseWeek) continue;
    const def = content.rivals.find((r) => r.id === rival.id);
    if (!def) continue;
    rival.version += 1;
    rival.capability += def.capabilityGain * (0.7 + rand(state) * 0.6);
    rival.score = round1(scoreNow(state, rival.capability));
    rival.nextReleaseWeek = state.week + 1 + randInt(state, Math.ceil(def.releaseEveryWeeks * 0.7), Math.ceil(def.releaseEveryWeeks * 1.3));
    const modelName = `${def.modelPrefix} ${rival.version}`;
    log(state, 'rival', `${def.name} released ${modelName} (${rival.score}).`);
    if (!state.pendingEvent && rand(state) < TUNING.rivalPressEventChance) {
      const ev = pickWeighted(state, content.events.filter((e) => e.trigger === 'rivalRelease'));
      if (ev) state.pendingEvent = instantiate(ev, { rival: def.name, model: modelName, score: String(rival.score) });
    }
  }

  // 5b. A saturated eval suite retires; everyone is re-scored on a harder one
  retireSaturatedSuite(state);

  // 6. Random events
  if (!state.pendingEvent && rand(state) < TUNING.randomEventChance) {
    const pool = content.events.filter((e) => e.trigger === 'random' && (!e.requiresLiveModel || state.liveModelId));
    const ev = pickWeighted(state, pool);
    if (ev) state.pendingEvent = instantiate(ev, {});
  }

  // 7. Modifiers tick down
  for (const m of state.modifiers) m.weeksLeft -= 1;
  state.modifiers = state.modifiers.filter((m) => m.weeksLeft > 0);

  // 8. Bankruptcy
  if (state.cash < 0) {
    state.weeksNegative += 1;
    if (state.weeksNegative >= TUNING.bankruptAfterNegativeWeeks) {
      state.status = 'bankrupt';
      log(state, 'bad', 'Out of cash for too long. The company is bankrupt.');
    } else {
      log(state, 'bad', `Cash is negative. Bankruptcy in ${TUNING.bankruptAfterNegativeWeeks - state.weeksNegative} wk.`);
    }
  } else {
    state.weeksNegative = 0;
  }

  state.week += 1;
  state.lastWeek = {
    revenue,
    salaries,
    rent,
    power,
    licenseUpkeep: upkeep,
    licenseRevenue: licenseIncome,
    demandTokens: demand,
    servedTokens: served,
    servingCapacityTokens: capacity,
    targetUsers: target,
  };
  state.history.push({ week: state.week, cash: state.cash, users: state.users, bestScore: bestScore(state) });
}

/** Users we'd converge to: market × our share of "pull" against rivals. */
export function targetUsers(state: GameState, content: Content): number {
  const live = liveModel(state);
  if (!live) return 0;
  // Pull uses capability (not suite score), so retiring a suite doesn't reshuffle the market.
  const pull = (capability: number, price: number) =>
    Math.exp((capability - state.suite.mid) / TUNING.capabilitySoftness) *
    Math.pow(price / TUNING.referencePrice, -TUNING.priceElasticity);
  const boost = state.modifiers.reduce((b, m) => b * m.shareBoost, 1);
  const ours = pull(live.capability, state.apiPrice) * Math.sqrt(state.reputation / 50) * boost;
  let total = ours;
  for (const r of state.rivals) {
    const def = content.rivals.find((d) => d.id === r.id);
    if (def) total += pull(r.capability, def.apiPrice);
  }
  return marketSize(state.week) * (ours / total);
}

/** When any model hits the saturation score, replace the suite with a harder one and re-score everyone. */
function retireSaturatedSuite(state: GameState): void {
  const top = Math.max(...state.models.map((m) => m.score), ...state.rivals.map((r) => r.score));
  if (top < TUNING.suiteSaturationScore) return;
  const old = state.suite.version;
  state.suite = { version: old + 1, mid: state.suite.mid + TUNING.suiteStep, startedWeek: state.week + 1 };
  for (const m of state.models) m.score = round1(scoreNow(state, m.capability));
  for (const r of state.rivals) r.score = round1(scoreNow(state, r.capability));
  if (state.training) state.training.projectedScore = scoreNow(state, state.training.projectedCapability);
  const newTop = Math.max(...state.models.map((m) => m.score), ...state.rivals.map((r) => r.score));
  log(
    state,
    'rival',
    `Suite v${old} is saturated (top score ${round1(top)}). Suite v${old + 1} replaces it: the best model now scores ${round1(newTop)}.`,
  );
}

/** A model shipped without the License to Scale requirements can trigger consequences per missing track. */
function rollLicenseConsequences(state: GameState, content: Content, tier: number, gaps: Record<TrackId, number>, name: string): void {
  const chance = (gap: number) => Math.min(0.9, gap * content.license.riskPerGap);
  if (gaps.safety > 0 && rand(state) < chance(gaps.safety)) {
    state.reputation = clampRep(state.reputation - 4 * gaps.safety);
    state.users *= 1 - 0.1 * gaps.safety;
    log(state, 'bad', `Safety incident: ${name} was jailbroken into harmful output. Reputation −${4 * gaps.safety}, users −${10 * gaps.safety}%.`);
  }
  if (gaps.compliance > 0 && rand(state) < chance(gaps.compliance)) {
    const fine = 1_000_000 * tier * gaps.compliance;
    state.cash -= fine;
    log(state, 'bad', `Regulators fined us ${formatM(fine)} for launching ${name} without the required filings.`);
  }
  if (gaps.environmental > 0 && rand(state) < chance(gaps.environmental)) {
    state.reputation = clampRep(state.reputation - 3 * gaps.environmental);
    const fine = 1_000_000 * gaps.environmental;
    state.cash -= fine;
    log(state, 'bad', `Permit violation: water and carbon limits exceeded. ${formatM(fine)} fine, reputation −${3 * gaps.environmental}.`);
  }
}

function applyEffects(state: GameState, e: Effects): void {
  if (e.cash) state.cash += e.cash;
  if (e.reputation) state.reputation = clampRep(state.reputation + e.reputation);
  if (e.staff) state.staff[e.staff.discipline] = Math.max(0, state.staff[e.staff.discipline] + e.staff.delta);
  if (e.shareBoost && e.boostWeeks) state.modifiers.push({ shareBoost: e.shareBoost, weeksLeft: e.boostWeeks });
  if (e.riskChance && e.riskReputation && rand(state) < e.riskChance) {
    state.reputation = clampRep(state.reputation + e.riskReputation);
    log(state, 'bad', `It backfired: reputation ${e.riskReputation}.`);
  }
}

function instantiate(ev: GameEvent, vars: Record<string, string>): PendingEvent {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
  return {
    eventId: ev.id,
    deck: ev.deck,
    speaker: ev.speaker,
    title: fill(ev.title),
    body: fill(ev.body),
    choices: ev.choices.map((c) => ({ ...c, label: fill(c.label), detail: fill(c.detail) })),
  };
}

function addFleet(state: GameState, chipId: string, count: number, owned: boolean): void {
  const existing = state.fleet.find((f) => f.chipId === chipId && f.owned === owned);
  if (existing) existing.count += count;
  else state.fleet.push({ id: `f${state.nextId++}`, chipId, count, owned });
}

function log(state: GameState, kind: LogKind, text: string): void {
  state.log.push({ week: state.week, kind, text });
  if (state.log.length > TUNING.logLimit) state.log.splice(0, state.log.length - TUNING.logLimit);
}

const clampRep = (r: number) => Math.max(0, Math.min(100, r));
const round1 = (n: number) => Math.round(n * 10) / 10;
const formatM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
