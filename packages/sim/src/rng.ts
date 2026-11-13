/** Seeded PRNG (mulberry32). State lives in the game state so runs are reproducible. */
export function rand(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: { rng: number }, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

export function pickWeighted<T extends { weight: number }>(s: { rng: number }, items: T[]): T | undefined {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = rand(s) * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
