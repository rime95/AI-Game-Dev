import { bestScore, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big } from '../format';

export function GameOver({ game }: { game: GameState }) {
  const newGame = useStore((s) => s.newGame);
  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="go-title">
        <div className="media incident">
          <div className="tag">Game over</div>
          <h2 id="go-title">The company ran out of money</h2>
        </div>
        <div className="body">
          <div>
            You lasted {game.week} weeks, reached {big(game.users)} users and a best eval score of {bestScore(game).toFixed(1)}.
          </div>
          <button className="btn primary big" onClick={() => newGame()}>
            Start a new company
          </button>
        </div>
      </div>
    </div>
  );
}
