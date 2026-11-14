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
      tab: 'sites',
      view: 'fab',
      tone: 'bad',
    });

  const idleLine = game.fab?.lines.find((l) => l.status === 'running' && !l.chipId);
  if (idleLine)
    out.push({
      key: `fab-${idleLine.id}`,
      text: `Fab bay ${idleLine.bay + 1} is idle: pick a chip design for it.`,
      tab: 'sites',
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

export function Nudges({ game }: { game: GameState }) {
  const dismissed = useStore((s) => s.dismissedNudges);
  const dismiss = useStore((s) => s.dismissNudge);
  const setTab = useStore((s) => s.setTab);
  const setWorldView = useStore((s) => s.setWorldView);
  const openSite = useStore((s) => s.openSite);
  const list = nudgesFor(game)
    .filter((n) => !dismissed.includes(n.key))
    .slice(0, 2);
  if (!list.length) return null;
  return (
    <div className="nudges" role="status">
      {list.map((n) => (
        <div key={n.key} className={`nudge ${n.tone}`}>
          <button
            className="nudge-go"
            onClick={() => {
              if (n.tab) setTab(n.tab);
              if (n.site) openSite(n.site.siteId, n.site.hallId);
              else if (n.view) setWorldView(n.view);
            }}
          >
            {n.text}
          </button>
          <button className="nudge-x" aria-label="Dismiss" onClick={() => dismiss(n.key)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
