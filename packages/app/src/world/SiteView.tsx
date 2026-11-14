import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, MapControls } from '@react-three/drei';
import { BoxGeometry } from 'three';
import { content } from '@stm/content';
import {
  equipmentDef,
  footprint,
  getChip,
  hallPlacementError,
  locationDef,
  serverLayout,
  TUNING,
  type GameState,
  type Hall,
  type ServerLayout,
  type Site,
} from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { EquipmentPiece, Ghost, heatTint } from './HqView';

/**
 * Site view (world-and-facilities §2.2, §3): the campus exterior, driven by the halls inside and our
 * license levels; click a hall to enter its 20×12 interior grid.
 */
export function SiteView({ game }: { game: GameState }) {
  const siteId = useStore((s) => s.siteId);
  const hallId = useStore((s) => s.hallId);
  const site = game.sites.find((s) => s.id === siteId);
  const servers = useMemo(() => serverLayout(game, content), [game]);
  if (!site) return <div className="bp-empty">Pick a campus on the world map.</div>;
  const hall = site.halls.find((h) => h.id === hallId);
  return (
    <>
      <Canvas orthographic shadows camera={{ position: [30, 30, 30], zoom: 18, near: 0.1, far: 400 }}>
        <color attach="background" args={['#0e141c']} />
        <hemisphereLight args={['#fffaf0', '#d9cfbb', 0.95]} />
        <directionalLight
          position={[14, 24, 8]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        {hall ? (
          <HallInterior game={game} site={site} hall={hall} servers={servers} />
        ) : (
          <Exterior game={game} site={site} servers={servers} />
        )}
        <MapControls makeDefault enableRotate={false} minZoom={6} maxZoom={120} screenSpacePanning />
      </Canvas>
      {hall ? <HallBar game={game} site={site} hall={hall} servers={servers} /> : <SiteBar game={game} site={site} servers={servers} />}
    </>
  );
}

export function Fit({ w, h, k = 1 }: { w: number; h: number; k?: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  useEffect(() => {
    const span = w + h;
    camera.zoom = k * Math.max(6, Math.min(size.width / (0.75 * span + 2), size.height / (0.45 * span + 4)));
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls?.target.set(0, 0, 0);
    controls?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, controls]);
  return null;
}

const SLOT_W = 10;
const SLOT_D = 6;
/** Hall slots: two rows of three. */
const slotPos = (i: number): [number, number] => [-12 + (i % 3) * 12, -5 + Math.floor(i / 3) * 9];

function Exterior({ game, site, servers }: { game: GameState; site: Site; servers: ServerLayout }) {
  const openHall = useStore((s) => s.openHall);
  const send = useStore((s) => s.send);
  const loc = locationDef(content, site.locationId);
  const coolers = site.halls.flatMap((h) => h.equipment).filter((e) => equipmentDef(content, e.equipId)?.kind === 'cooling').length;
  const power = game.license.power.level;
  const env = game.license.environmental.level;
  const building = site.status === 'building';
  const fence = useMemo(() => new BoxGeometry(42, 0.8, 32), []);
  return (
    <group>
      <Fit w={44} h={34} />
      {/* Land and fence */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[44, 0.6, 34]} />
        <meshStandardMaterial color={loc?.climate === 'cold' ? '#e3e8ea' : loc?.climate === 'hot' ? '#e8d6b4' : '#d7e3c4'} />
      </mesh>
      <lineSegments position={[0, 0.4, 0]}>
        <edgesGeometry args={[fence]} />
        <lineBasicMaterial color="#8a8f99" />
      </lineSegments>

      {Array.from({ length: content.sites.maxHalls }, (_, i) => {
        const hall = site.halls[i];
        const [x, z] = slotPos(i);
        if (!hall)
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh
                position={[0, 0.02, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  if (i === site.halls.length) send({ type: 'addHall', siteId: site.id });
                }}
              >
                <planeGeometry args={[SLOT_W, SLOT_D]} />
                <meshStandardMaterial color="#cfc7b2" transparent opacity={0.5} />
              </mesh>
              {i === site.halls.length && site.status === 'online' && (
                <Html position={[0, 0.6, 0]} center zIndexRange={[5, 0]}>
                  <div className="world-tag">+ Hall slot · {money(content.sites.hall.cost)} (click)</div>
                </Html>
              )}
            </group>
          );
        return (
          <HallBuilding key={hall.id} hall={hall} x={x} z={z} servers={servers} siteBuilding={building} onOpen={() => openHall(hall.id)} />
        );
      })}

      {/* Cooling yard: one unit per few coolers inside */}
      <group position={[18, 0, -12]}>
        {Array.from({ length: Math.min(24, Math.ceil(coolers / 4)) }, (_, i) => (
          <group key={i} position={[(i % 3) * 1.4, 0, Math.floor(i / 3) * 1.4]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.1, 1, 1.1]} />
              <meshStandardMaterial color="#eef1f4" />
            </mesh>
            <mesh position={[0, 1.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.4, 16]} />
              <meshStandardMaterial color="#9aa3b1" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Substation, plus on-site generation at higher Power levels */}
      <group position={[-18, 0, 11]}>
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[3, 1.6, 2.2]} />
          <meshStandardMaterial color="#e9e3d6" emissive={LAYER.power} emissiveIntensity={0.15} />
        </mesh>
        <Html position={[0, 2.4, 0]} center zIndexRange={[5, 0]}>
          <div className="world-tag" style={{ borderColor: LAYER.power }}>
            Substation
          </div>
        </Html>
      </group>
      {power >= 4 &&
        Array.from({ length: 12 }, (_, i) => (
          <mesh key={`sol${i}`} position={[-18 + (i % 4) * 1.6, 0.35, 4 + Math.floor(i / 4) * 1.2]} rotation={[-0.5, 0, 0]} castShadow>
            <boxGeometry args={[1.4, 0.06, 0.9]} />
            <meshStandardMaterial color="#2c3e66" />
          </mesh>
        ))}
      {power >= 5 && (
        <mesh position={[-14, 0, 14]} castShadow>
          <sphereGeometry args={[1.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f2efe8" emissive={LAYER.power} emissiveIntensity={0.1} />
        </mesh>
      )}

      {/* Water reclaim (Environmental level 2+) */}
      {env >= 2 && (
        <mesh position={[18, 0.02, 10]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5, 3.4]} />
          <meshStandardMaterial color="#7cc4c9" emissive="#7cc4c9" emissiveIntensity={0.15} />
        </mesh>
      )}

      {/* Operations center */}
      <group
        position={[18, 0, 3]}
        onClick={(e) => {
          e.stopPropagation();
          if (!site.opsCenter) send({ type: 'buildOpsCenter', siteId: site.id });
        }}
      >
        <mesh position={[0, 0.7, 0]} castShadow={site.opsCenter}>
          <boxGeometry args={[3, 1.4, 2.4]} />
          <meshStandardMaterial
            color={site.opsCenter ? '#fbf8f1' : '#ffffff'}
            wireframe={!site.opsCenter}
            transparent={!site.opsCenter}
            opacity={site.opsCenter ? 1 : 0.4}
            emissive={LAYER.gold}
            emissiveIntensity={site.opsCenter ? 0.12 : 0}
          />
        </mesh>
        <Html position={[0, 2.2, 0]} center zIndexRange={[5, 0]}>
          <div className="world-tag" style={{ borderColor: LAYER.gold }}>
            {site.opsCenter ? 'Operations center' : `Ops center · ${money(content.sites.opsCenter.cost)} (click)`}
          </div>
        </Html>
      </group>

      {/* Fiber line to HQ */}
      <mesh position={[0, 0.03, 16.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.25, 3]} />
        <meshStandardMaterial color={LAYER.compute} emissive={LAYER.compute} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function HallBuilding({
  hall,
  x,
  z,
  servers,
  siteBuilding,
  onOpen,
}: {
  hall: Hall;
  x: number;
  z: number;
  servers: ServerLayout;
  siteBuilding: boolean;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const room = servers.rooms.find((r) => r.roomId === hall.id);
  const chips = room?.racks.reduce((n, r) => n + r.count, 0) ?? 0;
  const building = siteBuilding || hall.status === 'building';
  const throttled = !!room && room.throttle < 1;
  const trim = throttled ? '#c2413b' : LAYER.compute;
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 1, 0]}
        castShadow={!building}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          if (!building) onOpen();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = building ? '' : 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[SLOT_W, 2, SLOT_D]} />
        <meshStandardMaterial
          color={building ? '#ffffff' : '#fbf8f1'}
          wireframe={building}
          transparent={building}
          opacity={building ? 0.45 : 1}
          emissive={trim}
          emissiveIntensity={hover && !building ? 0.15 : 0}
        />
      </mesh>
      {!building && (
        <mesh position={[0, 2.06, 0]}>
          <boxGeometry args={[SLOT_W + 0.1, 0.12, SLOT_D + 0.1]} />
          <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={throttled ? 0.5 : chips ? 0.3 : 0} />
        </mesh>
      )}
      <Html position={[0, 3, 0]} center zIndexRange={[5, 0]}>
        <div className="world-tag" style={{ borderColor: trim }}>
          {building
            ? `Hall · building, ${hall.weeksLeft} wk`
            : `Hall · ${chips.toLocaleString('en-US')} chips${throttled ? ` · throttled ${pct(room!.throttle)}` : ''}`}
        </div>
      </Html>
    </group>
  );
}

function HallInterior({ game, site, hall, servers }: { game: GameState; site: Site; hall: Hall; servers: ServerLayout }) {
  const { w, h } = content.sites.hall;
  const build = useStore((s) => s.build);
  const selected = useStore((s) => s.selectedRoom);
  const selectRoom = useStore((s) => s.selectRoom);
  const send = useStore((s) => s.send);
  const [tile, setTile] = useState<{ x: number; y: number } | null>(null);
  const room = servers.rooms.find((r) => r.roomId === hall.id);
  const toTile = (e: ThreeEvent<PointerEvent>) => ({ x: Math.floor(e.point.x + w / 2), y: Math.floor(e.point.z + h / 2) });

  let ghost: { x: number; y: number; w: number; h: number; ok: boolean; text: string } | null = null;
  const def = build?.kind === 'equipment' ? equipmentDef(content, build.templateId) : undefined;
  if (build && def && tile) {
    const f = footprint(def, build.rot);
    const x = tile.x - Math.floor((f.w - 1) / 2);
    const y = tile.y - Math.floor((f.h - 1) / 2);
    const err = hallPlacementError(game, content, hall.id, def.id, x, y, build.rot) ?? (game.cash < def.cost ? 'Not enough cash.' : null);
    ghost = { x, y, w: f.w, h: f.h, ok: !err, text: err ?? `${def.name} · ${money(def.cost)}` };
  }

  return (
    <group>
      <Fit w={w} h={h} />
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.6, h + 1.2]} />
        <meshStandardMaterial color="#d9dde4" />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        receiveShadow
        onPointerMove={(e) => build && setTile(toTile(e))}
        onPointerOut={() => setTile(null)}
        onClick={(e) => {
          if (e.delta > 4) return;
          if (ghost && build) {
            if (ghost.ok)
              send({ type: 'placeEquipment', hallId: hall.id, equipId: build.templateId, x: ghost.x, y: ghost.y, rot: build.rot });
          } else selectRoom(null);
        }}
        onContextMenu={() => useStore.getState().cancelBuild()}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={room ? heatTint(room.itKW, room.coolingKW) : '#dfe3ea'} />
      </mesh>
      {/* Walls: tall at the back, low at the front */}
      <mesh position={[0, 0.6, -h / 2 - 0.06]} raycast={() => null}>
        <boxGeometry args={[w + 0.24, 1.2, 0.12]} />
        <meshStandardMaterial color="#cfd6df" />
      </mesh>
      <mesh position={[-w / 2 - 0.06, 0.6, 0]} raycast={() => null}>
        <boxGeometry args={[0.12, 1.2, h]} />
        <meshStandardMaterial color="#cfd6df" />
      </mesh>
      {hall.equipment.map((eq) => (
        <EquipmentPiece
          key={eq.id}
          eq={eq}
          game={game}
          servers={servers}
          stageW={w}
          stageH={h}
          selected={selected === eq.id}
          interactive={!build}
          onSelect={selectRoom}
        />
      ))}
      {ghost && <Ghost {...ghost} stageW={w} stageH={h} />}
      <Html position={[-w / 2, 1.6, -h / 2]} zIndexRange={[5, 0]}>
        <div className="world-tag" style={{ borderColor: LAYER.compute }}>
          {site.name} · hall {site.halls.indexOf(hall) + 1}
        </div>
      </Html>
    </group>
  );
}

