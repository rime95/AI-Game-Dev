import { useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { content } from '@stm/content';
import { deriveChip, getArch, liveModel, runProgress, type ChipDesign, type GameState } from '@stm/sim';
import { useStore } from '../../store';
import { pct, times } from '../../format';
import { useDetails } from '../../panels/Panel';
import { ARCH_NAME, PRECISION_NAME, sizeName } from '../../words';
import { ChipCard } from './ChipCard';
import { layerCount, lossCurve, ModelStack } from './ModelStack';
import { BP, ExplodeContext, useExplode } from './parts';

/**
 * Blueprint mode (art-direction §2): opening a design tool turns the world into an engineer's
 * drawing of the thing being designed. Silicon shows the chip card; Models shows the layer stack.
 */
export function Blueprint({ game, kind }: { game: GameState; kind: 'chip' | 'model' }) {
  const [exploded, setExploded] = useState(true);
  return kind === 'chip' ? (
    <ChipBlueprint game={game} exploded={exploded} setExploded={setExploded} />
  ) : (
    <ModelBlueprint game={game} exploded={exploded} setExploded={setExploded} />
  );
}

interface ViewProps {
  game: GameState;
  exploded: boolean;
  setExploded: (v: boolean) => void;
}

function Scene({
  exploded,
  children,
  camera,
  target = [0, 0, 0],
}: {
  exploded: boolean;
  children: ReactNode;
  camera: [number, number, number];
  target?: [number, number, number];
}) {
  return (
    <Canvas camera={{ position: camera, fov: 35, near: 0.1, far: 200 }}>
      <color attach="background" args={[BP.bg]} />
      <Grid
        position={[0, -0.02, 0]}
        args={[60, 60]}
        cellSize={0.5}
        sectionSize={2.5}
        cellColor="#2a5a8a"
        sectionColor="#3f74a8"
        fadeDistance={40}
        infiniteGrid
      />
      <Explode target={exploded ? 1 : 0}>{children}</Explode>
      <OrbitControls makeDefault target={target} enablePan={false} minDistance={4} maxDistance={40} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}

function Explode({ target, children }: { target: number; children: ReactNode }) {
  const ref = useExplode(target);
  return <ExplodeContext.Provider value={ref}>{children}</ExplodeContext.Provider>;
}

function Toolbar({
  title,
  sub,
  exploded,
  setExploded,
  sources,
}: {
  title: string;
  sub: string;
  exploded: boolean;
  setExploded: (v: boolean) => void;
  sources?: ReactNode;
}) {
  return (
    <>
      <div className="bp-head">
        <span className="bp-tag">Blueprint</span>
        <div>
          <div className="bp-title">{title}</div>
          <div className="bp-sub">{sub}</div>
        </div>
      </div>
      <div className="bp-tools">
        {sources}
        <button className="bp-btn" onClick={() => setExploded(!exploded)}>
          {exploded ? 'Assemble' : 'Explode'}
        </button>
        <span className="bp-hint">Drag to rotate · scroll to zoom</span>
      </div>
    </>
  );
}

function ChipBlueprint({ game, exploded, setExploded }: ViewProps) {
  const draft = useStore((s) => s.chipDraft);
  const [source, setSource] = useState<string>('draft');
  const details = useDetails();
  const options: { id: string; label: string; design: ChipDesign }[] = [];
  if (draft) options.push({ id: 'draft', label: 'Draft', design: draft });
  if (game.chipProject) options.push({ id: 'tapeout', label: 'At the factory', design: game.chipProject.design });
  for (const c of game.customChips) {
    const info = game.customChipInfo?.[c.id];
    if (info) options.push({ id: c.id, label: c.name, design: info.design });
  }
  const current = options.find((o) => o.id === source) ?? options[0];
  if (!current) return <div className="bp-empty">Open the chip designer to start a design.</div>;
  const node = content.nodes.find((n) => n.id === current.design.nodeId) ?? content.nodes[0]!;
  const chip = deriveChip(node, current.design, 'blueprint');
  const info = game.customChipInfo?.[current.id];
  const gen = ['Older', 'Modern', 'Cutting-edge'][content.nodes.indexOf(node)] ?? node.name;

  return (
    <div className="bp-view">
      <Scene exploded={exploded} camera={[12, 10, 15]} target={[0, 2.2, 0]}>
        <ChipCard design={current.design} chip={chip} node={node} />
      </Scene>
      <Toolbar
        title={current.design.name || 'Untitled chip'}
        sub={
          details
            ? `${node.name} · ${chip.tflops.fp16} TFLOPS FP16 · ${chip.memGB} GB HBM · ${chip.watts} W${info ? ` · yield ${pct(info.yieldRate)}` : ''}`
            : `${gen} chip · ${times(chip.tflops.fp16 / content.chips[0]!.tflops.fp16)} speed · ${chip.memGB} GB memory${info ? ` · ${pct(info.yieldRate)} of chips come out good` : ''}`
        }
        exploded={exploded}
        setExploded={setExploded}
        sources={
          options.length > 1 && (
            <select className="bp-select" value={current.id} onChange={(e) => setSource(e.target.value)} aria-label="Chip to show">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        }
      />
    </div>
  );
}

function ModelBlueprint({ game, exploded, setExploded }: ViewProps) {
  const draft = useStore((s) => s.modelDraft);
  const [source, setSource] = useState<string>(game.training ? 'run' : 'draft');
  const live = liveModel(game);
  const details = useDetails();
  const options: {
    id: string;
    label: string;
    name: string;
    archId: string;
    paramsB: number;
    tokensB: number;
    precision: string;
    progress: number | null;
  }[] = [];
  if (game.training) {
    const s = game.training.spec;
    options.push({
      id: 'run',
      label: 'Training now',
      name: s.name,
      archId: s.archId,
      paramsB: s.paramsB,
      tokensB: s.tokensB,
      precision: s.precision,
      progress: runProgress(game.training),
    });
  }
  if (draft)
    options.push({
      id: 'draft',
      label: 'Draft',
      name: draft.name,
      archId: draft.archId,
      paramsB: draft.paramsB,
      tokensB: draft.tokensB,
      precision: draft.precision,
      progress: null,
    });
  if (live)
    options.push({
      id: 'live',
      label: `Live: ${live.name}`,
      name: live.name,
      archId: live.archId,
      paramsB: live.paramsB,
      tokensB: live.tokensB,
      precision: live.precision,
      progress: null,
    });
  const current = options.find((o) => o.id === source) ?? options[0];
  const arch = current && getArch(content, current.archId);
  if (!current || !arch) return <div className="bp-empty">Design a model in the Models panel to see it here.</div>;
  const run = current.id === 'run' ? game.training : null;

  return (
    <div className="bp-view">
      <Scene exploded={exploded} camera={[11, 4, 13.5]} target={[0, 0, 0]}>
        <ModelStack arch={arch} paramsB={current.paramsB} progress={current.progress} />
      </Scene>
      <Toolbar
        title={current.name || 'Untitled model'}
        sub={
          details
            ? `${arch.name} · ${current.paramsB}B params · ${layerCount(current.paramsB)} layers · ${current.tokensB.toLocaleString('en-US')}B tokens · ${current.precision.toUpperCase()}`
            : `${sizeName(current.paramsB)} ${(ARCH_NAME[arch.id] ?? arch.name).toLowerCase()} · ${layerCount(current.paramsB)} layers · ${PRECISION_NAME[current.precision as keyof typeof PRECISION_NAME] ?? current.precision} math`
        }
        exploded={exploded}
        setExploded={setExploded}
        sources={
          options.length > 1 && (
            <select className="bp-select" value={current.id} onChange={(e) => setSource(e.target.value)} aria-label="Model to show">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        }
      />
      {run && (
        <LossCurve progress={runProgress(run)} capability={run.projectedCapability + run.capabilityDelta} incidents={run.incidents} />
      )}
    </div>
  );
}

/** Live loss curve while a run trains (cosmetic: shaped by the run's projected capability). */
function LossCurve({ progress, capability, incidents }: { progress: number; capability: number; incidents: number }) {
  const pts = lossCurve(progress, capability);
  const W = 240;
  const H = 110;
  const x = (t: number) => 8 + t * (W - 16);
  const y = (l: number) => H - 10 - ((Math.min(11, l) - 1) / 10) * (H - 24);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.loss).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <div className="bp-loss">
      <div className="bp-sub">
        Mistakes per lesson (lower is better) · {pct(progress)} done{incidents ? ` · ${incidents} setback${incidents > 1 ? 's' : ''}` : ''}
      </div>
      <svg width={W} height={H} role="img" aria-label={`Loss ${last.loss.toFixed(2)}`}>
        <path d={`M8,${H - 10} H${W - 8}`} stroke="rgb(255 255 255 / 0.25)" />
        <path d={d} fill="none" stroke="#f2c94c" strokeWidth={2} />
        <circle cx={x(last.t)} cy={y(last.loss)} r={3} fill="#f2c94c" />
        <text x={W - 8} y={14} textAnchor="end" fill="#eaf3ff" fontSize={11}>
          {last.loss.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}
