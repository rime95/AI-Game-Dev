import type { Content, Discipline, HqStage, RoomTemplate, TrackId } from '@stm/content';
import type { GameState, HqState, PlacedRoom } from './types';
import { TUNING } from './tuning';
import { equipmentUpkeep } from './servers';

/** HQ track: rooms on a grid, desks, morale and productivity (world-and-facilities §4–§5). */

export function stageDef(content: Content, id: string): HqStage {
  return content.hq.stages.find((s) => s.id === id) ?? content.hq.stages[0];
}

export function templateDef(content: Content, id: string): RoomTemplate | undefined {
  return content.hq.rooms.find((r) => r.id === id);
}

export function nextStage(content: Content, state: GameState): HqStage | null {
  const i = content.hq.stages.findIndex((s) => s.id === state.hq.stage);
  return content.hq.stages[i + 1] ?? null;
}

/** Footprint after rotation (90° steps: odd rotations swap width and depth). */
export function footprint(t: { w: number; h: number }, rot: number): { w: number; h: number } {
  return rot % 2 ? { w: t.h, h: t.w } : { w: t.w, h: t.h };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function roomRect(content: Content, room: PlacedRoom): Rect {
  const t = templateDef(content, room.templateId);
  const f = t ? footprint(t, room.rot) : { w: 1, h: 1 };
  return { x: room.x, y: room.y, ...f };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Rooms share an edge (touching sides, not just corners). */
function adjacent(a: Rect, b: Rect): boolean {
  const xTouch = a.x + a.w === b.x || b.x + b.w === a.x;
  const yTouch = a.y + a.h === b.y || b.y + b.h === a.y;
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
  const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
  return (xTouch && yOverlap) || (yTouch && xOverlap);
}

/** Why a room can't go here, or null if it can. Doesn't check cash. */
export function placementError(
  state: GameState,
  content: Content,
  templateId: string,
  x: number,
  y: number,
  rot: number,
  floor = 0,
): string | null {
  const t = templateDef(content, templateId);
  if (!t) return 'Unknown room.';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rot) || !Number.isInteger(floor)) return 'Rooms snap to whole tiles.';
  const stage = stageDef(content, state.hq.stage);
  const stageIndex = content.hq.stages.indexOf(stage);
  if (stageIndex < t.minStage) return `A ${t.name.toLowerCase()} needs at least the ${lowerName(content.hq.stages[t.minStage].name)}.`;
  if (floor < 0 || floor >= stage.floors) return 'There is no such floor.';
  const r = { x, y, ...footprint(t, rot) };
  if (r.x < 0 || r.y < 0 || r.x + r.w > stage.w || r.y + r.h > stage.h) return `It doesn't fit inside the ${lowerName(stage.name)}.`;
  if (state.hq.rooms.some((o) => (o.floor ?? 0) === floor && overlaps(r, roomRect(content, o)))) return 'Something is already there.';
  return null;
}

/** First free spot for a template, scanning row by row (used by migrations, tests and the balance bot). */
export function findSpot(
  state: GameState,
  content: Content,
  templateId: string,
): { x: number; y: number; rot: number; floor: number } | null {
  const stage = stageDef(content, state.hq.stage);
  for (let floor = 0; floor < stage.floors; floor++)
    for (const rot of [0, 1])
      for (let y = 0; y < stage.h; y++)
        for (let x = 0; x < stage.w; x++)
          if (!placementError(state, content, templateId, x, y, rot, floor)) return { x, y, rot, floor };
  return null;
}

export function headcount(state: GameState): number {
  return Object.values(state.staff).reduce((n, c) => n + c, 0);
}

/** Effect multiplier of a placed room: its tier, plus the lab-next-to-break-room bonus. */
export function roomMultiplier(state: GameState, content: Content, room: PlacedRoom): { mult: number; adjacentBreak: boolean } {
  const t = templateDef(content, room.templateId);
  if (!t) return { mult: 0, adjacentBreak: false };
  let mult = t.tierEffect[Math.min(room.tier, t.tierEffect.length) - 1];
  let adjacentBreak = false;
  if (t.kind === 'lab') {
    const me = roomRect(content, room);
    adjacentBreak = state.hq.rooms.some(
      (o) =>
        o.id !== room.id &&
        (o.floor ?? 0) === (room.floor ?? 0) &&
        templateDef(content, o.templateId)?.kind === 'break' &&
        adjacent(me, roomRect(content, o)),
    );
    if (adjacentBreak) mult *= 1 + TUNING.labNextToBreakBonus;
  }
  return { mult, adjacentBreak };
}

export interface LabSeating {
  roomId: string;
  discipline: Discipline;
  seats: number;
  seated: number;
  mult: number;
  adjacentBreak: boolean;
}

