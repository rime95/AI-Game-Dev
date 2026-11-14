import { dateForWeek, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { dateLabel } from '../format';
import { LAYER } from '../ui/layers';

/** Transition moments (world-and-facilities §2.3): a news card over a short construction timelapse. */
export function MilestoneCard({ game }: { game: GameState }) {
  const m = useStore((s) => s.milestone);
  const close = useStore((s) => s.closeMilestone);
  if (!m) return null;
  const color =
    m.kind === 'site'
      ? LAYER.compute
      : m.kind === 'fab'
        ? LAYER.silicon
        : m.kind === 'ipo' || m.kind === 'funding'
          ? LAYER.products
          : m.kind === 'model'
            ? LAYER.models
            : LAYER.gold;
  const built = m.kind === 'hq' || m.kind === 'site' || m.kind === 'fab';
  return (
    <div className="milestone" role="dialog" aria-label={m.title}>
      <div className="milestone-card" style={{ ['--c' as string]: color }}>
        <div className="ms-mast">
          <span>THE {game.companyName.toUpperCase()} GAZETTE</span>
          <span>{dateLabel(dateForWeek(m.week))}</span>
        </div>
        {built ? (
          <div className="timelapse" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.12}s`, height: `${30 + ((i * 37) % 60)}%` }} />
            ))}
            <i className="crane" />
          </div>
        ) : (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 8) * 0.09}s`, ['--h' as string]: `${(i * 47) % 360}` }} />
            ))}
            <strong>{m.kind === 'model' ? 'LAUNCH' : 'FUNDED'}</strong>
          </div>
        )}
        <h2>{m.title}</h2>
        <p>{m.body}</p>
        <button className="btn primary" onClick={close}>
          {m.kind === 'model' ? 'Let’s go' : 'Back to work'}
        </button>
      </div>
    </div>
  );
}
