import type { Content, Discipline, Effects, GameEvent } from '@stm/content';
import type { Command, CommandResult, GameState, LogKind, PendingEvent } from './types';
import { TUNING } from './tuning';
import { pickWeighted, rand, randInt } from './rng';
import { clusterFlopsPerSecond, powerDrawMW } from './formulas';
import { equipmentDef, equipmentPlacement, ownedChipCosts } from './servers';
import { fillPlan, findHall, hallPlacementError, locationDef, siteError, sitesUpkeep, tickSites } from './sites';
import { fabChipShare, fabError, fabPowerMW, lineCost, newFab, newLine, stageUpgradeCost, tickFab } from './fab';
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
  bestCapability,
  buyAllowance,
  servingCapacityTokens,
} from './selectors';
import { capabilityForScore } from './formulas';
import { fundingCheck } from './funding';
import { isUserLeader, leadsEval, marketShares, previewAgi, VICTORY_TEXT } from './victory';
import type { Integration, TrainingRun, VictoryKind } from './types';
import { checkpointCapability, runFlopsPerWeek, runIncidentRates, runProgress } from './training';
import { availableDeals } from './acquisitions';
import {
  consumerTarget,
  consumerWeeklyRevenue,
  enterpriseSeats,
  enterpriseWeeklyRevenue,
  generateOffer,
  offerCheck,
} from './products';
import {
  deskStats,
  effectiveStaff,
  facilitiesCost,
  footprint,
  initialHq,
  lowerName,
  missingRoomFor,
  moveCheck,
  placementError,
  refreshHq,
  templateDef,
  tickHq,
  upgradeCost,
} from './hq';

