import type { ReactNode } from 'react';
import { content } from '@stm/content';
import { allChips, deskStats, freeChips, ownedPowerMW, totalUsers, type GameState, type WeekReport } from '@stm/sim';
import { big, money } from '../format';
import { LAYER } from './layers';
import { useStore } from '../store';
import { TimeControls } from './TimeControls';
import { nudgesFor } from '../world/Nudges';

/** Income and costs of a week report (everything, including facilities, campuses and the fab). */
export function weekTotals(lw: WeekReport | null | undefined) {
  if (!lw) return { income: 0, costs: 0, net: 0 };
  const costs =
    lw.salaries + lw.rent + lw.power + lw.licenseUpkeep + (lw.facilities ?? 0) + (lw.colocation ?? 0) + (lw.sites ?? 0) + (lw.fabCosts ?? 0);
  const income = lw.revenue + lw.licenseRevenue + (lw.fabSales ?? 0);
  return { income, costs, net: income - costs };
}

export function TopBar({ game }: { game: GameState }) {
  const setPauseOpen = useStore((s) => s.setPauseOpen);
  const total = game.fleet.reduce((n, f) => n + f.count, 0);
  const owned = game.fleet.filter((f) => f.owned).reduce((n, f) => n + f.count, 0);
  const free = allChips(game, content).reduce((n, c) => n + freeChips(game, c.id), 0);
  const power = ownedPowerMW(game, content);
  const desks = deskStats(game, content);
  const lw = game.lastWeek;
  const { income, costs, net } = weekTotals(lw);
  const runway = net < 0 && game.cash > 0 ? Math.floor(game.cash / -net) : null;

  return (
    <header className="topbar">
      <button className="icon-btn" aria-label="Open menu" title="Menu (Esc)" onClick={() => setPauseOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="brand">
        <span>{game.companyName}</span>
        <span className="brand-sub">Sand to Mind</span>
      </div>

      <div className="hud">
        {game.era === 'founding' ? (
          <FoundingHud game={game} />
        ) : (
        <>
        <Res
          cls="cash"
          k="Cash"
          c={LAYER.gold}
          v={money(game.cash)}
          neg={game.cash < 0}
          sub={
            lw ? (
              <span className={net >= 0 ? 'up' : 'down'}>
                {net >= 0 ? '▲' : '▼'} {money(Math.abs(net))}/wk{runway !== null && runway < 52 ? ` · ${runway} wk left` : ''}
              </span>
            ) : (
              'no results yet'
            )
          }
          pop={
            lw ? (
              <>
                <h4>Last week</h4>
                <Line k="API" v={lw.apiRevenue} />
                <Line k="App subscriptions" v={lw.consumerRevenue} />
                <Line k="Enterprise" v={lw.enterpriseRevenue} />
                {(lw.fabSales ?? 0) > 0 && <Line k="Chip sales" v={lw.fabSales!} />}
                {lw.licenseRevenue > 0 && <Line k="Heat sales" v={lw.licenseRevenue} />}
                {lw.slaPenalty > 0 && <Line k="SLA credits" v={-lw.slaPenalty} />}
                <Line k="Income" v={income} strong />
                <Line k="Salaries" v={-lw.salaries} />
                <Line k="Chip rent" v={-lw.rent} />
                <Line k="Power" v={-lw.power} />
                <Line k="Office & rooms" v={-(lw.facilities ?? 0)} />
                {(lw.colocation ?? 0) > 0 && <Line k="Rented rack space" v={-lw.colocation!} />}
                {(lw.sites ?? 0) > 0 && <Line k="Data centers" v={-lw.sites!} />}
                {(lw.fabCosts ?? 0) > 0 && <Line k="Fab" v={-lw.fabCosts!} />}
                <Line k="License upkeep" v={-lw.licenseUpkeep} />
                <Line k="Costs" v={-costs} strong />
                <Line k="Net" v={net} strong />
              </>
            ) : (
              <p>Advance a week to see the books.</p>
            )
          }
        />

        <div className="hud-group">
          <Res
            k="Users"
            c={LAYER.products}
            v={big(totalUsers(game))}
            pop={
              <>
                <h4>Users</h4>
                <p>Everyone using our API, app and enterprise products.</p>
                <Kv k="Reputation" v={`${game.reputation.toFixed(0)} / 100`} />
              </>
            }
          />
          <Res
            k="Team"
            c={LAYER.gold}
            v={`${desks.headcount}/${desks.capacity}`}
            neg={desks.crowding > 1}
            sub={`morale ${Math.round(game.hq.morale)}`}
            pop={
              <>
                <h4>People</h4>
                <Kv k="Headcount / seats" v={`${desks.headcount} / ${desks.capacity}`} />
                <Kv k="Morale" v={`${Math.round(game.hq.morale)} / 100`} />
                <Kv k="Productivity" v={`×${game.hq.productivity.toFixed(2)}`} />
                {desks.crowding > 1 && <p className="neg">Out of desks: everyone works slower. Build desk pods in HQ.</p>}
              </>
            }
          />
          <Res
            cls="opt"
            k="Reputation"
            c={LAYER.trust}
            v={game.reputation.toFixed(0)}
            neg={game.reputation < 20}
            pop={
              <>
                <h4>Reputation</h4>
                <p>How much users and regulators trust us. It recovers while we serve demand fully; Safety and Compliance raise its ceiling.</p>
              </>
            }
          />
        </div>

        <div className="hud-group">
          <Res
            k="Chips"
            c={LAYER.compute}
            v={`${big(free)} / ${big(total)}`}
            sub="free / total"
            pop={
              <>
                <h4>Chips</h4>
                <Kv k="Free" v={big(free)} />
                <Kv k="Owned" v={big(owned)} />
                <Kv k="Rented" v={big(total - owned)} />
                <p>Free chips can start a training run. Serving uses the rest.</p>
              </>
            }
          />
          <Res
            k="Power"
            c={LAYER.power}
            v={`${power.toFixed(1)} MW`}
            neg={power > game.powerCapMW}
            sub={`of ${game.powerCapMW} MW`}
            pop={
              <>
                <h4>Power</h4>
                <p>What our owned chips, halls and fab draw, against the cap from our Power license level.</p>
              </>
            }
          />
          <Res
            cls="opt"
            k="Data"
            c={LAYER.models}
            v={big(game.dataTokensB * 1e9)}
            sub="tokens to learn from"
            pop={
              <>
                <h4>Training data</h4>
                <p>Tokens we own. Buy more in Models before a bigger run.</p>
              </>
            }
          />
        </div>
        </>
        )}
      </div>

      <TimeControls game={game} />
      <TrayButtons game={game} />
    </header>
  );
}

/** The chip-company years: cash, people, trust, chips on sale, research points. */
function FoundingHud({ game }: { game: GameState }) {
  const f = game.founding!;
  const r = f.report;
  const costs = r ? r.costOfGoods + r.salaries + r.rent + r.upkeep : 0;
  const net = r ? r.sales - costs : 0;
  const people = Object.values(game.staff).reduce((n, c) => n + c, 0);
  const desks = deskStats(game, content);
  const onSale = f.products.filter((p) => !p.retired).length;
  return (
    <>
      <Res
        cls="cash"
        k="Cash"
        c={LAYER.gold}
        v={money(game.cash)}
        neg={game.cash < 0}
        sub={r ? <span className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '▲' : '▼'} {money(Math.abs(net))}/month</span> : 'no sales yet'}
        pop={
          r ? (
            <>
              <h4>Last month</h4>
              <Line k="Chip sales" v={r.sales} strong />
              <Line k="Making the chips" v={-r.costOfGoods} />
              <Line k="Salaries" v={-r.salaries} />
              <Line k="Rent" v={-r.rent} />
              <Line k="Rooms" v={-r.upkeep} />
              <Line k="Net" v={net} strong />
              <p>New designs and buzz are paid up front and aren't counted here.</p>
            </>
          ) : (
            <p>Play a month to see the books.</p>
          )
        }
      />
      <div className="hud-group">
        <Res
          k="Team"
          c={LAYER.gold}
          v={`${people}/${desks.capacity}`}
          neg={desks.crowding > 1}
          sub={`morale ${Math.round(game.hq.morale)}`}
          pop={
            <>
              <h4>People</h4>
              <Kv k="Chip designers" v={String(game.staff.hardwareEng)} />
              <Kv k="Salespeople" v={String(game.staff.product)} />
              <Kv k="Researchers" v={String(game.staff.research)} />
              <Kv k="Seats" v={String(desks.capacity)} />
              <p>The founder works for free. Everyone else is paid monthly.</p>
            </>
          }
        />
        <Res
          k="Trust"
          c={LAYER.trust}
          v={String(Math.round(f.trust))}
          pop={
            <>
              <h4>Customer trust</h4>
              <p>Good launches build it, disappointing ones cost it. More trust sells more of every chip.</p>
            </>
          }
        />
      </div>
      <div className="hud-group">
        <Res
          k="Chips"
          c={LAYER.silicon}
          v={String(onSale)}
          sub={`on sale · ${f.products.length} made`}
          pop={
            <>
              <h4>Our chips</h4>
              <p>Each sells for a year or two, slipping as the industry moves on. Ship 3 to afford an office.</p>
            </>
          }
        />
        <Res
          cls="opt"
          k="Research"
          c={LAYER.models}
          v={String(Math.floor(f.researchPoints))}
          sub="points"
          pop={
            <>
              <h4>Research points</h4>
              <p>Earned from every chip and from researchers. Spend them in Research on new generations, new kinds of chip and better tools.</p>
            </>
          }
        />
      </div>
    </>
  );
}

