import { useEffect, useState } from 'react';
import { content } from '@stm/content';
import {
  deskStats,
  equipmentDef,
  getChip,
  labSeating,
  moveCheck,
  roomMultiplier,
  serverLayout,
  stageDef,
  templateDef,
  TUNING,
  upgradeCost,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';
import { Diorama } from './Diorama';
import { HqView } from './HqView';
import { WorldMap } from './WorldMap';
import { SiteView } from './SiteView';
import { FabView } from './FabView';
import { ProductsShowcase } from './ProductsShowcase';
import { AlertFlag } from './Nudges';
import { MilestoneCard } from './Milestone';
import { MemorialCard } from './Memorial';
import { Blueprint } from './blueprint/Blueprint';
import { WaferReveal } from './blueprint/WaferReveal';
import { GUIDE_STEPS, nextStep } from '../guide';

/** The world area: the HQ (people) or the campus overview (machines), plus build-mode overlays. */
export function World({ game }: { game: GameState }) {
  const view = useStore((s) => s.worldView);
  const build = useStore((s) => s.build);
  const rotateBuild = useStore((s) => s.rotateBuild);
  const tab = useStore((s) => s.tab);
  const blueprint = tab === 'silicon' ? 'chip' : tab === 'models' ? 'model' : null;

  // R rotates the room being placed.
  useEffect(() => {
    if (!build) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement)) rotateBuild();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [build, rotateBuild]);

  if (blueprint)
    return (
      <>
        <Blueprint key={blueprint} game={game} kind={blueprint} />
        <WaferReveal game={game} />
        <MilestoneCard game={game} />
      </>
    );
  if (tab === 'products')
    return (
      <>
        <ProductsShowcase game={game} />
        <MilestoneCard game={game} />
      </>
    );

  return (
    <>
      {view === 'hq' ? (
        <HqView game={game} />
      ) : view === 'campus' ? (
        <Diorama game={game} />
      ) : view === 'map' ? (
        <WorldMap game={game} />
      ) : view === 'fab' ? (
        <FabView game={game} />
      ) : (
        <SiteView game={game} />
      )}
      <WaferReveal game={game} />
      <MilestoneCard game={game} />
      {view === 'campus' && <MemorialCard game={game} />}
      <div className="world-top">
        <div className="world-top-left">
          <Breadcrumb game={game} />
          {view === 'hq' && <FloorTabs game={game} />}
          <NextStepPill game={game} />
        </div>
        <AlertFlag game={game} />
      </div>
      {view === 'hq' && tab === 'hq' && <BuildBar game={game} />}
      {view === 'hq' && tab !== 'hq' && <BuildHint />}
    </>
  );
}

/** The one thing to do next. Click to go there; hide it from Settings. */
function NextStepPill({ game }: { game: GameState }) {
  const show = useStore((s) => s.settings.showGuide);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const setSubTab = useStore((s) => s.setSubTab);
  const update = useStore((s) => s.updateSettings);
  if (!show) return null;
  const step = nextStep(game);
  const here = tab === step.tab;
  return (
    <div className={`next-step${here ? ' here' : ''}`} key={step.key}>
      <button
        className="next-step-go"
        onClick={() => {
          setTab(step.tab);
          if (step.sub) setSubTab(step.tab, step.sub);
        }}
        title={here ? 'You are in the right place' : 'Go there'}
      >
        <span className="next-step-k">{step.n >= 1 && step.n <= GUIDE_STEPS ? `Next · ${step.n} of ${GUIDE_STEPS}` : 'Next'}</span>
        <span className="next-step-t">{step.text}</span>
        {!here && <span aria-hidden="true">→</span>}
      </button>
      <button className="next-step-x" aria-label="Hide the guide" title="Hide the guide (turn it back on in Settings)" onClick={() => update({ showGuide: false })}>
        ×
      </button>
    </div>
  );
}

