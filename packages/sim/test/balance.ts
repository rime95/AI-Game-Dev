// Headless balance runner: a scripted "careful player" over several seeds.
// Run: npx vite-node packages/sim/test/balance.ts [weeks] [seeds]
import { content } from '@stm/content';
import {
  applyCommand,
  bestScore,
  buyAllowance,
  contractCapacity,
  offerCheck,
  cloudSupply,
  createGame,
  deskStats,
  findSpot,
  findEquipmentSpot,
  rackUnits,
  serverLayout,
  stageDef,
  siteError,
  fabError,
  fabChipShare,
  lineCost,
  previewChip,
  previewAgi,
  bestCapability,
  modelFitsOnServer,
  stageUpgradeCost,
  FAB_STAGES,
  type FabStageId,
  labSeating,
  moveCheck,
  freeChips,
  fundingCheck,
  getChip,
  maxClusterChips,
  ownedPowerMW,
  powerDrawMW,
  previewTraining,
  rentedChips,
  TUNING,
  totalUsers,
  weeklyNet,
  type Command,
  type GameState,
  type TrainingSpec,
} from '../src';
import type { Chip, Precision } from '@stm/content';

const WEEKS = Number(process.argv[2] ?? 260);
const SEEDS = Number(process.argv[3] ?? 3);
const VERBOSE = SEEDS === 1;

const act = (s: GameState, cmd: Command): GameState => applyCommand(s, content, cmd).state;

const TARGET_WEEKS = 8;
/** Training budget for rung r: the first run's FLOPs × 6^r, with no end. */
const BASE_FLOPS = 6 * 7e9 * 140e9;
const rungFlops = (r: number) => BASE_FLOPS * Math.pow(6, r);
const PARAM_OPTIONS = [1, 3, 7, 13, 34, 70, 180, 400, 700, 1000, 1500, 2000, 3000, 5000];

/**
 * Best run for a FLOP budget on this chip: try dense and MoE at every size our chips can still serve
 * (weights must fit in one 8-chip server), spend the budget on tokens, keep the highest projected capability.
 */
function planRun(s: GameState, flops: number, chipId: string, chipCount: number, name: string): TrainingSpec | null {
  const chip = getChip(content, chipId, s);
  if (!chip) return null;
  const precisions: Precision[] = chip.tflops.fp8 > 0 ? ['fp8'] : ['fp16'];
  let best: { spec: TrainingSpec; cap: number } | null = null;
  for (const arch of content.archs)
    for (const precision of precisions)
      for (const paramsB of PARAM_OPTIONS) {
        if (!modelFitsOnServer(chip, paramsB, precision)) continue;
        const tokensB = Math.round(flops / (6 * paramsB * 1e9 * arch.activeParamFraction) / 1e9);
        if (tokensB < paramsB) continue; // badly undertrained
        const spec: TrainingSpec = { name, archId: arch.id, paramsB, tokensB, precision, chipId, chipCount };
        const cap = previewTraining({ ...s, dataTokensB: Math.max(s.dataTokensB, tokensB) }, content, spec).projectedCapability;
        if (!best || cap > best.cap) best = { spec, cap };
      }
  return best?.spec ?? null;
}

/** The chip to buy in bulk: Kite K2 or our newest custom design, whichever is cheaper per FP8 TFLOP. */
function bulkChip(s: GameState): Chip {
  const k2 = getChip(content, 'kite-k2')!;
  const ours = s.customChips.at(-1);
  if (!ours) return k2;
  const perTF = (c: Chip) => c.priceUsd / Math.max(1, c.tflops.fp8 || c.tflops.fp16);
  return perTF(ours) < perTF(k2) ? ours : k2;
}