export function createGame(content: Content, seed: number, companyName = 'Your lab'): GameState {
  const state: GameState = {
    version: 16,
    sites: [],
    fab: null,
    companyName: companyName.trim() || 'Your lab',
    hq: initialHq(content),
    consumer: { launched: false, subPrice: TUNING.startSubPrice, users: 0 },
    offers: [],
    contracts: [],
    acquired: [],
    integrations: [],
    ipBonus: 0,
    extraPowerMW: 0,
    victory: null,
    leaderStreak: 0,
    agi: null,
    ownership: TUNING.startOwnership,
    roundsRaised: 0,
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
    customChipInfo: {},
    purchasedThisWeek: {},
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
  log(state, 'info', `${state.companyName} begins: three people, a garage and $8M from early investors. First job: rent some chips and train a model.`);
  state.history.push({ week: 0, cash: state.cash, users: 0, bestScore: 0 });
  refreshHq(state, content);
  return state;
}

/** Apply one player command. Never mutates the input state. */
export function applyCommand(prev: GameState, content: Content, cmd: Command): CommandResult {
  const res = runCommand(prev, content, cmd);
  if (res.state !== prev) refreshHq(res.state, content);
  return res;
}

function runCommand(prev: GameState, content: Content, cmd: Command): CommandResult {
  if (cmd.type === 'continuePlaying') {
    if (prev.status !== 'won') return { state: prev, error: 'Nothing to continue.' };
    return { state: { ...structuredClone(prev), status: 'playing' } };
  }
  if (prev.status !== 'playing') return { state: prev, error: 'The game is over.' };
  const state = structuredClone(prev);
  const fail = (error: string): CommandResult => ({ state: prev, error });

  switch (cmd.type) {
    case 'releaseCheckpoint': {
      const run = state.training;
      if (!run) return fail('No training run in progress.');
      if (runProgress(run) < TUNING.checkpointMinProgress)
        return fail(`Checkpoints are only worth shipping after ${Math.round(TUNING.checkpointMinProgress * 100)}% of training.`);
      releaseRun(state, content, run, checkpointCapability(run), true);
      return { state };
    }

    case 'launchConsumerApp': {
      if (state.consumer.launched) return fail('The app is already live.');
      if (state.staff.product < 1) return fail('Hire a product manager first.');
      if (!state.liveModelId) return fail('We need a released model to power the app.');
      if (state.cash < TUNING.consumerLaunchCost) return fail('Not enough cash.');
      state.cash -= TUNING.consumerLaunchCost;
      state.consumer.launched = true;
      log(state, 'good', 'Our consumer app is live in the app stores.');
      return { state };
    }

    case 'setSubPrice': {
      if (!(cmd.price >= 1 && cmd.price <= 500)) return fail('Subscription must be between $1 and $500 a month.');
      state.consumer.subPrice = cmd.price;
      return { state };
    }

    case 'acceptOffer': {
      const offer = state.offers.find((o) => o.id === cmd.offerId);
      if (!offer) return fail('That offer has expired.');
      const check = offerCheck(state, content, offer);
      if (!check.canAccept) return fail(`Can't sign yet: ${check.checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}.`);
      state.offers = state.offers.filter((o) => o.id !== offer.id);
      state.contracts.push({
        id: offer.id,
        client: offer.client,
        sector: offer.sector,
        seats: offer.seats,
        pricePerSeat: offer.pricePerSeat,
        termWeeks: offer.termWeeks,
        weeksLeft: offer.termWeeks,
      });
      log(state, 'good', `Signed ${offer.client}: ${offer.seats.toLocaleString('en-US')} of their staff will use us for ${offer.termWeeks} weeks.`);
      return { state };
    }

    case 'declineOffer': {
      state.offers = state.offers.filter((o) => o.id !== cmd.offerId);
      return { state };
    }

    case 'acquire': {
      const deal = availableDeals(state, content).find((d) => d.id === cmd.dealId);
      if (!deal) return fail('That company is not for sale right now.');
      if (deal.price > state.cash) return fail('Not enough cash.');
      state.cash -= deal.price;
      state.integrations.push({
        dealId: deal.id,
        name: deal.name,
        gives: deal.gives,
        rivalId: deal.rivalId,
        price: deal.price,
        weeksLeft: deal.integrationWeeks,
        totalWeeks: deal.integrationWeeks,
        antitrustChance: deal.antitrustChance,
        clashChance: deal.clashChance,
      });
      log(
        state,
        'good',
        `Agreed to acquire ${deal.name} for ${formatM(deal.price)}. Integration: ${deal.integrationWeeks} wk` +
          (deal.antitrustChance > 0 ? `, pending antitrust review.` : '.'),
      );
      return { state };
    }

    case 'startAgiProgram': {
      const p = previewAgi(state, content, cmd.chipId, cmd.chipCount);
      if (p.errors.length) return fail(p.errors[0]!);
      state.cash -= TUNING.agiCost;
      state.agi = {
        chipId: cmd.chipId,
        chipCount: Math.floor(cmd.chipCount),
        weeksLeft: TUNING.agiWeeks,
        totalWeeks: TUNING.agiWeeks,
        startedWeek: state.week,
      };
      log(state, 'good', `The AGI Program has begun: ${TUNING.agiWeeks} weeks on ${Math.floor(cmd.chipCount).toLocaleString('en-US')} chips.`);
      return { state };
    }

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
      const allowance = buyAllowance(state, chip);
      if (count > allowance)
        return fail(`${chip.vendor === 'Your lab' ? 'The foundry' : chip.vendor} can only ship ${allowance} more ${chip.name} this week.`);
      const cost = chip.priceUsd * count;
      if (cost > state.cash) return fail('Not enough cash.');
      const newDraw = ownedPowerMW(state, content) + powerDrawMW(chip, count);
      if (newDraw > state.powerCapMW) {
        return fail(`Not enough site power: needs ${newDraw.toFixed(2)} MW of ${state.powerCapMW} MW.`);
      }
      state.cash -= cost;
      state.purchasedThisWeek[chip.id] = (state.purchasedThisWeek[chip.id] ?? 0) + count;
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
      const desks = deskStats(state, content);
      if (desks.crowding > 1 && desks.headcount - 1 <= desks.capacity)
        log(state, 'bad', `We're out of desks: ${desks.headcount} people, ${desks.capacity} seats. Crowding slows everyone down. Build more in the HQ.`);
      return { state };
    }

    case 'placeRoom': {
      const t = templateDef(content, cmd.templateId);
      if (!t) return fail('Unknown room.');
      const rot = ((Math.floor(cmd.rot) % 4) + 4) % 4;
      const floor = cmd.floor ?? 0;
      const err = placementError(state, content, t.id, cmd.x, cmd.y, rot, floor);
      if (err) return fail(err);
      if (state.cash < t.cost) return fail('Not enough cash.');
      state.cash -= t.cost;
      state.hq.rooms.push({ id: `room-${state.nextId++}`, templateId: t.id, x: cmd.x, y: cmd.y, rot, floor, tier: 1, spent: t.cost });
      return { state };
    }

    case 'demolishRoom': {
      const room = state.hq.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return fail('Unknown room.');
      const inRoom = state.hq.equipment.filter((e) => e.roomId === room.id);
      const refund = (room.spent + inRoom.reduce((n, e) => n + e.spent, 0)) * TUNING.demolishRefund;
      state.cash += refund;
      state.hq.rooms = state.hq.rooms.filter((r) => r !== room);
      state.hq.equipment = state.hq.equipment.filter((e) => e.roomId !== room.id);
      log(state, 'info', `Cleared out the ${templateDef(content, room.templateId)?.name.toLowerCase() ?? 'room'} (${formatM(refund)} back).`);
      return { state };
    }

    case 'placeEquipment': {
      const def = equipmentDef(content, cmd.equipId);
      if (!def) return fail('Unknown equipment.');
      const rot = ((Math.floor(cmd.rot) % 4) + 4) % 4;
      if (cmd.hallId) {
        const err = hallPlacementError(state, content, cmd.hallId, def.id, cmd.x, cmd.y, rot);
        if (err) return fail(err);
        if (state.cash < def.cost) return fail('Not enough cash.');
        state.cash -= def.cost;
        findHall(state, cmd.hallId)!.hall.equipment.push({ id: `eq-${state.nextId++}`, equipId: def.id, roomId: cmd.hallId, x: cmd.x, y: cmd.y, rot, spent: def.cost });
        return { state };
      }
      const { error, roomId } = equipmentPlacement(state, content, def.id, cmd.x, cmd.y, rot, cmd.floor ?? 0);
      if (error || !roomId) return fail(error ?? 'Equipment goes inside a server room.');
      if (state.cash < def.cost) return fail('Not enough cash.');
      state.cash -= def.cost;
      state.hq.equipment.push({ id: `eq-${state.nextId++}`, equipId: def.id, roomId, x: cmd.x, y: cmd.y, rot, spent: def.cost });
      return { state };
    }

    case 'demolishEquipment': {
      const eq = state.hq.equipment.find((e) => e.id === cmd.equipmentId);
      if (eq) {
        state.cash += eq.spent * TUNING.demolishRefund;
        state.hq.equipment = state.hq.equipment.filter((e) => e !== eq);
        return { state };
      }
      for (const site of state.sites)
        for (const hall of site.halls) {
          const he = hall.equipment.find((e) => e.id === cmd.equipmentId);
          if (!he) continue;
          state.cash += he.spent * TUNING.demolishRefund;
          hall.equipment = hall.equipment.filter((e) => e !== he);
          return { state };
        }
      return fail('Unknown equipment.');
    }

    case 'buildSite': {
      const loc = locationDef(content, cmd.locationId);
      const err = siteError(state, content, cmd.locationId);
      if (err || !loc) return fail(err ?? 'Unknown location.');
      if (state.cash < loc.buildCost) return fail('Not enough cash.');
      state.cash -= loc.buildCost;
      const id = `site-${state.nextId++}`;
      const halls = Array.from({ length: content.sites.startHalls }, () => ({
        id: `hall-${state.nextId++}`,
        status: 'building' as const,
        weeksLeft: loc.buildWeeks,
        equipment: [],
      }));
      state.sites.push({ id, locationId: loc.id, name: loc.name, status: 'building', weeksLeft: loc.buildWeeks, totalWeeks: loc.buildWeeks, halls, opsCenter: false });
      log(state, 'good', `Breaking ground on our ${state.sites.length === 1 ? 'first' : 'next'} data center campus at ${loc.name} (${loc.region}): ${loc.buildWeeks} weeks.`);
      return { state };
    }

    case 'addHall': {
      const site = state.sites.find((s) => s.id === cmd.siteId);
      if (!site) return fail('Unknown site.');
      if (site.halls.length >= content.sites.maxHalls) return fail(`${site.name} has room for ${content.sites.maxHalls} halls.`);
      const hall = content.sites.hall;
      if (state.cash < hall.cost) return fail('Not enough cash.');
      state.cash -= hall.cost;
      site.halls.push({ id: `hall-${state.nextId++}`, status: 'building', weeksLeft: site.status === 'online' ? hall.weeks : Math.max(hall.weeks, site.weeksLeft), equipment: [] });
      log(state, 'info', `Building a new data hall at ${site.name} (${hall.weeks} weeks).`);
      return { state };
    }

    case 'buildOpsCenter': {
      const site = state.sites.find((s) => s.id === cmd.siteId);
      if (!site) return fail('Unknown site.');
      if (site.opsCenter) return fail('This campus already has an operations center.');
      const ops = content.sites.opsCenter;
      if (state.cash < ops.cost) return fail('Not enough cash.');
      state.cash -= ops.cost;
      site.opsCenter = true;
      log(state, 'info', `${site.name} has an operations center: technicians on site, fewer hardware failures.`);
      return { state };
    }

    case 'fillHall': {
      const found = findHall(state, cmd.hallId);
      if (!found) return fail('Unknown data hall.');
      const cool = equipmentDef(content, cmd.coolingId);
      if (!cool || cool.kind !== 'cooling') return fail('Pick a cooling type.');
      let placed = 0;
      for (const p of fillPlan(state, content, cmd.hallId, cool.id)) {
        if (hallPlacementError(state, content, cmd.hallId, p.equipId, p.x, p.y, p.rot)) continue;
        const def = equipmentDef(content, p.equipId)!;
        if (state.cash < def.cost) break;
        state.cash -= def.cost;
        found.hall.equipment.push({ ...p, id: `eq-${state.nextId++}`, roomId: cmd.hallId, spent: def.cost });
        placed++;
      }
      if (!placed) return fail(found.hall.status === 'online' && found.site.status === 'online' ? 'Nothing fits (or not enough cash).' : 'That hall is still under construction.');
      return { state };
    }

    case 'buildFab': {
      const err = fabError(state, content);
      if (err) return fail(err);
      if (state.cash < content.fab.buildCost) return fail('Not enough cash.');
      state.cash -= content.fab.buildCost;
      state.fab = newFab(content);
      log(state, 'good', `Construction of our own chip factory has begun: ${content.fab.buildWeeks} weeks to go.`);
      return { state };
    }

    case 'addFabLine': {
      const fab = state.fab;
      if (!fab || fab.status !== 'online') return fail('The factory isn\'t open yet.');
      if (fab.lines.length >= content.fab.bays) return fail(`All ${content.fab.bays} bays have lines.`);
      const node = content.nodes.find((n) => n.id === cmd.nodeId);
      if (!node) return fail('Unknown process node.');
      if (state.week < node.availableFromWeek) return fail(`${node.name} isn't available until week ${node.availableFromWeek}.`);
      const cost = lineCost(content, node.id);
      if (state.cash < cost) return fail('Not enough cash.');
      state.cash -= cost;
      const bay = [...Array(content.fab.bays).keys()].find((b) => !fab.lines.some((l) => l.bay === b))!;
      fab.lines.push(newLine(`line-${state.nextId++}`, bay, node.id, content.fab.line.weeks));
      log(state, 'info', `Installing a ${node.name} production line in bay ${bay + 1} (${content.fab.line.weeks} weeks).`);
      return { state };
    }

    case 'upgradeFabStage': {
      const line = state.fab?.lines.find((l) => l.id === cmd.lineId);
      if (!line) return fail('Unknown line.');
      if (!(cmd.stage in line.stages)) return fail('Unknown stage.');
      if (line.stages[cmd.stage] >= content.fab.line.maxStageLevel) return fail('That stage is fully built out.');
      const cost = stageUpgradeCost(content, line);
      if (state.cash < cost) return fail('Not enough cash.');
      state.cash -= cost;
      line.stages[cmd.stage] += 1;
      return { state };
    }

    case 'retoolFabLine': {
      const line = state.fab?.lines.find((l) => l.id === cmd.lineId);
      if (!line) return fail('Unknown line.');
      const node = content.nodes.find((n) => n.id === cmd.nodeId);
      if (!node) return fail('Unknown process node.');
      if (node.id === line.nodeId) return fail('The line already makes that generation.');
      if (state.week < node.availableFromWeek) return fail(`${node.name} isn't available until week ${node.availableFromWeek}.`);
      const cost = lineCost(content, node.id) * content.fab.line.retoolShare;
      if (state.cash < cost) return fail('Not enough cash.');
      state.cash -= cost;
      Object.assign(line, { nodeId: node.id, chipId: null, status: 'retooling', weeksLeft: content.fab.line.retoolWeeks, wafers: 0 });
      log(state, 'info', `Refitting line ${line.bay + 1} for ${node.name} chips (${content.fab.line.retoolWeeks} weeks). It will need practice again before most chips come out good.`);
      return { state };
    }

    case 'setFabLineChip': {
      const line = state.fab?.lines.find((l) => l.id === cmd.lineId);
      if (!line) return fail('Unknown line.');
      const info = state.customChipInfo[cmd.chipId];
      if (!info) return fail('Factory lines make our own chip designs.');
      if (info.design.nodeId !== line.nodeId) return fail('That chip was designed for a different chip generation.');
      line.chipId = cmd.chipId;
      return { state };
    }

    case 'setFabLineMode': {
      const line = state.fab?.lines.find((l) => l.id === cmd.lineId);
      if (!line) return fail('Unknown line.');
      line.mode = cmd.mode === 'sell' ? 'sell' : 'fleet';
      if (cmd.fleetQuota !== undefined) {
        if (!(cmd.fleetQuota >= 0)) return fail('Quota must be zero or more.');
        line.fleetQuota = Math.floor(cmd.fleetQuota);
      }
      return { state };
    }

    case 'clearHall': {
      const found = findHall(state, cmd.hallId);
      if (!found) return fail('Unknown data hall.');
      state.cash += found.hall.equipment.reduce((n, e) => n + e.spent, 0) * TUNING.demolishRefund;
      found.hall.equipment = [];
      return { state };
    }

    case 'upgradeRoom': {
      const room = state.hq.rooms.find((r) => r.id === cmd.roomId);
      const t = room && templateDef(content, room.templateId);
      if (!room || !t) return fail('Unknown room.');
      const cost = upgradeCost(t, room.tier);
      if (cost === null) return fail(`The ${t.name.toLowerCase()} is fully upgraded.`);
      if (state.cash < cost) return fail('Not enough cash.');
      state.cash -= cost;
      room.tier += 1;
      room.spent += cost;
      log(state, 'good', `${t.name} upgraded to tier ${room.tier}.`);
      return { state };
    }

    case 'moveHq': {
      const { stage, error } = moveCheck(state, content);
      if (error || !stage) return fail(error ?? 'Nowhere to move.');
      state.cash -= stage.moveCost;
      state.hq.stage = stage.id;
      state.hq.moveInWeeks = TUNING.moveInWeeks;
      // Rooms move with us at the same spots: every stage is at least as big as the one before.
      for (const room of state.hq.rooms) {
        const t = templateDef(content, room.templateId);
        if (!t) continue;
        const f = footprint(t, room.rot);
        const nx = Math.min(room.x, stage.w - f.w);
        const ny = Math.min(room.y, stage.h - f.h);
        for (const e of state.hq.equipment.filter((q) => q.roomId === room.id)) {
          e.x += nx - room.x;
          e.y += ny - room.y;
        }
        room.x = nx;
        room.y = ny;
      }
      log(state, 'good', `We moved into the ${lowerName(stage.name)}! Unpacking boxes this week.`);
      return { state };
    }

    case 'buyData': {
      const b = Math.floor(cmd.billions);
      if (!(b > 0)) return fail('Amount must be positive.');
      const cost = b * TUNING.dataCostPerBillionTokens;
      if (cost > state.cash) return fail('Not enough cash.');
      state.cash -= cost;
      state.dataTokensB += b;
      log(state, 'info', `Bought ${b}B tokens of training data (about ${(b * 1e4).toLocaleString('en-US')} books).`);
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
        capabilityDelta: 0,
        scandalChance: 0,
        incidents: 0,
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

    case 'raiseFunding': {
      const f = fundingCheck(state, content);
      if (!f.round) return fail('No more funding rounds.');
      if (!f.canRaise) return fail(`Investors aren't convinced yet: ${f.checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}.`);
      state.cash += f.round.cash;
      state.ownership -= f.equitySold;
      state.roundsRaised += 1;
      state.reputation = clampRep(state.reputation + 2);
      log(
        state,
        'good',
        `${f.round.name} closed: ${formatM(f.round.cash)} for ${Math.round(f.equitySold * 1000) / 10}% of the company. Founders now own ${Math.round(state.ownership * 1000) / 10}%.`,
      );
      return { state };
    }

    case 'upgradeLicense': {
      const t = state.license[cmd.track];
      if (!t) return fail('Unknown track.');
      if (t.upgrade) return fail('That upgrade is already underway.');
      const next = nextUpgrade(state, content, cmd.track);
      if (!next) return fail('Already at the highest level.');
      const room = missingRoomFor(state, content, { track: cmd.track, level: t.level + 1 });
      if (room) return fail(`${next.name} needs a ${room.name.toLowerCase()} at HQ first.`);
      if (next.cost > state.cash) return fail('Not enough cash.');
      state.cash -= next.cost;
      t.upgrade = { weeksLeft: next.weeks, totalWeeks: next.weeks };
      log(state, 'info', `Started: ${next.name} (${next.weeks} weeks).`);
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
      log(state, 'info', `Sent ${cmd.design.name.trim()} to the factory. The first chips come back in ${preview.tapeoutWeeks} weeks.`);
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
      applyEffects(state, content, choice.effects, ev.fabLineId);
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
    run.flopsDone += runFlopsPerWeek(state, content, run);
    if (run.flopsDone >= run.flopsTotal) {
      releaseRun(state, content, run, run.projectedCapability + run.capabilityDelta, false);
    } else if (!state.pendingEvent) {
      // Things go wrong in big training runs.
      const rates = runIncidentRates(state, content, run);
      const kinds = (['hardware', 'lossSpike', 'contamination'] as const).filter((k) => rand(state) < rates[k]);
      const kind = kinds[0];
      if (kind) {
        const ev = content.events.find((e) => e.trigger === 'training' && e.incident === kind);
        const chip = getChip(content, run.spec.chipId, state);
        if (ev) {
          run.incidents += 1;
          state.hq.morale = Math.max(0, state.hq.morale + TUNING.moraleOnIncident);
          state.pendingEvent = instantiate(ev, { model: run.spec.name, chip: chip?.name ?? 'chip' });
        }
      }
    }
  }

  // 0. New week, new vendor allocations
  state.purchasedThisWeek = {};

  // 1a. License to Scale upgrades
  for (const track of TRACK_IDS) {
    const t = state.license[track];
    if (!t.upgrade) continue;
    t.upgrade.weeksLeft -= 1;
    if (t.upgrade.weeksLeft <= 0) {
      t.level += 1;
      t.upgrade = null;
      const lvl = levelDef(content, track, t.level);
      if (lvl?.powerCapMW) state.powerCapMW = lvl.powerCapMW + state.extraPowerMW;
      log(state, 'good', `${trackDef(content, track).name} is now level ${t.level}: ${lvl?.name ?? ''}.`);
    }
  }

  // 1c. Acquisitions finishing integration
  for (const deal of state.integrations) deal.weeksLeft -= 1;
  for (const deal of state.integrations.filter((d) => d.weeksLeft <= 0)) completeAcquisition(state, deal);
  state.integrations = state.integrations.filter((d) => d.weeksLeft > 0);

  // 1b. Chip tape-out progress
  const project = state.chipProject;
  if (project) {
    project.weeksLeft -= 1;
    const node = content.nodes.find((n) => n.id === project.design.nodeId);
    if (project.weeksLeft <= 0 && node) {
      if (!project.respun && rand(state) < bugChance(node, effectiveStaff(state, 'hardwareEng'))) {
        const extra = Math.ceil(node.tapeoutWeeks * RESPIN_TIME_SHARE);
        const cost = node.tapeoutCost * RESPIN_COST_SHARE;
        project.respun = true;
        project.weeksLeft = extra;
        project.totalWeeks += extra;
        state.cash -= cost;
        log(state, 'bad', `The first ${project.design.name} chips have a bug. Fixing it and sending it again: ${extra} more weeks, ${formatM(cost)}.`);
      } else {
        const yieldRate = Math.max(0.3, Math.min(0.95, node.baseYield + (rand(state) - 0.5) * 0.2 + effectiveStaff(state, 'hardwareEng') * 0.01));
        const chip = deriveChip(node, project.design, `custom-${state.nextId++}`, yieldRate);
        state.customChips.push(chip);
        state.customChipInfo[chip.id] = { design: project.design, yieldRate };
        state.chipProject = null;
        log(state, 'good', `${chip.name} works! ${Math.round(yieldRate * 100)}% of chips come out good, at $${Math.round(chip.priceUsd).toLocaleString('en-US')} each. Order some in Compute.`);
      }
    }
  }

  // 2. Serving and revenue: API, consumer app and enterprise all share the same serving chips
  const capacity = servingCapacityTokens(state, content);
  const apiDemand = state.users * TUNING.tokensPerUserPerWeek;
  const consumerDemand = state.consumer.launched ? state.consumer.users * TUNING.consumerTokensPerUser : 0;
  const demand = apiDemand + consumerDemand + enterpriseSeats(state) * TUNING.enterpriseTokensPerSeat;
  const servedRatio = demand > 0 ? Math.min(1, capacity / demand) : 1;
  const served = demand * servedRatio;
  const apiRevenue = ((apiDemand * servedRatio) / 1e6) * state.apiPrice;
  const consumerRevenue = consumerWeeklyRevenue(state) * servedRatio;
  let enterpriseRevenue = enterpriseWeeklyRevenue(state);
  let slaPenalty = 0;
  if (state.contracts.length && servedRatio < TUNING.slaThreshold) {
    slaPenalty = enterpriseRevenue * TUNING.slaPenaltyShare;
    const cancelled = state.contracts.filter(() => rand(state) < TUNING.slaCancelChance);
    for (const c of cancelled) log(state, 'bad', `${c.client} cancelled their contract after we broke our uptime promise.`);
    state.contracts = state.contracts.filter((c) => !cancelled.includes(c));
    log(state, 'bad', `Broken uptime promise: we answered only ${Math.round(servedRatio * 100)}% of requests. ${formatM(slaPenalty)} refunded to business clients.`);
  }
  enterpriseRevenue -= slaPenalty;
  const revenue = apiRevenue + consumerRevenue + enterpriseRevenue;

  // 3. Costs
  const salaries = Object.values(state.staff).reduce((n, c) => n + c, 0) * TUNING.salaryPerWeek;
  let rent = 0;
  let power = 0;
  for (const f of state.fleet) {
    const chip = getChip(content, f.chipId, state);
    if (chip && !f.owned) rent += chip.rentPerWeekUsd * f.count;
  }
  const owned = ownedChipCosts(state, content);
  power += owned.power;
  const colocation = owned.colocation;
  const upkeep = licenseUpkeep(state, content);
  const licenseIncome = licenseRevenue(state, content);
  const fab = tickFab(state, content, ownedPowerMW(state, content) - fabPowerMW(state, content));
  for (const l of fab.logs) log(state, l.kind, l.text);
  if (fab.incident && !state.pendingEvent) {
    const ev = content.events.find((x) => x.trigger === 'fab' && x.fabIncident === fab.incident!.kind);
    const line = state.fab?.lines.find((l) => l.id === fab.incident!.lineId);
    if (ev && line) state.pendingEvent = { ...instantiate(ev, { line: `fab line ${line.bay + 1}` }), fabLineId: line.id };
  }
  const fac = facilitiesCost(state, content);
  const facilities = fac.rent + fac.upkeep;
  const siteCosts = sitesUpkeep(state, content);
  state.cash += revenue + licenseIncome - salaries - rent - power - upkeep - facilities - colocation - siteCosts - fab.costs + fab.sales;

  // 3b. HQ: morale drifts, move-in ends; sites: construction
  tickHq(state, content);
  for (const line of tickSites(state, content)) log(state, 'good', line);

  // 4. Users move toward the market share our model + price earn
  const target = targetUsers(state, content);
  const serviceFactor = Math.min(1, servedRatio + 0.1);
  state.users = Math.max(0, state.users + (target * serviceFactor - state.users) * TUNING.userConvergencePerWeek);
  if (state.consumer.launched) {
    const appTarget = consumerTarget(state, content) * serviceFactor;
    state.consumer.users = Math.max(0, state.consumer.users + (appTarget - state.consumer.users) * TUNING.consumerConvergencePerWeek);
  }
  if (servedRatio < 0.95 && demand > 0) {
    state.reputation = clampRep(state.reputation - TUNING.underServedReputationLoss);
    if (servedRatio < 0.8) log(state, 'bad', `We could only answer ${Math.round(servedRatio * 100)}% of requests. Users are waiting: free up or add chips.`);
  } else if (state.reputation < reputationCeiling(state)) {
    // Serving people well slowly rebuilds trust, up to a ceiling that our Safety and Compliance levels raise.
    state.reputation = Math.min(reputationCeiling(state), state.reputation + TUNING.reputationRecoveryPerWeek);
  }

  // 4b. Enterprise: contracts run their term; new offers arrive, old ones expire
  for (const c of state.contracts) c.weeksLeft -= 1;
  for (const c of state.contracts.filter((x) => x.weeksLeft <= 0)) {
    state.reputation = clampRep(state.reputation + 1);
    log(state, 'good', `Contract with ${c.client} completed its ${c.termWeeks}-week term.`);
  }
  state.contracts = state.contracts.filter((c) => c.weeksLeft > 0);
  state.offers = state.offers.filter((o) => o.expiresWeek > state.week + 1);
  if (state.liveModelId && state.offers.length < TUNING.maxOpenOffers && rand(state) < TUNING.offerChancePerWeek) {
    const offer = generateOffer(state, content);
    state.offers.push(offer);
    log(state, 'info', `New enterprise offer: ${offer.client} (${offer.sector}) wants us for ${offer.seats.toLocaleString('en-US')} of their staff.`);
  }

  // 5. Rivals
  for (const rival of state.rivals) {
    if (state.week + 1 < rival.nextReleaseWeek) continue;
    const def = content.rivals.find((r) => r.id === rival.id);
    if (!def) continue;
    rival.version += 1;
    // Labs that fall behind the leader scale harder (they're well funded too).
    const leader = Math.max(bestCapability(state), ...state.rivals.map((r) => r.capability));
    const catchUp = 1 + TUNING.rivalCatchUp * Math.max(0, leader - rival.capability);
    rival.capability += def.capabilityGain * catchUp * (0.7 + rand(state) * 0.6);
    rival.score = round1(scoreNow(state, rival.capability));
    rival.nextReleaseWeek = state.week + 1 + randInt(state, Math.ceil(def.releaseEveryWeeks * 0.7), Math.ceil(def.releaseEveryWeeks * 1.3));
    const modelName = `${def.modelPrefix} ${rival.version}`;
    log(state, 'rival', `${def.name} released ${modelName} (smarts ${rival.score}).`);
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
      log(state, 'bad', `We are out of cash. Bankrupt in ${TUNING.bankruptAfterNegativeWeeks - state.weeksNegative} weeks unless we turn it around.`);
    }
  } else {
    state.weeksNegative = 0;
  }

  state.week += 1;
  state.lastWeek = {
    revenue,
    apiRevenue,
    consumerRevenue,
    enterpriseRevenue,
    slaPenalty,
    salaries,
    rent,
    facilities,
    colocation,
    sites: siteCosts,
    fabCosts: fab.costs,
    fabSales: fab.sales,
    power,
    licenseUpkeep: upkeep,
    licenseRevenue: licenseIncome,
    demandTokens: demand,
    servedTokens: served,
    servingCapacityTokens: capacity,
    targetUsers: target,
  };
  state.history.push({ week: state.week, cash: state.cash, users: state.users, bestScore: bestScore(state) });

  // 9. Endgame: AGI Program and victory conditions
  if (state.status === 'playing') checkEndgame(state, content);
}

function checkEndgame(state: GameState, content: Content): void {
  const agi = state.agi;
  if (agi) {
    agi.weeksLeft -= 1;
    if (agi.weeksLeft <= 0) {
      state.agi = null;
      const maxSafety = trackDef(content, 'safety').levels.length;
      const catastrophe = Math.min(1, (maxSafety - state.license.safety.level) * TUNING.agiCatastrophePerMissingSafety);
      if (catastrophe > 0 && rand(state) < catastrophe) {
        state.status = 'catastrophe';
        log(state, 'bad', 'The AGI system slipped its constraints. Without a full safety case, nobody could stop it in time.');
        return;
      }
      win(state, catastrophe > 0 ? 'recklessFrontier' : 'safeFrontier');
      return;
    }
  }

  state.leaderStreak = isUserLeader(state, content) ? state.leaderStreak + 1 : 0;
  if (state.victory) return; // already won once; keep playing freely
  if (state.leaderStreak >= TUNING.marketLeaderWeeks) return win(state, 'marketLeader');
  const maxPower = trackDef(content, 'power').levels.length;
  if (fabChipShare(state) >= TUNING.fullStackCustomShare && state.license.power.level >= maxPower && leadsEval(state)) {
    win(state, 'fullStack');
  }
}

function completeAcquisition(state: GameState, deal: Integration): void {
  if (deal.antitrustChance > 0 && rand(state) < deal.antitrustChance) {
    const refund = deal.price * TUNING.blockedDealRefund;
    state.cash += refund;
    log(state, 'bad', `Regulators blocked our purchase of ${deal.name}. ${formatM(refund)} came back; the deposit is lost.`);
    return;
  }
  const g = deal.gives;
  const parts: string[] = [];
  if (g.staff?.length) {
    const clash = deal.clashChance > 0 && rand(state) < deal.clashChance;
    let joined = 0;
    for (const s of g.staff) {
      const kept = clash ? Math.floor(s.count * 0.5) : s.count;
      state.staff[s.discipline] += kept;
      joined += kept;
    }
    parts.push(`${joined} staff`);
    if (clash) {
      state.reputation = clampRep(state.reputation - 1);
      log(state, 'bad', `Culture clash at ${deal.name}: half of their team quit during the merger.`);
    }
  }
  if (g.dataTokensB) {
    state.dataTokensB += g.dataTokensB;
    parts.push(`${g.dataTokensB.toLocaleString('en-US')}B tokens of data`);
  }
  if (g.users) {
    state.users += g.users;
    parts.push(`${(g.users / 1e6).toFixed(1)}M users`);
  }
  if (g.ipBonus) {
    state.ipBonus += g.ipBonus;
    parts.push(`+${Math.round(g.ipBonus * 100)}% smarter training`);
  }
  if (g.powerMW) {
    state.extraPowerMW += g.powerMW;
    state.powerCapMW += g.powerMW;
    parts.push(`${g.powerMW} MW of power`);
  }
  if (g.chips) {
    addFleet(state, g.chips.chipId, g.chips.count, true);
    parts.push(`${g.chips.count.toLocaleString('en-US')} chips`);
  }
  if (deal.rivalId) {
    state.rivals = state.rivals.filter((r) => r.id !== deal.rivalId);
    parts.push('one less rival');
  }
  state.acquired.push(deal.dealId);
  log(state, 'good', `${deal.name} is now part of us: ${parts.join(', ')}.`);
}

function win(state: GameState, kind: VictoryKind): void {
  if (!state.victory) state.victory = { kind, week: state.week };
  state.status = 'won';
  log(state, 'good', `Victory: ${VICTORY_TEXT[kind].title}. ${VICTORY_TEXT[kind].body}`);
}

/** Users we'd converge to: market × our share of "pull" against rivals. */
export function targetUsers(state: GameState, content: Content): number {
  if (!liveModel(state)) return 0;
  return marketSize(state.week) * marketShares(state, content).you;
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
    `Smarts test v${old} is too easy now (top score ${round1(top)}). Harder test v${old + 1} replaces it: the best model now scores ${round1(newTop)}.`,
  );
}