/** Where we are in the world; each crumb goes back up. Replaces the old view switch. */
function Breadcrumb({ game }: { game: GameState }) {
  const view = useStore((s) => s.worldView);
  const siteId = useStore((s) => s.siteId);
  const hallId = useStore((s) => s.hallId);
  const setTab = useStore((s) => s.setTab);
  const setView = useStore((s) => s.setWorldView);
  const openSite = useStore((s) => s.openSite);
  const crumbs: { label: string; go?: () => void }[] = [];
  if (view === 'hq') {
    crumbs.push({ label: 'HQ', go: () => setTab('hq') }, { label: stageDef(content, game.hq.stage).name });
  } else if (view === 'campus') {
    crumbs.push({ label: 'Compute' }, { label: 'Campus overview' });
  } else if (view === 'fab') {
    crumbs.push({ label: 'Fab', go: () => setTab('fab') }, { label: game.fab?.status === 'building' ? 'Under construction' : 'Production floor' });
  } else {
    crumbs.push({ label: 'Data centers', go: () => setTab('sites') }, { label: 'World map', go: () => setView('map') });
    const site = view === 'site' ? game.sites.find((x) => x.id === siteId) : undefined;
    if (site) {
      crumbs.push({ label: site.name, go: () => openSite(site.id, null) });
      const hall = site.halls.findIndex((h) => h.id === hallId);
      if (hall >= 0) crumbs.push({ label: `Hall ${hall + 1}` });
    }
  }
  return (
    <nav className="crumbs" aria-label="Location">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="crumb">
            {c.go && !last ? <button onClick={c.go}>{c.label}</button> : <span aria-current={last ? 'location' : undefined}>{c.label}</span>}
            {!last && (
              <span className="sep" aria-hidden="true">
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function BuildHint() {
  const setTab = useStore((s) => s.setTab);
  return (
    <button className="build-hint" onClick={() => setTab('hq')}>
      Build and arrange rooms in the <strong>HQ</strong> tab (5)
    </button>
  );
}

function BuildBar({ game }: { game: GameState }) {
  const build = useStore((s) => s.build);
  const startBuild = useStore((s) => s.startBuild);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const rotateBuild = useStore((s) => s.rotateBuild);
  const hasServerRoom = game.hq.rooms.some((r) => templateDef(content, r.templateId)?.kind === 'server');
  const [cat, setCat] = useState<Category>('people');
  const stageIndex = content.hq.stages.findIndex((s) => s.id === game.hq.stage);
  const item = (id: string, kind: 'room' | 'equipment', name: string, meta: string, cost: number, blurb: string, locked?: string) => (
    <button
      key={id}
      className="build-item"
      aria-pressed={build?.templateId === id}
      disabled={game.cash < cost || !!locked}
      title={locked ?? blurb}
      onClick={() => (build?.templateId === id ? cancelBuild() : startBuild(id, kind))}
    >
      <span className="name">{name}</span>
      <span className="meta">{locked ? locked : `${meta} · ${money(cost)}`}</span>
    </button>
  );
  return (
    <div className="dock">
      <div className="dock-tip">
        {build ? (
          <>
            <button className="btn sm" onClick={rotateBuild}>
              Rotate (R)
            </button>
            <span>Click to place · right-click or Esc to stop</span>
          </>
        ) : (
          <span>{hasServerRoom ? 'Pick something to build · click a room or rack to manage it' : 'Pick a room to build · click a room to manage it'}</span>
        )}
      </div>
    <div className="build-bar">
      <div className="build-cats" role="tablist" aria-label="Build category">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {content.hq.rooms
        .filter((t) => categoryOf(t.id, t.kind) === cat)
        .map((t) =>
          item(
            t.id,
            'room',
            t.name,
            `${t.w}×${t.h}`,
            t.cost,
            t.blurb,
            stageIndex < t.minStage ? `Needs the ${content.hq.stages[t.minStage].name.toLowerCase()}` : undefined,
          ),
        )}
      {cat === 'servers' && hasServerRoom && (
        <>
          <span className="build-sep" aria-hidden="true" />
          {content.hq.equipment.map((e) =>
            item(
              e.id,
              'equipment',
              e.name,
              e.kind === 'rack' ? `${e.chips} chips` : e.kind === 'power' ? `${e.powerKW} kW` : `${e.coolingKW} kW`,
              e.cost,
              e.blurb,
              game.license.power.level < e.requiresPowerLevel ? `Power level ${e.requiresPowerLevel}` : undefined,
            ),
          )}
        </>
      )}
    </div>
    </div>
  );
}

type Category = 'people' | 'comfort' | 'office' | 'servers';
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'people', label: 'Work' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'office', label: 'Office' },
  { id: 'servers', label: 'Servers' },
];
function categoryOf(id: string, kind: string): Category {
  if (kind === 'break') return 'comfort';
  if (kind === 'server') return 'servers';
  if (kind === 'special') return 'office';
  return 'people';
}

const DISCIPLINE_WORK: Record<string, { who: string; effect: (n: number) => string }> = {
  research: { who: 'researchers', effect: (n) => `+${(n * TUNING.researcherComputeBonus * 100).toFixed(1)}% effective compute` },
  hardwareEng: { who: 'hardware engineers', effect: (n) => `${n.toFixed(1)} engineers' worth of chip design skill` },
  ops: { who: 'ops engineers', effect: (n) => `${n.toFixed(1)} engineers' worth of reliability` },
  product: { who: 'product managers', effect: (n) => `${n.toFixed(1)} PMs' worth of conversion and accounts` },
  modelEng: { who: 'model engineers', effect: (n) => `${n.toFixed(1)} engineers` },
};

/** Floor tabs for multi-floor HQs (world-and-facilities §3). */
function FloorTabs({ game }: { game: GameState }) {
  const stage = stageDef(content, game.hq.stage);
  const floor = useStore((s) => s.floor);
  const setFloor = useStore((s) => s.setFloor);
  if (stage.floors <= 1) return null;
  return (
    <div className="floor-tabs" role="tablist" aria-label="Floor">
      {Array.from({ length: stage.floors }, (_, i) => {
        const rooms = game.hq.rooms.filter((r) => (r.floor ?? 0) === i).length;
        return (
          <button key={i} role="tab" aria-selected={Math.min(floor, stage.floors - 1) === i} onClick={() => setFloor(i)}>
            {stage.floorNames?.[i] ?? `Floor ${i + 1}`}
            <span className="muted"> · {rooms}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Card for whatever is selected in the HQ: a room or a piece of server equipment. */
export function SelectionCard({ game }: { game: GameState }) {
  const selected = useStore((s) => s.selectedRoom);
  if (!selected) return null;
  if (game.hq.equipment.some((e) => e.id === selected)) return <EquipmentCard game={game} id={selected} />;
  return <RoomCard game={game} id={selected} />;
}

function EquipmentCard({ game, id }: { game: GameState; id: string }) {
  const selectRoom = useStore((s) => s.selectRoom);
  const send = useStore((s) => s.send);
  const eq = game.hq.equipment.find((e) => e.id === id)!;
  const def = equipmentDef(content, eq.equipId);
  if (!def) return null;
  const layout = serverLayout(game, content);
  const room = layout.rooms.find((r) => r.roomId === eq.roomId);
  const rack = room?.racks.find((r) => r.equipmentId === id);
  const chip = rack?.chipId ? getChip(content, rack.chipId, game) : undefined;
  const lines: string[] = [];
  if (def.chips > 0) {
    if (rack?.chipId && chip) lines.push(`${rack.count}/${def.chips} × ${chip.name} · ${((rack.count * chip.watts) / 1000).toFixed(1)} kW`);
    else if (rack && !rack.powered) lines.push('Dark: no power unit has capacity left for it.');
    else lines.push('Empty. Buy owned chips in Compute and they rack here first.');
  }
  if (def.powerKW) lines.push(`Supplies ${def.powerKW} kW to racks in this room.`);
  if (def.coolingKW) lines.push(`Removes ${def.coolingKW} kW of heat · cooling overhead ${def.pue ?? TUNING.pue}.`);
  if (room) {
    lines.push(
      `Room: ${room.itKW.toFixed(0)} kW heat · ${room.coolingKW} kW cooling · ${room.powerKW} kW power · ${
        room.throttle < 1 ? `too hot: running at ${Math.round(room.throttle * 100)}%` : 'full speed'
      }`,
    );
  }
  return (
    <div
      className="card selection"
      style={{ ['--c' as string]: def.kind === 'cooling' ? LAYER.env : def.kind === 'power' ? LAYER.power : LAYER.compute }}
    >
      <div className="row between">
        <h3>{def.name}</h3>
        <button className="btn" aria-label="Close" onClick={() => selectRoom(null)}>
          ×
        </button>
      </div>
      {lines.map((l) => (
        <div className="small" key={l}>
          {l}
        </div>
      ))}
      <div className="small muted">Upkeep {money(def.upkeepPerWeek)}/wk</div>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            send({ type: 'demolishEquipment', equipmentId: id });
            selectRoom(null);
          }}
        >
          Remove (+{money(eq.spent * TUNING.demolishRefund)})
        </button>
      </div>
    </div>
  );
}

function RoomCard({ game, id }: { game: GameState; id: string }) {
  const selectRoom = useStore((s) => s.selectRoom);
  const send = useStore((s) => s.send);
  const room = game.hq.rooms.find((r) => r.id === id);
  const t = room && templateDef(content, room.templateId);
  if (!room || !t) return null;
  const { mult, adjacentBreak } = roomMultiplier(game, content, room);
  const up = upgradeCost(t, room.tier);
  const lab = labSeating(game, content).find((l) => l.roomId === room.id);
  const p = game.hq.productivity;
  const inRoom = game.hq.equipment.filter((e) => e.roomId === room.id);
  const refund = (room.spent + inRoom.reduce((n, e) => n + e.spent, 0)) * TUNING.demolishRefund;

  let effect: string;
  if (t.kind === 'lab' && lab) {
    const work = DISCIPLINE_WORK[lab.discipline];
    const n = lab.seated * mult * p;
    effect = `${lab.seated}/${lab.seats} ${work.who} seated · ${work.effect(n)} (${lab.seated} × ${mult.toFixed(2)} room × ${p.toFixed(2)} productivity)`;
  } else if (t.kind === 'special') {
    const r = t.requiredFor;
    effect = r?.track
      ? `Unlocks ${r.track[0].toUpperCase() + r.track.slice(1)} level ${r.level} and up in License to Scale.`
      : r?.fundingRound !== undefined
        ? `${content.funding[r.fundingRound]?.name ?? 'Later'} investors and up want to meet here.`
        : t.blurb;
  } else if (t.kind === 'desks') {
    effect = `${t.desks} desks.`;
  } else if (t.kind === 'server') {
    const s = serverLayout(game, content).rooms.find((r) => r.roomId === room.id);
    const chips = s?.racks.reduce((n, r) => n + r.count, 0) ?? 0;
    effect = s
      ? `${chips} chips racked · ${s.itKW.toFixed(0)} kW heat, ${s.coolingKW} kW cooling, ${s.powerKW} kW power · ${
          s.throttle < 1 ? `too hot, running at ${Math.round(s.throttle * 100)}%: add cooling` : 'running at full speed'
        } · cooling overhead ${s.pue.toFixed(2)}`
      : 'Empty server room.';
  } else {
    effect = `Break space for ${Math.round(t.serves * mult)} people. Morale rises when everyone has break space.`;
  }

  return (
    <div
      className="card selection"
      style={{
        ['--c' as string]:
          t.kind === 'lab' ? LAYER.models : t.kind === 'break' ? LAYER.gold : t.kind === 'server' ? LAYER.compute : LAYER.trust,
      }}
    >
      <div className="row between">
        <h3>
          {t.name}
          {t.tierEffect.length > 1 ? ` · tier ${room.tier}` : ''}
        </h3>
        <button className="btn" aria-label="Close" onClick={() => selectRoom(null)}>
          ×
        </button>
      </div>
      <div className="small">{effect}</div>
      {adjacentBreak && <div className="small muted">Next to a break room: +{TUNING.labNextToBreakBonus * 100}%.</div>}
      <div className="small muted">Upkeep {money(t.upkeepPerWeek * room.tier)}/wk</div>
      <div className="row">
        {up !== null && (
          <button className="btn primary" disabled={game.cash < up} onClick={() => send({ type: 'upgradeRoom', roomId: room.id })}>
            Upgrade to tier {room.tier + 1} ({money(up)}) · ×{t.tierEffect[room.tier].toFixed(1)}
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            send({ type: 'demolishRoom', roomId: room.id });
            selectRoom(null);
          }}
        >
          Demolish (+{money(refund)})
        </button>
      </div>
    </div>
  );
}