function acquireChips(s: GameState, need: number, keepCash: number): GameState {
  // 1) Rent K1 up to cloud supply. 2) Buy K2 if power and cash allow (upgrading power if needed).
  const k1 = getChip(content, 'kite-k1')!;
  const k2 = bulkChip(s);
  const free = () => [...content.chips, ...s.customChips].reduce((n, c) => n + freeChips(s, c.id), 0);
  let missing = need - free();
  if (missing <= 0) return s;
  const canRent = Math.max(0, cloudSupply(k1, s.week) - rentedChips(s, k1.id));
  if (canRent > 0) {
    s = act(s, { type: 'rentChips', chipId: k1.id, count: Math.min(missing, canRent) });
    missing = need - free();
  }
  if (missing > 0) {
    const room = Math.floor((s.powerCapMW - ownedPowerMW(s, content)) / powerDrawMW(k2, 1));
    const affordable = Math.floor((s.cash - keepCash) / k2.priceUsd);
    const buy = Math.min(missing, room, affordable, buyAllowance(s, k2));
    if (buy >= 8) s = act(s, { type: 'buyChips', chipId: k2.id, count: buy });
    if (room < missing && !s.license.power.upgrade) s = act(s, { type: 'upgradeLicense', track: 'power' });
  }
  return s;
}

const DESIGN_SPLIT = { compute: 0.52, sram: 0.12, memory: 0.28, interconnect: 0.08 };
const tapedNodes = (s: GameState) => new Set(Object.values(s.customChipInfo).map((i) => i.design.nodeId));

/** Hire hardware engineers once we have an office, and tape out a design on each new node. */
function siliconProgram(s: GameState): GameState {
  if (s.hq.stage === 'garage' || s.cash < 40_000_000) return s;
  const wantEng = s.fab || s.roundsRaised >= 3 ? 6 : 4;
  while (s.staff.hardwareEng < wantEng && s.cash > 40_000_000) s = furnish(act(s, { type: 'hire', discipline: 'hardwareEng' }));
  if (s.chipProject) return s;
  const open = content.nodes.filter((n) => s.week >= n.availableFromWeek && !tapedNodes(s).has(n.id));
  const node = open.at(-1);
  if (!node || s.cash < node.tapeoutCost * 3) return s;
  const design = { name: `S${s.customChips.length + 1} ${node.name}`, nodeId: node.id, split: DESIGN_SPLIT, fp8: true, fp4: false };
  if (previewChip(s, content, design).errors.length) return s;
  return act(s, { type: 'startTapeout', design });
}

/** Build the fab when we qualify, fill bays, keep lines on our newest design, and widen bottlenecks. */
function fabProgram(s: GameState): GameState {
  const try_ = (cmd: Command) => {
    const r = applyCommand(s, content, cmd);
    if (!r.error) s = r.state;
    return !r.error;
  };
  if (!s.fab) {
    if (!fabError(s, content) && s.cash > content.fab.buildCost * 1.5) try_({ type: 'buildFab' });
    return s;
  }
  if (s.fab.status !== 'online') return s;
  // Newest design per node.
  const newest = new Map<string, string>();
  for (const c of s.customChips) newest.set(s.customChipInfo[c.id]!.design.nodeId, c.id);
  const bestNode = [...newest.keys()].sort((a, b) => content.nodes.findIndex((n) => n.id === b) - content.nodes.findIndex((n) => n.id === a))[0];
  if (!bestNode) return s;
  if (s.fab.lines.length < 6 && s.cash > lineCost(content, bestNode) * 3) try_({ type: 'addFabLine', nodeId: bestNode });
  for (const line of s.fab.lines) {
    if (line.status !== 'running') continue;
    if (line.nodeId !== bestNode && s.cash > lineCost(content, bestNode) * 2) {
      try_({ type: 'retoolFabLine', lineId: line.id, nodeId: bestNode });
      continue;
    }
    // Only order fab chips for the fleet when we can afford to; otherwise sell everything.
    const quota = s.cash > 3_000_000_000 ? 1000 : 0;
    if ((line.fleetQuota ?? 2000) !== quota) try_({ type: 'setFabLineMode', lineId: line.id, mode: 'fleet', fleetQuota: quota });
    const want = newest.get(line.nodeId);
    if (want && line.chipId !== want) try_({ type: 'setFabLineChip', lineId: line.id, chipId: want });
    const b = line.lastWeek?.bottleneck;
    if (b && (FAB_STAGES as string[]).includes(b) && s.cash > stageUpgradeCost(content, line) * 4)
      try_({ type: 'upgradeFabStage', lineId: line.id, stage: b as FabStageId });
  }
  return s;
}

