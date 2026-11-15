import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { v2 } from '@stm/sim';
import { useStore } from '../store';
import { Icon, LAYER } from '../ui/layers';
import { ComponentRow, Section, StatStrip } from './kit';

type G = v2.GameV2;
type Campus = v2.Campus;
const $ = v2.moneyV2;
const pf = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M PF` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K PF` : `${Math.round(n)} PF`);

const ICON = {
  hall: 'M3 21V9l9-5 9 5v12M3 21h18M7 21v-6h10v6M7 12h10',
  chips: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  cooling: 'M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1L19.1 4.9',
  power: 'M13 2L4 14h7l-1 8 9-12h-7z',
  network: 'M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8M2 9a10 10 0 0 1 20 0',
  campus: 'M3 21h18M4 21V10l5-3v14M9 21V5l6-3v19M15 21V9l5 3v9',
};

/** Which campus the Compute view shows. */
function useCampus(g: G): [Campus | undefined, (id: string) => void] {
  const [id, setId] = useState<string | null>(null);
  const list = g.compute?.campuses ?? [];
  return [list.find((c) => c.id === id) ?? list[0], setId];
}

// ---------------------------------------------------------------- Stage (main view)

/** The campus as a little isometric diorama: halls, cooling yard, substation, solar field. */
export function CampusStage({ g }: { g: G }) {
  const c = g.compute?.campuses[0];
  const selected = useStore((s) => s.campus);
  const campus = g.compute?.campuses.find((x) => x.id === selected) ?? c;
  if (!campus)
    return (
      <div className="hero">
        <div className="hero-title">
          <div className="k-over">Compute</div>
          <h1>No campus yet</h1>
          <div className="sub">{g.research.done.includes('datacenters') ? 'Pick a site in the panel to break ground.' : 'Research data center engineering to build campuses.'}</div>
        </div>
      </div>
    );
  const st = v2.site(campus.siteId);
  return (
    <div className="hero campus-stage">
      <Canvas shadows orthographic camera={{ position: [20, 18, 20], zoom: 26, near: 0.1, far: 300 }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[12, 20, 6]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <directionalLight position={[-10, 8, -8]} intensity={0.4} color="#9fc4ff" />
        <CampusModel c={campus} />
        <ContactShadows position={[0, 0.01, 0]} opacity={0.35} scale={40} blur={2} far={4} />
        <OrbitControls makeDefault enablePan={false} minZoom={12} maxZoom={60} maxPolarAngle={1.2} autoRotate autoRotateSpeed={0.25} />
      </Canvas>
      <div className="hero-title">
        <div className="k-over">{v2.COMPUTE.sizes[campus.size]!.name}</div>
        <h1>{st.name} campus</h1>
        <div className="sub">{st.blurb}</div>
      </div>
      <div className="hero-caption">{campus.halls} hall{campus.halls === 1 ? '' : 's'} running · drag to rotate</div>
    </div>
  );
}

function Box({ size, position, color, rough = 0.7, metal = 0.1 }: { size: [number, number, number]; position: [number, number, number]; color: string; rough?: number; metal?: number }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
    </mesh>
  );
}

