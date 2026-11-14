import { dateForWeek, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { dateLabel } from '../format';
import { LAYER } from '../ui/layers';

/** Transition moments (world-and-facilities §2.3): a news card over a short construction timelapse. */
export function MilestoneCard({ game }: { game: GameState }) {
  const m = useStore((s) => s.milestone);
  const close = useStore((s) => s.closeMilestone);
  if (!m) return null;
  const color = m.kind === 'site' ? LAYER.compute : m.kind === 'fab' ? LAYER.silicon : m.kind === 'ipo' ? LAYER.products : LAYER.gold;
  return (
    <div className="milestone" role="dialog" aria-label={m.title}>
      <div className="milestone-card" style={{ ['--c' as string]: color }}>
        <div className="ms-mast">
          <span>THE {game.companyName.toUpperCase()} GAZETTE</span>
          <span>{dateLabel(dateForWeek(m.week))}</span>
        </div>
        <div className="timelapse" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s`, height: `${30 + ((i * 37) % 60)}%` }} />
          ))}
          <i className="crane" />
        </div>
        <h2>{m.title}</h2>
        <p>{m.body}</p>
        <button className="btn primary" onClick={close}>
          Back to work
        </button>
      </div>
    </div>
  );
}