function SiteBar({ game, site, servers }: { game: GameState; site: Site; servers: ServerLayout }) {
  const loc = locationDef(content, site.locationId)!;
  const rooms = servers.rooms.filter((r) => r.siteId === site.id);
  const chips = rooms.reduce((n, r) => n + r.racks.reduce((m, k) => m + k.count, 0), 0);
  const kw = rooms.reduce((n, r) => n + r.itKW, 0);
  return (
    <div className="build-bar info">
      <span className="small">
        <strong>{site.name}</strong> · {loc.region} ·{' '}
        {site.status === 'building'
          ? `under construction, ${site.weeksLeft} wk left`
          : `${chips.toLocaleString('en-US')} chips · ${(kw / 1000).toFixed(1)} MW`}{' '}
        · power ${loc.powerPricePerMWh}/MWh · {content.sites.climates[loc.climate].label.toLowerCase()} · click a hall to go inside
      </span>
    </div>
  );
}

function HallBar({ game, site, hall, servers }: { game: GameState; site: Site; hall: Hall; servers: ServerLayout }) {
  const build = useStore((s) => s.build);
  const startBuild = useStore((s) => s.startBuild);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const send = useStore((s) => s.send);
  const selected = useStore((s) => s.selectedRoom);
  const selectRoom = useStore((s) => s.selectRoom);
  const room = servers.rooms.find((r) => r.roomId === hall.id);
  const chips = room?.racks.reduce((n, r) => n + r.count, 0) ?? 0;
  const coolers = content.hq.equipment.filter((e) => e.kind === 'cooling');
  const eq = hall.equipment.find((e) => e.id === selected);
  const eqDef = eq && equipmentDef(content, eq.equipId);
  const rack = room?.racks.find((r) => r.equipmentId === selected);
  const chip = rack?.chipId ? getChip(content, rack.chipId, game) : undefined;

  return (
    <>
      <div className="build-bar">
        {content.hq.equipment.map((e) => {
          const locked = game.license.power.level < e.requiresPowerLevel;
          return (
            <button
              key={e.id}
              className="build-item"
              aria-pressed={build?.templateId === e.id}
              disabled={locked || game.cash < e.cost}
              title={e.blurb}
              onClick={() => (build?.templateId === e.id ? cancelBuild() : startBuild(e.id, 'equipment'))}
            >
              <span className="name">{e.name}</span>
              <span className="meta">{locked ? `Power level ${e.requiresPowerLevel}` : money(e.cost)}</span>
            </button>
          );
        })}
        <span className="build-sep" aria-hidden="true" />
        {coolers.map((c) => (
          <button
            key={c.id}
            className="btn"
            disabled={game.license.power.level < c.requiresPowerLevel}
            title="Fill the empty floor with a standard layout: racks plus this cooling and power units"
            onClick={() => send({ type: 'fillHall', hallId: hall.id, coolingId: c.id })}
          >
            Fill · {c.name.replace(/ (cooling|cooler|tank)$/i, '').toLowerCase()}
          </button>
        ))}
        <button className="btn" disabled={!hall.equipment.length} onClick={() => send({ type: 'clearHall', hallId: hall.id })}>
          Clear hall
        </button>
      </div>
      <div className="hq-banner hall-banner">
        <span>{chips.toLocaleString('en-US')} chips</span>
        {room && (
          <>
            <span>
              {room.itKW.toFixed(0)} kW heat · {room.coolingKW.toFixed(0)} kW cooling · {room.powerKW} kW power
            </span>
            <span className={room.throttle < 1 ? 'neg' : undefined}>
              {room.throttle < 1 ? `Throttled to ${pct(room.throttle)}` : 'Full speed'}
            </span>
            <span>PUE {room.pue.toFixed(2)}</span>
          </>
        )}
      </div>
      {eq && eqDef && (
        <div className="room-card card" style={{ ['--c' as string]: LAYER.compute }}>
          <div className="row between">
            <h3>{eqDef.name}</h3>
            <button className="btn" aria-label="Close" onClick={() => selectRoom(null)}>
              ×
            </button>
          </div>
          {eqDef.chips > 0 && (
            <div className="small">
              {rack?.chipId && chip
                ? `${rack.count}/${eqDef.chips} × ${chip.name}`
                : rack && !rack.powered
                  ? 'Dark: no power unit has capacity left.'
                  : 'Empty: owned chips rack here automatically.'}
            </div>
          )}
          {eqDef.coolingKW > 0 && <div className="small">Removes {eqDef.coolingKW} kW before the climate bonus.</div>}
          {eqDef.powerKW > 0 && <div className="small">Supplies {eqDef.powerKW} kW.</div>}
          <button
            className="btn"
            onClick={() => {
              send({ type: 'demolishEquipment', equipmentId: eq.id });
              selectRoom(null);
            }}
          >
            Remove (+{money(eq.spent * TUNING.demolishRefund)})
          </button>
        </div>
      )}
    </>
  );
}
