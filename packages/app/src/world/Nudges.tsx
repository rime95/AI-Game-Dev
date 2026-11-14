import { content } from '@stm/content';
import { deskStats, freeChips, allChips, moveCheck, serverLayout, TUNING, type GameState } from '@stm/sim';
import { useStore, type Tab, type WorldView } from '../store';
import { money } from '../format';

/**
 * Advisor nudges (world-and-facilities §9): when something in the world is wrong, a short note in the
 * corner says what and takes you there. At most two at a time, worst first; dismissable for the session.
 */

interface Nudge {
  key: string;
  text: string;
  tab?: Tab;
  view?: WorldView;
  site?: { siteId: string; hallId: string | null };
  tone: 'bad' | 'info';
}

export function nudgesFor(game: GameState): Nudge[] {
  const out: Nudge[] = [];
  const desks = deskStats(game, content);
  const layout = serverLayout(game, content);
  const lw = game.lastWeek;

  if (lw && lw.demandTokens > 0 && lw.servedTokens / lw.demandTokens < 0.95)
    out.push({ key: 'serving', text: 'Users are waiting: serving capacity is short. Add chips.', tab: 'compute', tone: 'bad' });

  if (game.reputation < 20)
    out.push({
      key: `rep-${Math.floor(game.week / 13)}`,
      text: `Reputation is ${Math.round(game.reputation)}: users stay away. Serve demand fully and raise Safety and Compliance to rebuild it.`,
      tab: 'license',
      tone: 'bad',
    });

  const hot = layout.rooms.find((r) => r.throttle < 1);
  if (hot) {
    const site = game.sites.find((s) => s.id === hot.siteId);
    out.push({
      key: `throttle-${hot.roomId}`,
      text: `${site ? `A hall at ${site.name}` : 'The HQ server room'} is throttling to ${Math.round(hot.throttle * 100)}%: add cooling.`,
      ...(site ? { tab: 'sites' as Tab, site: { siteId: site.id, hallId: hot.roomId } } : { tab: 'hq' as Tab, view: 'hq' as WorldView }),
      tone: 'bad',
    });
  }

  if (desks.crowding > 1)
    out.push({
      key: 'crowded',
      text: `Out of desks: ${desks.headcount} people, ${desks.capacity} seats. Everyone is slower.`,
      tab: 'hq',
      view: 'hq',
      tone: 'bad',
    });

  const unseated = (['research', 'hardwareEng', 'ops', 'product'] as const).find((d) => game.hq.seated[d] < game.staff[d]);
  if (unseated) {
    const room = { research: 'research lab', hardwareEng: 'hardware lab', ops: 'ops room', product: 'product studio' }[unseated];
    out.push({
      key: `seat-${unseated}`,
      text: `Some specialists have no ${room}, so they can't do their real job.`,
      tab: 'hq',
      view: 'hq',
      tone: 'info',
    });
  }

  for (const site of game.sites) {
    const empty = site.status === 'online' && site.halls.find((h) => h.status === 'online' && !h.equipment.length);
    if (empty) {
      out.push({
        key: `empty-${empty.id}`,
        text: `A data hall at ${site.name} is empty. Auto-fill it in one click.`,
        tab: 'sites',
        site: { siteId: site.id, hallId: empty.id },
        tone: 'info',
      });
      break;
    }
  }

  if (
    layout.colo > 1000 &&
    game.license.power.level >= content.sites.requiresPowerLevel &&
    !game.sites.some((s) => s.status === 'building')
  )
    out.push({
      key: 'colo',
      text: `${layout.colo.toLocaleString('en-US')} chips sit in colocation (${money(layout.colo * TUNING.colocationPerChipWeek)}/wk). Our own halls are cheaper.`,
      tab: 'sites',
      view: 'map',
      tone: 'info',
    });

  if (lw && (lw.fabCosts ?? 0) - (lw.fabSales ?? 0) > Math.max(20_000_000, lw.revenue * 0.3))
    out.push({
      key: `fab-spend-${game.week}`,
      text: `The fab spent ${money((lw.fabCosts ?? 0) - (lw.fabSales ?? 0))} more than it sold last week, mostly on chips for our fleet. Lower line quotas if we don't need them.`,
      tab: 'fab',
      view: 'fab',
      tone: 'bad',
    });

  const idleLine = game.fab?.lines.find((l) => l.status === 'running' && !l.chipId);
  if (idleLine)
    out.push({
      key: `fab-${idleLine.id}`,
      text: `Fab bay ${idleLine.bay + 1} is idle: pick a chip design for it.`,
      tab: 'fab',
      view: 'fab',
      tone: 'info',
    });

  const free = allChips(game, content).reduce((n, c) => n + freeChips(game, c.id), 0);
  if (free > 0 && !game.training && !game.liveModelId)
    out.push({ key: 'idle', text: `${free.toLocaleString('en-US')} chips are idle. Start a training run.`, tab: 'models', tone: 'info' });

  const move = moveCheck(game, content);
  if (move.stage && !move.error && desks.crowding > 0.85)
    out.push({
      key: `move-${move.stage.id}`,
      text: `We can move to the ${move.stage.name.toLowerCase()} now. More room to grow.`,
      tab: 'hq',
      view: 'hq',
      tone: 'info',
    });

  return out;
}

