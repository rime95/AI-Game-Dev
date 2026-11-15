import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import { v2 } from '@stm/sim';
import { drawDieShot } from '../art/dieShot';
import { Callout, Die, ExplodeContext, Fan, Fins, Layer, MAT, Part, useExplode } from './parts';

/** Everything the hero needs to draw a product (a wizard draft, a project or a shipped product). */
export interface HeroSpec {
  kind: v2.ProductKind;
  size: v2.ProjectSize;
  nodeId: string;
  board: (string | null)[];
  memory?: number;
  cooling?: number;
  tier?: v2.Tier;
  name?: string;
}

/**
 * The product hero: the thing you are making, big and exploded, built procedurally from your
 * choices so every pick in the wizard changes it. The die face is your actual layout.
 */
export function ProductHero({ spec, caption, compact }: { spec: HeroSpec; caption?: string; compact?: boolean }) {
  const [exploded, setExploded] = useState(true);
  return (
    <div className={compact ? 'hero hero-inset' : 'hero'}>
      <Canvas shadows camera={{ position: compact ? [5.5, 5, 6.5] : [6.5, 5.5, 7.5], fov: 34, near: 0.1, far: 200 }} dpr={[1, 2]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-6, 4, -4]} intensity={0.5} color="#9fc4ff" />
        <pointLight position={[0, 3, 5]} intensity={8} color="#7ce9d6" distance={14} />
        <Explode target={exploded ? 1 : 0}>
          <Product spec={spec} />
        </Explode>
        <ContactShadows position={[0, -0.02, 0]} opacity={0.45} scale={14} blur={2.4} far={6} color="#020617" />
        <OrbitControls makeDefault enablePan={false} minDistance={5} maxDistance={26} autoRotate autoRotateSpeed={0.6} target={[0, 0.9, 0]} />
        <FitCamera reach={REACH[spec.kind] * (compact ? 1.1 : 1)} />
      </Canvas>
      {!compact && (
        <div className="hero-toggle">
          <button className="btn sm ghost" onClick={() => setExploded((e) => !e)}>
            {exploded ? 'Assemble' : 'Explode'}
          </button>
        </div>
      )}
      <div className="hero-caption">{caption ?? `${v2.kind(spec.kind).name} · ${exploded ? 'exploded' : 'assembled'} · drag to rotate`}</div>
    </div>
  );
}

/** How far out the camera sits for each product (a graphics card is long; a phone chip is small). */
const REACH: Record<v2.ProductKind, number> = { cpu: 9, server: 10.5, gpu: 12.5, console: 10, mobile: 8, accel: 10.5, model: 10 };

/** Keep the whole product in view: pull the camera back when the stage is narrow or the product is big. */
function FitCamera({ reach }: { reach: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const dist = reach / Math.min(1, aspect / 1.5);
    const dir = new Vector3(0.62, 0.52, 0.72).normalize();
    camera.position.copy(dir.multiplyScalar(dist)).add(new Vector3(0, 0.9, 0));
    camera.updateProjectionMatrix();
  }, [camera, reach, size.width, size.height]);
  return null;
}

function Explode({ target, children }: { target: number; children: ReactNode }) {
  const ref = useExplode(target);
  return <ExplodeContext.Provider value={ref}>{children}</ExplodeContext.Provider>;
}