/** Keep the HQ furnished: move up when it is affordable, then labs, desks and break rooms. */
function furnish(s: GameState): GameState {
  const mc = moveCheck(s, content);
  if (!mc.error && mc.stage && s.cash > mc.stage.moveCost * 1.5 + 5_000_000) {
    s = act(s, { type: "moveHq" });
    if (VERBOSE) console.log(`  wk ${s.week}: moved to ${s.hq.stage}`);
  }
  const place = (templateId: string): boolean => {
    const spot = findSpot(s, content, templateId);
    if (!spot) return false;
    const res = applyCommand(s, content, { type: 'placeRoom', templateId, ...spot });
    if (res.error) return false;
    s = res.state;
    return true;
  };
  // Rooms that unlock funding rounds and license levels.
  const has = (id: string) => s.hq.rooms.some((r) => r.templateId === id);
  if (s.roundsRaised >= 1 && !has('boardroom')) place('boardroom');
  if (s.hq.stage !== 'garage' && s.cash > 5_000_000) {
    if (!has('legalOffice')) place('legalOffice');
    if (!has('secureVault')) place('secureVault');
  }
  for (const t of content.hq.rooms.filter((r) => r.seats)) {
    const d = t.seats!.discipline;
    while (labSeating(s, content, d).reduce((n, l) => n + l.seats, 0) < s.staff[d] && place(t.id));
  }
  while (deskStats(s, content).crowding > 1 && place('deskPod'));
  while (deskStats(s, content).breakCoverage < 1 && place('breakRoom'));
  return buildSites(buildServers(s));
}

/** Open data center campuses when colocation fees pile up; fill halls, add halls and ops centers. */
function buildSites(s: GameState): GameState {
  const try_ = (cmd: Command) => {
    const r = applyCommand(s, content, cmd);
    if (!r.error) s = r.state;
    return !r.error;
  };
  const colo = serverLayout(s, content).colo;
  const building = s.sites.some((x) => x.status === 'building' || x.halls.some((h) => h.status === 'building'));
  if (colo > 2000 && !building && s.cash > 120_000_000) {
    const site = s.sites.find((x) => x.status === 'online' && x.halls.length < content.sites.maxHalls);
    if (site) try_({ type: 'addHall', siteId: site.id });
    else {
      const loc = [...content.sites.locations].sort((a, b) => a.buildCost - b.buildCost).find((l) => !siteError(s, content, l.id));
      if (loc) try_({ type: 'buildSite', locationId: loc.id });
    }
  }
  for (const site of s.sites) {
    if (site.status !== 'online') continue;
    if (!site.opsCenter && s.cash > 50_000_000) try_({ type: 'buildOpsCenter', siteId: site.id });
    for (const hall of site.halls)
      if (hall.status === 'online' && hall.equipment.length === 0 && s.cash > 100_000_000)
        try_({ type: 'fillHall', hallId: hall.id, coolingId: s.license.power.level >= 2 ? 'coolLiquid' : 'coolAir' });
  }
  return s;
}

