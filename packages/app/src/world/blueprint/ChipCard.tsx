import { useMemo } from 'react';
import type { Chip, ProcessNode } from '@stm/content';
import { normalizeSplit, type ChipDesign } from '@stm/sim';
import { LAYER } from '../../ui/layers';
import { BpBox, Callout, Layer } from './parts';
import { useDetails } from '../../panels/Panel';

/**
 * Exploded accelerator card (world-and-facilities §8), generated from the design's numbers:
 * die floorplan from the area split, one HBM tower per stack, power stages from the wattage,
 * low-precision units as strips inside the compute block.
 */
export function ChipCard({ design, chip, node }: { design: ChipDesign; chip: Chip; node: ProcessNode }) {
  const split = normalizeSplit(design.split);
  const stacks = Math.max(1, Math.round(chip.memGB / node.hbmGBPerStack));
  const die = Math.sqrt(node.dieAreaMm2) / 10; // cm on the drawing
  const powerStages = Math.max(4, Math.min(24, Math.round(chip.watts / 80)));
  const details = useDetails();

  const plan = useMemo(
    () => floorplan(split, die, design.fp8, design.fp4),
    [split.compute, split.sram, split.memory, split.interconnect, die, design.fp8, design.fp4],
  );
  const perSide = Math.ceil(stacks / 2);
  const hbmPitch = Math.min(1.1, (die + 0.4) / perSide);
  const interposerW = die + 2 * 1.0 + 0.4;
  const interposerD = Math.max(die, perSide * hbmPitch) + 0.6;

  return (
    <group>
      {/* Board with power stages and the edge connector */}
      <Layer y={0} lift={0}>
        <BpBox size={[12, 0.16, 7]} position={[0, 0.08, 0]} />
        {Array.from({ length: powerStages }, (_, i) => (
          <BpBox
            key={i}
            size={[0.42, 0.22, 0.42]}
            position={[-5.2 + (i % 12) * 0.5, 0.27, 2.7 - Math.floor(i / 12) * 0.55]}
            tint={LAYER.power}
            opacity={0.5}
          />
        ))}
        <BpBox size={[6, 0.04, 0.4]} position={[0, 0.02, -3.7]} tint={LAYER.gold} opacity={0.6} />
        <Callout
          position={[6.2, 0.3, 2.4]}
          title="Board + power stages"
          lines={[`${powerStages} power stages`, `${chip.watts} W per chip`]}
        />
      </Layer>

      {/* Package substrate */}
      <Layer y={0.16} lift={0.7}>
        <BpBox size={[interposerW + 1.2, 0.12, interposerD + 1.2]} position={[0, 0.06, 0]} />
        <Callout position={[(interposerW + 1.2) / 2 + 0.2, 0.1, 0]} title="Package" lines={['Organic substrate', `${node.name} process`]} />
      </Layer>

      {/* Silicon interposer */}
      <Layer y={0.28} lift={1.5}>
        <BpBox size={[interposerW, 0.06, interposerD]} position={[0, 0.03, 0]} tint={LAYER.silicon} opacity={0.3} />
        <Callout position={[-interposerW / 2 - 0.2, 0.05, 0]} side="left" title="Interposer" lines={['Wires the memory to the chip']} />
      </Layer>

      {/* The die: floorplan blocks from the area split */}
      <Layer y={0.34} lift={2.5}>
        {plan.map((b) => (
          <BpBox key={b.key} size={[b.w, 0.08, b.d]} position={[b.x, 0.04, b.z]} tint={b.tint} opacity={0.55} />
        ))}
        {/* Core grid inside compute */}
        {plan
          .filter((b) => b.key.startsWith('compute'))
          .flatMap((b) => coreGrid(b, chip.tflops.fp16))
          .map((c, i) => (
            <BpBox key={`core${i}`} size={[c.w, 0.02, c.d]} position={[c.x, 0.09, c.z]} tint={LAYER.compute} opacity={0.25} />
          ))}
        <Callout
          position={[die / 2 + 0.3, 0.1, -die / 2]}
          title={`Die · ${node.dieAreaMm2} mm²`}
          lines={
            details
              ? [
                  `Compute ${Math.round(split.compute * 100)}% · ${chip.tflops.fp16} TFLOPS FP16`,
                  design.fp4
                    ? `FP8 + FP4 units · ${chip.tflops.fp4} TFLOPS FP4`
                    : design.fp8
                      ? `FP8 units · ${chip.tflops.fp8} TFLOPS FP8`
                      : 'No low-precision units',
                  `SRAM ${Math.round(split.sram * 100)}% · ×${(1 + split.sram * 2).toFixed(2)} bandwidth`,
                  `Links ${Math.round(split.interconnect * 100)}% · ${chip.interconnectGBs} GB/s`,
                ]
              : [
                  `Compute ${Math.round(split.compute * 100)}%: the number crunchers`,
                  design.fp4 ? 'Turbo math built in' : design.fp8 ? 'Fast math built in' : 'Careful math only',
                  `Cache ${Math.round(split.sram * 100)}%: speeds up memory`,
                  `Links ${Math.round(split.interconnect * 100)}%: talks to other chips`,
                ]
          }
        />
      </Layer>

      {/* HBM stacks on both sides of the die */}
      {[-1, 1].map((side) => (
        <Layer key={side} y={0.34} lift={2.5} slide={[side * 1.2, 0]}>
          {Array.from({ length: side < 0 ? perSide : stacks - perSide }, (_, i) => {
            const z = (i - ((side < 0 ? perSide : stacks - perSide) - 1) / 2) * hbmPitch;
            const x = side * (die / 2 + 0.6);
            return (
              <group key={i} position={[x, 0, z]}>
                {Array.from({ length: 6 }, (_, k) => (
                  <BpBox key={k} size={[0.7, 0.07, hbmPitch * 0.8]} position={[0, 0.04 + k * 0.08, 0]} tint={LAYER.models} opacity={0.4} />
                ))}
              </group>
            );
          })}
        </Layer>
      ))}
      <Layer y={0.34} lift={2.5} slide={[-1.2, 0]}>
        <Callout
          position={[-die / 2 - 1.2, 0.6, 0]}
          side="left"
          title={`Memory stacks × ${stacks}`}
          lines={details ? [`${chip.memGB} GB`, `${chip.memBwTBs} TB/s effective`] : [`${chip.memGB} GB of fast memory`]}
        />
      </Layer>

      {/* Cold plate with fins */}
      <Layer y={0.9} lift={4.2}>
        <BpBox size={[interposerW + 0.6, 0.25, interposerD + 0.6]} position={[0, 0.12, 0]} tint="#8fb4d9" opacity={0.2} />
        {Array.from({ length: 10 }, (_, i) => (
          <BpBox
            key={i}
            size={[0.06, 0.45, interposerD + 0.4]}
            position={[-((interposerW + 0.2) / 2) + i * ((interposerW + 0.2) / 9), 0.47, 0]}
            tint="#8fb4d9"
            opacity={0.15}
          />
        ))}
        <Callout position={[(interposerW + 0.6) / 2 + 0.2, 0.3, 0]} title="Cold plate" lines={[`Removes ~${chip.watts} W`]} />
      </Layer>
    </group>
  );
}

