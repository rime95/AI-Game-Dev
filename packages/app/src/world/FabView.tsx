import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, MapControls } from '@react-three/drei';
import type { Group } from 'three';
import { content } from '@stm/content';
import {
  FAB_STAGES,
  fabUnitCost,
  hbmPerWeek,
  hbmStacks,
  lineCapacity,
  lineCost,
  marketPerWeek,
  stageUpgradeCost,
  type FabLine,
  type FabStageId,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Fit } from './SiteView';

const STAGE_COLOR: Record<FabStageId, string> = {
  litho: LAYER.compute,
  etch: LAYER.silicon,
  test: LAYER.env,
  packaging: LAYER.products,
};
const BAY_W = 6;
const BAY_D = 4;
const bayPos = (b: number): [number, number] => [-15 + (b % 6) * BAY_W, -3 + Math.floor(b / 6) * 7];

/**
 * The fab (world-and-facilities §7): a cleanroom of 12 bays. Each line is four tool groups in a row
 * with status lights; wafers ride the overhead track while it runs. Click a bay to manage it.
 */
export function FabView({ game }: { game: GameState }) {
  const fab = game.fab;
  const [bay, setBay] = useState<number | null>(null);
  if (!fab)
    return (
      <div className="world-empty">
        <strong>No fab yet</strong>
        <span>An empty lot, waiting. The panel on the right shows what it takes to build one.</span>
      </div>
    );
  const building = fab.status === 'building';
  return (
    <>
      <Canvas orthographic shadows camera={{ position: [30, 30, 30], zoom: 20, near: 0.1, far: 400 }}>
        <color attach="background" args={['#080e22']} />
        <hemisphereLight args={['#fffaf0', '#d9cfbb', 0.95]} />
        <directionalLight
          position={[14, 24, 8]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <Fit w={40} h={20} />
        {/* Cleanroom floor */}
        <mesh position={[0, -0.3, 0]} receiveShadow onClick={() => setBay(null)}>
          <boxGeometry args={[40, 0.6, 20]} />
          <meshStandardMaterial color={building ? '#e6dcc6' : '#eef1f4'} />
        </mesh>
        <mesh position={[0, 0.8, -10.1]}>
          <boxGeometry args={[40, 1.6, 0.2]} />
          <meshStandardMaterial color="#dfe7ee" />
        </mesh>
        {Array.from({ length: content.fab.bays }, (_, b) => {
          const line = fab.lines.find((l) => l.bay === b);
          const [x, z] = bayPos(b);
          return (
            <Bay
              key={b}
              x={x}
              z={z}
              line={line}
              building={building}
              selected={bay === b}
              onClick={() => !building && setBay(b)}
              label={line ? lineLabel(game, line) : null}
            />
          );
        })}
        <MapControls makeDefault enableRotate={false} minZoom={8} maxZoom={80} screenSpacePanning />
      </Canvas>
      <FabBar game={game} />
      {bay !== null && !building && <BayCard game={game} bay={bay} onClose={() => setBay(null)} />}
    </>
  );
}

function lineLabel(game: GameState, line: FabLine): string {
  const node = content.nodes.find((n) => n.id === line.nodeId)?.name ?? line.nodeId;
  if (line.status !== 'running') return `Bay ${line.bay + 1} · ${node} · ${line.status} ${line.weeksLeft} wk`;
  const lw = line.lastWeek;
  const chip = game.customChips.find((c) => c.id === line.chipId);
  if (!chip) return `Bay ${line.bay + 1} · ${node} · pick a design`;
  return `Bay ${line.bay + 1} · ${chip.name} · ${lw ? `${big(lw.chips)}/wk · ${pct(lw.yieldRate)} good` : 'starting'}`;
}

function Bay({
  x,
  z,
  line,
  building,
  selected,
  onClick,
  label,
}: {
  x: number;
  z: number;
  line?: FabLine;
  building: boolean;
  selected: boolean;
  onClick: () => void;
  label: string | null;
}) {
  const track = useRef<Group>(null);
  const running = line?.status === 'running' && !!line.lastWeek?.chips;
  useFrame((_, dt) => {
    if (!track.current || !running) return;
    for (const c of track.current.children) {
      c.position.x += dt * 1.6;
      if (c.position.x > BAY_W / 2 - 0.3) c.position.x -= BAY_W - 0.6;
    }
  });
  const status = line?.status;
  const bottleneck = line?.lastWeek?.bottleneck;
  return (
    <group position={[x, 0, z]}>
      {/* Bay pad: click target */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => (document.body.style.cursor = building ? '' : 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[BAY_W - 0.4, BAY_D + 1]} />
        <meshStandardMaterial color={selected ? '#cfe0f5' : line ? '#e2e7ee' : '#e9e4d8'} />
      </mesh>
      {line &&
        FAB_STAGES.map((st, i) => {
          const level = line.stages[st];
          const lit =
            status === 'building' || status === 'retooling'
              ? '#c97c12'
              : line.pausedWeeks > 0
                ? '#8e44ad'
                : bottleneck === st || (st === 'packaging' && bottleneck === 'hbm')
                  ? '#c2413b'
                  : running
                    ? '#2f8a4c'
                    : '#8a8f99';
          const h = st === 'litho' ? 1.6 : 1;
          return (
            <group key={st} position={[-BAY_W / 2 + 0.9 + i * 1.4, 0, 0]}>
              {Array.from({ length: level }, (_, k) => (
                <mesh key={k} position={[0, h / 2, -BAY_D / 2 + 0.7 + k * 0.9]} castShadow raycast={() => null}>
                  <boxGeometry args={[1, h, 0.7]} />
                  <meshStandardMaterial
                    color={building || status === 'building' ? '#ffffff' : '#f7f8fa'}
                    wireframe={status === 'building'}
                    emissive={STAGE_COLOR[st]}
                    emissiveIntensity={0.18}
                  />
                </mesh>
              ))}
              <mesh position={[0, h + 0.12, -BAY_D / 2 + 0.7]} raycast={() => null}>
                <sphereGeometry args={[0.14, 12, 12]} />
                <meshStandardMaterial color={lit} emissive={lit} emissiveIntensity={0.9} />
              </mesh>
            </group>
          );
        })}
      {line && (
        <>
          {/* Overhead track with wafers */}
          <mesh position={[0, 2.1, BAY_D / 2 - 0.2]} raycast={() => null}>
            <boxGeometry args={[BAY_W - 0.4, 0.06, 0.12]} />
            <meshStandardMaterial color="#8a8f99" />
          </mesh>
          <group ref={track} position={[0, 1.95, BAY_D / 2 - 0.2]}>
            {running &&
              [0, 1, 2, 3].map((k) => (
                <mesh key={k} position={[-BAY_W / 2 + 0.4 + k * 1.4, 0, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                  <cylinderGeometry args={[0.3, 0.3, 0.04, 20]} />
                  <meshStandardMaterial color="#b9c4d4" metalness={0.6} roughness={0.25} emissive="#7f9cc4" emissiveIntensity={0.2} />
                </mesh>
              ))}
          </group>
        </>
      )}
      {label && (
        <Html position={[0, 3.8, -BAY_D / 2]} center zIndexRange={[5, 0]}>
          <div className="world-tag" style={{ borderColor: bottleneck && bottleneck !== 'demand' && running ? '#c2413b' : LAYER.silicon }}>
            {label}
          </div>
        </Html>
      )}
      {!line && !building && (
        <Html position={[0, 0.6, 0]} center zIndexRange={[5, 0]}>
          <div className="world-tag muted">Empty bay</div>
        </Html>
      )}
    </group>
  );
}

function FabBar({ game }: { game: GameState }) {
  const fab = game.fab!;
  const lw = game.lastWeek;
  const hbm = hbmPerWeek(game, content);
  return (
    <div className="build-bar">
      <span className="small">
        <strong>Fab</strong> ·{' '}
        {fab.status === 'building'
          ? `under construction, ${fab.weeksLeft} wk left`
          : `${fab.lines.length}/${content.fab.bays} lines · memory ${big(hbm)} stacks/wk${fab.hbmWeeks > 0 ? ' (shortage)' : ''} · market ${big(marketPerWeek(game, content))} chips/wk · last week ${money(-(lw?.fabCosts ?? 0))} costs, ${money(lw?.fabSales ?? 0)} sales`}
        {' · '}click a bay
      </span>
    </div>
  );
}

const BOTTLENECK_TEXT: Record<string, string> = {
  litho: 'Lithography is the slowest stage',
  etch: 'Deposition & etch is the slowest stage',
  test: 'Test is the slowest stage',
  packaging: 'Packaging is the bottleneck',
  hbm: 'Not enough chip memory this week',
  demand: 'Nowhere to put more chips (site power full, market saturated)',
  design: 'No chip design assigned',
  paused: 'Line paused after an incident',
};

function BayCard({ game, bay, onClose }: { game: GameState; bay: number; onClose: () => void }) {
  const send = useStore((s) => s.send);
  const [nodeId, setNodeId] = useState(content.nodes[0]!.id);
  const line = game.fab!.lines.find((l) => l.bay === bay);
  const openNodes = content.nodes.filter((n) => game.week >= n.availableFromWeek);

  if (!line) {
    return (
      <div className="room-card card" style={{ ['--c' as string]: LAYER.silicon }}>
        <div className="row between">
          <h3>Bay {bay + 1}</h3>
          <button className="btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="small">
          Install a production line for one process node. It runs lithography → deposition/etch → test → packaging.
        </div>
        <div className="seg">
          {openNodes.map((n) => (
            <button key={n.id} aria-pressed={nodeId === n.id} onClick={() => setNodeId(n.id)}>
              {n.name}
            </button>
          ))}
        </div>
        <button
          className="btn primary"
          disabled={game.cash < lineCost(content, nodeId)}
          onClick={() => send({ type: 'addFabLine', nodeId })}
        >
          Build line ({money(lineCost(content, nodeId))}, {content.fab.line.weeks} wk)
        </button>
      </div>
    );
  }

  const node = content.nodes.find((n) => n.id === line.nodeId)!;
  const designs = game.customChips.filter((c) => game.customChipInfo[c.id]?.design.nodeId === line.nodeId);
  const chip = game.customChips.find((c) => c.id === line.chipId);
  const cap = lineCapacity(content, line, node);
  const up = stageUpgradeCost(content, line);
  const lw = line.lastWeek;
  const retoolTargets = openNodes.filter((n) => n.id !== line.nodeId);

  return (
    <div className="room-card card fab-card" style={{ ['--c' as string]: LAYER.silicon }}>
      <div className="row between">
        <h3>
          Bay {bay + 1} · {node.name}
        </h3>
        <button className="btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {line.status !== 'running' ? (
        <div className="small">
          {line.status === 'building' ? 'Installing tools' : 'Retooling'}: {line.weeksLeft} wk left.
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="fab-chip">Making</label>
            <select
              id="fab-chip"
              value={line.chipId ?? ''}
              onChange={(e) => send({ type: 'setFabLineChip', lineId: line.id, chipId: e.target.value })}
            >
              <option value="" disabled>
                {designs.length ? 'Pick a design' : `No ${node.name} designs yet: tape one out in Silicon`}
              </option>
              {designs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="seg">
            <button aria-pressed={line.mode === 'fleet'} onClick={() => send({ type: 'setFabLineMode', lineId: line.id, mode: 'fleet' })}>
              Into our fleet
            </button>
            <button aria-pressed={line.mode === 'sell'} onClick={() => send({ type: 'setFabLineMode', lineId: line.id, mode: 'sell' })}>
              Sell on the market
            </button>
          </div>
          {line.mode === 'fleet' && (
            <div className="field">
              <span className="small muted">Chips a week for our fleet (the rest is sold)</span>
              <div className="seg">
                {[500, 2000, 5000, 20000].map((q) => (
                  <button
                    key={q}
                    aria-pressed={(line.fleetQuota ?? 2000) === q}
                    onClick={() => send({ type: 'setFabLineMode', lineId: line.id, mode: 'fleet', fleetQuota: q })}
                  >
                    {big(q)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {lw && (
            <div className="small">
              Last week: {big(lw.chips)} chips ({big(lw.toFleet)} to fleet, {big(lw.sold)} sold) · {pct(lw.yieldRate)} good ·{' '}
              {money(lw.unitCost)} each.{' '}
              <span style={{ color: lw.bottleneck === 'demand' ? undefined : 'var(--bad)' }}>{BOTTLENECK_TEXT[lw.bottleneck]}.</span>
            </div>
          )}
          {chip && (
            <div className="small muted">
              {hbmStacks(chip, node)} memory stacks per chip · mature unit cost ≈{' '}
              {money(fabUnitCost(content, node, chip, Math.min(0.95, node.baseYield + 0.12)))}
            </div>
          )}
        </>
      )}
      <table className="t">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Level</th>
            <th>Capacity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {FAB_STAGES.map((st) => {
            const def = content.fab.stages[st];
            const capText =
              st === 'packaging'
                ? `${big(line.stages[st] * (def.chipsPerLevel ?? 0))} chips`
                : `${line.stages[st] * (def.wafersPerLevel ?? 0)} wafers`;
            return (
              <tr key={st} style={{ color: cap.slowest === st ? 'var(--bad)' : undefined }}>
                <td>{def.name}</td>
                <td>{line.stages[st]}</td>
                <td>{capText}</td>
                <td>
                  <button
                    className="btn"
                    disabled={line.stages[st] >= content.fab.line.maxStageLevel || game.cash < up}
                    onClick={() => send({ type: 'upgradeFabStage', lineId: line.id, stage: st })}
                  >
                    +1 ({money(up)})
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {retoolTargets.length > 0 && (
        <div className="row">
          {retoolTargets.map((n) => (
            <button
              key={n.id}
              className="btn"
              disabled={game.cash < lineCost(content, n.id) * content.fab.line.retoolShare}
              onClick={() => send({ type: 'retoolFabLine', lineId: line.id, nodeId: n.id })}
            >
              Retool to {n.name} ({money(lineCost(content, n.id) * content.fab.line.retoolShare)}, {content.fab.line.retoolWeeks} wk)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
