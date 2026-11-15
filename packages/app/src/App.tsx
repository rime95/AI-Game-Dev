import { useEffect, type CSSProperties } from 'react';
import { useStore } from './store';
import { TopBar } from './ui/TopBar';
import { NavRail } from './ui/NavRail';
import { ActivityDrawer, Ticker } from './ui/Feed';
import { DecisionModal } from './ui/DecisionModal';
import { GameOver } from './ui/GameOver';
import { MainMenu } from './ui/MainMenu';
import { PauseMenu } from './ui/PauseMenu';
import { useClock } from './ui/TimeControls';
import { HOTKEYS, navOrder } from './ui/layers';
import { Panel } from './panels/Panel';
import { World } from './world/World';
import { AlertsTray } from './world/Nudges';
import { Shell2 } from './v2/Shell2';

export function App() {
  const screen = useStore((s) => s.screen);
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const pauseOpen = useStore((s) => s.pauseOpen);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);
  const setPauseOpen = useStore((s) => s.setPauseOpen);
  const settings = useStore((s) => s.settings);
  const g2 = useStore((s) => s.v2);

  useClock();

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

  // Esc closes the innermost thing first, then opens the pause menu. Number keys jump between sections.
  useEffect(() => {
    if (screen !== 'game' || useStore.getState().v2) return;
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const el = e.target as HTMLElement;
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
      if (e.key === 'Escape') {
        if (st.pauseOpen) return setPauseOpen(false);
        if (st.build) return st.cancelBuild();
        if (st.activityOpen) return st.setActivityOpen(false);
        if (st.alertsOpen) return st.setAlertsOpen(false);
        if (st.selectedRoom) return st.selectRoom(null);
        return setPauseOpen(true);
      }
      if (typing || st.pauseOpen || e.ctrlKey || e.altKey || e.metaKey || st.game?.pendingEvent) return;
      const i = HOTKEYS.indexOf(e.key);
      const order = navOrder(st.game?.era);
      if (i >= 0 && order[i]) st.setTab(order[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, setPauseOpen]);

  const toasts = (
    <div className="toasts">
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
    </div>
  );

  // CSS zoom scales the whole UI (Settings › Interface size).
  const style = {
    zoom: settings.uiScale / 100,
    ['--panel-w' as string]: `${settings.panelWidth}px`,
  } as CSSProperties;

  if (screen === 'menu') {
    return (
      <div className="app-root" style={style}>
        <MainMenu />
        {toasts}
      </div>
    );
  }
  if (g2)
    return (
      <div className="app-root" style={style}>
        <Shell2 g={g2} />
        {toasts}
      </div>
    );
  if (!game) return null;

  return (
    <div className="app-root" style={style}>
      <div className="shell">
        <TopBar game={game} />
        <NavRail game={game} />
        <div className="world">
          <World game={game} />
          <Ticker game={game} />
          <AlertsTray game={game} />
          <ActivityDrawer game={game} />
        </div>
        <Panel game={game} />
        {game.pendingEvent && !pauseOpen && <DecisionModal event={game.pendingEvent} />}
        {game.status !== 'playing' && !pauseOpen && <GameOver game={game} />}
        {pauseOpen && <PauseMenu game={game} />}
        {toasts}
      </div>
    </div>
  );
}
