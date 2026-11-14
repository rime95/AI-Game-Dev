import { content } from '@stm/content';
import { bestScore, fundingCheck, liveModel, marketSize, totalUsers, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat, useSubTab } from './Panel';
import { GoalsCard } from './GoalsCard';
import { weekTotals } from '../ui/TopBar';

export function OverviewPanel({ game }: { game: GameState }) {
  const lw = game.lastWeek;
  const { income, costs } = weekTotals(lw);
  const live = liveModel(game);
  const sub = useSubTab('overview');

  return (
    <>
      <Advisor who="chief" color={LAYER.trust}>
        {hint(game)}
      </Advisor>

      {sub === 'summary' && (
        <>
          <div className="card">
            <h3>Last week</h3>
            {lw ? (
              <>
                <div className="grid3">
                  <Stat k="Income" v={money(income)} c={LAYER.products} />
                  <Stat k="Costs" v={money(costs)} />
                  <Stat k="Net" v={money(income - costs)} c={income - costs >= 0 ? 'var(--good)' : 'var(--bad)'} />
                </div>
                <Bar value={income / Math.max(1, income, costs)} color={income >= costs ? 'var(--good)' : 'var(--bad)'} />
                <div className="small muted">Hover Cash in the top bar for the full breakdown.</div>
              </>
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
          <div className="small muted">
            Seed {game.seed} · {content.rivals.length} rival labs in the race · save, load and settings are in the menu (Esc).
          </div>
        </>
      )}

      {sub === 'goals' && <GoalsCard game={game} />}
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
              <span key={c.label} className="chip" style={{ ['--c' as string]: c.ok ? LAYER.env : 'var(--bad)' }}>
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
  if (fundingCheck(game, content).canRaise) return 'Investors are calling! We qualify for the next funding round. See Funding below.';
  if (!game.fleet.length) return 'Welcome to the garage! First we need chips to train on. Rent some Kite K1s in Compute: 64 is plenty for a first model.';
  if (game.training) {
    const t = game.training;
    const servingNote =
      game.liveModelId && game.lastWeek && game.lastWeek.servingCapacityTokens < game.lastWeek.demandTokens
        ? ' Careful: training is using the chips we need to answer users.'
        : '';
    return `${t.spec.name} is training: ${pct(t.flopsDone / t.flopsTotal)} done, expected smarts ${t.projectedScore.toFixed(1)}. Speed the clock up while we wait.${servingNote}`;
  }
  if (!game.models.length) return 'Chips are ready. Head to Models and pick a Quick model: it’s the safe first step.';
  const lw = game.lastWeek;
  if (lw && lw.demandTokens > lw.servingCapacityTokens)
    return 'More people want our model than we can answer, and they’re leaving. Add chips, or train a smaller model that’s cheaper to run.';
  if (lw && lw.revenue < lw.salaries + lw.rent + lw.power)
    return 'We are spending more than we earn. Raise prices, win users with a smarter model, or return rented chips we don’t use.';
  return 'A good week. Check Rivals for the next lab to beat, then plan a bigger training run.';
}
