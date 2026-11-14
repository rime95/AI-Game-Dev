import { useEffect, useMemo, useState } from 'react';
import { content, type Chip } from '@stm/content';
import { archFit, normalizeSplit, previewChip, type ChipDesign, type DieSplit, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money, pct, times, weeks } from '../format';
import { LAYER } from '../ui/layers';
import { Term } from '../ui/Term';
import { Advisor, Bar, useDetails, useSubTab } from './Panel';

const BLOCKS: { key: keyof DieSplit; label: string; does: string }[] = [
  { key: 'compute', label: 'Compute cores', does: 'Raw speed (TFLOPS)' },
  { key: 'sram', label: 'On-chip cache (SRAM)', does: 'Makes the main memory feel faster' },
  { key: 'memory', label: 'Memory stacks (HBM)', does: 'Memory size and speed (25 mm² per stack)' },
  { key: 'interconnect', label: 'Chip links', does: 'How fast chips talk to each other' },
];

const PRESETS: { label: string; blurb: string; split: DieSplit }[] = [
  { label: 'Good at everything', blurb: 'A safe all-round chip for training and serving.', split: { compute: 0.55, sram: 0.15, memory: 0.2, interconnect: 0.1 } },
  { label: 'Built for training', blurb: 'Almost all speed. Best for training all-rounder models.', split: { compute: 0.78, sram: 0.1, memory: 0.08, interconnect: 0.04 } },
  { label: 'Built for experts', blurb: 'Lots of memory and fast links, for team-of-experts models.', split: { compute: 0.35, sram: 0.15, memory: 0.25, interconnect: 0.25 } },
];

/** Chip generations from oldest to newest, in plain words. */
const GEN_NAME = ['Older and cheap', 'Modern', 'Cutting-edge'];
function genName(nodeId: string): string {
  const i = content.nodes.findIndex((n) => n.id === nodeId);
  return GEN_NAME[i] ?? content.nodes[i]?.name ?? nodeId;
}

/** The chip everyone starts on, for "×1.4 as fast" comparisons. */
export const STARTER_CHIP = content.chips[0]!;

function bugLabel(p: number): string {
  return p < 0.15 ? 'Low' : p < 0.35 ? 'Some' : 'High';
}

