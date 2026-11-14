import type { Content, SiteLocation } from '@stm/content';
import type { GameState, Hall, PlacedEquipment, Site } from './types';
import { footprint } from './hq';
import { equipmentDef, equipmentRect, serverLayout } from './servers';
import { getChip } from './selectors';

/**
 * Sites track (world-and-facilities §2.2): data center campuses at real-world-ish locations.
 * Each campus has data halls (a 20×12 grid of racks, cooling and power units), location stats
 * (power price, climate, water) and an optional operations center.
 */

export function locationDef(content: Content, id: string): SiteLocation | undefined {
  return content.sites.locations.find((l) => l.id === id);
}

export function findHall(state: GameState, hallId: string): { site: Site; hall: Hall } | null {
  for (const site of state.sites) {
    const hall = site.halls.find((h) => h.id === hallId);
    if (hall) return { site, hall };
  }
  return null;
}

/** Why we can't open a campus here (or null). Doesn't check cash. */
export function siteError(state: GameState, content: Content, locationId: string): string | null {
  const loc = locationDef(content, locationId);
  if (!loc) return 'Unknown location.';
  const rules = content.sites;
  if (state.license.power.level < rules.requiresPowerLevel)
    return `Data centers need Power license level ${rules.requiresPowerLevel} (a dedicated supply agreement).`;
  const env = rules.water[loc.water].envLevel;
  if (state.license.environmental.level < env)
    return `${loc.name} has ${rules.water[loc.water].label.toLowerCase()} water: it needs Environmental level ${env}.`;
  if (state.sites.some((s) => s.locationId === locationId)) return `We already have a campus at ${loc.name}.`;
  return null;
}

/** Why equipment can't go here in a data hall (or null). */
export function hallPlacementError(
  state: GameState,
  content: Content,
  hallId: string,
  equipId: string,
  x: number,
  y: number,
  rot: number,
): string | null {
  const found = findHall(state, hallId);
  if (!found) return 'Unknown data hall.';
  if (found.site.status !== 'online' || found.hall.status !== 'online') return 'That hall is still under construction.';
  const def = equipmentDef(content, equipId);
  if (!def) return 'Unknown equipment.';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rot)) return 'Equipment snaps to whole tiles.';
  if (state.license.power.level < def.requiresPowerLevel) return `${def.name} needs Power license level ${def.requiresPowerLevel}.`;
  const { w, h } = content.sites.hall;
  const r = { x, y, ...footprint(def, rot) };
  if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) return "It doesn't fit inside the hall.";
  const overlaps = (a: typeof r, b: typeof r) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (found.hall.equipment.some((e) => overlaps(r, equipmentRect(content, e)))) return 'Something is already there.';
  return null;
}

/** kW one full rack of our hungriest owned chip draws (1 kW chips if we own none yet). */
export function rackKW(state: GameState, content: Content): number {
  let watts = 1000;
  for (const f of state.fleet) if (f.owned) watts = Math.max(watts, getChip(content, f.chipId, state)?.watts ?? 0);
  return (watts * 32) / 1000;
}

/**
 * Standard hall layout for one cooling type: bands two tiles deep, each column either a rack or a
 * cooler-over-power-unit pair, with as many racks per pair as the cooler and power unit can feed.
 */
export function fillPlan(state: GameState, content: Content, hallId: string, coolingId: string): Omit<PlacedEquipment, 'id' | 'spent' | 'roomId'>[] {
  const cool = equipmentDef(content, coolingId);
  const pdu = content.hq.equipment.find((e) => e.kind === 'power');
  const rack = content.hq.equipment.find((e) => e.kind === 'rack');
  const found = findHall(state, hallId);
  if (!cool || !pdu || !rack || !found) return [];
  const { w, h } = content.sites.hall;
  const kw = rackKW(state, content);
  const climate = content.sites.climates[locationDef(content, found.site.locationId)!.climate];
  const perPair = Math.max(1, Math.min(Math.floor((cool.coolingKW * climate.coolingMult) / kw), Math.floor(pdu.powerKW / kw)));
  const out: Omit<PlacedEquipment, 'id' | 'spent' | 'roomId'>[] = [];
  for (let y = 0; y + 1 < h; y += 2) {
    for (let x = 0; x < w; x++) {
      // Every group of racks gets its cooler + power pair, including a short last group.
      if (x % (perPair + 1) === perPair || (x === w - 1 && x % (perPair + 1) !== 0)) {
        out.push({ equipId: cool.id, x, y, rot: 0 });
        out.push({ equipId: pdu.id, x, y: y + 1, rot: 0 });
      } else out.push({ equipId: rack.id, x, y, rot: 0 });
    }
  }
  return out;
}

/** Hardware failure multiplier for a training run, from where its chips live (attended sites fail less). */
export function siteFailureFactor(state: GameState, content: Content, chipId: string): number {
  const p = serverLayout(state, content).byChip[chipId];
  const total = state.fleet.filter((f) => f.chipId === chipId).reduce((n, f) => n + f.count, 0);
  if (!p || !total) return 1;
  const rules = content.sites;
  const elsewhere = total - p.attended - p.unattended;
  return (elsewhere + p.attended * rules.opsCenter.failureMult + p.unattended * rules.unattendedFailureMult) / total;
}

/** Weekly upkeep of campuses, halls and ops centers (equipment upkeep is counted with all equipment). */
export function sitesUpkeep(state: GameState, content: Content): number {
  const r = content.sites;
  return state.sites.reduce(
    (n, s) => n + r.siteUpkeepPerWeek + s.halls.length * r.hall.upkeepPerWeek + (s.opsCenter ? r.opsCenter.upkeepPerWeek : 0),
    0,
  );
}

/** Weekly construction progress. Returns log lines for anything that finished. */
export function tickSites(state: GameState, content: Content): string[] {
  const done: string[] = [];
  for (const site of state.sites) {
    if (site.status === 'building') {
      site.weeksLeft -= 1;
      if (site.weeksLeft <= 0) {
        site.status = 'online';
        for (const h of site.halls) h.status = 'online';
        done.push(`Our first halls at ${site.name} are online. Fill them with racks, cooling and power.`);
      }
      continue;
    }
    for (const hall of site.halls) {
      if (hall.status !== 'building') continue;
      hall.weeksLeft -= 1;
      if (hall.weeksLeft <= 0) {
        hall.status = 'online';
        done.push(`A new data hall is online at ${site.name}.`);
      }
    }
  }
  return done;
}
