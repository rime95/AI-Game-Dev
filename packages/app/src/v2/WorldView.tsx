import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Color, Object3D, type InstancedMesh } from 'three';
import { content } from '@stm/content';
import { v2 } from '@stm/sim';
import { useStore, type Tab2 } from '../store';
import { Icon, LAYER } from '../ui/layers';

type G = v2.GameV2;
const $ = v2.moneyV2;

/** Land on a 6° grid: [row, fromCol, toCol]; row r is centred on latitude 87 − 6r, col c on longitude −177 + 6c. */
const LAND: [number, number, number][] = [
  [1, 10, 18], [1, 20, 26], [2, 8, 18], [2, 19, 26], [2, 44, 50], [3, 2, 6], [3, 7, 19], [3, 20, 25], [3, 31, 34], [3, 35, 59], [4, 2, 6], [4, 7, 12], [4, 15, 21],
  [4, 26, 26], [4, 30, 59], [5, 6, 12], [5, 15, 20], [5, 29, 29], [5, 31, 33], [5, 34, 57], [6, 6, 21], [6, 28, 37], [6, 37, 53], [7, 7, 20], [7, 28, 36], [7, 37, 53],
  [7, 54, 54], [8, 8, 19], [8, 28, 29], [8, 31, 36], [8, 36, 52], [8, 53, 54], [9, 9, 17], [9, 28, 38], [9, 39, 50], [10, 10, 15], [10, 16, 16], [10, 27, 39], [10, 41, 44],
  [10, 45, 50], [11, 12, 14], [11, 16, 17], [11, 27, 36], [11, 37, 39], [11, 41, 43], [11, 46, 49], [12, 14, 16], [12, 27, 37], [12, 42, 43], [12, 46, 48], [12, 50, 50],
  [13, 16, 21], [13, 28, 37], [13, 47, 48], [14, 17, 22], [14, 31, 37], [14, 46, 52], [15, 16, 23], [15, 31, 37], [15, 46, 53], [16, 16, 24], [16, 32, 37], [16, 53, 54],
  [17, 17, 24], [17, 32, 37], [17, 38, 38], [17, 51, 53], [18, 18, 23], [18, 32, 36], [18, 38, 38], [18, 49, 55], [19, 18, 22], [19, 32, 35], [19, 49, 55], [20, 18, 21],
  [20, 33, 34], [20, 49, 55], [21, 18, 20], [21, 53, 54], [21, 58, 58], [22, 18, 19], [22, 58, 58], [23, 18, 19],
];

/** World units per degree. */
const K = 0.12;
const at = (lat: number, lon: number): [number, number, number] => [lon * K, 0, -lat * K];

