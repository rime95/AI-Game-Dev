import { content } from '@stm/content';
import { bestScore, fundingCheck, liveModel, marketSize, totalUsers, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';
import { GoalsCard } from './GoalsCard';

export function OverviewPanel({ game }: { game: GameState }) {
  const lw = game.lastWeek;
  const costs = lw ? lw.salaries + lw.rent + lw.power + lw.licenseUpkeep + (lw.facilities ?? 0) : 0;
  const income = lw ? lw.revenue + lw.licenseRevenue : 0;
  const live = liveModel(game);
  const setPauseOpen = useStore((s) => s.setPauseOpen);

  return (
    <>
      <Advisor who="Chief of staff" color={LAYER.trust}>
        {hint(game)}
      </Advisor>

      <div className="card">
        <h3>Last week</h3>
        {lw ? (
          <div className="grid2">
            <Stat k="API revenue" v={money(lw.apiRevenue)} c={LAYER.products} />
            <Stat k="App subscriptions" v={money(lw.consumerRevenue)} c={LAYER.products} />
            <Stat k="Enterprise" v={money(lw.enterpriseRevenue)} c={LAYER.products} />
            {lw.slaPenalty > 0 && <Stat k="SLA credits" v={money(-lw.slaPenalty)} c="var(--bad)" />}
            <Stat k="Costs" v={money(costs)} />
            <Stat k="Salaries" v={money(lw.salaries)} />
            <Stat k="Chip rent" v={money(lw.rent)} />
            <Stat k="Power" v={money(lw.power)} />
            <Stat k="Office & rooms" v={money(lw.facilities ?? 0)} c={LAYER.gold} />
            <Stat k="License upkeep" v={money(lw.licenseUpkeep)} c={LAYER.trust} />
            {lw.licenseRevenue > 0 && <Stat k="Heat sales" v={money(lw.licenseRevenue)} c={LAYER.env} />}
            <Stat k="Net" v={money(income - costs)} c={income - costs >= 0 ? 'var(--good)' : 'var(--bad)'} />
          </div>
        ) : (
          <div className="muted">Advance a week to see results.</div>
        )}
      </div>

      <div className="card">
        <h3>Position</h3>
        <div className="grid2">
          <Stat k="Live model" v={live ? `${live.name} · ${live.score.toFixed(1)}` : 'None yet'} c={LAYER.models} />
          <Stat k="Best score" v={bestScore(game).toFixed(1)} />
          <Stat k="Users (all products)" v={big(totalUsers(game))} c={LAYER.products} />
          <Stat k="Developer API share" v={pct(game.users / marketSize(game.week))} />
        </div>
        <Bar value={game.users / marketSize(game.week)} color={LAYER.products} />
      </div>

      <FundingCard game={game} />

      <GoalsCard game={game} />

      <div className="card">
        <h3>Game</h3>
        <div className="small muted">
          Seed {game.seed}. {content.rivals.length} rival labs started the race. Save, load and settings are in the menu.
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPauseOpen(true)}>
            Open menu (Esc)
          </button>
        </div>
      </div>
    </>
  );
}

function FundingCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const f = fundingCheck(game, content);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.gold }}>
      <div className="row between">
        <h3>Funding</h3>
        <span className="small muted">Founders own {pct(game.ownership)}</span>
      </div>
      {f.round ? (
        <>
          <div className="small">
            <strong>
              {f.round.name}: {money(f.round.cash)} for {pct(f.equitySold)} of the company.
            </strong>{' '}
            {f.round.blurb}
          </div>
          <div className="chips">
            {f.checks.map((c) => (
              <span key={c.label} className="chip" style={{ ['--c' as string]: c.ok ? LAYER.env : '#c2413b' }}>
                {c.ok ? '✓' : '✗'} {c.label}
              </span>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!f.canRaise} onClick={() => send({ type: 'raiseFunding' })}>
              Raise {f.round.name}
            </button>
          </div>
        </>
      ) : (
        <div className="small muted">We're public. No more private rounds.</div>
      )}
    </div>
  );
}

function hint(game: GameState): string {
  if (fundingCheck(game, content).canRaise) return 'Investors are calling. We qualify for the next funding round — see Funding below.';
  if (!game.fleet.length) return 'We have no compute. Rent some Kite K1 chips in Compute — 64 is plenty for a first model.';
  if (game.training) {
    const t = game.training;
    const servingNote =
      game.liveModelId && game.lastWeek && game.lastWeek.servingCapacityTokens < game.lastWeek.demandTokens
        ? ' Careful: training is using the chips we need for serving.'
        : '';
    return `${t.spec.name} is training: ${pct(t.flopsDone / t.flopsTotal)} done. Projected score ${t.projectedScore.toFixed(1)}.${servingNote}`;
  }
  if (!game.models.length) return 'Chips are ready. Design a first model in Models — a small dense model is the safe start.';
  const lw = game.lastWeek;
  if (lw && lw.demandTokens > lw.servingCapacityTokens)
    return 'Demand is outrunning serving capacity. Users are churning — add chips or pick a cheaper-to-serve model.';
  if (lw && lw.revenue < lw.salaries + lw.rent + lw.power)
    return 'We are burning cash. Either raise the API price, grow users with a better model, or trim idle rented chips.';
  return 'Healthy week. Check Rivals for the next lab to beat, then plan the next, bigger training run.';
}
