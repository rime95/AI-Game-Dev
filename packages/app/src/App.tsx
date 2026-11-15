import { useEffect, type CSSProperties } from 'react';
import { useStore } from './store';
import { MainMenu } from './ui/MainMenu';
import { Shell2 } from './v2/Shell2';

export function App() {
  const screen = useStore((s) => s.screen);
  const g2 = useStore((s) => s.v2);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);
  const settings = useStore((s) => s.settings);

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
  const style = { zoom: settings.uiScale / 100, ['--panel-w' as string]: `${settings.panelWidth}px` } as CSSProperties;

  return (
    <div className="app-root" style={style}>
      {screen === 'menu' || !g2 ? <MainMenu /> : <Shell2 g={g2} />}
      {toasts}
    </div>
  );
}
