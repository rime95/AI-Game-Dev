import { content } from '@stm/content';
import { allChips, dateForWeek, totalChips, totalUsers, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, dateLabel, money } from '../format';
import { LAYER } from '../ui/layers';

/** The garage memorial on the HQ campus: a nostalgia card comparing then and now. */
export function MemorialCard({ game }: { game: GameState }) {
  const open = useStore((s) => s.memorialOpen);
  const close = useStore((s) => s.setMemorialOpen);
  if (!open) return null;
  const first = game.models[0];
  const people = Object.values(game.staff).reduce((n, c) => n + c, 0);
  const chips = allChips(game, content).reduce((n, c) => n + totalChips(game, c.id), 0);
  return (
    <div className="room-card card memorial" style={{ ['--c' as string]: LAYER.gold }}>
      <div className="row between">
        <h3>The garage · where it began</h3>
        <button className="btn" aria-label="Close" onClick={() => close(false)}>
          ×
        </button>
      </div>
      <div className="small">
        {game.companyName} started on {dateLabel(dateForWeek(0))} in a garage: three people, a box fan and {money(8_000_000)} of seed money.
      </div>
      {first && (
        <div className="small">
          Our first model, <strong>{first.name}</strong>, shipped in week {first.releasedWeek}.
        </div>
      )}
      <div className="grid2">
        <div className="stat">
          <div className="k">Then</div>
          <div className="v">3 people · 0 chips</div>
        </div>
        <div className="stat">
          <div className="k">Now</div>
          <div className="v">
            {big(people)} people · {big(chips)} chips
          </div>
        </div>
      </div>
      <div className="small muted">{big(totalUsers(game))} people use what we built. From sand to mind.</div>
    </div>
  );
}
