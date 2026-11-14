import { content } from '@stm/content';
import { fabChipShare, fabError, locationDef, serverLayout, siteError, sitesUpkeep, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat, useDetails, useSubTab } from './Panel';

/** A location's selling points in a few words. */
function placeLine(powerPrice: number, climate: string, water: string): string {
  const price = powerPrice < 45 ? 'Cheap power' : powerPrice < 75 ? 'Fair power prices' : 'Pricey power';
  const cool = climate === 'cold' ? 'cold climate, easy to cool' : climate === 'hot' ? 'hot climate, costly to cool' : 'mild climate';
  const wet = water === 'scarce' ? ' · little water' : '';
  return `${price} · ${cool}${wet}`;
}

/** Sites track (world-and-facilities §2.2): our data center campuses and where we could build next. */
export function SitesPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const openSite = useStore((s) => s.openSite);
  const layout = serverLayout(game, content);
  const siteRooms = layout.rooms.filter((r) => r.siteId);
  const siteChips = siteRooms.reduce((n, r) => n + r.racks.reduce((m, k) => m + k.count, 0), 0);
  const rules = content.sites;
  const sub = useSubTab('sites');
  const details = useDetails();

  return (
    <>
      <Advisor who="infra" color={LAYER.compute}>
        {hint(
          game,
          layout.colo,
          siteRooms.some((r) => r.throttle < 1),
        )}
      </Advisor>

      {sub === 'campuses' && (<>
      <div className="card">
        <h3>Where our chips live</h3>
        <div className="grid2">
          <Stat k="Campuses" v={`${game.sites.length} · ${game.sites.reduce((n, s) => n + s.halls.length, 0)} halls`} />
          <Stat k="Chips in our halls" v={siteChips.toLocaleString('en-US')} c={LAYER.compute} />
          <Stat k="In rented rack space" v={`${layout.colo.toLocaleString('en-US')} · ${money(layout.colo * TUNING.colocationPerChipWeek)}/wk`} />
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
                <div className="small">Under construction: {site.weeksLeft} weeks left</div>
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
                        ? `building, ${hall.weeksLeft} weeks`
                        : hall.equipment.length
                          ? `${chips.toLocaleString('en-US')} chips${details ? ` · ${((room?.itKW ?? 0) / 1000).toFixed(2)} MW` : ''}${room && room.throttle < 1 ? ` · too hot, running at ${pct(room.throttle)}` : ''}`
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
                  Ops center: fewer breakdowns ({money(rules.opsCenter.cost)})
                </button>
              )}
            </div>
            {details ? (
            <div className="small muted">
              ${loc.powerPricePerMWh}/MWh · {rules.climates[loc.climate].label.toLowerCase()} (cooling ×
              {rules.climates[loc.climate].coolingMult}) ·{' '}
              {site.opsCenter
                ? `ops center: hardware failures ×${rules.opsCenter.failureMult}`
                : `no ops center: hardware failures ×${rules.unattendedFailureMult} for chips here`}
            </div>
            ) : (
            <div className="small muted">
              {placeLine(loc.powerPricePerMWh, loc.climate, loc.water)} ·{' '}
              {site.opsCenter ? 'ops center on site' : 'no ops center yet, so chips here break down more'}
            </div>
            )}
          </div>
        );
      })}
      {game.sites.length === 0 && <div className="empty">No campuses yet. See <strong>Build new</strong> for where we could go.</div>}
      </>)}

      {sub === 'build' && (
      <div className="card">
        <h3>Where we could build</h3>
        <div className="small muted">
          Campuses need Power license level {rules.requiresPowerLevel}. Each starts with {rules.startHalls} halls (up to {rules.maxHalls}). Dry
          places need Environmental levels. Every campus also lets bigger training runs spread over more chips without slowing down.
        </div>
        {content.sites.locations
          .filter((l) => !game.sites.some((s) => s.locationId === l.id))
          .map((l) => {
            const err = siteError(game, content, l.id);
            return (
              <div className="row between small" key={l.id}>
                <span title={err ?? l.blurb}>
                  <strong>{l.name}</strong> · {l.region} ·{' '}
                  {details ? `$${l.powerPricePerMWh}/MWh · ${l.climate} · ${l.water} water` : placeLine(l.powerPricePerMWh, l.climate, l.water)}
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
      )}
    </>
  );
}

/** Fab tab: our own fab. Lines are managed by clicking bays in the fab view. */
export function FabPanel({ game }: { game: GameState }) {
  return (
    <>
      <Advisor who="fab" color={LAYER.silicon}>
        {!game.fab
          ? 'A chip factory of our own makes our designs at cost, and we can sell what we don’t need.'
          : game.fab.status === 'building'
            ? `The factory is under construction: ${game.fab.weeksLeft} weeks to go.`
            : 'Click a bay in the factory to start a production line, upgrade it, or choose how many chips we keep.'}
      </Advisor>
      <FabCard game={game} />
    </>
  );
}

function hint(game: GameState, colo: number, throttled: boolean): string {
  const rules = content.sites;
  if (throttled) return 'A data hall is running too hot, so its chips slow down. Add coolers or switch to liquid cooling.';
  if (game.license.power.level < rules.requiresPowerLevel)
    return `Our own data centers need Power license level ${rules.requiresPowerLevel}. Until then, chips that don't fit at HQ live in rented rack space at ${money(TUNING.colocationPerChipWeek)} per chip each week.`;
  const empty = game.sites.flatMap((s) =>
    s.status === 'online' ? s.halls.filter((h) => h.status === 'online' && !h.equipment.length) : [],
  );
  if (empty.length)
    return `${empty.length} hall${empty.length > 1 ? 's are' : ' is'} empty. Open ${empty.length > 1 ? 'one' : 'it'} and use Auto-fill to rack it out in one click.`;
  if (colo > 0)
    return `${colo.toLocaleString('en-US')} chips sit in rented rack space for ${money(colo * TUNING.colocationPerChipWeek)} a week. Our own halls are cheaper: build a campus or add halls.`;
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
        <h3>Our own chip factory</h3>
        <div className="small muted">
          Make our chip designs ourselves. Cheaper chips, extra to sell, and a step towards owning the whole stack. Needs a Series D round,
          Power level {r.requiresPowerLevel}, Environmental level {r.requiresEnvironmentalLevel} and {r.requiresHardwareEng} hardware engineers
          with lab seats.
        </div>
        {err && (
          <div className="small" style={{ color: 'var(--bad)' }}>
            {err}
          </div>
        )}
        <button className="btn primary" disabled={!!err || game.cash < r.buildCost} onClick={() => send({ type: 'buildFab' })}>
          Build the factory ({money(r.buildCost)}, {r.buildWeeks} weeks)
        </button>
      </div>
    );
  }
  const chips = fab.lines.reduce((n, l) => n + (l.lastWeek?.chips ?? 0), 0);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
      <div className="row between">
        <h3>Our factory</h3>
        <button className="btn" onClick={() => setWorldView('fab')}>
          Open
        </button>
      </div>
      {fab.status === 'building' ? (
        <>
          <div className="small">Under construction: {fab.weeksLeft} weeks left</div>
          <Bar value={1 - fab.weeksLeft / fab.totalWeeks} color={LAYER.silicon} />
        </>
      ) : (
        <div className="grid2">
          <Stat k="Production lines" v={`${fab.lines.length} of ${r.bays}`} />
          <Stat k="Chips last week" v={chips.toLocaleString('en-US')} c={LAYER.silicon} />
          <Stat k="Our chips made here" v={pct(fabChipShare(game))} />
          <Stat k="Sales last week" v={money(game.lastWeek?.fabSales ?? 0)} c={LAYER.products} />
        </div>
      )}
    </div>
  );
}
