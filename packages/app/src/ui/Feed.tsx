import { useEffect } from 'react';
import type { GameState } from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';

export function Feed({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const blocked = !!game.pendingEvent || game.status !== 'playing';
  const lw = game.lastWeek;
  const net = lw ? lw.revenue + lw.licenseRevenue - lw.salaries - lw.rent - lw.power - lw.licenseUpkeep : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code === 'Space' && !blocked && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) {
        e.preventDefault();
        send({ type: 'advanceWeek' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, send]);

  const entries = game.log.slice(-40).reverse();

  return (
    <section className="feed" aria-label="Event feed">
      <div className="log" role="log">
        {entries.map((e, i) => (
          <div key={`${e.week}-${i}`} className={`e ${e.kind}`}>
            <span className="w">Wk {e.week}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
      <div className="advance">
        <div className="small muted">
          Last week net: <strong style={{ color: net >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(net)}</strong>
        </div>
        <button className="btn primary big" disabled={blocked} onClick={() => send({ type: 'advanceWeek' })}>
          Advance week ▶
        </button>
        <div className="small muted">{game.pendingEvent ? 'Decide on the open event first.' : 'Shortcut: Space'}</div>
      </div>
    </section>
  );
}
