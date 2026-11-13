import { content } from '@stm/content';
import { bestScore, liveModel, marketSize, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

export function OverviewPanel({ game }: { game: GameState }) {
  const lw = game.lastWeek;
  const costs = lw ? lw.salaries + lw.rent + lw.power : 0;
  const live = liveModel(game);
  const newGame = useStore((s) => s.newGame);

  return (
    <>
      <Advisor who="Chief of staff" color={LAYER.trust}>
        {hint(game)}
      </Advisor>

      <div className="card">
        <h3>Last week</h3>
        {lw ? (
          <div className="grid2">
            <Stat k="Revenue" v={money(lw.revenue)} c={LAYER.products} />
            <Stat k="Costs" v={money(costs)} />
            <Stat k="Salaries" v={money(lw.salaries)} />
            <Stat k="Chip rent" v={money(lw.rent)} />
            <Stat k="Power" v={money(lw.power)} />
            <Stat k="Net" v={money(lw.revenue - costs)} c={lw.revenue - costs >= 0 ? 'var(--good)' : 'var(--bad)'} />
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
          <Stat k="Users" v={big(game.users)} c={LAYER.products} />
          <Stat k="Market" v={big(marketSize(game.week))} />
        </div>
        <div className="small muted">Market share {pct(game.users / marketSize(game.week))}</div>
        <Bar value={game.users / marketSize(game.week)} color={LAYER.products} />
      </div>

      <div className="card">
        <h3>Game</h3>
        <div className="small muted">
          Seed {game.seed}. Progress autosaves in this browser. {content.rivals.length} rival labs are racing you.
        </div>
        <div className="row">
          <button className="btn" onClick={() => confirm('Abandon this company and start over?') && newGame()}>
            New game
          </button>
        </div>
      </div>
    </>
  );
}

function hint(game: GameState): string {
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