/** A model shipped without the License to Scale requirements can trigger consequences per missing track. */
function rollLicenseConsequences(state: GameState, content: Content, tier: number, gaps: Record<TrackId, number>, name: string): void {
  const chance = (gap: number) => Math.min(0.9, gap * content.license.riskPerGap);
  if (gaps.safety > 0 && rand(state) < chance(gaps.safety)) {
    state.reputation = clampRep(state.reputation - 4 * gaps.safety);
    state.users *= 1 - 0.1 * gaps.safety;
    log(state, 'bad', `Safety incident: people tricked ${name} into saying harmful things. Reputation −${4 * gaps.safety}, users −${10 * gaps.safety}%.`);
  }
  if (gaps.compliance > 0 && rand(state) < chance(gaps.compliance)) {
    const fine = 1_000_000 * tier * gaps.compliance;
    state.cash -= fine;
    log(state, 'bad', `Regulators fined us ${formatM(fine)} for launching ${name} without the right paperwork.`);
  }
  if (gaps.environmental > 0 && rand(state) < chance(gaps.environmental)) {
    state.reputation = clampRep(state.reputation - 3 * gaps.environmental);
    const fine = 1_000_000 * gaps.environmental;
    state.cash -= fine;
    log(state, 'bad', `Permit violation: we used more water and power than allowed. ${formatM(fine)} fine, reputation −${3 * gaps.environmental}.`);
  }
}