/** Rack owned chips at HQ (saves colocation fees): server room, racks, then enough power and cooling. */
function buildServers(s: GameState): GameState {
  const equip = (equipId: string): boolean => {
    const spot = findEquipmentSpot(s, content, equipId);
    if (!spot) return false;
    const res = applyCommand(s, content, { type: 'placeEquipment', equipId, ...spot });
    if (res.error) return false;
    s = res.state;
    return true;
  };
  const owned = s.fleet.filter((f) => f.owned).reduce((n, f) => n + f.count, 0);
  if (!owned || s.cash < 3_000_000) return s;
  const maxRacks = stageDef(content, s.hq.stage).maxRacks;
  if (!s.hq.rooms.some((r) => r.templateId.startsWith('serverRoom'))) {
    const spot = findSpot(s, content, 'serverRoomLarge') ? 'serverRoomLarge' : 'serverRoom';
    const at = findSpot(s, content, spot);
    if (at) s = act(s, { type: 'placeRoom', templateId: spot, ...at });
  }
  while (rackUnits(s, content) < Math.min(maxRacks, Math.ceil(owned / 32)) && equip('rack'));
  for (let i = 0; i < 20; i++) {
    const layout = serverLayout(s, content);
    const room = layout.rooms[0];
    if (!room) break;
    const wantKW = Math.min(layout.buildingKW, owned) ; // racks want ~1 kW per chip
    if (room.powerKW < Math.min(wantKW, rackUnits(s, content) * 32)) { if (!equip('pdu')) break; continue; }
    if (room.throttle < 1) { if (!(s.license.power.level >= 2 && equip('coolLiquid')) && !equip('coolAir')) break; continue; }
    break;
  }
  return s;
}

function bestTrainingChip(s: GameState): { id: string; free: number } {
  const options = [...content.chips, ...s.customChips].map((c) => ({ id: c.id, free: freeChips(s, c.id), fp8: c.tflops.fp8 }));
  options.sort((a, b) => b.free * b.fp8 - a.free * a.fp8);
  return options[0]!;
}

