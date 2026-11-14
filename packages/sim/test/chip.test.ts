import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import { seated } from './helpers';
import {
  applyCommand,
  archFit,
  createGame,
  deriveChip,
  getArch,
  previewChip,
  previewTraining,
  type ChipDesign,
  type Command,
  type GameState,
} from '../src';

const n7 = content.nodes.find((n) => n.id === 'n7')!;
const moe = getArch(content, 'moe')!;

const balanced: ChipDesign = {
  name: 'Sandpiper',
  nodeId: 'n7',
  split: { compute: 0.55, sram: 0.15, memory: 0.2, interconnect: 0.1 },
  fp8: true,
  fp4: false,
};
const memoryHeavy: ChipDesign = { ...balanced, name: 'Deepwell', split: { compute: 0.35, sram: 0.15, memory: 0.25, interconnect: 0.25 } };

function run(state: GameState, cmds: Command[]): GameState {
  for (const cmd of cmds) {
    const res = applyCommand(state, content, cmd);
    if (res.error) throw new Error(`${cmd.type}: ${res.error}`);
    state = res.state;
  }
  return state;
}

describe('chip design', () => {
  it('derives a 7 nm balanced chip in the same league as the vendor workhorse', () => {
    const chip = deriveChip(n7, balanced, 'x');
    expect(chip.tflops.fp16).toBeGreaterThan(300);
    expect(chip.tflops.fp16).toBeLessThan(500);
    expect(chip.tflops.fp8).toBe(chip.tflops.fp16 * 2);
    expect(chip.tflops.fp4).toBe(0);
    expect(chip.memGB).toBe(6 * n7.hbmGBPerStack);
    expect(chip.priceUsd).toBeLessThan(content.chips[0]!.priceUsd); // no vendor margin
  });

  it('lets you trade compute for memory and links to fit MoE (the co-design hook)', () => {
    const computeHeavy: ChipDesign = { ...balanced, split: { compute: 0.78, sram: 0.1, memory: 0.08, interconnect: 0.04 } };
    const a = deriveChip(n7, computeHeavy, 'a');
    const b = deriveChip(n7, memoryHeavy, 'b');
    expect(b.tflops.fp16).toBeLessThan(a.tflops.fp16);
    expect(archFit(b, moe).fit).toBeGreaterThan(archFit(a, moe).fit);
  });

  it('charges die area for precision units', () => {
    const plain = deriveChip(n7, { ...balanced, fp8: false }, 'p');
    const fp4 = deriveChip(n7, { ...balanced, fp8: true, fp4: true }, 'q');
    expect(fp4.tflops.fp16).toBeLessThan(plain.tflops.fp16);
    expect(fp4.tflops.fp4).toBe(fp4.tflops.fp16 * 4);
  });

  it('requires hardware engineers and an open node', () => {
    const s = createGame(content, 1);
    expect(previewChip(s, content, balanced).errors.join()).toMatch(/hardware engineer/);
    expect(previewChip(s, content, { ...balanced, nodeId: 'n5' }).errors.join()).toMatch(/week 30/);
  });

  it('tapes out, delivers a working chip and lets you train on it', () => {
    let s = createGame(content, 11);
    s.cash = 100_000_000; // test shortcut: tape-outs are a mid-game purchase
    s = run(s, [
      { type: 'hire', discipline: 'hardwareEng' },
      { type: 'hire', discipline: 'hardwareEng' },
    ]);
    s = seated(s); // engineers need a hardware lab
    s = run(s, [{ type: 'startTapeout', design: balanced }]);
    expect(s.cash).toBeLessThanOrEqual(100_000_000 - n7.tapeoutCost);
    for (let i = 0; i < 30 && s.customChips.length === 0; i++) {
      if (s.pendingEvent) s = run(s, [{ type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }]);
      s = run(s, [{ type: 'advanceWeek' }]);
    }
    const info = s.customChipInfo[s.customChips[0]!.id];
    expect(info.design.name).toBe(balanced.name);
    expect(info.yieldRate).toBeGreaterThan(0.29);
    expect(s.customChips).toHaveLength(1);
    const chip = s.customChips[0]!;
    expect(applyCommand(s, content, { type: 'rentChips', chipId: chip.id, count: 8 }).error).toMatch(/foundry/);
    s.cash = 50_000_000; // test shortcut: fund the purchase
    s = run(s, [{ type: 'buyChips', chipId: chip.id, count: 64 }]);
    const p = previewTraining(s, content, {
      name: 'On our silicon',
      archId: 'dense',
      paramsB: 7,
      tokensB: 140,
      precision: 'fp8',
      chipId: chip.id,
      chipCount: 64,
    });
    expect(p.errors).toEqual([]);
    expect(p.utilization).toBeGreaterThan(0.3);
  });
});
