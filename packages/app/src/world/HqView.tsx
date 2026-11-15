import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, MapControls, useTexture } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace, Vector2, type Group, type MeshStandardMaterial } from 'three';
import { content, type Discipline } from '@stm/content';
import {
  deskStats,
  equipmentDef,
  equipmentPlacement,
  equipmentRect,
  freeChips,
  serverLayout,
  totalChips,
  footprint,
  labSeating,
  placementError,
  roomRect,
  stageDef,
  templateDef,
  roomCost,
  type GameState,
  type PlacedEquipment,
  type PlacedRoom,
  type ServerLayout,
} from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';
import { DISCIPLINE_COLOR, roomArt } from './roomArt';
import { FitModel } from './Model';
import { DisplayWall } from './DisplayWall';
import { Character, type Activity } from './Character';
import { FOUNDER_PALETTE, personPalette, propPalette } from './palettes';

const DISCIPLINES: Discipline[] = ['research', 'modelEng', 'hardwareEng', 'product', 'ops'];

/** Look of each HQ stage: floor, walls and wall height (world-and-facilities §2.1). */
const STAGE_LOOK: Record<string, { floor: string; wall: string; backWall: number; label: string; floorTex: string; wallTex: string }> = {
  garage: { floor: '#d9d4ca', wall: '#d6d0c4', backWall: 1.1, label: 'Garage', floorTex: 'concrete', wallTex: 'block' },
  office: { floor: '#d8b98f', wall: '#f6f1e6', backWall: 0.9, label: 'Office', floorTex: 'wood', wallTex: 'plaster' },
  hqBuilding: { floor: '#c9ced6', wall: '#e4ebf1', backWall: 0.8, label: 'HQ building', floorTex: 'carpet', wallTex: 'plaster' },
};

/** Shared textures (public/textures/shared): neutral grey, tinted per stage by the material color. */
const texUrl = (name: string) => `${import.meta.env.BASE_URL}textures/shared/${name}.jpg`;
/** People beyond this many are drawn as the simple figure, to keep the frame rate up. */
const MAX_ANIMATED = 40;

/**
 * The HQ in isometric cutaway (world-and-facilities §3): rooms on the grid, staff at their seats,
 * and build mode with a green/red ghost. The sim owns the layout; this only renders it.
 */
