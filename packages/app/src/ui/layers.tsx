import type { Era } from '@stm/sim';
import type { Tab } from '../store';

/** One color per stack layer (art-direction §3), tuned to glow on the dark UI. Keep in sync with styles.css. */
export const LAYER = {
  silicon: '#2dd4bf',
  compute: '#5b8cff',
  power: '#f5a524',
  env: '#4ade80',
  models: '#a78bfa',
  products: '#ff7a59',
  trust: '#94a3b8',
  gold: '#facc15',
} as const;

export const BAD = '#f87171';

export const TAB_META: Record<Tab, { label: string; short?: string; color: string; icon: string }> = {
  overview: { label: 'Company', color: LAYER.trust, icon: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6' },
  hq: { label: 'HQ', color: LAYER.gold, icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01' },
  sites: { label: 'Data centers', color: LAYER.compute, icon: 'M3 20h18M5 20V10h6v10M13 20V6h6v14M7 13h2M7 16h2M15 9h2M15 12h2M15 15h2' },
  fab: { label: 'Fab', color: LAYER.silicon, icon: 'M3 21h18M4 21V11l5 3V11l5 3V7h6v14M16 10h2M16 13h2M16 16h2' },
  compute: { label: 'Compute', color: LAYER.compute, icon: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01' },
  silicon: { label: 'Silicon', color: LAYER.silicon, icon: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4' },
  license: { label: 'License to Scale', short: 'Licenses', color: LAYER.trust, icon: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5' },
  models: { label: 'Models', color: LAYER.models, icon: 'M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7 4 4 0 0 0 6 4 4 4 0 0 0 6-4 4 4 0 0 0-2-7V7a4 4 0 0 0-4-4zM12 3v18' },
  products: { label: 'Products', color: LAYER.products, icon: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2' },
  team: { label: 'Team', color: LAYER.gold, icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-5-5.9' },
  deals: { label: 'Deals', color: LAYER.gold, icon: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18' },
  rivals: { label: 'Rivals', color: LAYER.products, icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4' },
  chip: { label: 'Chips', color: LAYER.silicon, icon: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4M10 10h4v4h-4z' },
  research: { label: 'Research', color: LAYER.models, icon: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9' },
};

/** The rail, in four groups. Hotkeys 1–9, 0, -, = follow this order. */
export const NAV_GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: 'Company', tabs: ['overview', 'team', 'deals', 'rivals'] },
  { label: 'Facilities', tabs: ['hq', 'sites', 'fab'] },
  { label: 'Make', tabs: ['silicon', 'compute', 'models', 'products'] },
  { label: 'Govern', tabs: ['license'] },
];
/** The founding years: a small company, a small rail. More appears as the company grows. */
export const FOUNDING_NAV: { label: string; tabs: Tab[] }[] = [
  { label: 'Company', tabs: ['overview', 'team', 'rivals'] },
  { label: 'Workshop', tabs: ['chip', 'research', 'hq'] },
];
export const NAV_ORDER: Tab[] = NAV_GROUPS.flatMap((g) => g.tabs);
export const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function navGroups(era: Era | undefined): { label: string; tabs: Tab[] }[] {
  return era === 'founding' ? FOUNDING_NAV : NAV_GROUPS;
}
export function navOrder(era: Era | undefined): Tab[] {
  return navGroups(era).flatMap((g) => g.tabs);
}

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
