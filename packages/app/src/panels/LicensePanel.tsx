import { content, type TrackId } from '@stm/content';
import {
  bestScore,
  levelDef,
  licenseRevenue,
  licenseUpkeep,
  nextUpgrade,
  requirementsFor,
  tierForScore,
  tierName,
  trackDef,
  TRACK_IDS,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar } from './Panel';

export const TRACK_COLOR: Record<TrackId, string> = {
  power: LAYER.power,
  safety: LAYER.trust,
  compliance: LAYER.gold,
  environmental: LAYER.env,
};

/** The tier the player is working toward: one above their best model. */
export function nextTier(game: GameState): number {
  return Math.min(5, tierForScore(content, bestScore(game)) + 1);
}

export function LicensePanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const target = nextTier(game);
  const reqs = requirementsFor(game, content, target);
  const met = reqs.filter((r) => r.gap === 0).length;
  const upkeep = licenseUpkeep(game, content);
  const income = licenseRevenue(game, content);

  return (
    <>
      <Advisor who="Chief of staff" color={LAYER.trust}>
        Bigger models need a license to scale: enough power, a safety program, compliance and environmental standing. Skipping
        a requirement doesn't block training, but it risks fines, incidents and slow runs.
      </Advisor>

      <div className="card">
        <div className="row between">
          <h3>Next goal: {tierName(content, target)}</h3>
          <span className="small muted">
            {met}/4 met · from score {content.license.tiers.find((t) => t.tier === target)?.minScore}
          </span>
        </div>
        <div className="chips">
          {reqs.map((r) => (
            <span key={r.track} className="chip" style={{ ['--c' as string]: r.gap === 0 ? TRACK_COLOR[r.track] : '#c2413b' }}>
              {r.gap === 0 ? '✓' : '✗'} {trackDef(content, r.track).name} {r.have}/{r.need}
            </span>
          ))}
        </div>
        <div className="small muted">
          Upkeep {money(upkeep)}/wk{income > 0 ? ` · heat sales +${money(income)}/wk` : ''}
        </div>
      </div>

      {TRACK_IDS.map((id) => (
        <TrackCard key={id} game={game} id={id} onUpgrade={() => send({ type: 'upgradeLicense', track: id })} />
      ))}

      <div className="card">
        <h3>Tiers</h3>
        <table className="t">
          <tbody>
            {content.license.tiers.map((t) => (
              <tr key={t.tier} className={t.tier === target ? 'you' : undefined}>
                <td>{t.name}</td>
                <td className="muted">score {t.minScore}+</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted">
          A run's tier comes from its projected score. Each missing level adds {pct(content.license.riskPerGap)} risk on its
          track (power instead slows training by {pct(content.license.powerSlowdownPerGap)}).
        </div>
      </div>
    </>
  );
}

function TrackCard({ game, id, onUpgrade }: { game: GameState; id: TrackId; onUpgrade: () => void }) {
  const def = trackDef(content, id);
  const state = game.license[id];
  const current = levelDef(content, id, state.level)!;
  const next = nextUpgrade(game, content, id);
  const color = TRACK_COLOR[id];
  return (
    <div className="card" style={{ ['--c' as string]: color, borderTop: `4px solid ${color}` }}>
      <div className="row between">
        <h3>{def.name}</h3>
        <span className="row" aria-label={`Level ${state.level} of ${def.levels.length}`}>
          {def.levels.map((_, i) => (
            <span
              key={i}
              style={{ width: 10, height: 10, borderRadius: 3, background: i < state.level ? color : 'var(--line)' }}
            />
          ))}
        </span>
      </div>
      <div className="small">
        <strong>Level {state.level}: {current.name}.</strong> {current.blurb}
        {current.powerCapMW ? ` Site power ${current.powerCapMW} MW.` : ''}
      </div>
      {state.upgrade ? (
        <>
          <div className="small">Upgrading to {next?.name}: {state.upgrade.weeksLeft} wk left</div>
          <Bar value={1 - state.upgrade.weeksLeft / state.upgrade.totalWeeks} color={color} />
        </>
      ) : next ? (
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="small">
            <div>
              Next: <strong>{next.name}</strong> — {next.blurb}
            </div>
            <div className="muted">
              {money(next.cost)} · {next.weeks} wk · upkeep {money(next.upkeep)}/wk
              {next.powerCapMW ? ` · ${next.powerCapMW} MW` : ''}
              {next.weeklyRevenue ? ` · +${money(next.weeklyRevenue)}/wk heat sales` : ''}
            </div>
          </div>
          <button className="btn primary" disabled={next.cost > game.cash} onClick={onUpgrade}>
            Upgrade
          </button>
        </div>
      ) : (
        <div className="small muted">Maxed out.</div>
      )}
    </div>
  );
}
