import { useEffect } from 'react';
import { content } from '@stm/content';
import { deskStats, labSeating, moveCheck, roomMultiplier, stageDef, templateDef, TUNING, upgradeCost, type GameState } from '@stm/sim';
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
          <RoomCard game={game} />
        </>
      )}
    </>
  );
}

function HqBanner({ game }: { game: GameState }) {
  const d = deskStats(game, content);
  const move = moveCheck(game, content);
  const setTab = useStore((s) => s.setTab);
  const crowded = d.crowding > 1;
  return (
    <div className="hq-banner">
      <span className={crowded ? 'neg' : undefined} title="People / seats (desks plus filled specialist seats)">
        Desks {d.headcount}/{d.capacity}
      </span>
      <span title="Team morale (0–100)">Morale {Math.round(game.hq.morale)}</span>
      <span title="Crowding × morale × move-in">Productivity ×{game.hq.productivity.toFixed(2)}</span>
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
  return (
    <div className="build-bar">
      {content.hq.rooms.map((t) => (
        <button
          key={t.id}
          className="build-item"
          aria-pressed={build?.templateId === t.id}
          disabled={game.cash < t.cost}
          title={t.blurb}
          onClick={() => (build?.templateId === t.id ? cancelBuild() : startBuild(t.id))}
        >
          <span className="name">{t.name}</span>
          <span className="meta">
            {t.w}×{t.h} · {money(t.cost)}
          </span>
        </button>
      ))}
      {build ? (
        <div className="build-help">
          <button className="btn" onClick={rotateBuild}>
            Rotate (R)
          </button>
          <span className="small muted">Click to place · right-click or Esc to stop</span>
        </div>
      ) : (
        <span className="small muted build-help">Pick a room to build · click a room to manage it</span>
      )}
    </div>
  );
}

function RoomCard({ game }: { game: GameState }) {
  const selected = useStore((s) => s.selectedRoom);
  const selectRoom = useStore((s) => s.selectRoom);
  const send = useStore((s) => s.send);
  const room = game.hq.rooms.find((r) => r.id === selected);
  const t = room && templateDef(content, room.templateId);
  if (!room || !t) return null;
  const { mult, adjacentBreak } = roomMultiplier(game, content, room);
  const up = upgradeCost(t, room.tier);
  const lab = labSeating(game, content).find((l) => l.roomId === room.id);
  const p = game.hq.productivity;

  let effect: string;
  if (t.kind === 'lab' && lab) {
    const bonus = lab.seated * mult * p * TUNING.researcherComputeBonus;
    effect = `${lab.seated}/${lab.seats} researchers seated · +${(bonus * 100).toFixed(1)}% effective compute (${lab.seated} × ${(TUNING.researcherComputeBonus * 100).toFixed(0)}% × ${mult.toFixed(2)} room × ${p.toFixed(2)} productivity)`;
  } else if (t.kind === 'desks') {
    effect = `${t.desks} desks.`;
  } else {
    effect = `Break space for ${Math.round(t.serves * mult)} people. Morale rises when everyone has break space.`;
  }

  return (
    <div
      className="room-card card"
      style={{ ['--c' as string]: t.kind === 'lab' ? LAYER.models : t.kind === 'break' ? LAYER.gold : LAYER.trust }}
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
          Demolish (+{money(room.spent * TUNING.demolishRefund)})
        </button>
      </div>
    </div>
  );
}
