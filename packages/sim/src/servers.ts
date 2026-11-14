import type { Chip, Content, Equipment } from '@stm/content';
import type { GameState, PlacedEquipment } from './types';
import { TUNING } from './tuning';
import { getChip, totalChips } from './selectors';
import { footprint, roomRect, stageDef, templateDef, type Rect } from './hq';

/**
 * HQ server rooms (world-and-facilities §6): racks hold owned chips, power units switch them on,
 * cooling keeps them at full speed. Owned chips with no rack space go to colocation (rented rack
 * space, a weekly fee per chip) until we build our own data centers.
 */

export function equipmentDef(content: Content, id: string): Equipment | undefined {
  return content.hq.equipment.find((e) => e.id === id);
}

export function equipmentRect(content: Content, eq: PlacedEquipment): Rect {
  const def = equipmentDef(content, eq.equipId);
  const f = def ? footprint(def, eq.rot) : { w: 1, h: 1 };
  return { x: eq.x, y: eq.y, ...f };
}

const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Units that hold chips (racks and immersion tanks) count against the building's rack limit. */
export function rackUnits(state: GameState, content: Content): number {
  return state.hq.equipment.filter((e) => (equipmentDef(content, e.equipId)?.chips ?? 0) > 0).length;
}

/** Why this equipment can't go here (or null), and the server room it would sit in. */
export function equipmentPlacement(
  state: GameState,
  content: Content,
  equipId: string,
  x: number,
  y: number,
  rot: number,
  floor = 0,
): { error: string | null; roomId: string | null } {
  const def = equipmentDef(content, equipId);
  if (!def) return { error: 'Unknown equipment.', roomId: null };
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rot)) return { error: 'Equipment snaps to whole tiles.', roomId: null };
  if (state.license.power.level < def.requiresPowerLevel)
    return { error: `${def.name} needs Power license level ${def.requiresPowerLevel}.`, roomId: null };
  const r = { x, y, ...footprint(def, rot) };
  const room = state.hq.rooms.find(
    (rm) => (rm.floor ?? 0) === floor && templateDef(content, rm.templateId)?.kind === 'server' && inside(r, roomRect(content, rm)),
  );
  if (!room) return { error: 'Equipment goes inside a server room.', roomId: null };
  const sameFloor = new Set(state.hq.rooms.filter((rm) => (rm.floor ?? 0) === floor).map((rm) => rm.id));
  if (state.hq.equipment.some((e) => sameFloor.has(e.roomId) && overlaps(r, equipmentRect(content, e))))
    return { error: 'Something is already there.', roomId: room.id };
  if (def.chips > 0) {
    const stage = stageDef(content, state.hq.stage);
    if (rackUnits(state, content) >= stage.maxRacks)
      return {
        error: `The ${stage.name === 'Garage' ? 'garage' : stage.name}'s power and cooling can't take more than ${stage.maxRacks} rack${stage.maxRacks > 1 ? 's' : ''}. Bigger HQs (and later, data centers) can.`,
        roomId: room.id,
      };
  }
  return { error: null, roomId: room.id };
}

export interface RackLoad {
  equipmentId: string;
  chipId: string | null;
  count: number;
  /** False when the room's power units or the building can't supply it. */
  powered: boolean;
}

export interface ServerRoomState {
  /** HQ server room id, or data hall id. */
  roomId: string;
  /** Set for data halls. */
  siteId: string | null;
  racks: RackLoad[];
  /** Heat from powered chips, kW. */
  itKW: number;
  /** Cooling after the climate bonus, kW. */
  coolingKW: number;
  powerKW: number;
  /** Share of full speed the room's chips run at: min(1, cooling ÷ heat). */
  throttle: number;
  pue: number;
  powerPricePerMWh: number;
}

export interface ChipPlacement {
  owned: number;
  /** Owned chips racked and powered (HQ or data halls). */
  hq: number;
  /** Those chips' throttle-weighted count. */
  hqEffective: number;
  /** Racked in data halls at sites with / without an operations center. */
  attended: number;
  unattended: number;
  colo: number;
}

