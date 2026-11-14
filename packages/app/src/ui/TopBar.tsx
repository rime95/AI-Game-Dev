import { content } from '@stm/content';
import { allChips, dateForWeek, deskStats, freeChips, ownedPowerMW, totalUsers, type GameState } from '@stm/sim';
import { big, dateLabel, money } from '../format';
import { LAYER } from './layers';
import { useStore } from '../store';

export function TopBar({ game }: { game: GameState }) {
  const total = game.fleet.reduce((n, f) => n + f.count, 0);
  const free = allChips(game, content).reduce((n, c) => n + freeChips(game, c.id), 0);
  const power = ownedPowerMW(game, content);
  const setPauseOpen = useStore((s) => s.setPauseOpen);
  const desks = deskStats(game, content);

  return (
    <header className="topbar">
      <button className="menu-btn" aria-label="Open menu" title="Menu (Esc)" onClick={() => setPauseOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="brand">
        <span>{game.companyName}</span>
        <span className="brand-sub">SAND TO MIND</span>
      </div>
      <Res k="Cash" v={money(game.cash)} c={LAYER.gold} neg={game.cash < 0} />
      <Res k="Users" v={big(totalUsers(game))} c={LAYER.products} />
      <Res k="Chips free / total" v={`${big(free)} / ${big(total)}`} c={LAYER.compute} />
      <Res k="Site power" v={`${power.toFixed(2)} / ${game.powerCapMW} MW`} c={LAYER.power} />
      <Res k="Data" v={`${big(game.dataTokensB * 1e9)} tok`} c={LAYER.models} />
      <Res k="Desks · morale" v={`${desks.headcount}/${desks.capacity} · ${Math.round(game.hq.morale)}`} c={LAYER.gold} neg={desks.crowding > 1} />
      <Res k="Reputation" v={game.reputation.toFixed(0)} c={LAYER.trust} />
      <div className="res date" style={{ ['--c' as string]: 'transparent' }}>
        <span className="k">Week {game.week}</span>
        <span className="v">{dateLabel(dateForWeek(game.week))}</span>
      </div>
    </header>
  );
}

function Res({ k, v, c, neg }: { k: string; v: string; c: string; neg?: boolean }) {
  return (
    <div className="res" style={{ ['--c' as string]: c }}>
      <span className="k">{k}</span>
      <span className={`v${neg ? ' neg' : ''}`}>{v}</span>
    </div>
  );
}