/** Turn a training run into a released model (complete or from an early checkpoint). */
function releaseRun(state: GameState, content: Content, run: TrainingRun, capability: number, checkpoint: boolean): void {
  const id = `m${state.nextId++}`;
  state.models.push({
    id,
    name: run.spec.name,
    archId: run.spec.archId,
    paramsB: run.spec.paramsB,
    tokensB: run.spec.tokensB,
    precision: run.spec.precision,
    capability,
    score: round1(scoreNow(state, capability)),
    releasedWeek: state.week + 1,
  });
  log(
    state,
    'good',
    `${run.spec.name} is out${checkpoint ? ` early, ${Math.round(runProgress(run) * 100)}% trained` : ''}! It scores ${round1(scoreNow(state, capability))} smarts.`,
  );
  rollLicenseConsequences(state, content, run.tier, run.gaps, run.spec.name);
  if (run.scandalChance > 0 && rand(state) < run.scandalChance) {
    state.reputation = clampRep(state.reputation - 6);
    log(state, 'bad', `Researchers found test answers in ${run.spec.name}'s training data. Cheating scandal: reputation −6.`);
  }
  state.training = null;

  // A better model goes live, but only if our chips can actually serve it (weights must fit in one server).
  const live = liveModel(state);
  if (!live || capability > live.capability) {
    const previous = state.liveModelId;
    state.liveModelId = id;
    if (live && previous && servingCapacityTokens(state, content) === 0 && servingCapacityTokens({ ...state, liveModelId: previous }, content) > 0) {
      state.liveModelId = previous;
      log(state, 'bad', `${run.spec.name} is too big to serve on our chips: it doesn't fit in one server's memory. ${live.name} stays live. Get chips with more memory, then switch in Models.`);
    } else state.hq.morale = Math.min(100, state.hq.morale + TUNING.moraleOnRelease);
  }
}