/** Low-poly voxel land: each 6° cell becomes 2×2 blocks of slightly different heights. */
function Land() {
  const ref = useRef<InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: { x: number; z: number; h: number; c: string }[] = [];
    let seed = 7;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const [row, from, to] of LAND)
      for (let col = from; col <= to; col++)
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const lat = 87 - 6 * row + (i ? -1.5 : 1.5);
            const lon = -177 + 6 * col + (j ? 1.5 : -1.5);
            const polar = Math.abs(lat) > 69;
            const h = 0.18 + r() * 0.22 + (polar ? 0.05 : 0);
            out.push({ x: lon * K, z: -lat * K, h, c: polar ? '#c9d6e8' : r() > 0.82 ? '#2f7d63' : r() > 0.5 ? '#256b56' : '#1f5c4c' });
          }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    const col = new Color();
    cells.forEach((cell, i) => {
      o.position.set(cell.x, cell.h / 2, cell.z);
      o.scale.set(1, cell.h, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(cell.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} castShadow receiveShadow>
      <boxGeometry args={[3 * K * 0.96, 1, 3 * K * 0.96]} />
      <meshStandardMaterial roughness={0.85} metalness={0.05} />
    </instancedMesh>
  );
}

interface Place {
  id: string;
  name: string;
  kind: 'hq' | 'office' | 'campus' | 'site' | 'foundry' | 'fab' | 'agi';
  lat: number;
  lon: number;
  owned: boolean;
  line: string;
  body: string;
  action?: { label: string; disabled?: boolean; title?: string; run: () => void };
}

const KIND_ICON: Record<Place['kind'], string> = {
  hq: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  office: 'M4 21V5h10v16M14 9h6v12M7 9h4M7 13h4M7 17h4',
  campus: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  site: 'M4 4h16v6H4zM4 14h16v6H4z',
  foundry: 'M3 21V10l5 3V10l5 3V10l5 3V5h3v16z',
  fab: 'M3 21V10l5 3V10l5 3V10l5 3V5h3v16z',
  agi: 'M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z',
};
const KIND_COLOR: Record<Place['kind'], string> = { hq: '#7aa2ff', office: '#a3b1d1', campus: '#5eead4', site: '#5eead4', foundry: '#fbbf24', fab: '#fbbf24', agi: '#b49cff' };

const OFFICE_CITIES: Record<string, { name: string; lat: number; lon: number }> = {
  europe: { name: 'Munich', lat: 48.1, lon: 11.6 },
  japan: { name: 'Osaka', lat: 34.7, lon: 135.5 },
  asia: { name: 'Sydney', lat: -33.9, lon: 151.2 },
};

function usePlaces(g: G): Place[] {
  const send = useStore((s) => s.send2);
  const setTab = useStore((s) => s.setTab2);
  const select = useStore((s) => s.selectCampus);
  const go = (tab: Tab2) => () => setTab(tab);
  const stage = content.hq.stages.find((x) => x.id === g.hq.stage)?.name ?? g.hq.stage;
  const places: Place[] = [
    { id: 'hq', name: 'Santa Clara', kind: 'hq', lat: 37.35, lon: -121.95, owned: true, line: `City · your HQ`, body: `${stage} · ${g.staff.length} people`, action: { label: 'Go to HQ', run: go('hq') } },
  ];
  places.push(
    g.facilities.fab
      ? { id: 'fab', name: 'Albany', kind: 'fab', lat: 42.7, lon: -73.8, owned: true, line: `Megaproject · your fab`, body: `Level ${g.facilities.fab}: chips ${Math.round((1 - v2.unitCostMult(g)) * 100)}% cheaper to make, masks ${Math.round((1 - v2.maskCostMult(g)) * 100)}% cheaper.`, action: { label: 'Open facilities', run: go('hq') } }
      : { id: 'foundry', name: 'Hsinchu', kind: 'foundry', lat: 24.8, lon: 121, owned: true, line: 'Partner · TSMC makes your chips', body: g.research.done.includes('ownfab') ? 'You can build your own fab now.' : 'Your own fab unlocks with Fab engineering.', action: g.research.done.includes('ownfab') ? { label: 'Plan your fab', run: go('hq') } : undefined },
  );
  for (const r of v2.REGIONS.filter((x) => x.id !== 'na')) {
    const city = OFFICE_CITIES[r.id]!;
    const owned = g.offices.includes(r.id);
    const cost = v2.officeCost(g, r);
    places.push({
      id: `office-${r.id}`,
      name: city.name,
      kind: 'office',
      lat: city.lat,
      lon: city.lon,
      owned,
      line: owned ? `Sales office · ${r.name}` : `Could open · ${r.name}`,
      body: owned ? `Your chips sell across ${r.name}.` : `Opens ${r.name} to your chips: +${Math.round((r.weight / v2.WORLD_WEIGHT) * 100)}% of the world's buyers.`,
      action: owned ? undefined : { label: `Open office · ${$(cost)}`, disabled: g.cash < cost, run: () => send({ type: 'openOffice', region: r.id }) },
    });
  }
  const dcReady = g.research.done.includes('datacenters');
  for (const st of v2.SITES) {
    const c = g.compute?.campuses.find((x) => x.siteId === st.id);
    if (c)
      places.push({
        id: `campus-${st.id}`,
        name: st.name,
        kind: 'campus',
        lat: st.lat,
        lon: st.lon,
        owned: true,
        line: `Compute campus · ${v2.COMPUTE.sizes[c.size]!.name.toLowerCase()}`,
        body: `${c.halls} hall${c.halls === 1 ? '' : 's'} · ${Math.round(v2.campusPf(c)).toLocaleString('en-US')} PF · ${c.chip.name}`,
        action: { label: 'Open campus', run: () => (select(c.id), setTab('compute')) },
      });
    else if (dcReady) {
      const err = v2.campusError(g, st.id);
      places.push({
        id: `site-${st.id}`,
        name: st.name,
        kind: 'site',
        lat: st.lat,
        lon: st.lon,
        owned: false,
        line: `Compute site · ${st.power} $/MWh`,
        body: st.blurb,
        action: { label: `Build here · ${$(v2.COMPUTE.sizes[0]!.cost + v2.COMPUTE.hall.cost)}`, disabled: !!err, title: err ?? undefined, run: () => (send({ type: 'buildCampus', siteId: st.id }), setTab('compute')) },
      });
    }
  }
  if (g.agi)
    places.push({
      id: 'agi',
      name: 'The frontier run',
      kind: 'agi',
      lat: 35,
      lon: -106,
      owned: true,
      line: 'Megaproject · the AGI run',
      body: `${Math.round(((g.agi.pfDays ?? 0) / (g.agi.need ?? 1)) * 100)}% trained on your campuses.`,
      action: { label: 'Open compute', run: go('compute') },
    });
  return places;
}

/** The world tab's stage: voxel continents on a dark sea, labels on every place you own or could build. */
export function WorldStage({ g }: { g: G }) {
  const places = usePlaces(g);
  const selected = useStore((s) => s.place) ?? 'hq';
  const choose = useStore((s) => s.selectPlace);
  const sel = places.find((p) => p.id === selected) ?? places[0]!;
  const campuses = places.filter((p) => p.kind === 'campus').length;
  const mega = places.filter((p) => p.kind === 'fab' || p.kind === 'agi').length;
  const offices = places.filter((p) => p.kind === 'office' && p.owned).length;
  return (
    <div className="hero world-stage">
      <Canvas shadows camera={{ position: [-12, 13, 4], fov: 40, near: 0.1, far: 400 }} dpr={[1, 2]}>
        <color attach="background" args={['#050b1a']} />
        <Stars radius={120} depth={40} count={2500} factor={3} fade speed={0.4} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[60, 30]} />
          <meshStandardMaterial color="#0b2346" roughness={0.6} metalness={0.2} />
        </mesh>
        <Land />
        {places.map((p) => (
          <group key={p.id} position={at(p.lat, p.lon)}>
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
              <meshBasicMaterial color={KIND_COLOR[p.kind]} transparent opacity={p.owned ? 0.9 : 0.35} />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[0.22, 0.22, 0.22]} />
              <meshStandardMaterial color={KIND_COLOR[p.kind]} emissive={KIND_COLOR[p.kind]} emissiveIntensity={p.owned ? 0.8 : 0.1} />
            </mesh>
            <Html position={[0, 1.1, 0]} center zIndexRange={[20, 0]}>
              <button className={`place${p.owned ? ' owned' : ''}${p.id === sel.id ? ' on' : ''}`} style={{ ['--c' as string]: KIND_COLOR[p.kind] }} onClick={() => choose(p.id)}>
                <span className="ic">
                  <Icon d={KIND_ICON[p.kind]} />
                </span>
                {p.name}
              </button>
            </Html>
          </group>
        ))}
        <OrbitControls makeDefault target={[-10, 0, -4.5]} minDistance={6} maxDistance={40} maxPolarAngle={1.25} enableDamping />
      </Canvas>
      <div className="hero-title">
        <div className="k-over">World</div>
        <h1>{g.companyName}</h1>
        <div className="sub">
          1 HQ city · {offices} office{offices === 1 ? '' : 's'} · {campuses} compute campus{campuses === 1 ? '' : 'es'} · {mega} megaproject{mega === 1 ? '' : 's'}
        </div>
      </div>
      <div className="place-card" style={{ ['--c' as string]: KIND_COLOR[sel.kind] }}>
        <span className="ic">
          <Icon d={KIND_ICON[sel.kind]} />
        </span>
        <div className="txt">
          <b>{sel.name}</b>
          <span className="line">{sel.line}</span>
          <span className="body">{sel.body}</span>
        </div>
        {sel.action && (
          <button className="btn primary" disabled={sel.action.disabled} title={sel.action.title} onClick={sel.action.run}>
            {sel.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** The world tab's panel: everything you own, by place. */
export function WorldPanel({ g }: { g: G }) {
  const places = usePlaces(g);
  const choose = useStore((s) => s.selectPlace);
  const owned = places.filter((p) => p.owned);
  const open = places.filter((p) => !p.owned);
  const row = (p: Place) => (
    <button key={p.id} className="world-row" style={{ ['--c' as string]: KIND_COLOR[p.kind] }} onClick={() => choose(p.id)}>
      <span className="ic">
        <Icon d={KIND_ICON[p.kind]} />
      </span>
      <span className="txt">
        <b>{p.name}</b>
        <span>{p.line}</span>
      </span>
    </button>
  );
  return (
    <>
      <div className="k-section">
        <span className="k-label">Yours</span>
        {owned.map(row)}
      </div>
      {open.length > 0 && (
        <div className="k-section">
          <span className="k-label">Could build or open</span>
          {open.map(row)}
        </div>
      )}
      <p className="small muted" style={{ color: LAYER.trust }}>
        The map fills in as you grow: offices open regions to your chips, compute campuses unlock with data center engineering, and your fab and the AGI run appear as megaprojects.
      </p>
    </>
  );
}
