import { content } from '@stm/content';
import {
  deskStats,
  facilitiesCost,
  lowerName,
  labSeating,
  moraleTarget,
  moveCheck,
  moveCost,
  rackUnits,
  serverLayout,
  productivity,
  stageDef,
  templateDef,
  TUNING,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { BAD } from '../ui/layers';
import { Advisor, Bar, Stat, useDetails } from './Panel';

const SPECIALISTS = [
  { id: 'research', label: 'Researchers', room: 'research lab' },
  { id: 'hardwareEng', label: 'Hardware engineers', room: 'hardware lab' },
  { id: 'ops', label: 'Ops engineers', room: 'ops room' },
  { id: 'product', label: 'Product managers', room: 'product studio' },
] as const;

export function HqPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const stage = stageDef(content, game.hq.stage);
  const d = deskStats(game, content);
  const founding = game.era === 'founding';
  const p = productivity(game, content);
  const target = moraleTarget(game, content);
  const move = moveCheck(game, content);
  const fac = facilitiesCost(game, content);
  const labs = labSeating(game, content, 'research');
  const labSeats = labs.reduce((n, l) => n + l.seats, 0);
  const seatedResearch = labs.reduce((n, l) => n + l.seated, 0);
  const servers = serverLayout(game, content);
  const owned = game.fleet.filter((f) => f.owned).reduce((n, f) => n + f.count, 0);
  const details = useDetails();

  return (
    <>
      <Advisor who="office" color={LAYER.gold}>
        {servers.rooms.some((r) => r.throttle < 1)
          ? `The server room is too hot: chips run at ${Math.round(Math.min(...servers.rooms.map((r) => r.throttle)) * 100)}% speed. Add cooling.`
          : hint(game, d.crowding, seatedResearch, d.breakCoverage)}
      </Advisor>

      <div className="card">
        <div className="row between">
          <h3>{stage.name}</h3>
          {details && (
            <span className="small muted">
              {stage.w}×{stage.h} tiles
            </span>
          )}
        </div>
        <div className="small muted">{stage.blurb}</div>
        <div className="grid2">
          {founding ? (
            <>
              <Stat k="Rent" v={`${money(stage.founding?.rentPerMonth ?? 0)}/month`} />
              <Stat k="Room upkeep" v={`${money(fac.upkeep * (52 / 12) * TUNING.foundingCostScale)}/month`} />
            </>
          ) : (
            <>
              <Stat k="Rent" v={`${money(fac.rent)}/wk`} />
              <Stat k="Room upkeep" v={`${money(fac.upkeep)}/wk`} />
            </>
          )}
        </div>
      </div>

      {move.stage && (
        <div className="card" style={{ ['--c' as string]: LAYER.gold }}>
          <h3>Move to the {lowerName(move.stage.name)}</h3>
          <div className="small muted">{move.stage.blurb}</div>
          <div className="grid2">
            <Stat k="Space" v={`${move.stage.w}×${move.stage.h} tiles`} />
            <Stat k="Rent" v={founding ? `${money(move.stage.founding?.rentPerMonth ?? 0)}/month` : `${money(move.stage.rentPerWeek)}/wk`} />
            <Stat k="Move cost" v={money(moveCost(game, move.stage))} />
            <Stat k="Settling in" v={details ? `${TUNING.moveInWeeks} wk at ×${TUNING.moveInProductivity}` : `${TUNING.moveInWeeks} slower weeks`} />
          </div>
          <div className="small muted">Your rooms come with you at the same spots.</div>
          {move.error && (
            <div className="small" style={{ color: 'var(--bad)' }}>
              {move.error}
            </div>
          )}
          <button className="btn primary" disabled={!!move.error} onClick={() => send({ type: 'moveHq' })}>
            Move to the {lowerName(move.stage.name)}
          </button>
        </div>
      )}

      <div className="card">
        <h3>Desks and work speed</h3>
        <div className="grid2">
          <Stat k="People / seats" v={`${d.headcount} / ${d.capacity}`} c={d.crowding > 1 ? 'var(--bad)' : undefined} />
          {details ? (
            <Stat k="Crowding" v={pct(Math.min(9.99, d.crowding))} c={d.crowding > 1 ? 'var(--bad)' : undefined} />
          ) : (
            <Stat k="Working at" v={`${pct(p.total)} speed`} c={p.total < 0.9 ? 'var(--bad)' : LAYER.gold} />
          )}
        </div>
        <Bar value={d.capacity ? d.headcount / d.capacity : 1} color={d.crowding > 1 ? BAD : LAYER.gold} />
        {details && (<>
        <div className="small muted">
          Seats = {d.desks} desks + {d.specialistSeated} researchers seated in labs. Above 100% crowding, everyone works at 1 ÷ crowding².
        </div>
        <div className="grid2">
          <Stat k="Crowding" v={`×${p.crowding.toFixed(2)}`} />
          <Stat k="Morale" v={`×${p.morale.toFixed(2)}`} />
          <Stat k="Move-in" v={`×${p.moveIn.toFixed(2)}`} />
          <Stat k="Productivity" v={`×${p.total.toFixed(2)}`} c={LAYER.gold} />
        </div>
        <div className="small muted">
          Productivity scales research, cluster size per model engineer, tape-out skill, ops and product work.
        </div>
        </>)}
        {!details && (
          <div className="small muted">Crowded offices, low morale and moving house slow everyone down. Desks and break rooms fix the first two.</div>
        )}
      </div>

      <div className="card">
        <h3>Morale</h3>
        <div className="grid2">
          <Stat k="Now" v={Math.round(game.hq.morale)} c={game.hq.morale < 40 ? 'var(--bad)' : LAYER.gold} />
          <Stat k="Heading to" v={Math.round(target)} />
        </div>
        <Bar value={game.hq.morale / 100} color={LAYER.gold} />
        <div className="small muted">
          Break rooms cover {pct(d.breakCoverage)} of the team. Crowding wears people down; launches cheer them up and setbacks
          dent it.
        </div>
      </div>

      {!founding && (
      <div className="card">
        <h3>Specialist rooms</h3>
        <div className="small muted">
          Specialists only do their specialist work while seated in their room. Without one they still fill a desk.
        </div>
        {SPECIALISTS.map((s) => (
          <div
            className="row between small"
            key={s.id}
            style={{ color: game.hq.seated[s.id] < game.staff[s.id] ? 'var(--bad)' : undefined }}
          >
            <span>
              {s.label} · {s.room}
            </span>
            <span>
              {game.hq.seated[s.id]} / {game.staff[s.id]} seated
              {s.id === 'research' ? ` (${labSeats} seats)` : ''}
            </span>
          </div>
        ))}
      </div>
      )}

      {!founding && (
      <div className="card" style={{ ['--c' as string]: LAYER.compute }}>
        <h3>Server rooms</h3>
        <div className="grid2">
          <Stat k="Racks" v={`${rackUnits(game, content)} / ${stage.maxRacks}`} />
          <Stat k="HQ server power" v={`${Math.round(servers.hqKW)} / ${servers.buildingKW} kW`} />
          <Stat k="Owned chips at HQ" v={`${owned - servers.colo} / ${owned}`} c={LAYER.compute} />
          <Stat k="In rented rack space" v={`${servers.colo} · ${money(servers.colo * TUNING.colocationPerChipWeek)}/wk`} />
        </div>
        {!details &&
          servers.rooms.map((r, i) => (
            <div className="small" key={r.roomId} style={{ color: r.throttle < 1 ? 'var(--bad)' : undefined }}>
              Room {i + 1}: {r.throttle < 1 ? `too hot, chips at ${Math.round(r.throttle * 100)}% speed. Add cooling.` : 'cool and running at full speed'}
            </div>
          ))}
        {details && servers.rooms.map((r, i) => (
          <div className="small" key={r.roomId} style={{ color: r.throttle < 1 ? 'var(--bad)' : undefined }}>
            Room {i + 1}: {r.itKW.toFixed(0)} kW heat · {r.coolingKW} kW cooling · {r.powerKW} kW power ·{' '}
            {r.throttle < 1 ? `throttled to ${Math.round(r.throttle * 100)}%` : 'full speed'} · PUE {r.pue.toFixed(2)}
          </div>
        ))}
        <div className="small muted">
          {details
            ? `Owned chips rack here first: each rack holds 32 of one chip type, power units switch racks on, and if heat exceeds cooling every chip in the room slows to cooling ÷ heat. Chips without a powered rack go to rented rack space at ${money(TUNING.colocationPerChipWeek)}/chip/week. The ${lowerName(stage.name)} can supply ${stage.maxServerKW} kW and ${stage.maxRacks} rack${stage.maxRacks > 1 ? 's' : ''}.`
            : 'Chips we buy live here first. Each rack needs a power unit, and the room needs enough cooling or the chips slow down. Anything that doesn’t fit goes to rented rack space.'}
        </div>
      </div>
      )}

      <div className="card">
        <h3>Rooms ({game.hq.rooms.length})</h3>
        {game.hq.rooms.map((r) => {
          const t = templateDef(content, r.templateId);
          return (
            <div className="row between small" key={r.id}>
              <span>
                {t?.name ?? r.templateId}
                {t && t.tierEffect.length > 1 ? ` · tier ${r.tier}` : ''}
              </span>
              <button className="btn" onClick={() => useStore.getState().selectRoom(r.id)}>
                Manage
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function hint(game: GameState, crowding: number, seatedResearch: number, coverage: number): string {
  if (crowding > 1)
    return `We're ${Math.round((crowding - 1) * 100)}% over capacity and everyone is slower for it. Add desk pods, or move somewhere bigger.`;
  const unseated = SPECIALISTS.find((s) => s.id !== 'research' && game.hq.seated[s.id] < game.staff[s.id]);
  if (game.staff.research <= seatedResearch && unseated)
    return `${game.staff[unseated.id] - game.hq.seated[unseated.id]} ${unseated.label.toLowerCase()} have no ${unseated.room}, so they can't do their real job. Build one.`;
  if (game.staff.research > seatedResearch)
    return `${game.staff.research - seatedResearch} researcher${game.staff.research - seatedResearch > 1 ? 's have' : ' has'} no lab seat, so they don't boost training. Build a research lab.`;
  if (coverage < 1) return 'People need somewhere to take a breather. A break room lifts morale, and morale lifts productivity.';
  const move = moveCheck(game, content);
  if (move.stage && !move.error) return `We can afford the ${lowerName(move.stage.name)} now. More space means room to grow.`;
  return 'Everyone has a seat and a coffee machine. Keep space ahead of hiring.';
}