export interface ServerLayout {
  rooms: ServerRoomState[];
  byChip: Record<string, ChipPlacement>;
  /** Powered IT load at HQ vs the building's limit. */
  hqKW: number;
  buildingKW: number;
  colo: number;
}

interface Space {
  id: string;
  siteId: string | null;
  attended: boolean;
  units: { e: PlacedEquipment; def: Equipment }[];
  coolingMult: number;
  pueDelta: number;
  powerPrice: number;
  /** HQ rooms share the building's power limit; data halls only have site power. */
  hq: boolean;
}

/** Where every owned chip lives and how fast it runs. Derived from layout and fleet; never stored. */
export function serverLayout(state: GameState, content: Content): ServerLayout {
  const stage = stageDef(content, state.hq.stage);
  const remaining = new Map<string, number>();
  for (const f of state.fleet) if (f.owned) remaining.set(f.chipId, (remaining.get(f.chipId) ?? 0) + f.count);
  const chips = new Map<string, Chip | undefined>([...remaining.keys()].map((id) => [id, getChip(content, id, state)]));
  const byChip: Record<string, ChipPlacement> = {};
  for (const [id, n] of remaining) byChip[id] = { owned: n, hq: 0, hqEffective: 0, attended: 0, unattended: 0, colo: 0 };

  const withDefs = (list: PlacedEquipment[]) =>
    list.map((e) => ({ e, def: equipmentDef(content, e.equipId) })).filter((u): u is { e: PlacedEquipment; def: Equipment } => !!u.def);
  const spaces: Space[] = [];
  for (const room of state.hq.rooms) {
    if (templateDef(content, room.templateId)?.kind !== 'server') continue;
    spaces.push({
      id: room.id,
      siteId: null,
      attended: false,
      units: withDefs(state.hq.equipment.filter((e) => e.roomId === room.id)),
      coolingMult: 1,
      pueDelta: 0,
      powerPrice: TUNING.powerPricePerMWh,
      hq: true,
    });
  }
  for (const site of state.sites ?? []) {
    if (site.status !== 'online') continue;
    const loc = content.sites.locations.find((l) => l.id === site.locationId);
    const climate = loc ? content.sites.climates[loc.climate] : { coolingMult: 1, pueDelta: 0 };
    for (const hall of site.halls) {
      if (hall.status !== 'online') continue;
      spaces.push({
        id: hall.id,
        siteId: site.id,
        attended: site.opsCenter,
        units: withDefs(hall.equipment),
        coolingMult: climate.coolingMult,
        pueDelta: climate.pueDelta,
        powerPrice: loc?.powerPricePerMWh ?? TUNING.powerPricePerMWh,
        hq: false,
      });
    }
  }

  let buildingLeft = stage.maxServerKW;
  const rooms: ServerRoomState[] = [];
  for (const space of spaces) {
    const { units } = space;
    const powerKW = units.reduce((n, u) => n + u.def.powerKW, 0);
    const coolingKW = units.reduce((n, u) => n + u.def.coolingKW, 0) * space.coolingMult;
    let roomLeft = powerKW;
    const racks: RackLoad[] = [];
    for (const { e, def } of units) {
      if (def.chips <= 0) continue;
      const chipId = [...remaining.entries()].find(([, n]) => n > 0)?.[0] ?? null;
      const chip = chipId ? chips.get(chipId) : undefined;
      if (!chipId || !chip) {
        racks.push({ equipmentId: e.id, chipId: null, count: 0, powered: roomLeft > 0 });
        continue;
      }
      const kwEach = chip.watts / 1000;
      const budget = space.hq ? Math.min(roomLeft, buildingLeft) : roomLeft;
      const n = Math.min(def.chips, remaining.get(chipId)!, Math.floor(budget / kwEach + 1e-9));
      if (n <= 0) {
        racks.push({ equipmentId: e.id, chipId: null, count: 0, powered: false });
        continue;
      }
      remaining.set(chipId, remaining.get(chipId)! - n);
      roomLeft -= n * kwEach;
      if (space.hq) buildingLeft -= n * kwEach;
      racks.push({ equipmentId: e.id, chipId, count: n, powered: true });
    }
    const itKW = racks.reduce((kw, r) => kw + (r.chipId ? (r.count * (chips.get(r.chipId)?.watts ?? 0)) / 1000 : 0), 0);
    const throttle = itKW > 0 ? Math.min(1, coolingKW / itKW) : 1;
    const coolers = units.filter((u) => u.def.coolingKW > 0);
    const rawCool = coolers.reduce((n, u) => n + u.def.coolingKW, 0);
    const basePue = rawCool > 0 ? coolers.reduce((p, u) => p + (u.def.pue ?? TUNING.pue) * u.def.coolingKW, 0) / rawCool : TUNING.pue;
    const pue = Math.max(1.02, basePue + space.pueDelta);
    for (const r of racks) {
      if (!r.chipId) continue;
      const p = byChip[r.chipId];
      p.hq += r.count;
      p.hqEffective += r.count * throttle;
      if (space.siteId) {
        if (space.attended) p.attended += r.count;
        else p.unattended += r.count;
      }
    }
    rooms.push({ roomId: space.id, siteId: space.siteId, racks, itKW, coolingKW, powerKW, throttle, pue, powerPricePerMWh: space.powerPrice });
  }
  let colo = 0;
  for (const [id, n] of remaining) {
    byChip[id].colo = n;
    colo += n;
  }
  return { rooms, byChip, hqKW: stage.maxServerKW - buildingLeft, buildingKW: stage.maxServerKW, colo };
}

