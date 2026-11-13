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

const WEEKS = Number(process.argv[2] ?? 260);
const SEEDS = Number(process.argv[3] ?? 3);
const VERBOSE = SEEDS === 1;

const act = (s: GameState, cmd: Command): GameState => applyCommand(s, content, cmd).state;

// Model ladder: each step roughly 5-10x the compute of the last.
const LADDER = [
  { paramsB: 7, tokensB: 140 },
  { paramsB: 13, tokensB: 260 },
  { paramsB: 34, tokensB: 680 },
  { paramsB: 70, tokensB: 1400 },
  { paramsB: 180, tokensB: 3600 },
  { paramsB: 400, tokensB: 8000 },
  { paramsB: 1000, tokensB: 20000 },
  { paramsB: 2000, tokensB: 40000 },
];
const TARGET_WEEKS = 8;

function acquireChips(s: GameState, need: number, keepCash: number): GameState {
  // 1) Rent K1 up to cloud supply. 2) Buy K2 if power and cash allow (upgrading power if needed).
  const k1 = getChip(content, 'kite-k1')!;
  const k2 = getChip(content, 'kite-k2')!;
  const free = () => content.chips.reduce((n, c) => n + freeChips(s, c.id), 0);
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

function bestTrainingChip(s: GameState): { id: string; free: number } {
  const options = content.chips.map((c) => ({ id: c.id, free: freeChips(s, c.id), fp8: c.tflops.fp8 }));
  options.sort((a, b) => b.free * b.fp8 - a.free * a.fp8);
  return options[0]!;
}

function play(seed: number) {
  let s = createGame(content, seed);
  let rung = 0;
  const milestones: string[] = [];
  for (let w = 0; w < WEEKS && s.status === 'playing'; w++) {
    if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id });

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

    // Next training run on the ladder, sized to finish in ~TARGET_WEEKS.
    const next = LADDER[rung];
    if (!s.training && next) {
      const dataCost = Math.max(0, next.tokensB - s.dataTokensB) * TUNING.dataCostPerBillionTokens;
      if (s.cash > dataCost * 1.5 + 1_000_000) {
        if (dataCost > 0) s = act(s, { type: 'buyData', billions: next.tokensB - s.dataTokensB });
        const flops = 6 * next.paramsB * 1e9 * next.tokensB * 1e9;
        const perChipWeek = 2000e12 * 0.45 * TUNING.secondsPerWeek; // K2-class at FP8
        const want = Math.max(64, Math.ceil(flops / (perChipWeek * TARGET_WEEKS)));
        while (maxClusterChips(s) < want && s.cash > 1_000_000) s = act(s, { type: 'hire', discipline: 'modelEng' });
        // A run uses one chip type: build up a K2 cluster (bought over several weeks if allocation-limited),
        // falling back to rented K1 early on.
        const k2 = getChip(content, 'kite-k2')!;
        if (want > 256) {
          const missing = want - freeChips(s, k2.id);
          if (missing > 0) {
            const room = Math.floor((s.powerCapMW - ownedPowerMW(s, content)) / powerDrawMW(k2, 1));
            const buy = Math.min(missing, room, buyAllowance(s, k2), Math.floor((s.cash - dataCost - 2_000_000) / k2.priceUsd));
            if (buy >= 8) s = act(s, { type: 'buyChips', chipId: k2.id, count: buy });
            if (room < missing && !s.license.power.upgrade) s = act(s, { type: 'upgradeLicense', track: 'power' });
          }
        } else {
          s = acquireChips(s, want, 2_000_000);
        }
        const chip = bestTrainingChip(s);
        const spec: TrainingSpec = {
          name: `G${rung + 1}`,
          archId: 'dense',
          ...next,
          precision: 'fp8',
          chipId: chip.id,
          chipCount: Math.min(chip.free, maxClusterChips(s)),
        };
        let p = previewTraining(s, content, spec);
        for (const r of p.requirements) if (r.gap > 0 && !s.license[r.track].upgrade) s = act(s, { type: 'upgradeLicense', track: r.track });
        p = previewTraining(s, content, spec);
        if (VERBOSE && s.week % 13 === 0 && (p.errors.length || p.weeks > TARGET_WEEKS * 3))
          console.log(`  wk ${s.week}: waiting on ${spec.name}: ${p.errors.join('; ') || `${p.weeks} wk on ${spec.chipCount} chips`} (power ${ownedPowerMW(s, content).toFixed(1)}/${s.powerCapMW} MW, cash ${(s.cash / 1e6).toFixed(1)}M)`);
        if (!p.errors.length && p.weeks <= TARGET_WEEKS * 3) {
          s = act(s, { type: 'startTraining', spec });
          if (VERBOSE) console.log(`  wk ${s.week}: start ${spec.name} ${next.paramsB}B on ${spec.chipCount} ${spec.chipId} → ${p.projectedScore.toFixed(1)}, ${p.weeks} wk`);
          rung++;
        }
      }
    }

    // Products: launch the app once there's a decent model, sign every enterprise deal we qualify for.
    if (!s.consumer.launched && s.liveModelId && s.cash > 15_000_000) s = act(s, { type: 'launchConsumerApp' });
    for (const o of [...s.offers]) {
      if (s.contracts.length >= contractCapacity(s) && s.cash > 2_000_000) s = act(s, { type: 'hire', discipline: 'product' });
      if (offerCheck(s, content, o).canAccept) s = act(s, { type: 'acceptOffer', offerId: o.id });
    }

    // Hire a researcher whenever comfortably profitable.
    if (weeklyNet(s) > 200_000 && s.staff.research < 20) s = act(s, { type: 'hire', discipline: 'research' });

    s = act(s, { type: 'advanceWeek' });
    if (VERBOSE && s.week % 26 === 0) {
      const l = s.lastWeek!;
      const top = Math.max(...s.rivals.map((r) => r.score));
      console.log(
        `  wk ${s.week}: cash ${(s.cash / 1e6).toFixed(1)}M users ${(s.users / 1e6).toFixed(1)}M net/wk ${(weeklyNet(s) / 1e6).toFixed(2)}M ` +
          `best ${bestScore(s).toFixed(1)} top rival ${top.toFixed(1)} suite v${s.suite.version} served ${((l.servedTokens / Math.max(1, l.demandTokens)) * 100).toFixed(0)}% ` +
          `chips ${s.fleet.reduce((n, x) => n + x.count, 0)} own ${(s.ownership * 100).toFixed(0)}%`,
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
    milestones: milestones.join(', '),
  };
}

for (let seed = 1; seed <= SEEDS; seed++) {
  if (VERBOSE) console.log(`seed ${seed}`);
  console.log(play(seed * 101));
}