function CampusModel({ c }: { c: Campus }) {
  const cap = v2.COMPUTE.sizes[c.size]!.halls;
  const plotW = 10 + c.size * 5;
  const plotD = 9 + c.size * 3;
  const slots = useMemo(() => Array.from({ length: cap }, (_, i) => ({ x: -plotW / 2 + 3 + (i % 4) * 4.4, z: -plotD / 2 + 2.6 + Math.floor(i / 4) * 5.6 })), [cap, plotW, plotD]);
  const built = c.halls;
  const building = c.building.length;
  const stripe = c.chip.source === 'own' ? '#5eead4' : '#7aa2ff';
  return (
    <group>
      {/* Ground: the plot, a road, a fence line. */}
      <Box size={[plotW + 4, 0.3, plotD + 4]} position={[0, -0.15, 0]} color="#1c2a3a" />
      <Box size={[plotW, 0.04, plotD]} position={[0, 0.02, 0]} color="#2a3b4e" />
      <Box size={[plotW + 4, 0.05, 1.4]} position={[0, 0.03, plotD / 2 + 1.1]} color="#3a4352" />
      {slots.map((sl, i) => {
        const done = i < built;
        const up = i >= built && i < built + building;
        if (!done && !up) return <Box key={i} size={[3.6, 0.04, 4.6]} position={[sl.x + 1.8, 0.05, sl.z + 2.3]} color="#24364a" />;
        return (
          <group key={i} position={[sl.x + 1.8, 0, sl.z + 2.3]}>
            {done ? (
              <>
                <Box size={[3.6, 1.6, 4.6]} position={[0, 0.8, 0]} color="#e7edf5" rough={0.55} />
                <Box size={[3.62, 0.08, 0.35]} position={[0, 1.62, -1.2]} color={stripe} />
                <Box size={[3.62, 0.08, 0.35]} position={[0, 1.62, 1.2]} color="#ff8f73" />
                {/* Cooling on the roof: fans for air, a plate for liquid, tanks for immersion. */}
                {c.cooling === 0 && [-0.9, 0.9].map((x) => [-0.6, 0.6].map((z) => <Box key={`${x}${z}`} size={[0.7, 0.25, 0.7]} position={[x, 1.75, z]} color="#9aa6b6" metal={0.5} />))}
                {c.cooling === 1 && <Box size={[2.8, 0.2, 2]} position={[0, 1.72, 0]} color="#7aa2ff" metal={0.4} />}
                {c.cooling === 2 && [-1, 0, 1].map((x) => <Box key={x} size={[0.7, 0.45, 2.6]} position={[x, 1.85, 0]} color="#5eead4" metal={0.3} />)}
              </>
            ) : (
              <>
                <Box size={[3.6, 0.6, 4.6]} position={[0, 0.3, 0]} color="#8a96a8" />
                {[-1.6, 1.6].map((x) => (
                  <Box key={x} size={[0.12, 2.4, 0.12]} position={[x, 1.2, -2.2]} color="#fbbf24" metal={0.6} />
                ))}
              </>
            )}
          </group>
        );
      })}
      {/* Substation and the power plant: grid yard, solar field, or redundant generators. */}
      <group position={[plotW / 2 - 1.2, 0, -plotD / 2 + 1.4]}>
        <Box size={[1.8, 0.9, 1.8]} position={[0, 0.45, 0]} color="#3b4252" metal={0.4} />
        {[-0.5, 0.5].map((x) => (
          <Box key={x} size={[0.12, 1.6, 0.12]} position={[x, 1.2, 0]} color="#c8d0dc" metal={0.8} />
        ))}
      </group>
      {c.power === 1 && (
        <group position={[0, 0, plotD / 2 + 3.6]}>
          {Array.from({ length: 4 + c.size * 2 }, (_, i) => (
            <mesh key={i} position={[-plotW / 2 + 1.4 + i * 2.1, 0.35, 0]} rotation={[-0.5, 0, 0]} castShadow>
              <boxGeometry args={[1.9, 0.06, 1.3]} />
              <meshStandardMaterial color="#1e3a6b" roughness={0.2} metalness={0.6} />
            </mesh>
          ))}
        </group>
      )}
      {c.power === 2 &&
        [0, 1, 2].map((i) => <Box key={i} size={[1, 0.8, 1.6]} position={[plotW / 2 - 1 - i * 1.3, 0.4, plotD / 2 - 1]} color="#5b6474" metal={0.4} />)}
      {/* The office block. */}
      <Box size={[2.6, 2.2, 2]} position={[-plotW / 2 + 1.5, 1.1, plotD / 2 - 1.3]} color="#8fd3ff" rough={0.2} metal={0.5} />
      {/* Fibre: a glowing line to the edge for dual routes. */}
      {c.network === 1 && <Box size={[0.12, 0.06, plotD + 4]} position={[-plotW / 2 - 0.8, 0.06, 0]} color="#b49cff" />}
    </group>
  );
}

// ---------------------------------------------------------------- Panel