/** Fill specialist rooms with their staff, best rooms first. Without `discipline`, every specialist room. */
export function labSeating(state: GameState, content: Content, discipline?: Discipline): LabSeating[] {
  const labs = state.hq.rooms
    .map((room) => ({ room, t: templateDef(content, room.templateId) }))
    .filter((x) => x.t?.seats && (!discipline || x.t.seats.discipline === discipline))
    .map(({ room, t }) => ({
      roomId: room.id,
      discipline: t!.seats!.discipline,
      seats: t!.seats!.count,
      seated: 0,
      ...roomMultiplier(state, content, room),
    }))
    .sort((a, b) => b.mult - a.mult);
  const left = { ...state.staff };
  for (const lab of labs) {
    lab.seated = Math.min(lab.seats, left[lab.discipline]);
    left[lab.discipline] -= lab.seated;
  }
  return labs;
}

/** Disciplines that only do specialist work while seated in their room. */
export function seatedDisciplines(content: Content): Set<Discipline> {
  return new Set(content.hq.rooms.flatMap((r) => (r.seats ? [r.seats.discipline] : [])));
}

export interface DeskStats {
  headcount: number;
  desks: number;
  /** Specialist seats in use (only filled seats count as somewhere to sit). */
  specialistSeated: number;
  capacity: number;
  /** headcount ÷ capacity. Above 1 = overcrowded. */
  crowding: number;
  /** Staff a break room serves, after tier bonuses. */
  breakServes: number;
  /** Share of staff covered by break space (0–1). */
  breakCoverage: number;
}

export function deskStats(state: GameState, content: Content): DeskStats {
  let desks = 0;
  let breakServes = 0;
  for (const room of state.hq.rooms) {
    const t = templateDef(content, room.templateId);
    if (!t) continue;
    desks += t.desks;
    breakServes += t.serves * roomMultiplier(state, content, room).mult;
  }
  const specialistSeated = labSeating(state, content).reduce((n, l) => n + l.seated, 0);
  const capacity = desks + specialistSeated;
  const people = headcount(state);
  const crowding = people === 0 ? 0 : capacity === 0 ? Infinity : people / capacity;
  return {
    headcount: people,
    desks,
    specialistSeated,
    capacity,
    crowding,
    breakServes,
    breakCoverage: people === 0 ? 1 : Math.min(1, breakServes / people),
  };
}

/** Where morale is heading: break space per person, minus a penalty for crowding. */
export function moraleTarget(state: GameState, content: Content): number {
  const d = deskStats(state, content);
  return TUNING.moraleBase + TUNING.moraleFromBreakSpace * d.breakCoverage - (d.crowding > 1 ? TUNING.moraleCrowdedPenalty : 0);
}

export interface Productivity {
  crowding: number;
  morale: number;
  moveIn: number;
  total: number;
}

export function crowdingFactor(crowding: number): number {
  return crowding <= 1 ? 1 : 1 / (crowding * crowding);
}

export function moraleFactor(morale: number): number {
  return TUNING.moraleFactorMin + (TUNING.moraleFactorMax - TUNING.moraleFactorMin) * (Math.max(0, Math.min(100, morale)) / 100);
}

export function productivity(state: GameState, content: Content): Productivity {
  const crowding = crowdingFactor(deskStats(state, content).crowding);
  const morale = moraleFactor(state.hq.morale);
  const moveIn = state.hq.moveInWeeks > 0 ? TUNING.moveInProductivity : 1;
  return { crowding, morale, moveIn, total: crowding * morale * moveIn };
}

/** Recompute the cached figures other systems read (state.hq.productivity, state.hq.effective, state.hq.seated). */
export function refreshHq(state: GameState, content: Content): void {
  const p = productivity(state, content).total;
  state.hq.productivity = p;
  const seatedOnly = seatedDisciplines(content);
  const labs = labSeating(state, content);
  const effective = {} as Record<Discipline, number>;
  const seated = {} as Record<Discipline, number>;
  for (const d of Object.keys(state.staff) as Discipline[]) {
    const mine = labs.filter((l) => l.discipline === d);
    seated[d] = seatedOnly.has(d) ? mine.reduce((n, l) => n + l.seated, 0) : state.staff[d];
    effective[d] = (seatedOnly.has(d) ? mine.reduce((n, l) => n + l.seated * l.mult, 0) : state.staff[d]) * p;
  }
  state.hq.effective = effective;
  state.hq.seated = seated;
}

/** Staff of a discipline doing specialist work (seated in their room, if they need one), scaled by productivity. */
export function effectiveStaff(state: GameState, discipline: Discipline): number {
  return state.hq.effective?.[discipline] ?? state.staff[discipline] * state.hq.productivity;
}

/** Staff of a discipline sitting in their specialist room (headcount, not scaled). */
export function seatedStaff(state: GameState, discipline: Discipline): number {
  return state.hq.seated?.[discipline] ?? state.staff[discipline];
}

/** The room a License to Scale level or funding round still needs, if any. */
export function missingRoomFor(
  state: GameState,
  content: Content,
  need: { track: TrackId; level: number } | { fundingRound: number },
): RoomTemplate | null {
  for (const t of content.hq.rooms) {
    const r = t.requiredFor;
    if (!r) continue;
    const applies =
      'track' in need
        ? r.track === need.track && r.level !== undefined && need.level >= r.level
        : r.fundingRound !== undefined && need.fundingRound >= r.fundingRound;
    if (applies && !state.hq.rooms.some((room) => room.templateId === t.id)) return t;
  }
  return null;
}

