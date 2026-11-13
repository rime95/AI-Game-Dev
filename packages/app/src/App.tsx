import { useEffect } from 'react';
import { useStore } from './store';
import { TopBar } from './ui/TopBar';
import { NavRail } from './ui/NavRail';
import { Feed } from './ui/Feed';
import { DecisionModal } from './ui/DecisionModal';
import { GameOver } from './ui/GameOver';
import { Panel } from './panels/Panel';
import { Diorama } from './world/Diorama';

export function App() {
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!game) return null;

  return (
    <div className="shell">
      <TopBar game={game} />
      <NavRail />
      <div className="world">
        <Diorama game={game} />
      </div>
      <Panel game={game} />
      <Feed game={game} />
      {game.pendingEvent && <DecisionModal event={game.pendingEvent} />}
      {game.status !== 'playing' && <GameOver game={game} />}
      {error && (
        <button className="toast" onClick={clearError}>
          {error}
        </button>
      )}
    </div>
  );
}