/** The die shot as a texture (redrawn when the layout changes). */
function useDieTexture(spec: HeroSpec): CanvasTexture | null {
  const key = `${spec.size}|${spec.name ?? ''}|${spec.board.join(',')}`;
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawDieShot(ctx, 512, spec.board, spec.size, { name: spec.name, seed: key });
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

const nodeIndex = (id: string) => Math.max(0, v2.NODES.findIndex((n) => n.id === id));

function Product({ spec }: { spec: HeroSpec }) {
  const tex = useDieTexture(spec);
  const die = 0.3 * v2.SIZES[spec.size].w;
  const p = { spec, tex, die, mem: spec.memory ?? 0, cool: spec.cooling ?? 0, era: nodeIndex(spec.nodeId) };
  switch (spec.kind) {
    case 'gpu':
      return <GraphicsCard {...p} />;
    case 'console':
      return <ConsoleBoard {...p} />;
    case 'mobile':
      return <PhoneChip {...p} />;
    case 'accel':
      return <AccelModule {...p} />;
    case 'model':
      return <ModelStack spec={spec} />;
    case 'server':
      return <Processor {...p} big />;
    default:
      return <Processor {...p} />;
  }
}

interface PartProps {
  spec: HeroSpec;
  tex: CanvasTexture | null;
  die: number;
  mem: number;
  cool: number;
  era: number;
}

const memLabel = (s: HeroSpec) => v2.memoryName(s.kind, s.memory ?? 0);
const coolLabel = (s: HeroSpec) => v2.coolingName(s.kind, s.cooling ?? 0);
const dieLine = (s: HeroSpec) => `${v2.SIZES[s.size].w}×${v2.SIZES[s.size].h} tiles · ${v2.node(s.nodeId).name}`;

/** CPU or server processor: package (ceramic in the early years), pins, die, heat spreader, cooler. */
function Processor({ spec, tex, die, cool, era, big }: PartProps & { big?: boolean }) {
  const pkg = big ? 3.4 : 2.6;
  const body = era <= 2 && !big ? MAT.ceramic : MAT.substrate;
  const pins = 12;
  return (
    <group>
      <Layer y={0.1} lift={0}>
        <Part size={[pkg, 0.14, pkg]} mat={body} />
        {Array.from({ length: pins * pins }, (_, i) => (
          <mesh key={i} position={[-pkg / 2 + (pkg / pins) * ((i % pins) + 0.5), -0.1, -pkg / 2 + (pkg / pins) * (Math.floor(i / pins) + 0.5)]}>
            <boxGeometry args={[0.04, 0.08, 0.04]} />
            <meshStandardMaterial {...MAT.gold} />
          </mesh>
        ))}
        <Callout position={[pkg / 2 + 0.1, 0, 0]} title={big ? 'LGA package' : era <= 2 ? 'Ceramic package' : 'Package'} line={`${pins * pins} pins`} />
      </Layer>
      <Layer y={0.2} lift={0.7}>
        <Die size={die} texture={tex} />
        <Callout position={[die / 2 + 0.1, 0.05, -die / 2]} title={spec.name || 'Die'} line={dieLine(spec)} />
      </Layer>
      {(era >= 3 || big || cool >= 1) && (
        <Layer y={0.3} lift={1.45}>
          <Part size={[pkg * 0.82, 0.1, pkg * 0.82]} mat={MAT.silver} radius={0.06} />
          <Callout position={[pkg * 0.42, 0.05, pkg * 0.3]} title="Heat spreader" />
        </Layer>
      )}
      {cool >= 1 && (
        <Layer y={0.42} lift={2.3}>
          <Fins w={pkg * 1.05} d={pkg * 1.05} h={cool >= 3 ? 1.6 : 0.6} count={cool >= 3 ? 16 : 11} mat={cool >= 3 ? MAT.copper : MAT.alu} />
          {cool >= 2 && <Fan r={pkg * 0.42} position={[0, cool >= 3 ? 1.75 : 0.75, 0]} />}
          <Callout position={[pkg * 0.55, 0.4, 0]} title="Cooler" line={coolLabel(spec)} />
        </Layer>
      )}
    </group>
  );
}

/** A graphics card: board, bracket, die and memory chips, heatsink, shroud and fans. */
function GraphicsCard({ spec, tex, die, mem, cool, era }: PartProps) {
  const L = 6.2;
  const D = 2.5;
  const chips = [2, 4, 6, 8][mem]!;
  return (
    <group position={[0.4, 0, 0]}>
      <Layer y={0.05} lift={0}>
        <Part size={[L, 0.08, D]} mat={era <= 3 ? MAT.pcbGreen : MAT.pcbBlack} radius={0.02} />
        <Part size={[2.4, 0.04, 0.12]} position={[0.2, -0.02, D / 2 + 0.03]} mat={MAT.gold} radius={0.01} />
        <Part size={[0.06, 1.4, D * 0.95]} position={[-L / 2 - 0.05, 0.62, 0]} mat={MAT.silver} radius={0.02} />
        <Callout position={[L / 2, 0, D / 2]} title="Board" line={era <= 3 ? 'Green PCB' : 'Black PCB, 12 layers'} />
      </Layer>
      <Layer y={0.12} lift={0.75}>
        <Part size={[die * 1.25, 0.06, die * 1.25]} mat={MAT.substrate} />
        <Die size={die} position={[0, 0.06, 0]} texture={tex} />
        {Array.from({ length: chips }, (_, i) => {
          const side = i % 2 ? 1 : -1;
          const k = Math.floor(i / 2);
          return <Part key={i} size={[0.5, 0.07, 0.5]} position={[die * 0.9 + 0.4 + k * 0.62 - (chips > 4 ? 0.6 : 0), 0, side * (die * 0.55 + 0.35)]} mat={MAT.chip} />;
        })}
        <Callout position={[0, 0.1, -D / 2]} title={spec.name || 'GPU die'} line={dieLine(spec)} />
        <Callout position={[1.8, 0.1, D / 2]} title="Memory" line={`${memLabel(spec)} · ${chips} chips`} />
      </Layer>
      {cool >= 1 && (
        <Layer y={0.2} lift={1.6}>
          <Fins w={cool >= 3 ? L * 0.95 : cool >= 2 ? L * 0.6 : die * 1.6} d={cool >= 2 ? D * 0.9 : die * 1.6} h={cool >= 3 ? 0.55 : 0.35} count={cool >= 3 ? 34 : cool >= 2 ? 20 : 9} position={[cool >= 2 ? 0.2 : 0, 0, 0]} />
          {cool >= 3 && [-0.6, 0.3, 1.2].map((x, i) => <Part key={i} size={[0.08, 0.08, D * 0.85]} position={[x, 0.04, 0]} mat={MAT.copper} />)}
          <Callout position={[-L / 2 + 0.6, 0.4, -D / 2]} title="Heatsink" line={coolLabel(spec)} />
        </Layer>
      )}
      {cool >= 2 && (
        <Layer y={0.9} lift={2.4}>
          <Part size={[cool >= 3 ? L * 0.98 : L * 0.66, 0.14, D * 0.98]} position={[cool >= 3 ? 0 : 0.2, 0, 0]} mat={MAT.shroud} radius={0.08} />
          {(cool >= 3 ? [-1.9, 0, 1.9] : [0.2]).map((x, i) => (
            <Fan key={i} r={0.92} position={[x, 0.1, 0]} />
          ))}
          <Callout position={[L / 2 - 0.4, 0.2, -D / 2]} title="Shroud" line={cool >= 3 ? 'Three fans' : 'One fan'} />
        </Layer>
      )}
    </group>
  );
}

/** A console mainboard: the SoC, memory around it, and its cooler. */
function ConsoleBoard({ spec, tex, die, mem, cool }: PartProps) {
  const chips = [2, 4, 6, 8][mem]!;
  return (
    <group>
      <Layer y={0.05} lift={0}>
        <Part size={[4.4, 0.08, 3.6]} mat={MAT.pcbBlack} radius={0.02} />
        <Callout position={[2.2, 0, 1.8]} title="Mainboard" />
      </Layer>
      <Layer y={0.12} lift={0.75}>
        <Part size={[die * 1.4, 0.08, die * 1.4]} mat={MAT.substrate} />
        <Die size={die} position={[0, 0.07, 0]} texture={tex} />
        {Array.from({ length: chips }, (_, i) => {
          const a = (i / chips) * Math.PI * 2;
          return <Part key={i} size={[0.45, 0.07, 0.45]} position={[Math.cos(a) * (die + 0.55), 0, Math.sin(a) * (die + 0.55)]} mat={MAT.chip} />;
        })}
        <Callout position={[die, 0.1, -die]} title={spec.name || 'SoC'} line={dieLine(spec)} />
        <Callout position={[-die - 0.6, 0.1, die]} title="Memory" line={memLabel(spec)} />
      </Layer>
      {cool >= 1 && (
        <Layer y={0.2} lift={1.6}>
          {cool >= 3 ? <Part size={[3, 0.12, 2.6]} mat={MAT.copper} radius={0.05} /> : <Fins w={2.6} d={2.2} h={0.5} count={18} />}
          {cool >= 2 && <Fan r={0.85} position={[0, cool >= 3 ? 0.2 : 0.7, 0]} />}
          <Callout position={[1.5, 0.3, 0]} title="Cooling" line={coolLabel(spec)} />
        </Layer>
      )}
    </group>
  );
}

/** A phone chip: small board, the SoC, memory stacked on top, a heat spreader. */
function PhoneChip({ spec, tex, die, mem, cool }: PartProps) {
  const d = die * 0.7;
  return (
    <group>
      <Layer y={0.04} lift={0}>
        <Part size={[2.2, 0.06, 3.6]} mat={MAT.pcbBlack} radius={0.04} />
        {[[-0.6, 1.2], [0.6, 1.2], [-0.6, -1.2], [0.6, -1.2]].map(([x, z], i) => (
          <Part key={i} size={[0.4, 0.06, 0.3]} position={[x!, 0.05, z!]} mat={MAT.chip} />
        ))}
        <Callout position={[1.1, 0, 1.8]} title="Logic board" />
      </Layer>
      <Layer y={0.1} lift={0.6}>
        <Part size={[d * 1.3, 0.06, d * 1.3]} mat={MAT.substrate} />
        <Die size={d} position={[0, 0.05, 0]} texture={tex} />
        <Callout position={[d, 0.1, -d]} title={spec.name || 'SoC'} line={dieLine(spec)} />
      </Layer>
      <Layer y={0.18} lift={1.25}>
        {Array.from({ length: 1 + mem }, (_, i) => (
          <Part key={i} size={[d * 1.2, 0.05, d * 1.2]} position={[0, i * 0.07, 0]} mat={MAT.hbm} />
        ))}
        <Callout position={[d * 0.7, 0.1, d * 0.6]} title="Stacked memory" line={memLabel(spec)} />
      </Layer>
      {cool >= 1 && (
        <Layer y={0.3} lift={1.9}>
          {cool === 1 ? (
            <Part size={[1.9, 0.02, 3.2]} mat={{ color: '#2b2f38', roughness: 0.8, metalness: 0.1 }} />
          ) : (
            <>
              <Part size={[cool >= 3 ? 1.9 : 0.5, 0.05, cool >= 3 ? 3.2 : 2.6]} mat={MAT.copper} radius={0.02} />
            </>
          )}
          <Callout position={[1, 0, -1.5]} title="Cooling" line={coolLabel(spec)} />
        </Layer>
      )}
    </group>
  );
}

/** An AI accelerator module: board, interposer, die, HBM stacks, cold plate. */
function AccelModule({ spec, tex, die, mem, cool }: PartProps) {
  const stacks = [0, 2, 4, 8][mem]!;
  const per = Math.max(1, Math.ceil(stacks / 2));
  return (
    <group>
      <Layer y={0.05} lift={0}>
        <Part size={[4.6, 0.09, 3.6]} mat={MAT.pcbBlack} radius={0.03} />
        {Array.from({ length: 10 }, (_, i) => (
          <Part key={i} size={[0.28, 0.16, 0.28]} position={[-2 + (i % 5) * 0.32, 0.1, 1.45 - Math.floor(i / 5) * 0.34]} mat={{ color: '#3b3f48', roughness: 0.5, metalness: 0.4 }} />
        ))}
        <Callout position={[2.3, 0, 1.8]} title="Module board" line="Power stages and links" />
      </Layer>
      <Layer y={0.13} lift={0.7}>
        <Part size={[die + 2.2, 0.05, Math.max(die, per * 0.75) + 0.5]} mat={{ color: '#3a6b7a', roughness: 0.4, metalness: 0.5 }} />
        <Callout position={[-(die + 2.2) / 2, 0, 0]} title="Interposer" />
      </Layer>
      <Layer y={0.2} lift={1.35}>
        <Die size={die} texture={tex} />
        {stacks === 0
          ? [-1, 1].map((sx) => <Part key={sx} size={[0.5, 0.07, 0.5]} position={[sx * (die / 2 + 0.55), 0, 0]} mat={MAT.chip} />)
          : Array.from({ length: stacks }, (_, i) => {
              const side = i < per ? -1 : 1;
              const k = i % per;
              return <Part key={i} size={[0.62, 0.34, 0.62]} position={[side * (die / 2 + 0.55), 0.14, -((per - 1) * 0.72) / 2 + k * 0.72]} mat={MAT.hbm} radius={0.04} />;
            })}
        <Callout position={[0, 0.1, -die / 2 - 0.3]} title={spec.name || 'Accelerator die'} line={dieLine(spec)} />
        <Callout position={[die / 2 + 0.9, 0.3, 0]} title="Memory" line={memLabel(spec)} />
      </Layer>
      {cool >= 1 && (
        <Layer y={0.45} lift={2.2}>
          {cool >= 2 ? <Part size={[die + 2.4, 0.18, 3]} mat={MAT.copper} radius={0.06} /> : <Fins w={die + 2.2} d={2.8} h={0.5} count={20} />}
          {cool >= 2 && [-0.8, 0.8].map((z) => <Part key={z} size={[0.18, 0.18, 1.2]} position={[(die + 2.4) / 2 + 0.3, 0.05, z]} mat={MAT.silver} />)}
          <Callout position={[0, 0.3, 1.5]} title="Cooling" line={coolLabel(spec)} />
        </Layer>
      )}
    </group>
  );
}

/** An AI model: its layers as glowing slabs (deeper for bigger models). */
function ModelStack({ spec }: { spec: HeroSpec }) {
  const layers = { S: 6, M: 9, L: 12, XL: 16 }[spec.size];
  const uses = (id: string) => spec.board.filter((c) => c === id).length;
  const glow = ['#b49cff', '#8f7bff', '#7aa2ff', '#5eead4'];
  return (
    <group position={[0, 0.2, 0]}>
      {Array.from({ length: layers }, (_, i) => (
        <Layer key={i} y={i * 0.16} lift={i * 0.14}>
          <Part size={[3.2 - i * 0.04, 0.1, 2.2 - i * 0.03]} mat={{ color: glow[i % glow.length]!, roughness: 0.4, metalness: 0.2 }} radius={0.04} />
        </Layer>
      ))}
      <Layer y={layers * 0.16} lift={layers * 0.14 + 0.4}>
        <Callout position={[1.7, 0, 0]} title={spec.name || 'Model'} line={`${layers} layer groups · ${uses('gpus')} compute · ${uses('data')} data · ${uses('safety')} safety`} />
      </Layer>
    </group>
  );
}