export function SiliconPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const [design, setDesign] = useState<ChipDesign>({
    name: `Sandpiper ${game.customChips.length + 1}`,
    nodeId: 'n7',
    split: PRESETS[0]!.split,
    fp8: true,
    fp4: false,
  });
  const preview = useMemo(() => previewChip(game, content, design), [game, design]);
  const setChipDraft = useStore((s) => s.setChipDraft);
  useEffect(() => setChipDraft(design), [design, setChipDraft]);
  const split = normalizeSplit(design.split);
  const setBlock = (key: keyof DieSplit, value: number) => setDesign((d) => ({ ...d, split: { ...d.split, [key]: value } }));
  const project = game.chipProject;
  const sub = useSubTab('silicon');
  const details = useDetails();
  const presetIdx = PRESETS.findIndex((p) => p.split === design.split);

  return (
    <>
      <Advisor who="hardware" color={LAYER.silicon}>
        {game.staff.hardwareEng === 0
          ? 'We have no hardware engineers yet. Hire one in Team and we can design our own chips.'
          : details
            ? 'Split the chip between compute, cache, memory and links. Our own chips skip the vendor markup, but every trip to the factory is a bet.'
            : 'Pick what the chip is for and how new it should be. Our own chips cost far less than buying from vendors, but the first batch can come back with bugs.'}
      </Advisor>

      {project && (
        <div className="card">
          <div className="row between">
            <h3>At the factory: {project.design.name}</h3>
            <span className="small muted">{weeks(project.weeksLeft)} left</span>
          </div>
          <Bar value={1 - project.weeksLeft / project.totalWeeks} color={LAYER.silicon} />
          <div className="small muted">
            {project.respun ? 'The first batch had a bug. We fixed it and sent it again. This one should work.' : 'Waiting for the first chips to come back.'}
          </div>
        </div>
      )}

      {sub === 'design' && (<>
      <div className="blueprint">
        <div className="row between">
          <h3>Chip designer</h3>
          <span className="bp-tag">Blueprint</span>
        </div>

        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input id="c-name" value={design.name} onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))} />
        </div>

        <div className="field">
          <span className="bp-label">
            <Term k="generation" />
          </span>
          <div className="seg">
            {content.nodes.map((n) => (
              <button key={n.id} aria-pressed={design.nodeId === n.id} onClick={() => setDesign((d) => ({ ...d, nodeId: n.id }))}>
                {genName(n.id)}
                {details ? ` · ${n.name}` : ''}
                {game.week < n.availableFromWeek ? ` · week ${n.availableFromWeek}` : ''}
              </button>
            ))}
          </div>
        </div>

        {!details && (
          <div className="field">
            <span className="bp-label">What is it for?</span>
            <div className="pick-grid three">
              {PRESETS.map((p, i) => (
                <button key={p.label} className="pick" aria-pressed={presetIdx === i} onClick={() => setDesign((d) => ({ ...d, split: p.split, fp8: true, fp4: false }))}>
                  <span className="pick-title">{p.label}</span>
                  <span className="pick-sub">{p.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Floorplan split={split} dieMm2={preview.node?.dieAreaMm2 ?? 800} stacks={preview.hbmStacks} details={details} />

        {details && (<>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setDesign((d) => ({ ...d, split: p.split }))}>
              {p.label}
            </button>
          ))}
        </div>

        {BLOCKS.map((b) => (
          <div className="field" key={b.key}>
            <div className="row between">
              <label htmlFor={`s-${b.key}`}>{b.label}</label>
              <span className="bp-label">
                {pct(split[b.key])} · {Math.round(split[b.key] * (preview.node?.dieAreaMm2 ?? 800))} mm²
              </span>
            </div>
            <input
              id={`s-${b.key}`}
              type="range"
              min={0}
              max={100}
              value={Math.round(design.split[b.key] * 100)}
              onChange={(e) => setBlock(b.key, Number(e.target.value) / 100)}
            />
            <span className="bp-label">{b.does}</span>
          </div>
        ))}

        <div className="row">
          <label className="row small">
            <input type="checkbox" checked={design.fp8} onChange={(e) => setDesign((d) => ({ ...d, fp8: e.target.checked, fp4: e.target.checked && d.fp4 }))} />
            FP8 units (−10% compute area, 2× at FP8)
          </label>
        </div>
        <div className="row">
          <label className="row small">
            <input type="checkbox" checked={design.fp4} disabled={!design.fp8} onChange={(e) => setDesign((d) => ({ ...d, fp4: e.target.checked }))} />
            FP4 units (−10% more, 4× at FP4)
          </label>
        </div>
        </>)}
      </div>

      <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
        <h3>
          <Term k="factory" />
        </h3>
        <div className="outcomes">
          {preview.chip && (
            <div>
              <span className="k">
                <Term k="speed" />
              </span>
              <span className="v">{times(preview.chip.tflops.fp16 / STARTER_CHIP.tflops.fp16)}</span>
              <span className="s">vs {STARTER_CHIP.name}</span>
            </div>
          )}
          <div>
            <span className="k">Factory cost</span>
            <span className="v">{money(preview.tapeoutCost)}</span>
          </div>
          <div>
            <span className="k">Ready in</span>
            <span className="v">{weeks(preview.tapeoutWeeks)}</span>
          </div>
          <div>
            <span className="k">Bug risk</span>
            <span className="v" style={{ color: preview.bugChance > 0.3 ? 'var(--bad)' : undefined }}>
              {details ? pct(preview.bugChance) : bugLabel(preview.bugChance)}
            </span>
          </div>
        </div>
        {preview.chip && !details && (
          <div className="small muted">
            {preview.chip.memGB} GB memory ({STARTER_CHIP.name} has {STARTER_CHIP.memGB} GB) · each chip costs us {money(preview.chip.priceUsd)} to make.
          </div>
        )}
        <div className="small muted">
          A bug means fixing it and sending it again: half as long again and 40% more cost. Each hardware engineer makes bugs less likely.
        </div>
        {preview.errors.length > 0 && (
          <ul className="errors">
            {preview.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button
          className="btn primary big"
          disabled={preview.errors.length > 0}
          onClick={() => {
            send({ type: 'startTapeout', design });
            setDesign((d) => ({ ...d, name: `Sandpiper ${game.customChips.length + 2}` }));
          }}
        >
          Send to the factory
        </button>
      </div>
      </>)}

      {sub === 'chips' && (<>
      {preview.chip && <Comparison mine={preview.chip} details={details} />}
      <div className="card">
        <h3>Our chips</h3>
        {game.customChips.length === 0 ? (
          <div className="muted">We haven't made a chip of our own yet.</div>
        ) : (
          game.customChips.map((c) => (
            <div key={c.id} className="row between">
              <span>
                <strong>{c.name}</strong> <span className="small muted">{c.blurb}</span>
              </span>
              <span className="small">{money(c.priceUsd)}/unit</span>
            </div>
          ))
        )}
        {game.customChips.length > 0 && <div className="small muted">Buy units in Compute, then pick them when training.</div>}
      </div>
      </>)}
    </>
  );
}

/** Top-down die floorplan: block sizes track the split live. */
export function Floorplan({ split, dieMm2, stacks, details }: { split: DieSplit; dieMm2: number; stacks: number; details: boolean }) {
  const top = split.compute + split.sram;
  const bottom = split.memory + split.interconnect;
  const w = (a: number, b: number) => `${(a / Math.max(0.0001, a + b)) * 100}%`;
  return (
    <figure className="floorplan" aria-label="Die floorplan">
      <div className="die">
        <div className="die-row" style={{ flexGrow: Math.max(0.05, top) }}>
          <div className="blk compute" style={{ width: w(split.compute, split.sram) }}>
            <span>Compute {pct(split.compute)}</span>
          </div>
          <div className="blk sram" style={{ width: w(split.sram, split.compute) }}>
            <span>{details ? 'SRAM' : 'Cache'} {pct(split.sram)}</span>
          </div>
        </div>
        <div className="die-row" style={{ flexGrow: Math.max(0.05, bottom) }}>
          <div className="blk memory" style={{ width: w(split.memory, split.interconnect) }}>
            <span>
              {details ? 'HBM' : 'Memory'} ×{stacks} {pct(split.memory)}
            </span>
          </div>
          <div className="blk link" style={{ width: w(split.interconnect, split.memory) }}>
            <span>Links {pct(split.interconnect)}</span>
          </div>
        </div>
      </div>
      <figcaption>
        {details
          ? `${dieMm2} mm² die · ${Math.round(Math.sqrt(dieMm2))} × ${Math.round(Math.sqrt(dieMm2))} mm`
          : `About the size of a postage stamp: ${Math.round(Math.sqrt(dieMm2))} × ${Math.round(Math.sqrt(dieMm2))} mm`}
      </figcaption>
    </figure>
  );
}

function Comparison({ mine, details }: { mine: Chip; details: boolean }) {
  const dense = content.archs.find((a) => a.id === 'dense')!;
  const moe = content.archs.find((a) => a.id === 'moe')!;
  const cols = [mine, ...content.chips];
  const simple: { k: string; f: (c: Chip) => string }[] = [
    { k: 'Speed', f: (c) => times(c.tflops.fp16 / STARTER_CHIP.tflops.fp16) },
    { k: 'Memory', f: (c) => `${c.memGB} GB` },
    { k: 'Power', f: (c) => `${c.watts} W` },
    { k: 'Price', f: (c) => money(c.priceUsd) },
  ];
  const rows: { k: string; f: (c: Chip) => string }[] = !details ? simple : [
    { k: 'FP16 TFLOPS', f: (c) => `${c.tflops.fp16}` },
    { k: 'FP8 / FP4', f: (c) => `${c.tflops.fp8 || '—'} / ${c.tflops.fp4 || '—'}` },
    { k: 'Memory', f: (c) => `${c.memGB} GB` },
    { k: 'Bandwidth', f: (c) => `${c.memBwTBs} TB/s` },
    { k: 'Links', f: (c) => `${c.interconnectGBs} GB/s` },
    { k: 'Power', f: (c) => `${c.watts} W` },
    { k: 'Unit cost', f: (c) => money(c.priceUsd) },
    { k: 'Dense fit', f: (c) => pct(archFit(c, dense).fit) },
    { k: 'MoE fit', f: (c) => pct(archFit(c, moe).fit) },
  ];
  return (
    <div className="card">
      <h3>This design versus chips we can buy</h3>
      <table className="t">
        <thead>
          <tr>
            <th />
            {cols.map((c, i) => (
              <th key={c.id}>{i === 0 ? 'Yours' : c.name.replace('Kite ', '').replace('Monolith ', '')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td className="muted">{r.k}</td>
              {cols.map((c, i) => (
                <td key={c.id} style={i === 0 ? { fontWeight: 700, color: LAYER.silicon } : undefined}>
                  {r.f(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
