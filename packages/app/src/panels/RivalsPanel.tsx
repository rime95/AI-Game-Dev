import { content } from '@stm/content';
import { bestScore, rivalUsers, TUNING, type GameState } from '@stm/sim';
import { big } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar } from './Panel';

export function RivalsPanel({ game }: { game: GameState }) {
  const mine = bestScore(game);
  const users = rivalUsers(game, content);
  const rows = [
    ...game.rivals.map((r) => {
      const def = content.rivals.find((d) => d.id === r.id)!;
      return {
        id: r.id,
        name: def.name,
        model: `${def.modelPrefix} ${r.version}`,
        score: r.score,
        price: def.apiPrice,
        users: users[r.id] ?? 0,
        you: false,
        note: def.personality,
      };
    }),
    { id: 'you', name: game.companyName, model: game.models.at(-1)?.name ?? '—', score: mine, price: game.apiPrice, users: game.users, you: true, note: '' },
  ].sort((a, b) => b.score - a.score);
  const top = Math.max(...rows.map((r) => r.score));
  const yourRank = rows.findIndex((r) => r.you);
  const next = yourRank > 0 ? rows[yourRank - 1] : undefined;

  return (
    <>
      <Advisor who="Research lead" color={LAYER.models}>
        {next
          ? `Next to pass: ${next.name} at ${next.score.toFixed(1)} — ${(next.score - mine).toFixed(1)} points to go.`
          : 'We lead the frontier eval. Expect everyone to come after us.'}
      </Advisor>
      <div className="card">
        <div className="row between">
          <h3>Frontier eval · Suite v{game.suite.version}</h3>
          <span className="small muted">since week {game.suite.startedWeek}</span>
        </div>
        <div className="small muted">
          Top score {top.toFixed(1)} / {TUNING.suiteSaturationScore}. When any model reaches {TUNING.suiteSaturationScore}, the suite
          retires and a harder one re-scores every model. Capability and license tiers don't change — only the numbers do.
        </div>
        <Bar value={top / TUNING.suiteSaturationScore} color={LAYER.models} />
      </div>
      <div className="card">
        <h3>Leaderboard</h3>
        <table className="t">
          <thead>
            <tr>
              <th>#</th>
              <th>Lab</th>
              <th>Model</th>
              <th>Score</th>
              <th>$/1M</th>
              <th>Users</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.you ? 'you' : undefined} title={r.note}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.model}</td>
                <td>{r.score.toFixed(1)}</td>
                <td>{r.price}</td>
                <td>{big(r.users)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {content.rivals.map((r) => (
        <div className="card" key={r.id}>
          <h3>{r.name}</h3>
          <div className="small muted">{r.personality}</div>
        </div>
      ))}
    </>
  );
}
