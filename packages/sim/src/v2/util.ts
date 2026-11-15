import { rand } from '../rng';
import { T } from './data';
import type { GameV2, Tone } from './types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const yearOf = (day: number) => T.startYear + Math.floor(day / 360);
export const monthIndex = (day: number) => Math.floor(day / 30);
export const monthOf = (day: number) => Math.floor((day % 360) / 30);
export const dayOfMonth = (day: number) => (day % 30) + 1;

/** "March 1991". */
export const monthLabel = (day: number) => `${MONTHS[monthOf(day)]} ${yearOf(day)}`;
/** "12 Mar 1991". */
export const dateLabel = (day: number) => `${dayOfMonth(day)} ${MONTHS[monthOf(day)].slice(0, 3)} ${yearOf(day)}`;

export function log(s: GameV2, text: string, tone: Tone = 'info'): void {
  s.log.push({ day: s.day, text, tone });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

export function newId(s: GameV2, prefix: string): string {
  return `${prefix}-${s.nextId++}`;
}

export function pick<X>(s: GameV2, list: readonly X[]): X {
  return list[Math.floor(rand(s) * list.length)]!;
}

export function between(s: GameV2, lo: number, hi: number): number {
  return lo + rand(s) * (hi - lo);
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function money(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** Book a cost or income line for this month. Positive amounts are costs unless `income`. */
export function spend(s: GameV2, line: 'salaries' | 'facilities' | 'projects' | 'marketing' | 'hiring' | 'other', amount: number): void {
  s.cash -= amount;
  s.month[line] += amount;
}
