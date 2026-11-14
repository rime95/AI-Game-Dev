import { content } from '@stm/content';
import { fundingCheck, runProgress, type GameState } from '@stm/sim';
import { useStore, type Tab } from '../store';
import { nudgesFor } from '../world/Nudges';
import { HOTKEYS, Icon, navGroups, navOrder, TAB_META } from './layers';
import { nextStep } from '../guide';

/** Work under way per tab, 0–1, shown as a ring on the icon. */
function progressFor(game: GameState): Partial<Record<Tab, number>> {
  const out: Partial<Record<Tab, number>> = {};
  if (game.training) out.models = runProgress(game.training);
  if (game.chipProject) out.silicon = 1 - game.chipProject.weeksLeft / game.chipProject.totalWeeks;
  if (game.fab?.status === 'building') out.fab = 1 - game.fab.weeksLeft / game.fab.totalWeeks;
  const site = game.sites.find((s) => s.status === 'building');
  if (site) out.sites = 1 - site.weeksLeft / site.totalWeeks;
  const p = game.founding?.project;
  if (p && game.era === 'founding') out.chip = 1 - p.monthsLeft / p.totalMonths;
  return out;
}

export function NavRail({ game }: { game: GameState }) {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const dismissed = useStore((s) => s.dismissedNudges);
  const alerts = new Map<Tab, 'bad' | 'info'>();
  for (const n of nudgesFor(game)) {
    if (!n.tab || dismissed.includes(n.key)) continue;
    if (alerts.get(n.tab) !== 'bad') alerts.set(n.tab, n.tone);
  }
  if (game.era === 'founding') {
    alerts.clear();
    const step = nextStep(game);
    if (step.n > 0) alerts.set(step.tab, 'info');
  } else if (fundingCheck(game, content).canRaise && !alerts.has('overview')) alerts.set('overview', 'info');
  const progress = progressFor(game);

  return (
    <nav className="rail" aria-label="Sections">
      {navGroups(game.era).map((g) => (
        <div className="rail-group" key={g.label}>
          <div className="rail-label">{g.label}</div>
          {g.tabs.map((t) => {
            const m = TAB_META[t];
            const key = HOTKEYS[navOrder(game.era).indexOf(t)];
            const p = progress[t];
            const alert = alerts.get(t);
            return (
              <button
                key={t}
                style={{ ['--c' as string]: m.color }}
                aria-current={tab === t ? 'page' : undefined}
                title={`${m.label} (${key})`}
                onClick={() => setTab(t)}
              >
                <span className="rail-icon">
                  <Icon d={m.icon} />
                  {p !== undefined && (
                    <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="16" pathLength={100} strokeDasharray={`${Math.round(p * 100)} 100`} />
                    </svg>
                  )}
                </span>
                <span className="rail-text">{m.short ?? m.label}</span>
                {alert && <span className={`dot ${alert}`} aria-label={alert === 'bad' ? 'needs attention' : 'something to do'} />}
                <kbd>{key}</kbd>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
