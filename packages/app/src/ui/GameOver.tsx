import { bestScore, totalUsers, VICTORY_TEXT, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';

/** End screens: victory (can keep playing), bankruptcy and AGI catastrophe. */
export function GameOver({ game }: { game: GameState }) {
  const quitToMenu = useStore((s) => s.quitToMenu);
  const send = useStore((s) => s.send);
  const won = game.status === 'won' && game.victory;
  const text = won
    ? VICTORY_TEXT[game.victory!.kind]
    : game.status === 'catastrophe'
      ? { title: 'Catastrophe', body: 'The AGI Program ended in disaster. Safety was the one thing we could not skip.' }
      : { title: 'The company ran out of money', body: 'Out of cash for too long. The lights go off in the data hall.' };

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="go-title">
        <div className={`media ${won ? 'victory' : 'incident'}`}>
          <div className="tag">{won ? 'Victory' : 'Game over'}</div>
          <h2 id="go-title">{text.title}</h2>
        </div>
        <div className="body">
          <div>{text.body}</div>
          <div className="grid3">
            <div className="stat">
              <div className="k">Weeks</div>
              <div className="v">{game.week}</div>
            </div>
            <div className="stat">
              <div className="k">Users</div>
              <div className="v">{big(totalUsers(game))}</div>
            </div>
            <div className="stat">
              <div className="k">Best score</div>
              <div className="v">{bestScore(game).toFixed(1)}</div>
            </div>
            <div className="stat">
              <div className="k">Cash</div>
              <div className="v">{money(game.cash)}</div>
            </div>
            <div className="stat">
              <div className="k">Founders own</div>
              <div className="v">{pct(game.ownership)}</div>
            </div>
            <div className="stat">
              <div className="k">Eval suite</div>
              <div className="v">v{game.suite.version}</div>
            </div>
          </div>
          {won && (
            <button className="btn primary big" onClick={() => send({ type: 'continuePlaying' })}>
              Keep playing
            </button>
          )}
          <button className={`btn big${won ? '' : ' primary'}`} onClick={() => void quitToMenu()}>
            Start a new company
          </button>
        </div>
      </div>
    </div>
  );
}