function TrayButtons({ game }: { game: GameState }) {
  const activityOpen = useStore((s) => s.activityOpen);
  const alertsOpen = useStore((s) => s.alertsOpen);
  const setActivityOpen = useStore((s) => s.setActivityOpen);
  const setAlertsOpen = useStore((s) => s.setAlertsOpen);
  const seenWeek = useStore((s) => s.seenWeek);
  const dismissed = useStore((s) => s.dismissedNudges);
  const unread = game.log.filter((e) => e.week > seenWeek).length;
  const alerts = nudgesFor(game).filter((n) => !dismissed.includes(n.key));
  const bad = alerts.some((a) => a.tone === 'bad');
  return (
    <div className="tray">
      <button
        className="icon-btn"
        aria-pressed={alertsOpen}
        aria-label={`Alerts (${alerts.length})`}
        title="Alerts"
        onClick={() => setAlertsOpen(!alertsOpen)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l9.5 17h-19zM12 10v4M12 17h.01" />
        </svg>
        {alerts.length > 0 && <span className={`badge${bad ? ' bad' : ''}`}>{alerts.length}</span>}
      </button>
      <button
        className="icon-btn"
        aria-pressed={activityOpen}
        aria-label={`Activity (${unread} new)`}
        title="Activity log"
        onClick={() => setActivityOpen(!activityOpen)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    </div>
  );
}

function Res({ k, v, c, neg, sub, pop, cls }: { k: string; v: string; c: string; neg?: boolean; sub?: ReactNode; pop?: ReactNode; cls?: string }) {
  return (
    <div className={`res${cls ? ` ${cls}` : ""}`} style={{ ['--c' as string]: c }} tabIndex={pop ? 0 : undefined}>
      <span className="k">{k}</span>
      <span className={`v${neg ? ' neg' : ''}`}>{v}</span>
      {sub && <span className="s">{sub}</span>}
      {pop && (
        <div className="pop" role="tooltip">
          {pop}
        </div>
      )}
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className={`kv${strong ? ' strong' : ''}`}>
      <span>{k}</span>
      <span className={v < 0 ? 'down' : v > 0 ? 'up' : undefined}>{money(v)}</span>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
