import { useEffect, useState } from 'react';
import type { GameState, LogEntry } from '@stm/sim';
import { useStore } from '../store';
import { turnLabel } from './TimeControls';

type Filter = 'all' | 'good' | 'bad' | 'rival';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'good', label: 'Wins' },
  { id: 'bad', label: 'Problems' },
  { id: 'rival', label: 'Rivals' },
];

/** The activity log as a slide-over drawer (top bar bell). */
export function ActivityDrawer({ game }: { game: GameState }) {
  const open = useStore((s) => s.activityOpen);
  const setOpen = useStore((s) => s.setActivityOpen);
  const [filter, setFilter] = useState<Filter>('all');
  if (!open) return null;
  const entries = game.log.filter((e) => filter === 'all' || e.kind === filter).slice().reverse();
  let lastWeek = -1;
  return (
    <div className="tray-panel activity" role="dialog" aria-label="Activity">
      <div className="tray-head">
        <h3>Activity</h3>
        <button className="icon-btn sm" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="seg sm">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="log" role="log">
        {entries.length === 0 && <div className="muted small pad">Nothing here yet.</div>}
        {entries.map((e, i) => {
          const head = e.week !== lastWeek;
          lastWeek = e.week;
          return (
            <div key={`${e.week}-${i}`}>
              {head && <div className="log-week">{turnLabel(game, e.week)}</div>}
              <div className={`e ${e.kind}`}>{e.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The newest entries of the week just played, flashed under the top bar for a few seconds. */
export function Ticker({ game }: { game: GameState }) {
  const activityOpen = useStore((s) => s.activityOpen);
  const [shown, setShown] = useState<LogEntry[]>([]);
  const week = game.week;
  useEffect(() => {
    const fresh = game.log.filter((e) => e.week === week - 1 || e.week === week).filter((e) => e.kind !== 'info');
    setShown(fresh.slice(-2));
    const t = setTimeout(() => setShown([]), 4500);
    return () => clearTimeout(t);
    // Only when a new week begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);
  if (activityOpen || !shown.length) return null;
  return (
    <div className="ticker" aria-live="polite">
      {shown.map((e, i) => (
        <div key={i} className={`tick ${e.kind}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}