function applyEffects(state: GameState, content: Content, e: Effects, fabLineId?: string): void {
  const line = fabLineId ? state.fab?.lines.find((l) => l.id === fabLineId) : undefined;
  if (line) {
    if (e.fabPauseWeeks) line.pausedWeeks = Math.max(line.pausedWeeks, e.fabPauseWeeks);
    if (e.fabYieldMult) line.yieldMult = e.fabYieldMult;
    if (e.fabSpeedMult) line.speedMult = e.fabSpeedMult;
    if ((e.fabYieldMult || e.fabSpeedMult) && e.fabWeeks) line.modWeeks = e.fabWeeks;
  }
  if (e.fabHbmMult && state.fab) {
    state.fab.hbmMult = e.fabHbmMult;
    state.fab.hbmWeeks = e.fabWeeks ?? 4;
  }
  const run = state.training;
  if (run) {
    if (e.runProgressWeeks) {
      run.flopsDone = Math.max(0, run.flopsDone + e.runProgressWeeks * runFlopsPerWeek(state, content, run));
    }
    if (e.runSpeedMult) run.speedFactor *= e.runSpeedMult;
    if (e.runCapabilityDelta) run.capabilityDelta += e.runCapabilityDelta;
    if (e.runCapabilityRiskChance && e.runCapabilityRiskDelta && rand(state) < e.runCapabilityRiskChance) {
      run.capabilityDelta += e.runCapabilityRiskDelta;
      log(state, 'bad', `${run.spec.name} never fully recovered from going off the rails. The final model will be weaker.`);
    }
    if (e.runCostPerChip) state.cash -= e.runCostPerChip * run.spec.chipCount;
    if (e.runScandalChance) run.scandalChance = Math.max(run.scandalChance, e.runScandalChance);
  }
  if (e.cash) state.cash += e.cash;
  if (e.reputation) state.reputation = clampRep(state.reputation + e.reputation);
  if (e.morale) state.hq.morale = Math.max(0, Math.min(100, state.hq.morale + e.morale));
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

/** How far reputation recovers on its own: a base, plus each Safety and Compliance level above 1. */
export function reputationCeiling(state: GameState): number {
  return TUNING.reputationRecoveryBase + TUNING.reputationPerTrustLevel * (state.license.safety.level - 1 + state.license.compliance.level - 1);
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const formatM = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(1)}M`);