/** Share of full speed a chip type delivers across the fleet (rented and colocated chips run at 1). */
export function chipEfficiency(state: GameState, content: Content, chipId: string, layout = serverLayout(state, content)): number {
  const total = totalChips(state, chipId);
  const p = layout.byChip[chipId];
  if (!total || !p) return 1;
  return (total - p.hq + p.hqEffective) / total;
}

/** Weekly electricity for owned chips (per-room PUE at HQ, standard PUE in colocation) and colocation fees. */
export function ownedChipCosts(state: GameState, content: Content, layout = serverLayout(state, content)): { power: number; colocation: number } {
  const perKWWeek = (168 * TUNING.powerPricePerMWh) / 1000;
  let power = 0;
  for (const room of layout.rooms) power += (room.itKW * room.pue * 168 * room.powerPricePerMWh) / 1000;
  let colocation = 0;
  for (const [id, p] of Object.entries(layout.byChip)) {
    const chip = getChip(content, id, state);
    if (!chip || !p.colo) continue;
    power += (p.colo * chip.watts) / 1000 * TUNING.pue * perKWWeek;
    colocation += p.colo * TUNING.colocationPerChipWeek;
  }
  return { power, colocation };
}

export function equipmentUpkeep(state: GameState, content: Content): number {
  const all = [...state.hq.equipment, ...(state.sites ?? []).flatMap((s) => s.halls.flatMap((h) => h.equipment))];
  return all.reduce((n, e) => n + (equipmentDef(content, e.equipId)?.upkeepPerWeek ?? 0), 0);
}

/** First free spot for equipment inside any server room (balance bot, tests). */
export function findEquipmentSpot(
  state: GameState,
  content: Content,
  equipId: string,
): { x: number; y: number; rot: number; floor: number } | null {
  const stage = stageDef(content, state.hq.stage);
  for (let floor = 0; floor < stage.floors; floor++)
    for (const rot of [0, 1])
      for (let y = 0; y < stage.h; y++)
        for (let x = 0; x < stage.w; x++)
          if (!equipmentPlacement(state, content, equipId, x, y, rot, floor).error) return { x, y, rot, floor };
  return null;
}
