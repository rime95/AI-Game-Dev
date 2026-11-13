import { content } from '@stm/content';
import { dateForWeek, freeChips, ownedPowerMW, type GameState } from '@stm/sim';
import { big, dateLabel, money } from '../format';
import { LAYER } from './layers';

export function TopBar({ game }: { game: GameState }) {
  const total = game.fleet.reduce((n, f) => n + f.count, 0);
  const free = content.chips.reduce((n, c) => n + freeChips(game, c.id), 0);
  const power = ownedPowerMW(game, content);

  return (
    <header className="topbar">
      <div className="brand">SAND TO MIND</div>
      <Res k="Cash" v={money(game.cash)} c={LAYER.gold} neg={game.cash < 0} />
      <Res k="Users" v={big(game.users)} c={LAYER.products} />
      <Res k="Chips free / total" v={`${big(free)} / ${big(total)}`} c={LAYER.compute} />
      <Res k="Site power" v={`${power.toFixed(2)} / ${game.powerCapMW} MW`} c={LAYER.power} />
      <Res k="Data" v={`${big(game.dataTokensB * 1e9)} tok`} c={LAYER.models} />
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
