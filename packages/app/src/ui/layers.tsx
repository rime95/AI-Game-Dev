import type { Tab } from '../store';

/** One color per stack layer (art-direction §3). Keep in sync with styles.css. */
export const LAYER = {
  silicon: '#138a7d',
  compute: '#2a63d4',
  power: '#c97c12',
  env: '#3b8f55',
  models: '#6d45c4',
  products: '#d4553d',
  trust: '#4a5568',
  gold: '#b8901a',
} as const;

export const TAB_META: Record<Tab, { label: string; color: string; icon: string }> = {
  overview: { label: 'Company', color: LAYER.trust, icon: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6' },
  compute: { label: 'Compute', color: LAYER.compute, icon: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01' },
  silicon: { label: 'Silicon', color: LAYER.silicon, icon: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4' },
  license: { label: 'License', color: LAYER.trust, icon: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5' },
  models: { label: 'Models', color: LAYER.models, icon: 'M12 3a4 4 0 0 0-4 4v1a4 4 0 0 0-2 7 4 4 0 0 0 6 4 4 4 0 0 0 6-4 4 4 0 0 0-2-7V7a4 4 0 0 0-4-4zM12 3v18' },
  products: { label: 'Products', color: LAYER.products, icon: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2' },
  team: { label: 'Team', color: LAYER.gold, icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-5-5.9' },
  rivals: { label: 'Rivals', color: LAYER.products, icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4' },
};

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
