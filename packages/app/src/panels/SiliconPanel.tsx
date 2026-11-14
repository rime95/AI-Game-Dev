import { useEffect, useMemo, useState } from 'react';
import { content, type Chip } from '@stm/content';
import { archFit, normalizeSplit, previewChip, type ChipDesign, type DieSplit, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, useSubTab } from './Panel';

const BLOCKS: { key: keyof DieSplit; label: string; does: string }[] = [
  { key: 'compute', label: 'Compute cores', does: 'Raw TFLOPS' },
  { key: 'sram', label: 'On-die SRAM', does: 'Multiplies effective bandwidth' },
  { key: 'memory', label: 'HBM interfaces', does: 'Memory size + bandwidth (25 mm² per stack)' },
  { key: 'interconnect', label: 'Interconnect', does: 'Chip-to-chip links' },
];

const PRESETS: { label: string; split: DieSplit }[] = [
  { label: 'Balanced', split: { compute: 0.55, sram: 0.15, memory: 0.2, interconnect: 0.1 } },
  { label: 'Training beast', split: { compute: 0.78, sram: 0.1, memory: 0.08, interconnect: 0.04 } },
  { label: 'MoE server', split: { compute: 0.35, sram: 0.15, memory: 0.25, interconnect: 0.25 } },
];

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

  return (
    <>
      <Advisor who="Hardware lead" color={LAYER.silicon}>
        {game.staff.hardwareEng === 0
          ? 'We have no hardware engineers. Hire one in Team before we can tape out a chip.'
          : 'Split the die between compute, SRAM, memory and links. Our own chips skip the vendor margin — but every tape-out is a bet.'}
      </Advisor>

      {project && (
        <div className="card">
          <div className="row between">
            <h3>Taping out: {project.design.name}</h3>
            <span className="small muted">{project.weeksLeft} wk left</span>
          </div>
          <Bar value={1 - project.weeksLeft / project.totalWeeks} color={LAYER.silicon} />
          <div className="small muted">{project.respun ? 'Respin after a silicon bug. This one should work.' : 'Waiting for first silicon from the foundry.'}</div>
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
          <span className="bp-label">Process node</span>
          <div className="seg">
            {content.nodes.map((n) => (
              <button key={n.id} aria-pressed={design.nodeId === n.id} onClick={() => setDesign((d) => ({ ...d, nodeId: n.id }))}>
                {n.name}
                {game.week < n.availableFromWeek ? ` · wk ${n.availableFromWeek}` : ''}
              </button>
            ))}
          </div>
        </div>

        <Floorplan split={split} dieMm2={preview.node?.dieAreaMm2 ?? 800} stacks={preview.hbmStacks} />

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
      </div>

      <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
        <h3>Tape-out</h3>
        <div className="grid3">
          <div className="stat">
            <div className="k">Cost</div>
            <div className="v">{money(preview.tapeoutCost)}</div>
          </div>
          <div className="stat">
            <div className="k">Time</div>
            <div className="v">{preview.tapeoutWeeks} wk</div>
          </div>
          <div className="stat">
            <div className="k">Bug risk</div>
            <div className="v" style={{ color: preview.bugChance > 0.3 ? 'var(--bad)' : undefined }}>
              {pct(preview.bugChance)}
            </div>
          </div>
        </div>
        <div className="small muted">
          A bug means a respin: +50% time and +40% cost. Each hardware engineer cuts the risk by 15%.
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
          Tape out
        </button>
      </div>
      </>)}

      {sub === 'chips' && (<>
      {preview.chip && <Comparison mine={preview.chip} />}
      <div className="card">
        <h3>Our chips</h3>
        {game.customChips.length === 0 ? (
          <div className="muted">No custom silicon yet.</div>
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
function Floorplan({ split, dieMm2, stacks }: { split: DieSplit; dieMm2: number; stacks: number }) {
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
            <span>SRAM {pct(split.sram)}</span>
          </div>
        </div>
        <div className="die-row" style={{ flexGrow: Math.max(0.05, bottom) }}>
          <div className="blk memory" style={{ width: w(split.memory, split.interconnect) }}>
            <span>
              HBM ×{stacks} {pct(split.memory)}
            </span>
          </div>
          <div className="blk link" style={{ width: w(split.interconnect, split.memory) }}>
            <span>Links {pct(split.interconnect)}</span>
          </div>
        </div>
      </div>
      <figcaption>
        {dieMm2} mm² die · {Math.round(Math.sqrt(dieMm2))} × {Math.round(Math.sqrt(dieMm2))} mm
      </figcaption>
    </figure>
  );
}

function Comparison({ mine }: { mine: Chip }) {
  const dense = content.archs.find((a) => a.id === 'dense')!;
  const moe = content.archs.find((a) => a.id === 'moe')!;
  const cols = [mine, ...content.chips];
  const rows: { k: string; f: (c: Chip) => string }[] = [
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
      <h3>Current design versus vendor chips</h3>
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
