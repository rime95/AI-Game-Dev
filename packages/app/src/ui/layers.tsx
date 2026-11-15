/** One color per stack layer (art-direction §3), Night Lab pastels that glow on navy. Keep in sync with styles.css. */
export const LAYER = {
  silicon: '#5eead4',
  compute: '#7aa2ff',
  power: '#fbbf24',
  env: '#6ee7a8',
  models: '#b49cff',
  products: '#ff8f73',
  trust: '#a3b1d1',
  gold: '#fcd34d',
} as const;

export const BAD = '#f87171';

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