export function ComputePanel({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const selectedId = useStore((s) => s.campus);
  const select = useStore((s) => s.selectCampus);
  const [refitOpen, setRefitOpen] = useState(false);
  const comp = g.compute;
  const campuses = comp?.campuses ?? [];
  const c = campuses.find((x) => x.id === selectedId) ?? campuses[0];
  const ready = g.research.done.includes('datacenters');
  if (!ready)
    return (
      <Section label="Compute">
        <p className="small">
          Data center campuses unlock with <b>Data center engineering</b> in Research. Your AI models train and serve on them, and the best ones are filled with your own accelerators.
        </p>
      </Section>
    );
  const total = v2.totalPf(g);
  const trainShare = comp?.trainShare ?? 0.5;
  const training = g.projects.filter((p) => p.phase === 'training');
  const trainingBusy = training.length > 0 || (!!g.agi && !g.ending);
  const servedPf = Math.min(v2.servingPf(g), (comp?.demand ?? 0) / v2.COMPUTE.customersPerPf);
  const inUse = total > 0 ? ((trainingBusy ? v2.trainingPf(g) : 0) + servedPf) / total : 0;
  const monthly = campuses.reduce((n, x) => n + v2.campusMonthly(x), 0);
  return (
    <>
      <StatStrip
        items={[
          { k: 'Capacity', v: pf(total) },
          { k: 'In use', v: `${Math.round(inUse * 100)}%`, bar: inUse },
          { k: 'Running', v: `${$(monthly)}/mo` },
        ]}
      />
      <Section label="Training vs serving" aside={<span className="k-hint">{Math.round(trainShare * 100)}% trains</span>}>
        <input type="range" min={0} max={100} step={5} value={Math.round(trainShare * 100)} onChange={(e) => send({ type: 'setTrainShare', share: Number(e.target.value) / 100 })} />
        <span className="k-hint">
          Training: {pf(v2.trainingPf(g))} {trainingBusy ? `for ${training.map((p) => p.name).join(', ')}${g.agi && !g.ending ? `${training.length ? ', ' : ''}the AGI run` : ''}` : '(idle: nothing is training)'}. Serving: {pf(v2.servingPf(g))} for{' '}
          {Math.round(v2.servingCustomers(g)).toLocaleString('en-US')} AI customers a day. Idle serving capacity is rented out as cloud.
        </span>
        {training.map((p) => (
          <div key={p.id} className="small">
            <div className="row between">
              <b>{p.name}</b>
              <span className="muted">
                {Math.round((p.pfDays ?? 0) / 1000).toLocaleString('en-US')}K of {Math.round(p.need / 1000).toLocaleString('en-US')}K PF-days
              </span>
            </div>
            <span className="k-bar">
              <i style={{ width: `${Math.min(100, (p.progress / Math.max(1, p.need)) * 100)}%` }} />
            </span>
          </div>
        ))}
      </Section>

      {campuses.length > 1 && (
        <div className="k-choice-grid" style={{ gridTemplateColumns: `repeat(${Math.min(3, campuses.length)}, minmax(0, 1fr))` }}>
          {campuses.map((x) => (
            <button key={x.id} className="k-choice" aria-pressed={x.id === c?.id} onClick={() => select(x.id)}>
              <span className="t">{v2.site(x.siteId).name}</span>
              <span className="e">{pf(v2.campusPf(x))}</span>
            </button>
          ))}
        </div>
      )}

      {c && <CampusCard g={g} c={c} refitOpen={refitOpen} setRefitOpen={setRefitOpen} />}
      <NewCampus g={g} />
    </>
  );
}

function CampusCard({ g, c, refitOpen, setRefitOpen }: { g: G; c: Campus; refitOpen: boolean; setRefitOpen: (v: boolean) => void }) {
  const send = useStore((s) => s.send2);
  const st = v2.site(c.siteId);
  const cap = v2.COMPUTE.sizes[c.size]!.halls;
  const q = (part: v2.CampusPart, option?: number | string) => v2.upgradeQuote(g, c, part, option);
  const up = (part: v2.CampusPart, option?: number | string) => send({ type: 'upgradeCampus', campusId: c.id, part, option });
  const hall = q('hall');
  const size = q('size');
  const cool = q('cooling');
  const net = q('network');
  const nextPower = (c.power + 1) % v2.COMPUTE.power.length;
  const power = q('power', nextPower);
  const own = v2.ownChips(g);
  const bought = v2.boughtChip(g);
  return (
    <>
      <Section label={`${st.name} · since ${v2.monthLabelV2(c.openedDay)}`}>
        <StatStrip
          items={[
            { k: 'Capacity', v: pf(v2.campusPf(c)) },
            { k: 'Power', v: `${v2.campusMw(c)} MW` },
            { k: 'Running', v: `${$(v2.campusMonthly(c))}/mo` },
          ]}
        />
      </Section>
      <div className="k-rows" style={{ ['--c' as string]: LAYER.compute }}>
        <ComponentRow
          icon={<Icon d={ICON.hall} />}
          label="Halls"
          value={`${c.halls} of ${cap} halls${c.building.length ? ` · ${c.building.length} going up` : ''}`}
          effect={`${v2.COMPUTE.hall.mw} MW each · room for ${cap - c.halls - c.building.length} more`}
          action={c.halls + c.building.length < cap ? { label: `Add hall · ${$(hall.cost)}`, onClick: () => up('hall'), disabled: !!hall.error, title: hall.error ?? undefined } : undefined}
          top={c.halls + c.building.length >= cap ? 'Full' : undefined}
        />
        <ComponentRow
          icon={<Icon d={ICON.chips} />}
          label="Chips"
          value={c.chip.name}
          effect={`${c.chip.pfPerMw.toLocaleString('en-US')} PF per MW · ${c.chip.source === 'own' ? 'your own design' : 'bought at market price'}`}
          action={{ label: refitOpen ? 'Close' : 'Refit', onClick: () => setRefitOpen(!refitOpen) }}
        />
        {refitOpen && (
          <div className="k-refit">
            {[...own.slice(0, 3).map((p) => ({ id: p.id, chip: v2.ownChip(p) })), { id: 'bought', chip: bought }].map(({ id, chip }) => {
              const r = q('chips', id);
              const same = c.chip.name === chip.name;
              return (
                <button key={id} className="k-choice" disabled={same || !!r.error} onClick={() => (up('chips', id), setRefitOpen(false))} title={r.error ?? undefined}>
                  <span className="t">{chip.name}</span>
                  <span className="e">
                    {chip.pfPerMw.toLocaleString('en-US')} PF/MW ({chip.pfPerMw >= c.chip.pfPerMw ? '+' : ''}
                    {Math.round((chip.pfPerMw / c.chip.pfPerMw - 1) * 100)}%) · {same ? 'installed' : $(r.cost)}
                  </span>
                </button>
              );
            })}
            {own.length === 0 && <span className="k-hint">Design an AI accelerator in the Studio to fill your halls with your own chips: more compute per watt, at your cost instead of the market price.</span>}
          </div>
        )}
        <ComponentRow
          icon={<Icon d={ICON.cooling} />}
          label="Cooling"
          value={v2.COMPUTE.cooling[c.cooling]!.name}
          effect={`PUE ${v2.campusPue(c).toFixed(2)}${st.climate > 0 ? ' · cool climate helps' : st.climate < 0 ? ' · hot climate costs' : ''}`}
          action={cool.error === 'Already the best there is.' ? undefined : { label: `Upgrade · ${$(cool.cost)}`, onClick: () => up('cooling'), disabled: !!cool.error, title: cool.error ?? undefined }}
          top={cool.error === 'Already the best there is.' ? 'Top tier' : undefined}
        />
        <ComponentRow
          icon={<Icon d={ICON.power} />}
          label="Power"
          value={v2.COMPUTE.power[c.power]!.name}
          effect={`${st.power} $/MWh grid · ${v2.COMPUTE.power[c.power]!.blurb}`}
          action={{ label: `Change · ${$(power.cost)}`, onClick: () => up('power', nextPower), disabled: !!power.error, title: `Switch to ${v2.COMPUTE.power[nextPower]!.name.toLowerCase()}: ${v2.COMPUTE.power[nextPower]!.blurb}${power.error ? ` (${power.error})` : ''}` }}
        />
        <ComponentRow
          icon={<Icon d={ICON.network} />}
          label="Network"
          value={v2.COMPUTE.network[c.network]!.name}
          effect={`+${Math.round((v2.COMPUTE.network[c.network]!.bonus + ((st as { net?: number }).net ?? 0)) * 100)}% compute`}
          action={net.error === 'Already the best there is.' ? undefined : { label: `Upgrade · ${$(net.cost)}`, onClick: () => up('network'), disabled: !!net.error, title: net.error ?? undefined }}
          top={net.error === 'Already the best there is.' ? 'Top tier' : undefined}
        />
        <ComponentRow
          icon={<Icon d={ICON.campus} />}
          label="Campus"
          value={v2.COMPUTE.sizes[c.size]!.name}
          effect={`Room for ${cap} halls`}
          action={size.error === 'Already the largest.' ? undefined : { label: `Grow · ${$(size.cost)}`, onClick: () => up('size'), disabled: !!size.error, title: size.error ?? undefined }}
          top={size.error === 'Already the largest.' ? 'Largest' : undefined}
        />
      </div>
    </>
  );
}

function NewCampus({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const select = useStore((s) => s.selectCampus);
  const cost = v2.COMPUTE.sizes[0]!.cost + v2.COMPUTE.hall.cost;
  const sites = v2.SITES.filter((x) => !(g.compute?.campuses ?? []).some((c) => c.siteId === x.id));
  return (
    <Section label="Break ground somewhere new" aside={<span className="k-hint">{$(cost)} with the first hall</span>}>
      <div className="k-rows">
        {sites.map((x) => {
          const err = v2.campusError(g, x.id);
          return (
            <ComponentRow
              key={x.id}
              icon={<Icon d={ICON.campus} />}
              label={x.region === 'na' ? 'North America' : x.region === 'europe' ? 'Europe' : x.region === 'japan' ? 'Japan' : 'Asia-Pacific'}
              value={x.name}
              effect={`${x.power} $/MWh · ${x.blurb}`}
              action={{
                label: 'Build',
                disabled: !!err,
                title: err ?? undefined,
                onClick: () => {
                  send({ type: 'buildCampus', siteId: x.id });
                  setTimeout(() => {
                    const last = useStore.getState().v2?.compute?.campuses.at(-1);
                    if (last) select(last.id);
                  }, 100);
                },
              }}
            />
          );
        })}
      </div>
    </Section>
  );
}

export { useCampus };
