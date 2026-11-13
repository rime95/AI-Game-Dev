import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, MapControls } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';
import { content } from '@stm/content';
import { allChips, freeChips, marketSize, ownedPowerMW, requirementsFor, tierName, type GameState } from '@stm/sim';
import { useStore, type Tab } from '../store';
import { LAYER } from '../ui/layers';
import { nextTier, TRACK_COLOR } from '../panels/LicensePanel';

/**
 * Placeholder diorama (art-direction §4 and §10): every building is a box in its layer color,
 * and its state is visible without opening a menu. Final art swaps in via the asset registry later.
 */
export function Diorama({ game }: { game: GameState }) {
  return (
    <>
      <Canvas orthographic shadows camera={{ position: [24, 22, 24], zoom: 32, near: 0.1, far: 300 }}>
        <color attach="background" args={['#f4efe4']} />
        <hemisphereLight args={['#fffaf0', '#d9cfbb', 0.9]} />
        <directionalLight
          position={[12, 22, 8]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <Campus game={game} />
        <MapControls enableRotate={false} minZoom={14} maxZoom={90} screenSpacePanning />
      </Canvas>
      <div className="world-legend" aria-hidden="true">
        <span><i style={{ background: LAYER.models }} />Training</span>
        <span><i style={{ background: LAYER.compute }} />Serving</span>
        <span><i style={{ background: '#55575f' }} />Idle</span>
      </div>
      <div className="world-hint">Drag to pan · scroll to zoom · click a building</div>
    </>
  );
}

function Campus({ game }: { game: GameState }) {
  const setTab = useStore((s) => s.setTab);
  const total = game.fleet.reduce((n, f) => n + f.count, 0);
  const training = game.training?.spec.chipCount ?? 0;
  const free = allChips(game, content).reduce((n, c) => n + freeChips(game, c.id), 0);
  const serving = game.liveModelId ? free : 0;
  const share = game.users / marketSize(game.week);
  const power = ownedPowerMW(game, content) / game.powerCapMW;

  return (
    <group>
      {/* Main slab */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[22, 1, 15]} />
        <meshStandardMaterial color="#e6dcc6" />
      </mesh>
      <mesh position={[0, -0.02, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[21, 14]} />
        <meshStandardMaterial color="#d7e3c4" />
      </mesh>
      {/* Paths */}
      <mesh position={[0, 0, 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 1]} />
        <meshStandardMaterial color="#efe8da" />
      </mesh>

      <Building tab="overview" setTab={setTab} label="HQ" position={[-7, 0, -3.5]} size={[3.4, 2.6, 3.2]} color={LAYER.trust} />
      <Building
        tab="models"
        setTab={setTab}
        label={
          game.agi
            ? `AGI Program · ${game.agi.weeksLeft} wk`
            : game.training
              ? `Lab · training ${Math.round((game.training.flopsDone / game.training.flopsTotal) * 100)}%`
              : 'Research lab'
        }
        position={[-7, 0, 3.6]}
        size={[3.4, game.agi ? 3.4 : 1.8, 3.2]}
        color={LAYER.models}
        pulse={!!game.training || !!game.agi}
      />
      <Building tab="compute" setTab={setTab} label={`Data hall · ${total} chips`} position={[1, 0, -3.6]} size={[8, 1.4, 3.6]} color={LAYER.compute} />
      <RackYard total={total} training={training} serving={serving} />
      <Building
        tab="compute"
        setTab={setTab}
        label="Substation"
        position={[8, 0, -3.8]}
        size={[2, 1, 2.2]}
        color={LAYER.power}
        glow={power}
      />
      <Building
        tab="silicon"
        setTab={setTab}
        label={
          game.chipProject
            ? `Chip lab · tape-out ${game.chipProject.weeksLeft} wk`
            : game.customChips.length
              ? `Chip lab · ${game.customChips.length} design${game.customChips.length > 1 ? 's' : ''}`
              : game.staff.hardwareEng
                ? 'Chip lab · ready'
                : 'Chip lab · no engineers'
        }
        position={[8, 0, 3.6]}
        size={[3.2, 1.6, 3]}
        color={LAYER.silicon}
        pulse={!!game.chipProject}
        ghost={!game.staff.hardwareEng && !game.customChips.length}
      />
      <Skyline share={share} onClick={() => setTab('products')} />
      <ExpansionScaffold game={game} onClick={() => setTab('license')} />
    </group>
  );
}

/**
 * License to Scale made physical (art-direction §4): the next campus expansion sits behind
 * scaffolding with one sign per requirement. A sign lights in its track color once met.
 */
function ExpansionScaffold({ game, onClick }: { game: GameState; onClick: () => void }) {
  const target = nextTier(game);
  const reqs = requirementsFor(game, content, target);
  const met = reqs.filter((r) => r.gap === 0).length;
  const click = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick();
  };
  return (
    <group position={[0, 0, -10.6]}>
      {/* Unbuilt expansion pad */}
      <mesh position={[0, -0.4, 0]} receiveShadow onClick={click}>
        <boxGeometry args={[22, 0.8, 5.4]} />
        <meshStandardMaterial color="#d9cfba" transparent opacity={0.7} />
      </mesh>
      {/* Scaffolding frame */}
      <mesh position={[0, 1.4, 0]} onClick={click}>
        <boxGeometry args={[14, 2.8, 3.4]} />
        <meshStandardMaterial color="#8a7f6a" wireframe />
      </mesh>
      {reqs.map((r, i) => {
        const color = r.gap === 0 ? TRACK_COLOR[r.track] : '#c2413b';
        const x = -5.4 + i * 3.6;
        return (
          <group key={r.track} position={[x, 0, 2]} onClick={click}>
            <mesh position={[0, 0.7, 0]} castShadow>
              <boxGeometry args={[0.12, 1.4, 0.12]} />
              <meshStandardMaterial color="#6b6455" />
            </mesh>
            <mesh position={[0, 1.55, 0]} castShadow>
              <boxGeometry args={[1.5, 0.75, 0.1]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={r.gap === 0 ? 0.45 : 0.15} />
            </mesh>
          </group>
        );
      })}
      <Html position={[0, 3.6, 0]} center zIndexRange={[5, 0]}>
        <div
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            background: '#fffdf8',
            border: `2px solid ${LAYER.trust}`,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Expansion · {tierName(content, target)} · {met}/4 met
        </div>
      </Html>
    </group>
  );
}

interface BuildingProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  pulse?: boolean;
  glow?: number;
  ghost?: boolean;
}

function Building({ tab, setTab, label, position, size, color, pulse, glow = 0, ghost }: BuildingProps) {
  const mat = useRef<MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const p = pulse ? 0.25 + 0.25 * Math.sin(clock.elapsedTime * 3) : 0;
    mat.current.emissiveIntensity = p + glow * 0.5 + (hover ? 0.15 : 0);
  });
  return (
    <group position={position}>
      <mesh
        position={[0, size[1] / 2, 0]}
        castShadow={!ghost}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          setTab(tab);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          ref={mat}
          color={ghost ? '#ffffff' : '#fbf8f1'}
          emissive={color}
          emissiveIntensity={0}
          transparent={ghost}
          opacity={ghost ? 0.35 : 1}
          wireframe={ghost}
        />
      </mesh>
      {/* Colored roof trim = layer color */}
      {!ghost && (
        <mesh position={[0, size[1] + 0.06, 0]} castShadow>
          <boxGeometry args={[size[0] + 0.1, 0.12, size[2] + 0.1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      <Html position={[0, size[1] + 0.9, 0]} center zIndexRange={[5, 0]}>
        <div
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            background: '#fffdf8',
            border: `2px solid ${color}`,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            color: '#22232a',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

const RACK_SLOTS = 40;
const CHIPS_PER_RACK = 64;

/** Each rack = 64 chips. Violet = training, blue = serving, dark = idle (visible waste). */
function RackYard({ total, training, serving }: { total: number; training: number; serving: number }) {
  const racks = Math.min(RACK_SLOTS, Math.ceil(total / CHIPS_PER_RACK));
  const trainingRacks = Math.round((training / Math.max(1, total)) * racks);
  const servingRacks = Math.round((serving / Math.max(1, total)) * racks);
  const items = Array.from({ length: RACK_SLOTS }, (_, i) => {
    const col = i % 10;
    const row = Math.floor(i / 10);
    let color = '#e3dccd';
    let emissive = 0;
    if (i < racks) {
      if (i < trainingRacks) {
        color = LAYER.models;
        emissive = 0.6;
      } else if (i < trainingRacks + servingRacks) {
        color = LAYER.compute;
        emissive = 0.5;
      } else color = '#55575f';
    }
    return { key: i, x: -2.6 + col * 0.8, z: -0.6 + row * 0.75, color, emissive, filled: i < racks };
  });
  return (
    <group position={[1.4, 0, 1.6]}>
      {items.map((r) => (
        <mesh key={r.key} position={[r.x, r.filled ? 0.45 : 0.05, r.z]} castShadow={r.filled}>
          <boxGeometry args={[0.55, r.filled ? 0.9 : 0.1, 0.5]} />
          <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={r.emissive} />
        </mesh>
      ))}
    </group>
  );
}

/** City edge: windows light up as you gain market share. */
function Skyline({ share, onClick }: { share: number; onClick: () => void }) {
  const lit = Math.min(1, Math.sqrt(share) * 2);
  const towers = [1.6, 2.6, 1.2, 3.4, 2.0, 1.4, 2.9, 1.8, 2.3, 1.1, 3.0, 1.5];
  return (
    <group position={[-9.6, 0, 9.2]}>
      <mesh position={[9.6, -0.35, 0]} receiveShadow>
        <boxGeometry args={[22, 0.7, 2.6]} />
        <meshStandardMaterial color="#ddd3bf" />
      </mesh>
      {towers.map((h, i) => {
        const on = i / towers.length < lit;
        return (
          <mesh
            key={i}
            position={[i * 1.75, h / 2, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <boxGeometry args={[1.1, h, 1.1]} />
            <meshStandardMaterial color={on ? '#fbe3dc' : '#cfc8bb'} emissive={LAYER.products} emissiveIntensity={on ? 0.45 : 0} />
          </mesh>
        );
      })}
      <Html position={[9.6, 4, 0]} center zIndexRange={[5, 0]}>
        <div
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            background: '#fffdf8',
            border: `2px solid ${LAYER.products}`,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          City · {(share * 100).toFixed(1)}% of users
        </div>
      </Html>
    </group>
  );
}
