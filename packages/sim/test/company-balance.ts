// Chip-company balance runner: a sensible player from January 1991 until the AI chapter opens.
// Run: npx vite-node packages/sim/test/company-balance.ts [seeds] [verbose]
import { content, type ProductTypeId } from '@stm/content';
import {
  aiReady,
  applyCommand,
  buzzCost,
  companyYear,
  createFoundingGame,
  designPreview,
  designSlots,
  findSpot,
  isUnlocked,
  moveCheck,
  moveCost,
  researchError,
  roomCost,
  segmentShares,
  templateDef,
  TUNING,
  type Command,
  type GameState,
  type ProductDesign,
} from '../src';

const SEEDS = Number(process.argv[2] ?? 4);
const VERBOSE = process.argv[3] === 'v';
const act = (s: GameState, cmd: Command): GameState => {
  const r = applyCommand(s, content, cmd);
  return r.error ? s : r.state;
};
const headcount = (s: GameState) => Object.values(s.staff).reduce((n, c) => n + c, 0);
const seats = (s: GameState, d: string) =>
  s.hq.rooms.reduce((n, r) => {
    const t = templateDef(content, r.templateId);
    return n + (t?.seats?.discipline === d ? t.seats.count : 0);
  }, 0);
const desks = (s: GameState) => s.hq.rooms.reduce((n, r) => n + (templateDef(content, r.templateId)?.desks ?? 0), 0);

/** The next chip to design: the kind whose newest chip is oldest, on the newest generation we can afford. */
export function botDesign(s: GameState): ProductDesign | null {
  const f = s.founding!;
  const types = content.founding.types.filter((t) => isUnlocked(content, f, 'type', t.id) && !f.projects.some((p) => p.design.type === t.id));
  const year = companyYear(s);
  const live = (t: ProductTypeId) => content.founding.segments.some((g) => g.buys === t && year >= g.fromYear);
  const age = (t: ProductTypeId) => s.week - Math.max(-99, ...f.products.filter((p) => p.design.type === t).map((p) => p.month));
  const type = types.filter((t) => live(t.id)).sort((a, b) => age(b.id) - age(a.id))[0];
  if (!type) return null;
  const gens = content.founding.generations.filter((g) => isUnlocked(content, f, 'generation', g.id)).reverse();
  for (const g of gens) {
    for (const scale of [1.3, 1, 0.8]) {
      const d: ProductDesign = { name: `${type.short} ${f.products.length + 1}`, type: type.id, genId: g.id, split: { ...type.ideal }, scale };
      const pv = designPreview(s, content, d);
      if (!pv.errors.length && pv.devCost < s.cash * (scale > 1 ? 0.25 : 0.45)) return d;
    }
  }
  return null;
}

function place(s: GameState, templateId: string): GameState {
  const t = templateDef(content, templateId)!;
  if (s.cash < roomCost(s, t) * 3) return s;
  const spot = findSpot(s, content, templateId);
  return spot ? act(s, { type: 'placeRoom', templateId, ...spot }) : s;
}

function botTurn(s: GameState): GameState {
  const f = s.founding!;
  if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
  for (const r of content.founding.research) if (!researchError(s, content, r.id)) s = act(s, { type: 'buyResearch', researchId: r.id });
  const mc = moveCheck(s, content);
  if (!mc.error && mc.stage && s.cash > moveCost(s, mc.stage) * 2 + 50_000) s = act(s, { type: 'moveHq' });
  const stage = content.hq.stages.findIndex((x) => x.id === s.hq.stage);
  if (stage >= 1) {
    const monthly = headcount(s) * TUNING.foundingSalaryPerMonth + (f.report?.rent ?? 0) + 5000;
    const cap = stage >= 2 ? 40 : 12;
    if (s.cash > monthly * 8 + 50_000 && headcount(s) < cap) {
      const want = s.staff.hardwareEng < 2 * (s.staff.product + s.staff.research) + 1 ? 'hardwareEng' : s.staff.research <= s.staff.product ? 'research' : 'product';
      s = act(s, { type: 'hire', discipline: want });
    }
    if (s.staff.hardwareEng > seats(s, 'hardwareEng')) s = place(s, 'hardwareLab');
    if (s.staff.research > seats(s, 'research')) s = place(s, 'researchLab');
    if (s.staff.product > seats(s, 'product')) s = place(s, 'productStudio');
    if (headcount(s) > desks(s) + seats(s, 'hardwareEng') + seats(s, 'research') + seats(s, 'product') - 1) s = place(s, 'deskPod');
    if (s.hq.morale < 55) s = place(s, 'breakRoom');
  }
  while (s.founding!.projects.length < designSlots(s)) {
    const d = botDesign(s);
    if (!d) break;
    const before = s;
    s = act(s, { type: 'startDesign', design: d });
    if (s === before) break;
  }
  for (const p of s.founding!.projects) {
    const b = buzzCost(s, content, p.id);
    if (b && p.buzz === 0 && s.cash > b.cost * 6) s = act(s, { type: 'buyBuzz', projectId: p.id });
  }
  return act(s, { type: 'advanceMonth' });
}

export function runCompany(seed: number) {
  let s = createFoundingGame(content, seed, `Bot ${seed}`);
  const at: Record<string, number> = {};
  let events = 0;
  let minCash = s.cash;
  for (let m = 0; m < 12 * 30 && s.status === 'playing'; m++) {
    if (s.pendingEvent) events++;
    s = botTurn(s);
    minCash = Math.min(minCash, s.cash);
    const year = companyYear(s);
    if (!at.office && s.hq.stage !== 'garage') at.office = year;
    if (!at.hq && s.hq.stage === 'hqBuilding') at.hq = year;
    if (!at.ai && aiReady(content, s.founding)) at.ai = year;
    const ch = s.founding!.chapter.index;
    if (ch && !at[`ch${ch}`]) at[`ch${ch}`] = year;
    if (VERBOSE && s.week % 12 === 0) {
      const f = s.founding!;
      const shares = segmentShares(s, content).map((g) => `${g.segmentId} ${Math.round(g.share * 100)}%`).join(' ');
      console.log(
        `${year}: cash $${(s.cash / 1e6).toFixed(2)}M staff ${headcount(s)} chips ${f.products.length} last ${f.products.slice(-3).map((p) => p.score.toFixed(1)).join('/')} rp ${f.researchPoints.toFixed(0)} research ${f.unlocked.length} chapter ${f.chapter.index} sales/mo $${((f.report?.sales ?? 0) / 1e3).toFixed(0)}K | ${shares}`,
      );
    }
    if (at.ai) break;
  }
  const f = s.founding!;
  return {
    seed,
    status: s.status,
    year: companyYear(s),
    cashM: Math.round(s.cash / 1e5) / 10,
    minCashK: Math.round(minCash / 1e3),
    chips: f.products.length,
    avgLast5: Math.round((f.products.slice(-5).reduce((n, p) => n + p.score, 0) / Math.max(1, Math.min(5, f.products.length))) * 10) / 10,
    staff: headcount(s),
    chapter: f.chapter.index,
    research: f.unlocked.length,
    events,
    milestones: at,
  };
}

if (!process.env.VITEST) for (let seed = 1; seed <= SEEDS; seed++) console.log(JSON.stringify(runCompany(seed)));
