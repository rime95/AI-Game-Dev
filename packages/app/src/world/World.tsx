import { useEffect } from 'react';
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

/** The world area: the HQ (people) or the campus overview (machines), plus build-mode overlays. */
export function World({ game }: { game: GameState }) {
  const view = useStore((s) => s.worldView);
  const setView = useStore((s) => s.setWorldView);
  const build = useStore((s) => s.build);
  const rotateBuild = useStore((s) => s.rotateBuild);

  // R rotates the room being placed.
  useEffect(() => {
    if (!build) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement)) rotateBuild();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [build, rotateBuild]);

  return (
    <>
      {view === 'hq' ? <HqView game={game} /> : <Diorama game={game} />}
      <div className="world-top">
        <div className="view-switch" role="tablist" aria-label="World view">
          <button role="tab" aria-selected={view === 'hq'} onClick={() => setView('hq')}>
            HQ · {stageDef(content, game.hq.stage).name}
          </button>
          <button role="tab" aria-selected={view === 'campus'} onClick={() => setView('campus')}>
            Campus
          </button>
        </div>
        {view === 'hq' && <HqBanner game={game} />}
      </div>
      {view === 'hq' && (
        <>
          <BuildBar game={game} />
          <SelectionCard game={game} />
        </>
      )}
    </>
  );
}

function HqBanner({ game }: { game: GameState }) {
  const d = deskStats(game, content);
  const move = moveCheck(game, content);
  const setTab = useStore((s) => s.setTab);
  const layout = serverLayout(game, content);
  const throttled = layout.rooms.some((r) => r.throttle < 1);
  const crowded = d.crowding > 1;
  return (
    <div className="hq-banner">
      <span className={crowded ? 'neg' : undefined} title="People / seats (desks plus filled specialist seats)">
        Desks {d.headcount}/{d.capacity}
      </span>
      <span title="Team morale (0–100)">Morale {Math.round(game.hq.morale)}</span>
      <span title="Crowding × morale × move-in">Productivity ×{game.hq.productivity.toFixed(2)}</span>
      {layout.rooms.length > 0 && (
        <span className={throttled ? 'neg' : undefined} title="Powered IT load at HQ / what the building can supply">
          Servers {Math.round(layout.hqKW)}/{layout.buildingKW} kW{throttled ? ' · throttling' : ''}
        </span>
      )}
      {move.stage && !move.error && (
        <button className="btn primary" style={{ ['--c' as string]: LAYER.gold }} onClick={() => setTab('hq')}>
          {move.stage.name} available
        </button>
      )}
    </div>
  );
}

function BuildBar({ game }: { game: GameState }) {
  const build = useStore((s) => s.build);
  const startBuild = useStore((s) => s.startBuild);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const rotateBuild = useStore((s) => s.rotateBuild);
  const hasServerRoom = game.hq.rooms.some((r) => templateDef(content, r.templateId)?.kind === 'server');
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
    <div className="build-bar">
      {content.hq.rooms.map((t) => item(t.id, 'room', t.name, `${t.w}×${t.h}`, t.cost, t.blurb))}
      {hasServerRoom && (
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
      {build ? (
        <div className="build-help">
          <button className="btn" onClick={rotateBuild}>
            Rotate (R)
          </button>
          <span className="small muted">Click to place · right-click or Esc to stop</span>
        </div>
      ) : (
        <span className="small muted build-help">
          {hasServerRoom ? 'Pick something to build · click a room or rack to manage it' : 'Pick a room to build · click a room to manage it'}
        </span>
      )}
    </div>
  );
}

/** Card for whatever is selected in the HQ: a room or a piece of server equipment. */
function SelectionCard({ game }: { game: GameState }) {
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
  if (def.coolingKW) lines.push(`Removes ${def.coolingKW} kW of heat · PUE ${def.pue ?? TUNING.pue}.`);
  if (room) {
    lines.push(
      `Room: ${room.itKW.toFixed(0)} kW heat · ${room.coolingKW} kW cooling · ${room.powerKW} kW power · ${
        room.throttle < 1 ? `throttled to ${Math.round(room.throttle * 100)}%` : 'full speed'
      }`,
    );
  }
  return (
    <div className="room-card card" style={{ ['--c' as string]: def.kind === 'cooling' ? LAYER.env : def.kind === 'power' ? LAYER.power : LAYER.compute }}>
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
    const bonus = lab.seated * mult * p * TUNING.researcherComputeBonus;
    effect = `${lab.seated}/${lab.seats} researchers seated · +${(bonus * 100).toFixed(1)}% effective compute (${lab.seated} × ${(TUNING.researcherComputeBonus * 100).toFixed(0)}% × ${mult.toFixed(2)} room × ${p.toFixed(2)} productivity)`;
  } else if (t.kind === 'desks') {
    effect = `${t.desks} desks.`;
  } else if (t.kind === 'server') {
    const s = serverLayout(game, content).rooms.find((r) => r.roomId === room.id);
    const chips = s?.racks.reduce((n, r) => n + r.count, 0) ?? 0;
    effect = s
      ? `${chips} chips racked · ${s.itKW.toFixed(0)} kW heat, ${s.coolingKW} kW cooling, ${s.powerKW} kW power · ${
          s.throttle < 1 ? `throttled to ${Math.round(s.throttle * 100)}%: add cooling` : 'running at full speed'
        } · PUE ${s.pue.toFixed(2)}`
      : 'Empty server room.';
  } else {
    effect = `Break space for ${Math.round(t.serves * mult)} people. Morale rises when everyone has break space.`;
  }

  return (
    <div
      className="room-card card"
      style={{
        ['--c' as string]: t.kind === 'lab' ? LAYER.models : t.kind === 'break' ? LAYER.gold : t.kind === 'server' ? LAYER.compute : LAYER.trust,
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