export function facilitiesCost(state: GameState, content: Content): { rent: number; upkeep: number } {
  const rent = stageDef(content, state.hq.stage).rentPerWeek;
  const upkeep = state.hq.rooms.reduce((n, r) => {
    const t = templateDef(content, r.templateId);
    return n + (t ? t.upkeepPerWeek * r.tier : 0);
  }, 0);
  return { rent, upkeep: upkeep + equipmentUpkeep(state, content) };
}

/** 'Office' → 'office', but 'HQ building' stays as is. */
export function lowerName(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

export function upgradeCost(t: RoomTemplate, tier: number, state?: GameState): number | null {
  return tier >= t.tierEffect.length ? null : roomCost(state, t) * tier;
}

/** What a room costs to build right now (1990s prices in the founding era). */
export function roomCost(state: GameState | undefined, t: { cost: number }): number {
  return state?.era === 'founding' ? Math.round(t.cost * TUNING.foundingCostScale) : t.cost;
}

/** What moving to a stage costs right now. */
export function moveCost(state: GameState, stage: HqStage): number {
  return state.era === 'founding' && stage.founding ? stage.founding.moveCost : stage.moveCost;
}

/** Can we move to the next HQ stage? Returns the stage and an error if not. */
export function moveCheck(state: GameState, content: Content): { stage: HqStage | null; error?: string } {
  const stage = nextStage(content, state);
  if (!stage) return { stage, error: 'This is the biggest HQ available for now.' };
  if (state.era === 'founding') {
    const terms = stage.founding;
    if (!terms) return { stage, error: 'The company needs to grow up before a move this big.' };
    const shipped = state.founding?.products.length ?? 0;
    if (shipped < terms.chipsShipped && state.cash < terms.orCash)
      return { stage, error: `Ship ${terms.chipsShipped} chips (or have $${(terms.orCash / 1e6).toFixed(1)}M in the bank) to afford the ${lowerName(stage.name)}.` };
    if (state.cash < terms.moveCost) return { stage, error: 'Not enough cash for the move.' };
    return { stage };
  }
  const unlocked = state.roundsRaised >= stage.requiresRounds || (stage.orCash !== undefined && state.cash >= stage.orCash);
  if (!unlocked) {
    const round = content.funding[stage.requiresRounds - 1]?.name ?? 'another funding round';
    const cash = stage.orCash !== undefined ? ` (or $${Math.round(stage.orCash / 1e6)}M in the bank)` : '';
    return { stage, error: `The ${lowerName(stage.name)} needs ${round} closed${cash} first.` };
  }
  if (state.cash < stage.moveCost) return { stage, error: 'Not enough cash for the move.' };
  return { stage };
}

/** Weekly HQ update: morale drifts toward its target, overcrowding wears it down, move-in ends. */
export function tickHq(state: GameState, content: Content): void {
  const hq = state.hq;
  const target = moraleTarget(state, content);
  hq.morale += (target - hq.morale) * TUNING.moraleDrift;
  if (deskStats(state, content).crowding > 1) hq.morale -= TUNING.moraleCrowdedPerWeek;
  hq.morale = Math.max(0, Math.min(100, hq.morale));
  if (hq.moveInWeeks > 0) hq.moveInWeeks -= 1;
}

export function initialHq(content: Content): HqState {
  const pod = content.hq.rooms.find((r) => r.kind === 'desks');
  return {
    stage: content.hq.stages[0].id,
    equipment: [],
    rooms: pod ? [{ id: 'room-0', templateId: pod.id, x: 0, y: 0, rot: 0, floor: 0, tier: 1, spent: 0 }] : [],
    morale: TUNING.startMorale,
    moveInWeeks: 0,
    productivity: 1,
    effective: { research: 0, modelEng: 0, hardwareEng: 0, product: 0, ops: 0 },
    seated: { research: 0, modelEng: 0, hardwareEng: 0, product: 0, ops: 0 },
  };
}

/**
 * Place rooms for the current staff where they fit, free of charge: labs for researchers,
 * desk pods for everyone else, then break rooms. Used to furnish upgraded saves.
 */
export function autoFurnish(state: GameState, content: Content): void {
  const place = (templateId: string): boolean => {
    const spot = findSpot(state, content, templateId);
    if (!spot) return false;
    state.hq.rooms.push({ id: `room-${state.nextId++}`, templateId, ...spot, tier: 1, spent: 0 });
    return true;
  };
  const pod = content.hq.rooms.find((r) => r.kind === 'desks');
  const brk = content.hq.rooms.find((r) => r.kind === 'break');
  for (const lab of content.hq.rooms.filter((r) => r.seats)) {
    const d = lab.seats!.discipline;
    while (labSeating(state, content, d).reduce((n, l) => n + l.seats, 0) < state.staff[d] && place(lab.id));
  }
  if (pod) while (deskStats(state, content).crowding > 1 && place(pod.id));
  if (brk) while (deskStats(state, content).breakCoverage < 1 && place(brk.id));
}
