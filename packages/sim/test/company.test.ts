import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  createFoundingGame,
  createGame,
  designPreview,
  goalMet,
  launchReception,
  migrateSave,
  moveCheck,
  researchError,
  segmentShares,
  splitFit,
  TUNING,
  type Command,
  type GameState,
  type ProductDesign,
} from '../src';

const act = (s: GameState, cmd: Command): GameState => {
  const r = applyCommand(s, content, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
};
const ideal = (t: 'cpu' | 'gpu') => ({ ...content.founding.types.find((x) => x.id === t)!.ideal });
const design = (type: 'cpu' | 'gpu', extra: Partial<ProductDesign> = {}): ProductDesign => ({ name: `Test ${type}`, type, genId: 'g1000', split: ideal(type), scale: 1, ...extra });

/** Play months, answering any decision with its first choice. */
function months(s: GameState, n: number): GameState {
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
    s = act(s, { type: 'advanceMonth' });
  }
  return s;
}

/** Design a chip and play until it's on the shelf. */
function ship(s: GameState, d: ProductDesign): GameState {
  const before = s.founding!.products.length;
  s = act(s, { type: 'startDesign', design: d });
  for (let i = 0; i < 24 && s.founding!.products.length === before; i++) s = months(s, 1);
  return s;
}

describe('the chip-company years', () => {
  it('start in January 1991: one founder in a garage with a workbench, processors and graphics chips to make', () => {
    const s = createFoundingGame(content, 1, 'Garage Co');
    expect(s.era).toBe('founding');
    expect(s.cash).toBe(content.founding.startCash);
    expect(s.staff.hardwareEng).toBe(1);
    expect(s.hq.rooms.some((r) => r.templateId === 'workbench')).toBe(true);
    expect(designPreview(s, content, design('cpu')).errors).toEqual([]);
    expect(designPreview(s, content, design('gpu')).errors).toEqual([]);
    expect(designPreview(s, content, { ...design('cpu'), genId: 'g800' }).errors[0]).toMatch(/Research/);
  });

  it('scores a design by how well its die split suits the kind of chip', () => {
    const cpuSplit = ideal('cpu');
    const gpuSplit = ideal('gpu');
    expect(splitFit(content, 'cpu', cpuSplit)).toBeGreaterThan(splitFit(content, 'cpu', gpuSplit));
    expect(splitFit(content, 'gpu', gpuSplit)).toBeGreaterThan(splitFit(content, 'gpu', cpuSplit));
    const s = createFoundingGame(content, 1);
    expect(designPreview(s, content, design('gpu')).expectedScore).toBeGreaterThan(designPreview(s, content, design('gpu', { split: cpuSplit })).expectedScore);
  });

  it('ships a chip: factory months, then reviews, then sales', () => {
    let s = createFoundingGame(content, 3);
    s = ship(s, design('cpu'));
    const chip = s.founding!.products[0]!;
    expect(chip.reviews).toHaveLength(content.founding.reviewers.length);
    expect(chip.score).toBeGreaterThan(1);
    const cash = s.cash;
    s = months(s, 3);
    expect(s.founding!.products[0]!.revenue).toBeGreaterThan(0);
    expect(s.founding!.totalSales).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(cash - 1); // no salaries yet: sales only add
  });

  it('gives the same reviews for the same seed', () => {
    const a = ship(createFoundingGame(content, 9), design('gpu'));
    const b = ship(createFoundingGame(content, 9), design('gpu'));
    expect(a.founding!.products[0]!.reviews).toEqual(b.founding!.products[0]!.reviews);
  });

  it('turns buzz into a better launch for a good chip and a worse one for a weak chip', () => {
    expect(launchReception(8, 90)).toBeGreaterThan(launchReception(8, 0));
    expect(launchReception(3, 90)).toBeLessThan(launchReception(3, 0));
  });

  it('sells less of an overpriced chip', () => {
    let s = ship(createFoundingGame(content, 4), design('cpu'));
    const id = s.founding!.products[0]!.id;
    const fair = segmentShares(s, content).find((g) => g.segmentId === 'home')!.share;
    s = act(s, { type: 'setChipPrice', productId: id, price: s.founding!.products[0]!.price * 2 });
    expect(segmentShares(s, content).find((g) => g.segmentId === 'home')!.share).toBeLessThan(fair);
  });

  it('gates research by year and prerequisites', () => {
    const s = createFoundingGame(content, 1);
    s.founding!.researchPoints = 500;
    expect(researchError(s, content, 'r-3d')).toMatch(/1995/);
    expect(researchError(s, content, 'r-testlab')).toMatch(/Design software/);
    expect(researchError(s, content, 'r-tools')).toBeNull();
    const t = act(s, { type: 'buyResearch', researchId: 'r-tools' });
    expect(t.founding!.unlocked).toContain('r-tools');
  });

  it('keeps rivals behind our best chip of each kind', () => {
    let s = createFoundingGame(content, 6);
    s = ship(s, design('cpu', { scale: 1.3 }));
    s = months(s, 30);
    const best = Math.max(...s.founding!.products.filter((p) => p.design.type === 'cpu').map((p) => p.score));
    for (const r of s.founding!.rivals.filter((r) => content.founding.rivals.find((d) => d.id === r.id)!.type === 'cpu' && r.chips > 0))
      expect(r.score).toBeLessThan(best);
  });

  it('spaces decisions out', () => {
    let s = createFoundingGame(content, 12);
    const at: number[] = [];
    for (let i = 0; i < 120 && s.status === 'playing'; i++) {
      if (s.pendingEvent) {
        at.push(s.week);
        s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices[0]!.id });
      }
      if (!s.founding!.projects.length && s.cash > 40_000) {
        const r = applyCommand(s, content, { type: 'startDesign', design: design(s.week % 2 ? 'cpu' : 'gpu') });
        if (!r.error) s = r.state;
      }
      s = act(s, { type: 'advanceMonth' });
    }
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(TUNING.foundingEventCooldown);
  });

  it('opens the office after three chips (or enough cash), and only then lets us hire', () => {
    let s = createFoundingGame(content, 2);
    expect(applyCommand(s, content, { type: 'hire', discipline: 'hardwareEng' }).error).toMatch(/office/);
    expect(moveCheck(s, content).error).toBeTruthy();
    s.founding!.products.push(...[1, 2, 3].map((i) => ({ ...ship(createFoundingGame(content, 2), design('cpu')).founding!.products[0]!, id: `x${i}` })));
    s.cash = 500_000;
    expect(moveCheck(s, content).error).toBeUndefined();
    s = act(s, { type: 'moveHq' });
    s = act(s, { type: 'hire', discipline: 'hardwareEng' });
    expect(s.staff.hardwareEng).toBe(2);
  });

  it('completes a chapter once, pays its reward and moves on', () => {
    let s = createFoundingGame(content, 5);
    const ch = content.founding.chapters[0]!;
    s = ship(s, design('gpu', { scale: 1.3 }));
    s.founding!.totalSales = 1e6;
    s.founding!.products[0]!.score = 9;
    const rp = s.founding!.researchPoints;
    s = months(s, 1);
    expect(s.founding!.chapter.index).toBe(1);
    expect(s.founding!.researchPoints).toBeGreaterThanOrEqual(rp + (ch.reward.researchPoints ?? 0));
    expect(ch.goals.every((g) => goalMet(s, content, g))).toBe(true);
    const idx = s.founding!.chapter.index;
    s = months(s, 2);
    expect(s.founding!.chapter.index).toBe(idx); // the next chapter's goals aren't met yet
  });

  it('opens the AI chapter with our best graphics chip in the fleet', () => {
    let s = ship(createFoundingGame(content, 8), design('gpu'));
    expect(applyCommand(s, content, { type: 'startAiEra' }).error).toMatch(/neural/i);
    s.founding!.unlocked.push('r-gpgpu', 'r-neural');
    s.week = 12 * 22;
    const ai = act(s, { type: 'startAiEra' });
    expect(ai.era).toBe('ai');
    expect(ai.founding!.products.length).toBe(1);
    expect(ai.customChips).toHaveLength(1);
    expect(ai.fleet.find((x) => x.chipId === ai.customChips[0]!.id)?.count).toBe(64);
    expect(new Date(ai.aiStartUtc!).getUTCFullYear()).toBe(2013);
    const later = act(ai, { type: 'advanceMonth' });
    expect(later.week).toBeGreaterThan(0);
  });

  it('upgrades a v17 save to the AI era', () => {
    const s = { ...structuredClone(createGame(content, 1)), version: 17 } as Record<string, unknown>;
    delete s.era;
    delete s.founding;
    const res = migrateSave(s, content);
    expect('state' in res && res.state.era).toBe('ai');
  });
});

describe('moving rooms', () => {
  it('moves a room for free and refuses spots that are taken or outside', () => {
    let s = createFoundingGame(content, 1);
    const bench = s.hq.rooms.find((r) => r.templateId === 'workbench')!;
    const cash = s.cash;
    s = act(s, { type: 'moveRoom', roomId: bench.id, x: 5, y: 4, rot: 0 });
    const moved = s.hq.rooms.find((r) => r.id === bench.id)!;
    expect([moved.x, moved.y]).toEqual([5, 4]);
    expect(s.cash).toBe(cash);
    // Nudging it one tile over its own old spot is fine; off the edge is not.
    s = act(s, { type: 'moveRoom', roomId: bench.id, x: 4, y: 4, rot: 0 });
    expect(applyCommand(s, content, { type: 'moveRoom', roomId: bench.id, x: 7, y: 4, rot: 0 }).error).toBeTruthy();
    const other = s.hq.rooms.find((r) => r.id !== bench.id)!;
    expect(applyCommand(s, content, { type: 'moveRoom', roomId: bench.id, x: other.x, y: other.y, rot: other.rot }).error).toBeTruthy();
  });
});
