import { useState } from 'react';
import { content } from '@stm/content';
import { allChips, freeChips, goalProgress, previewAgi, TUNING, VICTORY_TEXT, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Bar } from './Panel';

/** The three ways to win, with live progress, plus the AGI Program controls. */
export function GoalsCard({ game }: { game: GameState }) {
  const goals = goalProgress(game, content);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.models }}>
      <div className="row between">
        <h3>Ways to win</h3>
        {game.victory && <span className="small" style={{ color: 'var(--good)', fontWeight: 700 }}>Won: {VICTORY_TEXT[game.victory.kind].title}</span>}
      </div>
      {goals.map((g) => (
        <div key={g.kind} className="field">
          <strong>{VICTORY_TEXT[g.kind].title}</strong>
          <div className="chips">
            {g.checks.map((c) => (
              <span key={c.label} className="chip" style={{ ['--c' as string]: c.ok ? LAYER.env : '#6f7079' }}>
                {c.ok ? '✓' : '○'} {c.label}
                {c.detail ? ` · ${c.detail}` : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
      <AgiControls game={game} />
    </div>
  );
}

function AgiControls({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const chips = allChips(game, content).filter((c) => freeChips(game, c.id) > 0);
  const [chipId, setChipId] = useState(chips[0]?.id ?? 'kite-k2');
  const [count, setCount] = useState<number>(TUNING.agiMinChips);
  const preview = previewAgi(game, content, chipId, count);

  if (game.agi) {
    return (
      <div className="field">
        <strong>AGI Program running · {game.agi.weeksLeft} wk left</strong>
        <Bar value={1 - game.agi.weeksLeft / game.agi.totalWeeks} color={LAYER.models} />
        <span className="small muted">
          Catastrophe risk at completion: {pct(preview.catastropheChance)} (raise Safety to level 5 to remove it).
        </span>
      </div>
    );
  }

  return (
    <div className="field">
      <strong>AGI Program</strong>
      <span className="small muted">
        The endgame: {money(TUNING.agiCost)}, {TUNING.agiWeeks} weeks and {big(TUNING.agiMinChips)}+ chips. Finishing it wins — if
        safety holds. Catastrophe risk now: <strong style={{ color: preview.catastropheChance > 0 ? 'var(--bad)' : undefined }}>{pct(preview.catastropheChance)}</strong>.
      </span>
      <div className="grid2">
        <div className="field">
          <label htmlFor="agi-chip">Chip</label>
          <select id="agi-chip" value={chipId} onChange={(e) => setChipId(e.target.value)}>
            {allChips(game, content).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({big(freeChips(game, c.id))} free)
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="agi-count">Chips to commit</label>
          <input id="agi-count" type="number" min={TUNING.agiMinChips} value={count} onChange={(e) => setCount(Math.floor(Number(e.target.value)))} />
        </div>
      </div>
      {preview.errors.length > 0 && (
        <ul className="errors">
          {preview.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        className="btn primary"
        disabled={preview.errors.length > 0}
        onClick={() => {
          if (preview.catastropheChance === 0 || confirm(`Start with a ${pct(preview.catastropheChance)} chance of catastrophe?`))
            send({ type: 'startAgiProgram', chipId, chipCount: count });
        }}
      >
        Start the AGI Program
      </button>
    </div>
  );
}
