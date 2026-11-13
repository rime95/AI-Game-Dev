import { useState } from 'react';
import { content } from '@stm/content';
import { liveModel, marketSize, targetUsers, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

export function ProductsPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const [price, setPrice] = useState(game.apiPrice);
  const live = liveModel(game);
  const lw = game.lastWeek;
  const capacityRatio = lw && lw.demandTokens > 0 ? lw.servingCapacityTokens / lw.demandTokens : 1;
  const target = targetUsers(game, content);

  return (
    <>
      <Advisor who="Product lead" color={LAYER.products}>
        Our API is priced per million tokens. Cheaper pulls more users, but every token has to be served by chips that
        aren't busy training.
      </Advisor>

      <div className="card">
        <h3>Developer API</h3>
        <div className="grid2">
          <Stat k="Live model" v={live ? `${live.name} · ${live.score.toFixed(1)}` : 'None'} c={LAYER.models} />
          <Stat k="Price" v={`$${game.apiPrice.toFixed(2)} / 1M tok`} c={LAYER.products} />
        </div>
        <div className="field">
          <label htmlFor="price">New price ($ per 1M tokens)</label>
          <div className="row">
            <input
              id="price"
              type="number"
              min={0.1}
              step={0.5}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <button className="btn primary" disabled={price === game.apiPrice} onClick={() => send({ type: 'setApiPrice', price })}>
              Set price
            </button>
          </div>
        </div>
        <div className="small muted">Rival prices: {content.rivals.map((r) => `${r.name.split(' ')[0]} $${r.apiPrice}`).join(' · ')}</div>
      </div>

      <div className="card">
        <h3>Users</h3>
        <div className="grid2">
          <Stat k="Users now" v={big(game.users)} c={LAYER.products} />
          <Stat k="Heading toward" v={big(target)} />
          <Stat k="Market size" v={big(marketSize(game.week))} />
          <Stat k="Demand / wk" v={`${big(lw?.demandTokens ?? 0)} tok`} />
        </div>
        <div className="small muted">Each user uses about {big(TUNING.tokensPerUserPerWeek)} tokens a week.</div>
      </div>

      <div className="card">
        <h3>Serving capacity</h3>
        <div className="small">
          Capacity covers {pct(Math.min(capacityRatio, 9.99))} of demand
          {capacityRatio < 1 && <strong style={{ color: 'var(--bad)' }}> — users are churning</strong>}
        </div>
        <Bar value={Math.min(1, capacityRatio)} color={capacityRatio < 1 ? '#c2413b' : LAYER.compute} />
        <div className="grid2">
          <Stat k="Capacity / wk" v={`${big(lw?.servingCapacityTokens ?? 0)} tok`} c={LAYER.compute} />
          <Stat k="Revenue / wk" v={money(lw?.revenue ?? 0)} c={LAYER.products} />
        </div>
        <div className="small muted">
          Serving is limited by memory bandwidth: each token reads the model's active weights. MoE and low precision serve
          far more tokens per chip.
        </div>
      </div>
    </>
  );
}
