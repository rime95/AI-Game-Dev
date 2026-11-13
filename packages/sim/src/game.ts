import type { Content, Discipline, Effects, GameEvent } from '@stm/content';
import type { Command, CommandResult, GameState, LogKind, PendingEvent } from './types';
import { TUNING } from './tuning';
import { pickWeighted, rand, randInt } from './rng';
import { clusterFlopsPerSecond, powerDrawMW, weeklyPowerCost } from './formulas';
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
  servingCapacityTokens,
} from './selectors';

export function createGame(content: Content, seed: number): GameState {
  const state: GameState = {
    version: 1,
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
      const chip = getChip(content, cmd.chipId);
      if (!chip) return fail('Unknown chip.');
      if (!(cmd.count > 0)) return fail('Count must be positive.');
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
      const chip = getChip(content, cmd.chipId);
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
      const chip = getChip(content, entry.chipId);
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
        projectedScore: preview.projectedScore,
      };
      log(state, 'info', `Training started: ${cmd.spec.name.trim()} (~${preview.weeks} wk).`);
      return { state };
    }

    case 'setApiPrice': {
      if (!(cmd.price > 0) || cmd.price > 1000) return fail('Price must be between $0 and $1,000 per 1M tokens.');
      state.apiPrice = cmd.price;
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
    const chip = getChip(content, run.spec.chipId);
    if (arch && chip) {
      run.flopsDone += clusterFlopsPerSecond(chip, arch, run.spec.precision, run.spec.chipCount) * TUNING.secondsPerWeek;
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
        score: round1(run.projectedScore),
        releasedWeek: state.week + 1,
      });
      const live = liveModel(state);
      if (!live || run.projectedScore > live.score) state.liveModelId = id;
      log(state, 'good', `${run.spec.name} released: scores ${round1(run.projectedScore)} on the frontier eval.`);
      state.training = null;
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
    const chip = getChip(content, f.chipId);
    if (!chip) continue;
    if (f.owned) power += weeklyPowerCost(chip, f.count);
    else rent += chip.rentPerWeekUsd * f.count;
  }
  state.cash += revenue - salaries - rent - power;

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
    rival.score = round1(rival.score + (100 - rival.score) * def.releaseGain * (0.7 + rand(state) * 0.6));
    rival.nextReleaseWeek = state.week + 1 + randInt(state, Math.ceil(def.releaseEveryWeeks * 0.7), Math.ceil(def.releaseEveryWeeks * 1.3));
    const modelName = `${def.modelPrefix} ${rival.version}`;
    log(state, 'rival', `${def.name} released ${modelName} (${rival.score}).`);
    if (!state.pendingEvent && rand(state) < TUNING.rivalPressEventChance) {
      const ev = pickWeighted(state, content.events.filter((e) => e.trigger === 'rivalRelease'));
      if (ev) state.pendingEvent = instantiate(ev, { rival: def.name, model: modelName, score: String(rival.score) });
    }
  }

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
  const pull = (score: number, price: number) =>
    Math.exp(score / TUNING.scoreSoftness) * Math.pow(price / TUNING.referencePrice, -TUNING.priceElasticity);
  const boost = state.modifiers.reduce((b, m) => b * m.shareBoost, 1);
  const ours = pull(live.score, state.apiPrice) * Math.sqrt(state.reputation / 50) * boost;
  let total = ours;
  for (const r of state.rivals) {
    const def = content.rivals.find((d) => d.id === r.id);
    if (def) total += pull(r.score, def.apiPrice);
  }
  return marketSize(state.week) * (ours / total);
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