interface Block {
  key: string;
  x: number;
  z: number;
  w: number;
  d: number;
  tint: string;
}

/**
 * Die layout: memory PHYs on the left/right edges (next to the HBM), links on the top/bottom
 * edges, SRAM in a band through the middle, compute filling the rest, low-precision units as strips.
 */
function floorplan(
  s: { compute: number; sram: number; memory: number; interconnect: number },
  die: number,
  fp8: boolean,
  fp4: boolean,
): Block[] {
  const area = die * die;
  const memW = (s.memory * area) / die / 2; // each side
  const innerW = die - memW * 2;
  const linkD = innerW > 0 ? (s.interconnect * area) / innerW / 2 : 0;
  const innerD = die - linkD * 2;
  const sramD = innerD * (s.sram / Math.max(1e-6, s.sram + s.compute));
  const computeD = (innerD - sramD) / 2;
  const blocks: Block[] = [];
  if (memW > 0.01) {
    blocks.push({ key: 'memL', x: -die / 2 + memW / 2, z: 0, w: memW, d: die, tint: LAYER.models });
    blocks.push({ key: 'memR', x: die / 2 - memW / 2, z: 0, w: memW, d: die, tint: LAYER.models });
  }
  if (linkD > 0.01) {
    blocks.push({ key: 'linkT', x: 0, z: -die / 2 + linkD / 2, w: innerW, d: linkD, tint: LAYER.silicon });
    blocks.push({ key: 'linkB', x: 0, z: die / 2 - linkD / 2, w: innerW, d: linkD, tint: LAYER.silicon });
  }
  if (sramD > 0.01) blocks.push({ key: 'sram', x: 0, z: 0, w: innerW, d: sramD, tint: LAYER.env });
  // Compute above and below the SRAM band; the precision units take a share of each.
  const prec = (fp8 ? 0.1 : 0) + (fp8 && fp4 ? 0.1 : 0);
  for (const sign of [-1, 1]) {
    const zc = sign * (sramD / 2 + computeD / 2);
    const coreW = innerW * (1 - prec);
    blocks.push({ key: `compute${sign}`, x: -innerW / 2 + coreW / 2, z: zc, w: coreW, d: computeD, tint: LAYER.compute });
    if (prec > 0)
      blocks.push({ key: `prec${sign}`, x: innerW / 2 - (innerW * prec) / 2, z: zc, w: innerW * prec, d: computeD, tint: LAYER.products });
  }
  return blocks;
}

function coreGrid(b: Block, tflops: number): Block[] {
  const n = Math.max(2, Math.min(8, Math.round(Math.sqrt(tflops / 40))));
  const out: Block[] = [];
  const cw = b.w / n;
  const rows = Math.max(1, Math.round(n * (b.d / b.w)));
  const cd = b.d / rows;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < rows; j++)
      out.push({ key: '', x: b.x - b.w / 2 + cw * (i + 0.5), z: b.z - b.d / 2 + cd * (j + 0.5), w: cw * 0.8, d: cd * 0.8, tint: '' });
  return out;
}
