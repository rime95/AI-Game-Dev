import { useEffect } from 'react';
import { dateForWeek, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { clockHold, TICK_MS } from '../time';
import { dateLabel } from '../format';
import type { Speed } from '../saves';

/** Why the clock is held, read from the store. */
function useHold(): string | null {
  return useStore((s) =>
    clockHold({
      game: s.game,
      pauseOpen: s.pauseOpen,
      building: !!s.build,
      milestoneOpen: !!s.milestone && s.settings.pauseOnMilestones,
      revealOpen: !!s.reveal,
      memorialOpen: s.memorialOpen,
    }),
  );
}

/**
 * The game clock: at speed > 0 a week passes every TICK_MS, waiting for the worker between weeks.
 * Anything that needs the player's attention holds it; it resumes at the same speed once cleared.
 * Space toggles pause, Shift+Space (or Enter) steps one week.
 */
export function useClock() {
  const speed = useStore((s) => s.speed);
  const hold = useHold();
  const week = useStore((s) => s.game?.week);

  useEffect(() => {
    if (!speed || hold) return;
    const t = setTimeout(() => useStore.getState().step(), TICK_MS[speed]);
    return () => clearTimeout(t);
  }, [speed, hold, week]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (e.code !== 'Space') return;
      e.preventDefault();
      const st = useStore.getState();
      if (st.screen !== 'game' || st.pauseOpen) return;
      if (e.shiftKey) {
        if (!clockHold({ game: st.game, pauseOpen: false, building: false, milestoneOpen: false, revealOpen: false, memorialOpen: false })) st.step();
      } else st.setSpeed(st.speed ? 0 : lastSpeed(st.speed));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

let remembered: Exclude<Speed, 0> = 1;
function lastSpeed(current: Speed): Speed {
  if (current) remembered = current;
  return remembered;
}

const SPEEDS: { v: Speed; label: string; glyph: string }[] = [
  { v: 0, label: 'Pause', glyph: 'M7 5h3v14H7zM14 5h3v14h-3z' },
  { v: 1, label: 'Play 1×', glyph: 'M8 5l10 7-10 7z' },
  { v: 2, label: 'Fast 2×', glyph: 'M4 5l8 7-8 7zM12 5l8 7-8 7z' },
  { v: 4, label: 'Fastest 4×', glyph: 'M2 5l6.5 7L2 19zM8.5 5l6.5 7-6.5 7zM15 5l6.5 7-6.5 7z' },
];

export function TimeControls({ game }: { game: GameState }) {
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const step = useStore((s) => s.step);
  const inFlight = useStore((s) => s.inFlight);
  const hold = useHold();
  const running = speed > 0 && !hold;

  return (
    <div className="clock">
      <div className="clock-date" title={hold && speed ? `Held: ${hold}` : undefined}>
        <span className="k">
          Week {game.week}
          {speed > 0 && hold ? <span className="held"> · held</span> : null}
        </span>
        <span className="v">{dateLabel(dateForWeek(game.week))}</span>
        <span className={`clock-progress${running ? ` run s${speed}` : ''}`} key={`${game.week}-${speed}-${running}`} aria-hidden="true" />
      </div>
      <div className="speeds" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s.v}
            aria-pressed={speed === s.v}
            title={`${s.label}${s.v === 0 ? ' (Space)' : ''}`}
            aria-label={s.label}
            onClick={() => {
              if (s.v) lastSpeed(s.v);
              setSpeed(s.v);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={s.glyph} />
            </svg>
          </button>
        ))}
      </div>
      <button
        className="btn primary step"
        disabled={!!game.pendingEvent || game.status !== 'playing' || inFlight}
        title={game.pendingEvent ? 'Decide on the open event first' : 'Advance one week (Shift+Space)'}
        onClick={step}
      >
        Next week
      </button>
    </div>
  );
}
