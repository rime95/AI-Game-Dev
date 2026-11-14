export function money(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export function big(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Scientific notation for FLOPs, e.g. 5.9e21. */
export function sci(n: number): string {
  if (n <= 0) return '0';
  const e = Math.floor(Math.log10(n));
  return `${(n / 10 ** e).toFixed(1)}e${e}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function dateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "×1.4" against a reference (the starter chip, say). */
export function times(x: number): string {
  if (!isFinite(x) || x <= 0) return '×0';
  return `×${x >= 10 ? x.toFixed(0) : x >= 2 ? x.toFixed(1) : x.toFixed(2).replace(/0$/, '')}`;
}

/** Training data in book-equivalents (1B tokens ≈ 10,000 books). */
export function books(tokensB: number): string {
  return `${big(tokensB * 1e4)} books`;
}

/** A weekly chance in three words. */
export function riskLabel(p: number): 'Low' | 'Some' | 'High' {
  return p < 0.02 ? 'Low' : p < 0.06 ? 'Some' : 'High';
}

export function weeks(n: number): string {
  if (n >= 104) return `${(n / 52).toFixed(1)} years`;
  if (n >= 8) {
    const m = Math.round(n / (52 / 12));
    return `${m} month${m === 1 ? '' : 's'}`;
  }
  return `${Math.round(n)} week${Math.round(n) === 1 ? '' : 's'}`;
}

/** Megawatts as homes powered (~800 homes per MW). */
export function homes(mw: number): string {
  return `${big(mw * 800)} homes`;
}
