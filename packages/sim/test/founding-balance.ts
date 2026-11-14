// Founding-era balance runner: a sensible player from January 1991 to the end of the chapter.
// Run: npx vite-node packages/sim/test/founding-balance.ts [seeds]
import { content } from '@stm/content';
import {
  applyCommand,
  createFoundingGame,
  findSpot,
  fitKey,
  isUnlocked,
  moveCheck,
  projectPreview,
  researchError,
  roomCost,
  templateDef,
  TUNING,
  type Command,
  type GameState,
} from '../src';

const SEEDS = Number(process.argv[2] ?? 3);
const VERBOSE = SEEDS === 1;
const act = (s: GameState, cmd: Command): GameState => {
  const r = applyCommand(s, content, cmd);
  return r.error ? s : r.state;
};

/** Pick the chip to build: known great pairs first, then pairs we haven't tried, newest generation we can afford. */
export function botProject(s: GameState): Command | null {
  const f = s.founding!;
  const fd = content.founding;
  const types = fd.types.filter((t) => isUnlocked(content, f, 'type', t.id));
  const markets = fd.markets.filter((m) => isUnlocked(content, f, 'market', m.id));
  const gens = fd.generations.filter((g) => isUnlocked(content, f, 'generation', g.id)).reverse();
  let best: { cmd: Command; value: number } | null = null;
  for (const t of types)
    for (const m of markets) {
      const known = f.fitKnown[fitKey(t.id, m.id)];
      if (known === 'poor') continue;
      for (const g of gens) {
        const pv = projectPreview(s, content, t.id, m.id, g.id);
        if (pv.errors.length || pv.cost > s.cash * 0.5) continue;
        const fitBonus = known === 'great' ? 1.5 : known === 'ok' ? 1 : 1.15;
        const value = pv.expectedScore * fitBonus * m.monthlySales;
        if (!best || value > best.value)
          best = { cmd: { type: 'startProject', name: `Chip ${f.chips.length + 1}`, typeId: t.id, marketId: m.id, genId: g.id }, value };
        break;
      }
    }
  return best?.cmd ?? null;
}

function botTurn(s: GameState): GameState {
  const f = s.founding!;
  if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
  for (const r of content.founding.research) if (!researchError(s, content, r.id)) s = act(s, { type: 'buyResearch', researchId: r.id });
  if (!moveCheck(s, content).error && s.cash > 180_000) s = act(s, { type: 'moveHq' });
  const stageIndex = content.hq.stages.findIndex((x) => x.id === s.hq.stage);
  if (stageIndex >= 1) {
    const monthly = Object.values(s.staff).reduce((n, c) => n + c, 0) * TUNING.foundingSalaryPerMonth + 15_000;
    if (s.cash > monthly * 4 && s.staff.hardwareEng + s.staff.product < 14) {
      const needSeats = s.staff.hardwareEng >= (s.hq.seated.hardwareEng ?? 0) + 0 && s.staff.hardwareEng > seats(s, 'hardwareEng') - 1;
      if (needSeats) {
        const lab = templateDef(content, 'hardwareLab')!;
        const spot = findSpot(s, content, lab.id);
        if (spot && s.cash > roomCost(s, lab) * 3) s = act(s, { type: 'placeRoom', templateId: lab.id, ...spot });
      }
      s = act(s, { type: 'hire', discipline: s.staff.product * 3 < s.staff.hardwareEng ? 'product' : 'hardwareEng' });
    }
    const desks = Object.values(s.staff).reduce((n, c) => n + c, 0) > deskCount(s) - 1;
    if (desks) {
      const spot = findSpot(s, content, 'deskPod');
      if (spot) s = act(s, { type: 'placeRoom', templateId: 'deskPod', ...spot });
    }
  }
  if (!f.project) {
    const cmd = botProject(s);
    if (cmd) s = act(s, cmd);
  }
  return act(s, { type: 'advanceMonth' });
}

const seats = (s: GameState, d: 'hardwareEng') =>
  s.hq.rooms.reduce((n, r) => {
    const t = templateDef(content, r.templateId);
    return n + (t?.seats?.discipline === d ? t.seats.count : 0);
  }, 0);
const deskCount = (s: GameState) => s.hq.rooms.reduce((n, r) => n + (templateDef(content, r.templateId)?.desks ?? 0), 0) + seats(s, 'hardwareEng');

export function runFounding(seed: number) {
  let s = createFoundingGame(content, seed, `Bot ${seed}`);
  let office = -1;
  let events = 0;
  const months = (content.founding.endYear - content.founding.startYear + 1) * 12;
  for (let m = 0; m < months && s.status === 'playing'; m++) {
    if (s.pendingEvent) events++;
    s = botTurn(s);
    if (office < 0 && s.hq.stage !== 'garage') office = s.week;
    if (VERBOSE && s.week % 6 === 0) {
      const f = s.founding!;
      const best = f.chips.at(-1);
      console.log(
        `${1991 + Math.floor(s.week / 12)}-${String((s.week % 12) + 1).padStart(2, '0')} cash $${(s.cash / 1e3).toFixed(0)}K staff ${s.staff.hardwareEng}+${s.staff.product} chips ${f.chips.length} last ${best ? best.score.toFixed(1) : '-'} rp ${f.researchPoints} unlocked ${f.unlocked.length} rivals ${f.rivals.map((r) => r.score.toFixed(1)).join('/')}`,
      );
    }
  }
  const f = s.founding!;
  return {
    seed,
    status: s.status,
    cash: Math.round(s.cash),
    chips: f.chips.length,
    avgScore: f.chips.reduce((n, c) => n + c.score, 0) / Math.max(1, f.chips.length),
    lastScores: f.chips.slice(-4).map((c) => c.score),
    officeYear: office < 0 ? null : 1991 + Math.floor(office / 12),
    staff: s.staff.hardwareEng + s.staff.product,
    research: f.unlocked.length,
    events,
    chapterDone: f.chapterDone,
    rivalScores: f.rivals.map((r) => r.score),
  };
}

if (!process.env.VITEST) {
  for (let seed = 1; seed <= SEEDS; seed++) console.log(JSON.stringify(runFounding(seed)));
}