export function HqView({ game }: { game: GameState }) {
  return (
    <Canvas orthographic shadows camera={{ position: [20, 20, 20], zoom: 40, near: 0.1, far: 300 }}>
      <color attach="background" args={['#080e22']} />
      <hemisphereLight args={['#fffaf0', '#d9cfbb', 0.6]} />
      {/* Soft studio light and reflections from a CC0 Poly Haven HDRI. */}
      <Suspense fallback={null}>
        <Environment files={`${import.meta.env.BASE_URL}env/poly_haven_studio_1k.exr`} environmentIntensity={0.55} />
      </Suspense>
      <directionalLight
        position={[10, 18, 6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      <Hq game={game} />
      <MapControls makeDefault enableRotate={false} minZoom={8} maxZoom={220} screenSpacePanning />
    </Canvas>
  );
}

function CameraRig({ w, h }: { w: number; h: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  useEffect(() => {
    // Fit the whole floor in view, then let the player pan and zoom.
    const span = w + h;
    camera.zoom = Math.max(8, Math.min(size.width / (0.75 * span + 2), size.height / (0.45 * span + 3)));
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls?.target.set(0, 0, 0);
    controls?.update();
    // Only refit when the HQ itself changes size, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, controls]);
  return null;
}

interface Person {
  key: string;
  discipline: Discipline;
}

/** Who sits where: specialists in their rooms, everyone else at desks, a few on a break, the rest standing. */
function seatPeople(game: GameState) {
  const pool: Record<Discipline, Person[]> = { research: [], modelEng: [], hardwareEng: [], product: [], ops: [] };
  for (const d of DISCIPLINES) for (let i = 0; i < game.staff[d]; i++) pool[d].push({ key: `${d}${i}`, discipline: d });

  const byRoom = new Map<string, Person[]>();
  for (const lab of labSeating(game, content)) byRoom.set(lab.roomId, pool[lab.discipline].splice(0, lab.seated));
  const deskQueue = DISCIPLINES.flatMap((d) => pool[d]);
  const pods = game.hq.rooms.filter((r) => templateDef(content, r.templateId)?.kind === 'desks');
  for (const pod of pods) byRoom.set(pod.id, deskQueue.splice(0, templateDef(content, pod.templateId)!.desks));

  // About one in seven seated people is on a coffee break, if there's somewhere to go.
  const breaks = game.hq.rooms.filter((r) => templateDef(content, r.templateId)?.kind === 'break');
  const seatedAtDesks = pods.flatMap((p) => byRoom.get(p.id)!);
  let onBreak = Math.round(seatedAtDesks.length / 7);
  for (const br of breaks) {
    const visitors: Person[] = [];
    for (const pod of pods) {
      const list = byRoom.get(pod.id)!;
      while (onBreak > 0 && visitors.length < 4 && list.length > 1) {
        visitors.push(list.pop()!);
        onBreak--;
      }
    }
    byRoom.set(br.id, visitors);
  }
  // The first person is the founder; the first MAX_ANIMATED get the animated character.
  const everyone = DISCIPLINES.flatMap((d) => Array.from({ length: game.staff[d] }, (_, i) => `${d}${i}`));
  return { byRoom, standing: deskQueue, founder: everyone[0], animated: new Set(everyone.slice(0, MAX_ANIMATED)) };
}

/** A person: the animated character (painted for them) when it's loaded and there's budget, else the simple figure. */
function PersonView({
  person,
  founder,
  animated,
  activity,
  position,
  face,
  slump,
  cloud,
  crowded,
}: {
  person: Person;
  founder: boolean;
  animated: boolean;
  activity: Activity;
  position: [number, number, number];
  face: number;
  slump: boolean;
  cloud: boolean;
  crowded?: boolean;
}) {
  const color = founder ? FOUNDER_PALETTE.shirt! : DISCIPLINE_COLOR[person.discipline];
  const simple = <Figure position={position} face={face} color={color} sit={activity !== 'stand'} slump={slump} cloud={cloud} crowded={crowded} />;
  if (!animated) return simple;
  return (
    <Suspense fallback={simple}>
      <group position={position} rotation={[0, face, 0]}>
        <Character palette={founder ? FOUNDER_PALETTE : personPalette(person.key, person.discipline)} activity={activity} slump={slump} bob={crowded} />
        {cloud && <MoodCloud />}
        {activity === 'type' && <WorkBubbles kind={person.discipline === 'research' ? 'research' : 'design'} seed={person.key} />}
      </group>
    </Suspense>
  );
}

function freeTiles(game: GameState, w: number, h: number): { x: number; y: number }[] {
  const used = new Set<string>();
  for (const r of game.hq.rooms.filter((room) => (room.floor ?? 0) === 0)) {
    const rect = roomRect(content, r);
    for (let x = rect.x; x < rect.x + rect.w; x++) for (let y = rect.y; y < rect.y + rect.h; y++) used.add(`${x},${y}`);
  }
  const out: { x: number; y: number }[] = [];
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) if (!used.has(`${x},${y}`)) out.push({ x, y });
  return out;
}

function Hq({ game }: { game: GameState }) {
  const stage = stageDef(content, game.hq.stage);
  const look = STAGE_LOOK[stage.id] ?? STAGE_LOOK.office;
  const { w, h } = stage;
  const build = useStore((s) => s.build);
  const selected = useStore((s) => s.selectedRoom);
  const selectRoom = useStore((s) => s.selectRoom);
  const send = useStore((s) => s.send);
  const floor = Math.min(
    useStore((s) => s.floor),
    stage.floors - 1,
  );
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoverRoom, setHoverRoom] = useState<string | null>(null);
  const lowMorale = game.hq.morale < 40;

  const { byRoom, standing, founder, animated } = useMemo(() => seatPeople(game), [game]);
  const standSpots = useMemo(() => freeTiles(game, w, h), [game, w, h]);

  // Tile under the pointer, from a point on the floor plane.
  const toTile = (e: ThreeEvent<PointerEvent>) => ({ x: Math.floor(e.point.x + w / 2), y: Math.floor(e.point.z + h / 2) });

  const ghost = build && hoverTile ? ghostFor(game, build.kind, build.templateId, build.rot, hoverTile, floor, build.moveId) : null;
  const servers = useMemo(() => serverLayout(game, content), [game]);
  const rooms = game.hq.rooms.filter((r) => (r.floor ?? 0) === floor);
  const roomIds = new Set(rooms.map((r) => r.id));

  return (
    <group>
      <CameraRig w={w} h={h} />
      {/* Slab under the building */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.6, h + 1.2]} />
        <meshStandardMaterial color="#e6dcc6" />
      </mesh>
      {/* Floor: catches pointer events for build mode */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        receiveShadow
        onPointerMove={(e) => build && setHoverTile(toTile(e))}
        onPointerOut={() => setHoverTile(null)}
        onClick={(e) => {
          if (e.delta > 4) return; // a drag to pan, not a click
          if (ghost) {
            if (ghost.ok && build!.moveId) {
              send({ type: 'moveRoom', roomId: build!.moveId, x: ghost.x, y: ghost.y, rot: build!.rot, floor });
              useStore.getState().cancelBuild();
            } else if (ghost.ok)
              send(
                build!.kind === 'room'
                  ? { type: 'placeRoom', templateId: build!.templateId, x: ghost.x, y: ghost.y, rot: build!.rot, floor }
                  : { type: 'placeEquipment', equipId: build!.templateId, x: ghost.x, y: ghost.y, rot: build!.rot, floor },
              );
          } else if (!build) selectRoom(null);
        }}
        onContextMenu={() => useStore.getState().cancelBuild()}
      >
        <planeGeometry args={[w, h]} />
        <Suspense fallback={<meshStandardMaterial color={look.floor} />}>
          <TiledFloor w={w} h={h} tex={look.floorTex} tint={look.floor} />
        </Suspense>
      </mesh>
      <GridLines w={w} h={h} strong={!!build} />
      <Walls w={w} h={h} look={look} garage={stage.id === 'garage'} />
      {floor === 0 && <DisplayWall w={w} h={h} wallHeight={look.backWall} />}
      {stage.id === 'garage' && floor === 0 && <GarageClutter game={game} w={w} h={h} />}
      {stage.id === 'garage' && floor === 0 && (
        <Suspense fallback={null}>
          <GarageDecals game={game} w={w} h={h} />
        </Suspense>
      )}

      {rooms.filter((room) => room.id !== build?.moveId).map((room) => (
        <Room
          key={room.id}
          room={room}
          stageW={w}
          stageH={h}
          people={byRoom.get(room.id) ?? []}
          founder={founder}
          animated={animated}
          stageId={stage.id}
          training={!!game.training}
          lowMorale={lowMorale}
          selected={selected === room.id}
          hovered={hoverRoom === room.id}
          interactive={!build}
          heat={servers.rooms.find((r) => r.roomId === room.id)}
          onHover={setHoverRoom}
          onSelect={selectRoom}
          label={roomLabel(game, room)}
        />
      ))}

      {game.hq.equipment
        .filter((eq) => roomIds.has(eq.roomId))
        .map((eq) => (
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

      {floor === 0 &&
        standing.map((p, i) => {
          const spot = standSpots[Math.floor(i / 2) % Math.max(1, standSpots.length)];
          const x = (spot?.x ?? i % w) - w / 2 + (i % 2 ? 0.7 : 0.3);
          const z = (spot?.y ?? 0) - h / 2 + (i % 2 ? 0.65 : 0.35);
          return (
            <PersonView
              key={p.key}
              person={p}
              founder={p.key === founder}
              animated={animated.has(p.key)}
              activity="stand"
              position={[x, 0, z]}
              face={i * 1.7}
              slump={lowMorale}
              crowded
              cloud={lowMorale && i % 3 === 0}
            />
          );
        })}

      {ghost && <Ghost {...ghost} stageW={w} stageH={h} />}
    </group>
  );
}

function roomLabel(game: GameState, room: PlacedRoom): string {
  const t = templateDef(content, room.templateId);
  if (!t) return '';
  const tier = t.tierEffect.length > 1 ? ` · tier ${room.tier}` : '';
  if (t.kind === 'lab') {
    const lab = labSeating(game, content).find((l) => l.roomId === room.id);
    return `${t.name} · ${lab?.seated ?? 0}/${lab?.seats ?? 0} seated${tier}`;
  }
  if (t.kind === 'desks') return `${t.name} · ${t.desks} desks`;
  if (t.kind === 'server' || t.kind === 'special') return t.name;
  return `${t.name} · serves ${Math.round(t.serves * t.tierEffect[room.tier - 1])}${tier}`;
}

function ghostFor(
  game: GameState,
  kind: 'room' | 'equipment',
  templateId: string,
  rot: number,
  tile: { x: number; y: number },
  floor: number,
  moveId?: string,
) {
  const t = kind === 'room' ? templateDef(content, templateId) : equipmentDef(content, templateId);
  if (!t) return null;
  const f = footprint(t, rot);
  // Center the footprint on the pointer.
  const x = tile.x - Math.floor((f.w - 1) / 2);
  const y = tile.y - Math.floor((f.h - 1) / 2);
  if (moveId) {
    const moved = game.hq.rooms.find((r) => r.id === moveId);
    const err =
      placementError(game, content, templateId, x, y, rot, floor, moveId) ??
      (moved && rot !== moved.rot && game.hq.equipment.some((e) => e.roomId === moveId) ? 'Empty the server room before turning it.' : null);
    return { x, y, w: f.w, h: f.h, ok: !err, text: err ?? `Move the ${t.name.toLowerCase()} here · free` };
  }
  const err =
    (kind === 'room'
      ? placementError(game, content, templateId, x, y, rot, floor)
      : equipmentPlacement(game, content, templateId, x, y, rot, floor).error) ?? (game.cash < roomCost(game, t) ? 'Not enough cash.' : null);
  return { x, y, w: f.w, h: f.h, ok: !err, text: err ?? `${t.name} · ${money(roomCost(game, t))}` };
}

export function Ghost({
  x,
  y,
  w,
  h,
  ok,
  text,
  stageW,
  stageH,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ok: boolean;
  text: string;
  stageW: number;
  stageH: number;
}) {
  const color = ok ? '#2f8a4c' : '#c2413b';
  const cx = x + w / 2 - stageW / 2;
  const cz = y + h / 2 - stageH / 2;
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.2, 0]} raycast={() => null}>
        <boxGeometry args={[w - 0.04, 0.4, h - 0.04]} />
        <meshStandardMaterial color={color} transparent opacity={0.35} />
      </mesh>
      <Html position={[0, 1.1, 0]} center zIndexRange={[6, 0]}>
        <div className="world-tag" style={{ borderColor: color }}>
          {text}
        </div>
      </Html>
    </group>
  );
}

/** A shared texture with its normal map, repeated `rx` by `ry` times, tinted by `tint`. */
function TexMaterial({ tex, rx, ry, tint, roughness = 0.85 }: { tex: string; rx: number; ry: number; tint: string; roughness?: number }) {
  const [base, normal] = useTexture([texUrl(tex), texUrl(`${tex}_n`)]);
  const [map, normalMap] = useMemo(() => {
    const out = [base.clone(), normal.clone()];
    for (const t of out) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
    }
    out[0].colorSpace = SRGBColorSpace;
    return out;
  }, [base, normal, rx, ry]);
  const normalScale = useMemo(() => new Vector2(0.6, 0.6), []);
  return <meshStandardMaterial map={map} normalMap={normalMap} normalScale={normalScale} color={tint} roughness={roughness} />;
}

/** The stage floor (concrete, wood or carpet), one texture repeat per 2 tiles. */
function TiledFloor({ w, h, tex, tint }: { w: number; h: number; tex: string; tint: string }) {
  return <TexMaterial tex={tex} rx={w / 2} ry={h / 2} tint={tint} />;
}

/** An oil stain on the garage floor, and a chip poster, cork board and circuit poster on the walls (one decal sheet). */
function GarageDecals({ game, w, h }: { game: GameState; w: number; h: number }) {
  const sheet = useTexture(`${import.meta.env.BASE_URL}textures/shared/decals.png`);
  // The sheet is a 3x3 grid: 0 oil, 1 drips, 2 chip poster, 3 cork board, 4 circuit poster, 5 calendar, 6 photo, 7 footprints, 8 outlet.
  const maps = useMemo(
    () =>
      [0, 1, 2, 3, 4].map((i) => {
        const t = sheet.clone();
        t.colorSpace = SRGBColorSpace;
        t.repeat.set(1 / 3, 1 / 3);
        t.offset.set((i % 3) / 3, 1 - (Math.floor(i / 3) + 1) / 3);
        t.needsUpdate = true;
        return t;
      }),
    [sheet],
  );
  const free = useMemo(() => freeTiles(game, w, h).filter((t) => t.x > 0 && t.y > 0), [game, w, h]);
  const stain = free[Math.floor(free.length / 2)];
  const back = STAGE_LOOK.garage.backWall;
  return (
    <group>
      {stain && (
        <mesh rotation={[-Math.PI / 2, 0, 0.6]} position={[stain.x - w / 2 + 0.5, 0.008, stain.y - h / 2 + 0.5]} raycast={() => null}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshStandardMaterial map={maps[0]} transparent depthWrite={false} roughness={0.4} />
        </mesh>
      )}
      <mesh position={[-w / 2 + 2.2, back * 0.6, -h / 2 + 0.01]} raycast={() => null}>
        <planeGeometry args={[0.55, 0.55]} />
        <meshStandardMaterial map={maps[2]} transparent />
      </mesh>
      <mesh position={[-w / 2 + 0.01, back * 0.58, -h / 2 + 2]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[0.55, 0.55]} />
        <meshStandardMaterial map={maps[3]} transparent />
      </mesh>
      <mesh position={[-w / 2 + 0.01, back * 0.6, -h / 2 + 3.2]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[0.45, 0.45]} />
        <meshStandardMaterial map={maps[4]} transparent />
      </mesh>
    </group>
  );
}

/** Boxes, a bin, a coat rack and a plant on free tiles along the garage's back and left walls. */
function GarageClutter({ game, w, h }: { game: GameState; w: number; h: number }) {
  const spots = useMemo(() => {
    const free = freeTiles(game, w, h).filter((t) => t.x === 0 || t.y === 0);
    return free.sort((a, b) => a.x + a.y - (b.x + b.y));
  }, [game, w, h]);
  const items: { model: string; size: [number, number, number]; face: number; wall?: boolean }[] = [
    { model: 'shelving', size: [0.62, 0.9, 0.3], face: 0, wall: true },
    { model: 'cardboardBoxClosed', size: [0.3, 0.32, 0.3], face: 0.3 },
    { model: 'coatRackStanding', size: [0.3, 0.85, 0.3], face: 0 },
    { model: 'cardboardBoxOpen', size: [0.42, 0.3, 0.3], face: -0.2 },
    { model: 'trashcan', size: [0.3, 0.4, 0.3], face: 0 },
    { model: 'pottedPlant', size: [0.34, 0.62, 0.34], face: 0 },
    { model: 'cardboardBoxClosed', size: [0.26, 0.26, 0.26], face: 0.8 },
  ];
  return (
    <group>
      {spots.slice(0, items.length).map((t, i) => (
        <Suspense key={`${t.x},${t.y}`} fallback={null}>
          {/* Tucked toward the wall corner of the tile, leaving room for people. */}
          <group position={[t.x - w / 2 + (t.x === 0 ? 0.25 : 0.5), 0, t.y - h / 2 + (t.y === 0 ? 0.25 : 0.5)]}>
            {items[i].wall ? (
              // Backed against whichever wall the tile touches.
              <group position={t.y === 0 ? [0, 0, -0.08] : [-0.08, 0, 0]}>
                <FitModel
                  name={items[i].model}
                  size={t.y === 0 ? items[i].size : [items[i].size[2], items[i].size[1], items[i].size[0]]}
                  face={t.y === 0 ? 0 : Math.PI / 2}
                  palette={propPalette('garage', items[i].model)}
                />
              </group>
            ) : (
              <FitModel name={items[i].model} size={items[i].size} face={items[i].face} />
            )}
          </group>
        </Suspense>
      ))}
    </group>
  );
}

function GridLines({ w, h, strong }: { w: number; h: number; strong: boolean }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    for (let x = 0; x <= w; x++) pts.push(x - w / 2, 0.004, -h / 2, x - w / 2, 0.004, h / 2);
    for (let y = 0; y <= h; y++) pts.push(-w / 2, 0.004, y - h / 2, w / 2, 0.004, y - h / 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [w, h]);
  return (
    <lineSegments geometry={geom} raycast={() => null}>
      <lineBasicMaterial color={strong ? '#2a63d4' : '#000000'} transparent opacity={strong ? 0.35 : 0.06} />
    </lineSegments>
  );
}

/** Cutaway walls: taller at the back, knee height at the front so you can see in. */
function Walls({ w, h, look, garage }: { w: number; h: number; look: (typeof STAGE_LOOK)[string]; garage: boolean }) {
  const t = 0.12;
  const back = look.backWall;
  const front = 0.25;
  // One texture repeat per tile of wall (cinder blocks / plaster read at that scale).
  const wallMat = (len: number) => (
    <Suspense fallback={<meshStandardMaterial color={look.wall} />}>
      <TexMaterial tex={look.wallTex} rx={len} ry={back} tint={look.wall} roughness={0.95} />
    </Suspense>
  );
  return (
    <group>
      <mesh position={[0, back / 2, -h / 2 - t / 2]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[w + t * 2, back, t]} />
        {wallMat(w)}
      </mesh>
      <mesh position={[-w / 2 - t / 2, back / 2, 0]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[t, back, h]} />
        {wallMat(h)}
      </mesh>
      <mesh position={[0, front / 2, h / 2 + t / 2]} receiveShadow raycast={() => null}>
        <boxGeometry args={[w + t * 2, front, t]} />
        <meshStandardMaterial color={look.wall} />
      </mesh>
      <mesh position={[w / 2 + t / 2, front / 2, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[t, front, h]} />
        <meshStandardMaterial color={look.wall} />
      </mesh>
      {garage ? (
        // Roll-up door on the back wall and a bare bulb.
        <group raycast={() => null}>
          <mesh position={[0.6, 0.47, -h / 2 + 0.01]}>
            <planeGeometry args={[3.2, 0.94]} />
            <Suspense fallback={<meshStandardMaterial color="#9e978a" />}>
              <TexMaterial tex="rollerdoor" rx={1} ry={1} tint="#c9c6bf" roughness={0.6} />
            </Suspense>
          </mesh>
          <mesh position={[0.6, 0.97, -h / 2 + 0.03]}>
            <boxGeometry args={[3.3, 0.08, 0.06]} />
            <meshStandardMaterial color="#7d7a73" />
          </mesh>
          <mesh position={[-w / 2 + 0.6, back + 0.05, -h / 2 + 0.3]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color="#fff6d6" emissive="#ffd970" emissiveIntensity={0.9} />
          </mesh>
        </group>
      ) : (
        // Windows along the back walls.
        <group>
          {Array.from({ length: Math.floor(w / 3) }, (_, i) => (
            <mesh key={`wx${i}`} position={[-w / 2 + 1.5 + i * 3, back * 0.6, -h / 2 + 0.005]}>
              <boxGeometry args={[1.8, back * 0.45, 0.02]} />
              <meshStandardMaterial color="#bcd6ec" emissive="#bcd6ec" emissiveIntensity={0.2} />
            </mesh>
          ))}
          {Array.from({ length: Math.floor(h / 3) }, (_, i) => (
            <mesh key={`wz${i}`} position={[-w / 2 + 0.005, back * 0.6, -h / 2 + 1.5 + i * 3]}>
              <boxGeometry args={[0.02, back * 0.45, 1.8]} />
              <meshStandardMaterial color="#bcd6ec" emissive="#bcd6ec" emissiveIntensity={0.2} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

interface RoomProps {
  room: PlacedRoom;
  founder: string;
  animated: Set<string>;
  stageId: string;
  stageW: number;
  stageH: number;
  people: Person[];
  training: boolean;
  lowMorale: boolean;
  selected: boolean;
  hovered: boolean;
  interactive: boolean;
  label: string;
  /** Server rooms: heat vs cooling, for the floor tint. */
  heat?: { itKW: number; coolingKW: number };
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function Room({
  room,
  founder,
  animated,
  stageId,
  stageW,
  stageH,
  people,
  training,
  lowMorale,
  selected,
  hovered,
  interactive,
  label,
  heat,
  onHover,
  onSelect,
}: RoomProps) {
  const t = templateDef(content, room.templateId)!;
  const rect = roomRect(content, room);
  const retro = useStore((s) => s.game?.era === 'founding');
  const art = useMemo(() => roomArt(t, room.tier, retro), [t, room.tier, retro]);
  const cx = rect.x + rect.w / 2 - stageW / 2;
  const cz = rect.y + rect.h / 2 - stageH / 2;
  const wallH = 0.22;
  const trim = selected || hovered ? 0.55 : 0.12;
  // Seats get people in order; sitting seats first so desks fill before break-room counters.
  const seats = art.seats;

  return (
    <group position={[cx, 0, cz]}>
      {/* Floor patch in the room's tint: also the click/hover target */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.006, 0]}
        receiveShadow
        onPointerOver={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          onHover(room.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          if (!interactive || e.delta > 4) return;
          e.stopPropagation();
          onSelect(room.id);
        }}
      >
        <planeGeometry args={[rect.w - 0.04, rect.h - 0.04]} />
        {/* The room tint is see-through so the stage floor shows (server rooms show heat instead). */}
        <meshStandardMaterial color={heat ? heatTint(heat.itKW, heat.coolingKW) : art.floor} transparent={!heat} opacity={heat ? 1 : 0.4} />
      </mesh>
      {/* Low walls in the layer color */}
      {(
        [
          [0, -rect.h / 2, rect.w, 0.06],
          [0, rect.h / 2, rect.w, 0.06],
          [-rect.w / 2, 0, 0.06, rect.h],
          [rect.w / 2, 0, 0.06, rect.h],
        ] as const
      ).map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, wallH / 2, z]} castShadow raycast={() => null}>
          <boxGeometry args={[sx, wallH, sz]} />
          <meshStandardMaterial color={art.color} emissive={art.color} emissiveIntensity={trim} />
        </mesh>
      ))}
      {/* Furniture and people, laid out in the template frame and rotated with the room */}
      <group rotation={[0, (-room.rot * Math.PI) / 2, 0]}>
        <group position={[-t.w / 2, 0, -t.h / 2]}>
          {art.props.map((p, i) => {
            const box = (
              <mesh position={[p.u, (p.y ?? 0) + p.size[1] / 2, p.v]} castShadow receiveShadow raycast={() => null}>
                <boxGeometry args={p.size} />
                <meshStandardMaterial
                  color={p.trainingGlow && training ? LAYER.models : p.color}
                  emissive={p.trainingGlow && training ? LAYER.models : p.color}
                  emissiveIntensity={p.trainingGlow && training ? 0.8 : (p.glow ?? 0)}
                />
              </mesh>
            );
            if (!p.model) return <group key={i}>{box}</group>;
            return (
              <Suspense key={i} fallback={box}>
                <group position={[p.u, p.y ?? 0, p.v]}>
                  <FitModel name={p.model} size={p.size} face={p.face} stretch={p.stretch} palette={propPalette(stageId, p.model)} />
                  {p.trainingGlow && training && (
                    // Screens glow while a model trains.
                    <pointLight position={[0, p.size[1] * 0.6, 0]} color={LAYER.models} intensity={0.6} distance={0.9} />
                  )}
                </group>
              </Suspense>
            );
          })}
          {people.slice(0, seats.length).map((person, i) => (
            <PersonView
              key={person.key}
              person={person}
              founder={person.key === founder}
              animated={animated.has(person.key)}
              activity={!seats[i].sit ? 'stand' : t.kind === 'desks' || t.kind === 'lab' ? 'type' : 'sit'}
              position={[seats[i].u, 0, seats[i].v]}
              face={seats[i].face}
              slump={lowMorale}
              cloud={lowMorale && i % 3 === 0}
            />
          ))}
        </group>
      </group>
      {/* Tier pips */}
      {Array.from({ length: room.tier > 1 ? room.tier : 0 }, (_, i) => (
        <mesh key={`pip${i}`} position={[-rect.w / 2 + 0.2 + i * 0.22, wallH + 0.08, -rect.h / 2]} raycast={() => null}>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color={LAYER.gold} emissive={LAYER.gold} emissiveIntensity={0.5} />
        </mesh>
      ))}
      {(hovered || selected) && (
        <Html position={[0, 1.4, 0]} center zIndexRange={[6, 0]}>
          <div className="world-tag" style={{ borderColor: art.color }}>
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * While the clock runs in the rebooted game, people at work pop small bubbles over their heads:
 * design or engineering points in mint, research in lavender. Purely visual, staggered per person.
 */
function WorkBubbles({ kind, seed }: { kind: 'design' | 'research'; seed: string }) {
  const running = useStore((s) => !!s.v2 && s.speed > 0);
  const [n, setN] = useState(0);
  const offset = useMemo(() => [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 7, [seed]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setN((x) => x + 1), 2600 + offset * 230);
    return () => clearInterval(t);
  }, [running, offset]);
  if (!running || n === 0) return null;
  const text = kind === 'research' ? ['+R', '✦', '+1'][n % 3] : ['+D', '+E', '+1', '✓'][n % 4];
  return (
    <Html position={[0, 0.82, 0]} center zIndexRange={[5, 0]}>
      <span key={n} className={`work-bubble ${kind}`}>
        {text}
      </span>
    </Html>
  );
}

/** The little grey cloud over someone unhappy. */
function MoodCloud() {
  return (
    <group position={[0, 0.85, 0]}>
      {[-0.07, 0, 0.07].map((x) => (
        <mesh key={x} position={[x, x === 0 ? 0.04 : 0, 0]} raycast={() => null}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#8b8f99" />
        </mesh>
      ))}
    </group>
  );
}

/** A tiny staff figure. Slumped with a little cloud when morale is low; bobbing when standing around crowded. */
function Figure({
  position,
  face,
  color,
  sit,
  slump,
  cloud,
  crowded,
}: {
  position: [number, number, number];
  face: number;
  color: string;
  sit: boolean;
  slump: boolean;
  cloud: boolean;
  crowded?: boolean;
}) {
  const ref = useRef<Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (crowded && ref.current) ref.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2.2 + phase)) * 0.04;
  });
  const base = sit ? 0.12 : 0;
  return (
    <group position={position} rotation={[0, face, 0]}>
      <group ref={ref}>
        <group rotation={[slump ? 0.35 : 0, 0, 0]} position={[0, base, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.09, 0.12, sit ? 0.3 : 0.4, 10]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, sit ? 0.44 : 0.5, 0]} castShadow raycast={() => null}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color="#f1d3b8" />
          </mesh>
        </group>
        {cloud && <MoodCloud />}
      </group>
    </group>
  );
}

export function useDeskSummary(game: GameState) {
  return useMemo(() => deskStats(game, content), [game]);
}

/** Heat overlay (decoration only): cool blue when cooling has headroom, red when it can't keep up. */
export function heatTint(itKW: number, coolingKW: number): string {
  if (itKW <= 0) return '#dfe3ea';
  const r = Math.min(1.3, itKW / Math.max(1, coolingKW));
  const t = Math.max(0, Math.min(1, (r - 0.4) / 0.9));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(198, 240)}, ${mix(214, 170)}, ${mix(238, 160)})`;
}

/**
 * A rack, cooling unit or power unit. Rack lights (world-and-facilities §6): violet = training,
 * blue = serving, dark = idle or unpowered, blinking red = throttled.
 */
export function EquipmentPiece({
  eq,
  game,
  servers,
  stageW,
  stageH,
  selected,
  interactive,
  onSelect,
}: {
  eq: PlacedEquipment;
  game: GameState;
  servers: ServerLayout;
  stageW: number;
  stageH: number;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const def = equipmentDef(content, eq.equipId);
  const light = useRef<MeshStandardMaterial>(null);
  const room = servers.rooms.find((r) => r.roomId === eq.roomId);
  const rack = room?.racks.find((r) => r.equipmentId === eq.id);
  const throttled = !!room && room.throttle < 1 && !!rack?.count;
  let lightColor = '#2b2e36';
  if (rack?.chipId && rack.count) {
    const total = totalChips(game, rack.chipId);
    const training = total - freeChips(game, rack.chipId);
    // Training takes the first racks of a chip type, serving the rest.
    const racksOfType = room!.racks.filter((r) => r.chipId === rack.chipId);
    const share = training / Math.max(1, total);
    const idx = racksOfType.indexOf(rack);
    if (idx < Math.round(share * racksOfType.length)) lightColor = LAYER.models;
    else if (game.liveModelId) lightColor = LAYER.compute;
  }
  useFrame(({ clock }) => {
    if (!light.current) return;
    light.current.emissiveIntensity = throttled
      ? 0.3 + 0.7 * (Math.sin(clock.elapsedTime * 6) > 0 ? 1 : 0)
      : lightColor === '#2b2e36'
        ? 0
        : 0.8;
  });
  if (!def) return null;
  const r = equipmentRect(content, eq);
  const cx = r.x + r.w / 2 - stageW / 2;
  const cz = r.y + r.h / 2 - stageH / 2;
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 4) return;
    e.stopPropagation();
    onSelect(eq.id);
  };
  const outline = selected ? 0.5 : 0;
  if (def.kind === 'rack') {
    return (
      <group position={[cx, 0, cz]} onClick={click}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[r.w - 0.18, 0.9, r.h - 0.18]} />
          <meshStandardMaterial color="#2f333d" emissive={LAYER.compute} emissiveIntensity={outline} />
        </mesh>
        {/* Front light strips, facing the camera side */}
        {[0.2, 0.4, 0.6, 0.8].map((y) => (
          <mesh key={y} position={[r.w / 2 - 0.08, y, 0]}>
            <boxGeometry args={[0.02, 0.06, r.h - 0.4]} />
            <meshStandardMaterial
              ref={y === 0.2 ? light : undefined}
              color={throttled ? '#c2413b' : lightColor}
              emissive={throttled ? '#c2413b' : lightColor}
              emissiveIntensity={0.8}
            />
          </mesh>
        ))}
      </group>
    );
  }
  if (def.kind === 'power') {
    return (
      <group position={[cx, 0, cz]} onClick={click}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.6, 0.7, 0.6]} />
          <meshStandardMaterial color="#e9e3d6" emissive={LAYER.power} emissiveIntensity={0.15 + outline} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[0.62, 0.06, 0.62]} />
          <meshStandardMaterial color={LAYER.power} />
        </mesh>
      </group>
    );
  }
  // Cooling: air = fan box, liquid = blue pipes, immersion = coolant tank.
  const isAir = def.id === 'coolAir';
  const isTank = def.chips > 0;
  return (
    <group position={[cx, 0, cz]} onClick={click}>
      <mesh position={[0, isTank ? 0.3 : 0.4, 0]} castShadow>
        <boxGeometry args={[0.8, isTank ? 0.6 : 0.8, 0.8]} />
        <meshStandardMaterial color={isTank ? '#d8eef0' : '#eef1f4'} emissive={LAYER.env} emissiveIntensity={outline} />
      </mesh>
      {isAir && (
        <mesh position={[0, 0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.3, 20]} />
          <meshStandardMaterial color="#9aa3b1" />
        </mesh>
      )}
      {!isAir && !isTank && (
        <>
          {[-0.2, 0.2].map((z) => (
            <mesh key={z} position={[0, 0.95, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.9, 10]} />
              <meshStandardMaterial color={LAYER.compute} />
            </mesh>
          ))}
        </>
      )}
      {isTank && (
        <mesh position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.7, 0.7]} />
          <meshStandardMaterial color="#5fd0d8" emissive="#5fd0d8" emissiveIntensity={rack?.count ? 0.5 : 0.1} />
        </mesh>
      )}
    </group>
  );
}
