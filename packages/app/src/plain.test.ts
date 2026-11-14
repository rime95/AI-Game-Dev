import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { applyCommand, createGame, previewTraining, type GameState } from '@stm/sim';
import { modelPresets } from './presets';
import { nextStep } from './guide';

const fresh = (): GameState => createGame(content, 7, 'Plain Co');
const run = (s: GameState, ...cmds: Parameters<typeof applyCommand>[2][]): GameState => {
  for (const c of cmds) {
    const r = applyCommand(s, content, c);
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
};

describe('model size cards', () => {
  it('offer nothing until we have chips', () => {
    expect(modelPresets(fresh(), content, 'dense', 'M1')).toEqual([]);
  });

  it('offer growing sizes that a new company can actually start', () => {
    const s = run(fresh(), { type: 'rentChips', chipId: content.chips[0]!.id, count: 64 });
    const cards = modelPresets(s, content, 'dense', 'M1');
    expect(cards.length).toBeGreaterThan(1);
    for (let i = 1; i < cards.length; i++) expect(cards[i]!.spec.paramsB).toBeGreaterThan(cards[i - 1]!.spec.paramsB);
    const quick = cards[0]!;
    expect(quick.blocked).toBeNull();
    // Buying the missing data first and then starting must work, exactly as the Start button does.
    let t = s;
    if (quick.dataShortB > 0) t = run(t, { type: 'buyData', billions: quick.dataShortB });
    expect(previewTraining(t, content, quick.spec).errors).toEqual([]);
    t = run(t, { type: 'startTraining', spec: quick.spec });
    expect(t.training?.spec.paramsB).toBe(quick.spec.paramsB);
  });
});

describe('next step guide', () => {
  it('walks a new player from renting chips to training', () => {
    let s = fresh();
    expect(nextStep(s).key).toBe('rent');
    s = run(s, { type: 'rentChips', chipId: content.chips[0]!.id, count: 64 });
    expect(nextStep(s)).toMatchObject({ key: 'train', tab: 'models' });
    const quick = modelPresets(s, content, 'dense', 'M1')[0]!;
    if (quick.dataShortB > 0) s = run(s, { type: 'buyData', billions: quick.dataShortB });
    s = run(s, { type: 'startTraining', spec: quick.spec });
    expect(nextStep(s).key).toBe('wait');
  });
});

/** Words a new player shouldn't meet in event, chip, license or company text. */
const JARGON = /\b(FLOPs?|TFLOPS|HBM|SRAM|PUE|colocation|SLA|checkpoint|tape-?out|respin|Suite v\d|eval suite|tokens per parameter)\b/i;

function texts(value: unknown, path: string, out: { path: string; text: string }[]) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (['name', 'blurb', 'title', 'body', 'label', 'detail', 'missing', 'speaker'].includes(k) || typeof v === 'object') texts(v, `${path}.${k}`, out);
  return out;
}

describe('player-facing content', () => {
  it('stays free of unexplained jargon', () => {
    const { events, chips, archs, license, startups, funding, hq, sites } = content as unknown as Record<string, unknown>;
    const all = texts({ events, chips, archs, license, startups, funding, hq, sites }, 'content', []);
    expect(all.length).toBeGreaterThan(150);
    const found = all.filter((t) => JARGON.test(t.text));
    expect(found).toEqual([]);
  });
});
