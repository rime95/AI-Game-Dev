import { content } from '@stm/content';
import { fabChipShare, fabError, locationDef, serverLayout, siteError, sitesUpkeep, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

/** Sites track (world-and-facilities §2.2): our data center campuses and where we could build next. */
export function SitesPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const openSite = useStore((s) => s.openSite);
  const setWorldView = useStore((s) => s.setWorldView);
  const layout = serverLayout(game, content);
  const siteRooms = layout.rooms.filter((r) => r.siteId);
  const siteChips = siteRooms.reduce((n, r) => n + r.racks.reduce((m, k) => m + k.count, 0), 0);
  const rules = content.sites;

  return (
    <>
      <Advisor who="Infrastructure lead" color={LAYER.compute}>
        {hint(
          game,
          layout.colo,
          siteRooms.some((r) => r.throttle < 1),
        )}
      </Advisor>

      <div className="card">
        <div className="row between">
          <h3>Fleet hosting</h3>
          <button className="btn" onClick={() => setWorldView('map')}>
            World map
          </button>
        </div>
        <div className="grid2">
          <Stat k="Campuses" v={`${game.sites.length} · ${game.sites.reduce((n, s) => n + s.halls.length, 0)} halls`} />
          <Stat k="Chips in our halls" v={siteChips.toLocaleString('en-US')} c={LAYER.compute} />
          <Stat k="In colocation" v={`${layout.colo.toLocaleString('en-US')} · ${money(layout.colo * TUNING.colocationPerChipWeek)}/wk`} />
          <Stat k="Campus upkeep" v={`${money(sitesUpkeep(game, content))}/wk`} />
        </div>
      </div>

      {game.sites.map((site) => {
        const loc = locationDef(content, site.locationId)!;
        return (
          <div className="card" key={site.id} style={{ ['--c' as string]: LAYER.compute }}>
            <div className="row between">
              <h3>
                {site.name} <span className="small muted">· {loc.region}</span>
              </h3>
              <button className="btn" onClick={() => openSite(site.id)}>
                Open
              </button>
            </div>
            {site.status === 'building' ? (
              <>
                <div className="small">Under construction: {site.weeksLeft} wk left</div>
                <Bar value={1 - site.weeksLeft / site.totalWeeks} color={LAYER.compute} />
              </>
            ) : (
              site.halls.map((hall, i) => {
                const room = layout.rooms.find((r) => r.roomId === hall.id);
                const chips = room?.racks.reduce((n, r) => n + r.count, 0) ?? 0;
                return (
                  <div className="row between small" key={hall.id} style={{ color: room && room.throttle < 1 ? 'var(--bad)' : undefined }}>
                    <span>
                      Hall {i + 1}:{' '}
                      {hall.status === 'building'
                        ? `building, ${hall.weeksLeft} wk`
                        : hall.equipment.length
                          ? `${chips.toLocaleString('en-US')} chips · ${((room?.itKW ?? 0) / 1000).toFixed(2)} MW${room && room.throttle < 1 ? ` · throttled ${pct(room.throttle)}` : ''}`
                          : 'empty'}
                    </span>
                    {hall.status === 'online' && (
                      <button className="btn" onClick={() => openSite(site.id, hall.id)}>
                        {hall.equipment.length ? 'Inside' : 'Fit out'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
            <div className="row">
              <button
                className="btn"
                disabled={site.halls.length >= rules.maxHalls || game.cash < rules.hall.cost}
                onClick={() => send({ type: 'addHall', siteId: site.id })}
              >
                {site.halls.length >= rules.maxHalls ? 'All 6 halls built' : `Add hall (${money(rules.hall.cost)}, ${rules.hall.weeks} wk)`}
              </button>
              {!site.opsCenter && (
                <button
                  className="btn"
                  disabled={game.cash < rules.opsCenter.cost}
                  onClick={() => send({ type: 'buildOpsCenter', siteId: site.id })}
                >
                  Ops center ({money(rules.opsCenter.cost)})
                </button>
              )}
            </div>
            <div className="small muted">
              ${loc.powerPricePerMWh}/MWh · {rules.climates[loc.climate].label.toLowerCase()} (cooling ×
              {rules.climates[loc.climate].coolingMult}) ·{' '}
              {site.opsCenter
                ? `ops center: hardware failures ×${rules.opsCenter.failureMult}`
                : `no ops center: hardware failures ×${rules.unattendedFailureMult} for chips here`}
            </div>
          </div>
        );
      })}

      <FabCard game={game} />

      <div className="card">
        <h3>Where we could build</h3>
        <div className="small muted">
          Campuses need Power level {rules.requiresPowerLevel}. Each starts with {rules.startHalls} halls (up to {rules.maxHalls}). Dry
          places need Environmental levels.
        </div>
        {content.sites.locations
          .filter((l) => !game.sites.some((s) => s.locationId === l.id))
          .map((l) => {
            const err = siteError(game, content, l.id);
            return (
              <div className="row between small" key={l.id}>
                <span title={err ?? l.blurb}>
                  <strong>{l.name}</strong> · {l.region} · ${l.powerPricePerMWh}/MWh · {l.climate} · {l.water} water
                </span>
                <button
                  className="btn"
                  disabled={!!err || game.cash < l.buildCost}
                  title={err ?? undefined}
                  onClick={() => send({ type: 'buildSite', locationId: l.id })}
                >
                  {money(l.buildCost)}
                </button>
              </div>
            );
          })}
      </div>
    </>
  );
}

function hint(game: GameState, colo: number, throttled: boolean): string {
  const rules = content.sites;
  if (throttled) return 'A data hall is throttling: its cooling can’t keep up. Add coolers or use liquid cooling.';
  if (game.license.power.level < rules.requiresPowerLevel)
    return `Our own data centers need Power license level ${rules.requiresPowerLevel}. Until then, owned chips beyond HQ go to colocation at ${money(TUNING.colocationPerChipWeek)} per chip per week.`;
  const empty = game.sites.flatMap((s) =>
    s.status === 'online' ? s.halls.filter((h) => h.status === 'online' && !h.equipment.length) : [],
  );
  if (empty.length)
    return `${empty.length} hall${empty.length > 1 ? 's are' : ' is'} empty. Open ${empty.length > 1 ? 'one' : 'it'} and use Auto-fill to rack it out in one click.`;
  if (colo > 0)
    return `${colo.toLocaleString('en-US')} chips sit in colocation for ${money(colo * TUNING.colocationPerChipWeek)} a week. Our own halls are cheaper: build a campus or add halls.`;
  return 'Every owned chip has a home. Cold sites cool for less; cheap power keeps the bill down.';
}

/** Our own fab: requirements, construction and a summary of its lines. */
function FabCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const setWorldView = useStore((s) => s.setWorldView);
  const fab = game.fab;
  const r = content.fab;
  if (!fab) {
    const err = fabError(game, content);
    return (
      <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
        <h3>Our own fab</h3>
        <div className="small muted">
          Make our chip designs ourselves: lines of lithography, etch, test and packaging. Cheaper chips, surplus to sell, and the road to
          Full Stack. Needs Series D, Power level {r.requiresPowerLevel}, Environmental level {r.requiresEnvironmentalLevel} and{' '}
          {r.requiresHardwareEng} seated hardware engineers.
        </div>
        {err && (
          <div className="small" style={{ color: 'var(--bad)' }}>
            {err}
          </div>
        )}
        <button className="btn primary" disabled={!!err || game.cash < r.buildCost} onClick={() => send({ type: 'buildFab' })}>
          Build the fab ({money(r.buildCost)}, {r.buildWeeks} wk)
        </button>
      </div>
    );
  }
  const chips = fab.lines.reduce((n, l) => n + (l.lastWeek?.chips ?? 0), 0);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
      <div className="row between">
        <h3>Our fab</h3>
        <button className="btn" onClick={() => setWorldView('fab')}>
          Open
        </button>
      </div>
      {fab.status === 'building' ? (
        <>
          <div className="small">Under construction: {fab.weeksLeft} wk left</div>
          <Bar value={1 - fab.weeksLeft / fab.totalWeeks} color={LAYER.silicon} />
        </>
      ) : (
        <div className="grid2">
          <Stat k="Lines" v={`${fab.lines.length} / ${r.bays} bays`} />
          <Stat k="Chips last week" v={chips.toLocaleString('en-US')} c={LAYER.silicon} />
          <Stat k="Fleet made by us" v={pct(fabChipShare(game))} />
          <Stat k="Sales last week" v={money(game.lastWeek?.fabSales ?? 0)} c={LAYER.products} />
        </div>
      )}
    </div>
  );
}