/** Go wherever an alert points. */
function useGo() {
  const setTab = useStore((s) => s.setTab);
  const setWorldView = useStore((s) => s.setWorldView);
  const openSite = useStore((s) => s.openSite);
  return (n: Nudge) => {
    if (n.tab) setTab(n.tab);
    if (n.site) openSite(n.site.siteId, n.site.hallId);
    else if (n.view) setWorldView(n.view);
  };
}

/** The alerts tray (top bar ⚠): everything that needs attention, worst first. */
export function AlertsTray({ game }: { game: GameState }) {
  const open = useStore((s) => s.alertsOpen);
  const setOpen = useStore((s) => s.setAlertsOpen);
  const dismissed = useStore((s) => s.dismissedNudges);
  const dismiss = useStore((s) => s.dismissNudge);
  const go = useGo();
  if (!open) return null;
  const list = nudgesFor(game)
    .filter((n) => !dismissed.includes(n.key))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));
  return (
    <div className="tray-panel alerts" role="dialog" aria-label="Alerts">
      <div className="tray-head">
        <h3>Alerts</h3>
        <button className="icon-btn sm" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      {list.length === 0 && <div className="muted small pad">All clear. Nothing needs you right now.</div>}
      {list.map((n) => (
        <div key={n.key} className={`nudge ${n.tone}`}>
          <div className="nudge-text">{n.text}</div>
          <div className="row">
            {n.tab && (
              <button
                className="btn sm primary"
                onClick={() => {
                  go(n);
                  setOpen(false);
                }}
              >
                Go there
              </button>
            )}
            <button className="btn sm ghost" onClick={() => dismiss(n.key)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Corner flag in the world for the single worst problem, so it can't be missed while the tray is shut. */
export function AlertFlag({ game }: { game: GameState }) {
  const open = useStore((s) => s.alertsOpen);
  const dismissed = useStore((s) => s.dismissedNudges);
  const dismiss = useStore((s) => s.dismissNudge);
  const go = useGo();
  if (open) return null;
  const worst = nudgesFor(game).find((n) => n.tone === 'bad' && !dismissed.includes(n.key));
  if (!worst) return null;
  return (
    <div className="alert-flag" role="status">
      <button className="alert-go" onClick={() => go(worst)}>
        <span className="alert-icon" aria-hidden="true">!</span>
        {worst.text}
      </button>
      <button className="nudge-x" aria-label="Dismiss" onClick={() => dismiss(worst.key)}>
        ×
      </button>
    </div>
  );
}
