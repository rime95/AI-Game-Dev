import { content, type TrackId } from '@stm/content';
import {
  levelDef,
  missingRoomFor,
  licenseRevenue,
  licenseUpkeep,
  nextUpgrade,
  requirementsFor,
  bestCapability,
  scoreNow,
  tierForCapability,
  tierName,
  trackDef,
  TRACK_IDS,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { money, pct } from '../format';
import { BAD, LAYER } from '../ui/layers';
import { Advisor, Bar, useDetails } from './Panel';

export const TRACK_COLOR: Record<TrackId, string> = {
  power: LAYER.power,
  safety: LAYER.trust,
  compliance: LAYER.gold,
  environmental: LAYER.env,
};

/** The tier the player is working toward: one above their best model. */
export function nextTier(game: GameState): number {
  return Math.min(5, tierForCapability(content, bestCapability(game)) + 1);
}

/** A tier's threshold expressed as a score on the current eval suite. */
function tierScoreNow(game: GameState, tier: number): string {
  const t = content.license.tiers.find((x) => x.tier === tier);
  return t ? scoreNow(game, t.minCapability).toFixed(0) : '?';
}

export function LicensePanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const target = nextTier(game);
  const reqs = requirementsFor(game, content, target);
  const met = reqs.filter((r) => r.gap === 0).length;
  const upkeep = licenseUpkeep(game, content);
  const income = licenseRevenue(game, content);
  const details = useDetails();

  return (
    <>
      <Advisor who="chief" color={LAYER.trust}>
        Smarter models need a bigger license from the government: enough power, a safety program, paperwork in order and a clean
        environmental record. We can train without them, but we risk fines, scandals and slow runs.
      </Advisor>

      <div className="card">
        <div className="row between">
          <h3>Next goal: {tierName(content, target)}</h3>
          <span className="small muted">
            {met} of 4 ready · for models with smarts {tierScoreNow(game, target)}+
          </span>
        </div>
        <div className="chips">
          {reqs.map((r) => (
            <span key={r.track} className="chip" style={{ ['--c' as string]: r.gap === 0 ? TRACK_COLOR[r.track] : BAD }}>
              {r.gap === 0 ? '✓' : '✗'} {trackDef(content, r.track).name} {r.have}/{r.need}
            </span>
          ))}
        </div>
        <div className="small muted">
          Upkeep {money(upkeep)} a week{income > 0 ? ` · selling waste heat earns ${money(income)} a week` : ''}
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
                <td className="muted">
                  {t.tier === 1 ? 'any model' : `smarts ${tierScoreNow(game, t.tier)}+`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted">
          {details
            ? `A run's tier comes from its capability, so a new test never lowers it (the smarts thresholds above just shift). Each missing level adds ${pct(content.license.riskPerGap)} risk on its track (power instead slows training by ${pct(content.license.powerSlowdownPerGap)}).`
            : 'When the smarts test gets harder, these numbers drop too, but your license stays the same.'}
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
  const missingRoom = next ? missingRoomFor(game, content, { track: id, level: game.license[id].level + 1 }) : null;
  const color = TRACK_COLOR[id];
  return (
    <div className="card" style={{ ['--c' as string]: color, borderTop: `4px solid ${color}` }}>
      <div className="row between">
        <h3>{def.name}</h3>
        <span className="row" aria-label={`Level ${state.level} of ${def.levels.length}`}>
          {def.levels.map((_, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: i < state.level ? color : 'var(--line)' }} />
          ))}
        </span>
      </div>
      <div className="small">
        <strong>
          Level {state.level}: {current.name}.
        </strong>{' '}
        {current.blurb}
        {current.powerCapMW ? ` We can draw ${current.powerCapMW} MW.` : ''}
      </div>
      {state.upgrade ? (
        <>
          <div className="small">
            Upgrading to {next?.name}: {state.upgrade.weeksLeft} weeks left
          </div>
          <Bar value={1 - state.upgrade.weeksLeft / state.upgrade.totalWeeks} color={color} />
        </>
      ) : next ? (
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="small">
            <div>
              Next: <strong>{next.name}</strong> — {next.blurb}
            </div>
            <div className="muted">
              {money(next.cost)} · {next.weeks} weeks · then {money(next.upkeep)} a week
              {next.powerCapMW ? ` · up to ${next.powerCapMW} MW` : ''}
              {next.weeklyRevenue ? ` · earns ${money(next.weeklyRevenue)} a week selling heat` : ''}
            </div>
          </div>
          <button
            className="btn primary"
            disabled={next.cost > game.cash || !!missingRoom}
            onClick={onUpgrade}
            title={missingRoom ? `Needs a ${missingRoom.name.toLowerCase()} at HQ` : undefined}
          >
            {missingRoom ? `Needs ${missingRoom.name.toLowerCase()}` : 'Upgrade'}
          </button>
        </div>
      ) : (
        <div className="small muted">Maxed out.</div>
      )}
    </div>
  );
}
