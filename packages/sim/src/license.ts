import type { Content, LicenseLevel, TrackId } from '@stm/content';
import type { GameState, LicenseTrackState } from './types';

export const TRACK_IDS: TrackId[] = ['power', 'safety', 'compliance', 'environmental'];

export function initialLicense(): Record<TrackId, LicenseTrackState> {
  return {
    power: { level: 1, upgrade: null },
    safety: { level: 1, upgrade: null },
    compliance: { level: 1, upgrade: null },
    environmental: { level: 1, upgrade: null },
  };
}

/** Tiers are set on capability (not suite score), so retiring an eval suite never lowers a tier. */
export function tierForCapability(content: Content, capability: number): number {
  let tier = 1;
  for (const t of content.license.tiers) if (capability >= t.minCapability) tier = Math.max(tier, t.tier);
  return tier;
}

export function tierName(content: Content, tier: number): string {
  return content.license.tiers.find((t) => t.tier === tier)?.name ?? `Tier ${tier}`;
}

export function trackDef(content: Content, id: TrackId) {
  return content.license.tracks.find((t) => t.id === id)!;
}

/** The level definition (1-based) for a track, if it exists. */
export function levelDef(content: Content, id: TrackId, level: number): LicenseLevel | undefined {
  return trackDef(content, id).levels[level - 1];
}

export interface Requirement {
  track: TrackId;
  have: number;
  need: number;
  gap: number;
  /** Chance the track's consequence hits on release (power: 0, it slows training instead). */
  risk: number;
}

/** The License to Scale checklist for a run of the given tier. */
export function requirementsFor(state: GameState, content: Content, tier: number): Requirement[] {
  return TRACK_IDS.map((track) => {
    const have = state.license[track].level;
    const gap = Math.max(0, tier - have);
    const risk = track === 'power' ? 0 : Math.min(0.9, gap * content.license.riskPerGap);
    return { track, have, need: tier, gap, risk };
  });
}

export function powerSpeedFactor(content: Content, powerGap: number): number {
  return Math.max(0.25, 1 - powerGap * content.license.powerSlowdownPerGap);
}

export function licenseUpkeep(state: GameState, content: Content): number {
  return TRACK_IDS.reduce((sum, t) => sum + (levelDef(content, t, state.license[t].level)?.upkeep ?? 0), 0);
}

export function licenseRevenue(state: GameState, content: Content): number {
  return TRACK_IDS.reduce((sum, t) => sum + (levelDef(content, t, state.license[t].level)?.weeklyRevenue ?? 0), 0);
}

/** The next upgrade available on a track, or undefined at max level. */
export function nextUpgrade(state: GameState, content: Content, track: TrackId): LicenseLevel | undefined {
  return levelDef(content, track, state.license[track].level + 1);
}
