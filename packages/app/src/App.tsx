import { useEffect } from 'react';
import { useStore } from './store';
import { TopBar } from './ui/TopBar';
import { NavRail } from './ui/NavRail';
import { Feed } from './ui/Feed';
import { DecisionModal } from './ui/DecisionModal';
import { GameOver } from './ui/GameOver';
import { MainMenu } from './ui/MainMenu';
import { PauseMenu } from './ui/PauseMenu';
import { Panel } from './panels/Panel';
import { World } from './world/World';

export function App() {
  const screen = useStore((s) => s.screen);
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const pauseOpen = useStore((s) => s.pauseOpen);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);
  const setPauseOpen = useStore((s) => s.setPauseOpen);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [error, clearError]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 2500);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  // Esc opens and closes the pause menu during play.
  useEffect(() => {
    if (screen !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useStore.getState();
      // Esc leaves build mode or closes a room card before it opens the menu.
      if (!st.pauseOpen && st.build) return st.cancelBuild();
      if (!st.pauseOpen && st.selectedRoom) return st.selectRoom(null);
      setPauseOpen(!st.pauseOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, setPauseOpen]);

  const toasts = (
    <>
      {error && (
        <button className="toast" onClick={clearError}>
          {error}
        </button>
      )}
      {notice && !error && (
        <button className="toast good" onClick={clearNotice}>
          {notice}
        </button>
      )}
    </>
  );

  if (screen === 'menu') {
    return (
      <>
        <MainMenu />
        {toasts}
      </>
    );
  }
  if (!game) return null;

  return (
    <div className="shell">
      <TopBar game={game} />
      <NavRail />
      <div className="world">
        <World game={game} />
      </div>
      <Panel game={game} />
      <Feed game={game} />
      {game.pendingEvent && !pauseOpen && <DecisionModal event={game.pendingEvent} />}
      {game.status !== 'playing' && !pauseOpen && <GameOver game={game} />}
      {pauseOpen && <PauseMenu game={game} />}
      {toasts}
    </div>
  );
}