function play(seed: number) {
  let s = createGame(content, seed);
  let rung = 0;
  let waited = 0;
  const milestones: string[] = [];
  for (let w = 0; w < WEEKS && s.status === 'playing'; w++) {
    if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id });

    s = furnish(s);
    s = siliconProgram(s);
    s = fabProgram(s);

    // Endgame: max out Safety, then commit to the AGI Program.
    if (!s.agi && !s.victory && bestCapability(s) >= TUNING.agiCapability - 0.3) {
      const maxSafety = content.license.tracks.find((t) => t.id === 'safety')!.levels.length;
      if (s.license.safety.level < maxSafety && !s.license.safety.upgrade) s = act(s, { type: 'upgradeLicense', track: 'safety' });
      const chip = bestTrainingChip(s);
      const count = Math.max(TUNING.agiMinChips, Math.min(chip.free, 100_000));
      if (
        s.license.safety.level >= maxSafety &&
        !s.training &&
        s.cash > TUNING.agiCost + 1_000_000_000 &&
        !previewAgi(s, content, chip.id, count).errors.length
      ) {
        s = act(s, { type: 'startAgiProgram', chipId: chip.id, chipCount: count });
        milestones.push(`wk${s.week} AGI Program`);
      }
    }

    // Pricing: when hosting and power eat most of the API revenue, charge more (and ease off when users leave).
    const lwk = s.lastWeek;
    if (lwk && s.week % 4 === 0 && lwk.revenue > 0) {
      const hosting = lwk.colocation + lwk.power + lwk.sites + lwk.rent;
      if (hosting > lwk.revenue * 0.5 && s.apiPrice < 40) s = act(s, { type: 'setApiPrice', price: Math.round(s.apiPrice * 1.15 * 100) / 100 });
      else if (hosting < lwk.revenue * 0.15 && s.apiPrice > 6) s = act(s, { type: 'setApiPrice', price: Math.round(s.apiPrice * 0.95 * 100) / 100 });
    }

    // Raise money whenever investors will take our call.
    const f = fundingCheck(s, content);
    if (f.canRaise) {
      s = act(s, { type: 'raiseFunding' });
      milestones.push(`wk${s.week} ${f.round!.name}`);
    }

    // Keep serving capacity ahead of demand.
    const lw = s.lastWeek;
    if (lw && s.liveModelId && lw.demandTokens > lw.servingCapacityTokens * 0.9) {
      const perChip = lw.servingCapacityTokens / Math.max(1, content.chips.reduce((n, c) => n + freeChips(s, c.id), 0));
      const extra = perChip > 0 ? Math.ceil((lw.demandTokens * 1.3 - lw.servingCapacityTokens) / perChip) : 64;
      const freeNow = content.chips.reduce((n, c) => n + freeChips(s, c.id), 0);
      s = acquireChips(s, freeNow + Math.min(extra, 20000), 2_000_000);
    }

    // Next training run: the next rung's FLOP budget, sized to finish in ~TARGET_WEEKS, shaped by the planner.
    if (!s.training) {
      const flops = rungFlops(rung);
      const bulk = bulkChip(s);
      const perChipWeek = bulk.tflops.fp8 * 1e12 * 0.45 * TUNING.secondsPerWeek;
      const want = Math.max(64, Math.ceil(flops / (perChipWeek * TARGET_WEEKS)));
      for (let before = -1; maxClusterChips(s) < want && maxClusterChips(s) > before && s.cash > 1_000_000; ) {
        before = maxClusterChips(s);
        s = furnish(act(s, { type: 'hire', discipline: 'modelEng' }));
      }
      // A run uses one chip type: build up a cluster of our bulk chip (bought over several weeks if
      // allocation-limited), falling back to rented K1 early on.
      if (want > 256) {
        const missing = want - freeChips(s, bulk.id);
        if (missing > 0) {
          const room = Math.floor((s.powerCapMW - ownedPowerMW(s, content)) / powerDrawMW(bulk, 1));
          const buy = Math.min(missing, room, buyAllowance(s, bulk), Math.floor((s.cash - 50_000_000) / bulk.priceUsd));
          if (buy >= 8) s = act(s, { type: 'buyChips', chipId: bulk.id, count: buy });
          if (room < missing && !s.license.power.upgrade) s = act(s, { type: 'upgradeLicense', track: 'power' });
        }
      } else {
        s = acquireChips(s, want, 2_000_000);
      }
      const chip = bestTrainingChip(s);
      const spec = planRun(s, flops, chip.id, Math.min(chip.free, maxClusterChips(s)), `G${rung + 1}`);
      if (spec) {
        const dataCost = Math.max(0, spec.tokensB - s.dataTokensB) * TUNING.dataCostPerBillionTokens;
        if (s.cash > dataCost * 1.5 + 1_000_000) {
          if (dataCost > 0) s = act(s, { type: 'buyData', billions: spec.tokensB - s.dataTokensB });
          let p = previewTraining(s, content, spec);
          for (const r of p.requirements) if (r.gap > 0 && !s.license[r.track].upgrade) s = act(s, { type: 'upgradeLicense', track: r.track });
          p = previewTraining(s, content, spec);
          // Wait (up to 12 weeks) for license upgrades rather than ship into incidents.
          const gapped = p.requirements.some((r) => r.gap > 0 && s.license[r.track].upgrade);
          if (gapped && waited < 12) {
            waited++;
            p = { ...p, errors: [...p.errors, 'waiting for license upgrades'] };
          }
          if (VERBOSE && s.week % 13 === 0 && (p.errors.length || p.weeks > TARGET_WEEKS * 3))
            console.log(`  wk ${s.week}: waiting on ${spec.name}: ${p.errors.join('; ') || `${p.weeks} wk on ${spec.chipCount} chips`} (power ${ownedPowerMW(s, content).toFixed(1)}/${s.powerCapMW} MW, cash ${(s.cash / 1e6).toFixed(1)}M)`);
          if (!p.errors.length && p.weeks <= TARGET_WEEKS * 3) {
            s = act(s, { type: 'startTraining', spec });
            if (VERBOSE)
              console.log(`  wk ${s.week}: start ${spec.name} ${spec.archId} ${spec.paramsB}B×${spec.tokensB}B on ${spec.chipCount} ${spec.chipId} → ${p.projectedScore.toFixed(1)}, ${p.weeks} wk`);
            rung++;
            waited = 0;
          }
        }
      }
    }

    // Products: launch the app once there's a decent model, sign every enterprise deal we qualify for.
    if (!s.consumer.launched && s.liveModelId && s.cash > 15_000_000) s = act(s, { type: 'launchConsumerApp' });
    for (const o of [...s.offers]) {
      if (s.contracts.length >= contractCapacity(s) && s.cash > 2_000_000) {
        const hired = furnish(act(s, { type: 'hire', discipline: 'product' }));
        if (contractCapacity(hired) > contractCapacity(s)) s = hired; // only hire if they get a seat
      }
      if (offerCheck(s, content, o).canAccept) s = act(s, { type: 'acceptOffer', offerId: o.id });
    }

    // Hire a researcher whenever comfortably profitable.
    if (weeklyNet(s) > 200_000 && s.staff.research < 20) s = act(s, { type: 'hire', discipline: 'research' });

    s = act(s, { type: 'advanceWeek' });
    if (VERBOSE && s.week % 13 === 0) {
      const l = s.lastWeek!;
      const top = Math.max(...s.rivals.map((r) => r.score));
      console.log(
        `  wk ${s.week}: cash ${(s.cash / 1e6).toFixed(1)}M users ${(s.users / 1e6).toFixed(1)}M net/wk ${(weeklyNet(s) / 1e6).toFixed(2)}M ` +
          `best ${bestScore(s).toFixed(1)} top rival ${top.toFixed(1)} suite v${s.suite.version} served ${((l.servedTokens / Math.max(1, l.demandTokens)) * 100).toFixed(0)}% ` +
          `chips ${s.fleet.reduce((n, x) => n + x.count, 0)} own ${(s.ownership * 100).toFixed(0)}%` +
          (s.fab ? ` fab -${(l.fabCosts / 1e6).toFixed(0)}M +${(l.fabSales / 1e6).toFixed(0)}M lines ${s.fab.lines.map((x) => `${x.nodeId}:${x.lastWeek?.chips ?? 0}/${x.lastWeek?.bottleneck ?? x.status}`).join(' ')}` : '') +
          ` live ${s.models.find((m) => m.id === s.liveModelId)?.name} rep ${s.reputation.toFixed(0)} price ${s.apiPrice} rev ${(l.revenue / 1e6).toFixed(0)}M power ${(l.power / 1e6).toFixed(1)}M sites ${(l.sites / 1e6).toFixed(1)}M colo ${(l.colocation / 1e6).toFixed(1)}M sal ${(l.salaries / 1e6).toFixed(1)}M upkeep ${(l.licenseUpkeep / 1e6).toFixed(1)}M`,
      );
    }
  }
  const top = Math.max(...s.rivals.map((r) => r.score));
  return {
    seed,
    status: s.status,
    week: s.week,
    cashM: Math.round(s.cash / 1e6),
    usersM: Math.round(totalUsers(s) / 1e5) / 10,
    appM: Math.round(s.consumer.users / 1e5) / 10,
    contracts: s.contracts.length,
    best: bestScore(s).toFixed(1),
    topRival: top.toFixed(1),
    rank: 1 + s.rivals.filter((r) => r.score > bestScore(s)).length,
    silicon: `${s.customChips.length} designs (${s.customChips.map((c) => `${c.name} $${Math.round(c.priceUsd)}`).join(', ')}), fab ${s.fab ? `${s.fab.status} ${s.fab.lines.length} lines, ${Math.round(fabChipShare(s) * 100)}% of owned chips` : 'none'}`,
    victory: s.victory ? `${s.victory.kind} wk${s.victory.week}` : 'none',
    sites: `${s.sites.length} campuses, ${s.sites.reduce((n, x) => n + x.halls.length, 0)} halls, colo ${serverLayout(s, content).colo}`,
    hq: `${s.hq.stage} ${deskStats(s, content).headcount}/${deskStats(s, content).capacity} morale ${s.hq.morale.toFixed(0)}`,
    milestones: milestones.join(', '),
  };
}

const FIRST = Number(process.argv[4] ?? 1);
for (let seed = FIRST; seed < FIRST + SEEDS; seed++) {
  if (VERBOSE) console.log(`seed ${seed}`);
  console.log(play(seed * 101));
}
