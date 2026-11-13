import { useState } from 'react';
import { content } from '@stm/content';
import {
  consumerMarket,
  consumerTarget,
  contractCapacity,
  conversion,
  liveModel,
  marketSize,
  offerCheck,
  targetUsers,
  TUNING,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

export function ProductsPanel({ game }: { game: GameState }) {
  const live = liveModel(game);
  const lw = game.lastWeek;
  const capacityRatio = lw && lw.demandTokens > 0 ? lw.servingCapacityTokens / lw.demandTokens : 1;

  return (
    <>
      <Advisor who="Product lead" color={LAYER.products}>
        Three ways to sell the same model: a developer API, a consumer app with subscriptions, and enterprise contracts.
        All of them run on the chips that aren't training — run short and everyone suffers.
      </Advisor>

      <div className="card">
        <div className="row between">
          <h3>Serving capacity</h3>
          <span className="small muted">Live: {live ? `${live.name} · ${live.score.toFixed(1)}` : 'no model'}</span>
        </div>
        <div className="small">
          {capacityRatio >= 1 ? 'Capacity covers all demand' : `Capacity covers ${pct(capacityRatio)} of demand`}
          {capacityRatio < 1 && <strong style={{ color: 'var(--bad)' }}> — users are churning</strong>}
          {capacityRatio < TUNING.slaThreshold && game.contracts.length > 0 && (
            <strong style={{ color: 'var(--bad)' }}> and enterprise SLAs are breached</strong>
          )}
        </div>
        <Bar value={Math.min(1, capacityRatio)} color={capacityRatio < 1 ? '#c2413b' : LAYER.compute} />
        <div className="grid2">
          <Stat k="Capacity / wk" v={`${big(lw?.servingCapacityTokens ?? 0)} tok`} c={LAYER.compute} />
          <Stat k="Demand / wk" v={`${big(lw?.demandTokens ?? 0)} tok`} />
        </div>
      </div>

      <ApiCard game={game} />
      <ConsumerCard game={game} />
      <EnterpriseCard game={game} />
    </>
  );
}

function ApiCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const [price, setPrice] = useState(game.apiPrice);
  return (
    <div className="card" style={{ borderTop: `4px solid ${LAYER.products}` }}>
      <div className="row between">
        <h3>Developer API</h3>
        <span className="small muted">{money(game.lastWeek?.apiRevenue ?? 0)}/wk</span>
      </div>
      <div className="grid3">
        <Stat k="Developers" v={big(game.users)} c={LAYER.products} />
        <Stat k="Heading to" v={big(targetUsers(game, content))} />
        <Stat k="Market" v={big(marketSize(game.week))} />
      </div>
      <div className="field">
        <label htmlFor="price">Price ($ per 1M tokens)</label>
        <div className="row">
          <input id="price" type="number" min={0.1} step={0.5} value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ flex: 1 }} />
          <button className="btn primary" disabled={price === game.apiPrice} onClick={() => send({ type: 'setApiPrice', price })}>
            Set
          </button>
        </div>
      </div>
      <div className="small muted">
        Rivals: {content.rivals.map((r) => `${r.name.split(' ')[0]} $${r.apiPrice}`).join(' · ')}. Each developer uses ~
        {big(TUNING.tokensPerUserPerWeek)} tokens a week.
      </div>
    </div>
  );
}

function ConsumerCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const [price, setPrice] = useState(game.consumer.subPrice);
  const c = game.consumer;
  return (
    <div className="card" style={{ borderTop: `4px solid ${LAYER.products}` }}>
      <div className="row between">
        <h3>Consumer app</h3>
        <span className="small muted">{c.launched ? `${money(game.lastWeek?.consumerRevenue ?? 0)}/wk` : 'not launched'}</span>
      </div>
      {!c.launched ? (
        <>
          <div className="small">
            A chat app for everyone, with a free tier and a paid subscription. Needs a released model and a product manager.
            Free users still cost serving: ~{big(TUNING.consumerTokensPerUser)} tokens each a week.
          </div>
          <button
            className="btn primary"
            disabled={!game.liveModelId || game.staff.product < 1 || game.cash < TUNING.consumerLaunchCost}
            onClick={() => send({ type: 'launchConsumerApp' })}
          >
            Launch the app ({money(TUNING.consumerLaunchCost)})
          </button>
        </>
      ) : (
        <>
          <div className="grid3">
            <Stat k="App users" v={big(c.users)} c={LAYER.products} />
            <Stat k="Paying" v={`${big(c.users * conversion(game))} · ${pct(conversion(game))}`} />
            <Stat k="Heading to" v={big(consumerTarget(game, content))} />
          </div>
          <div className="field">
            <label htmlFor="sub">Subscription ($ per month)</label>
            <div className="row">
              <input id="sub" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ flex: 1 }} />
              <button className="btn primary" disabled={price === c.subPrice} onClick={() => send({ type: 'setSubPrice', price })}>
                Set
              </button>
            </div>
          </div>
          <div className="small muted">
            Consumer market {big(consumerMarket(game.week))}. Rival apps charge ${TUNING.referenceSubPrice}. Each product manager
            adds {(TUNING.conversionPerProductManager * 100).toFixed(1)}% to paid conversion (max {pct(TUNING.maxConversion)}).
          </div>
        </>
      )}
    </div>
  );
}

function EnterpriseCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  return (
    <div className="card" style={{ borderTop: `4px solid ${LAYER.products}` }}>
      <div className="row between">
        <h3>Enterprise</h3>
        <span className="small muted">
          {money(game.lastWeek?.enterpriseRevenue ?? 0)}/wk · accounts {game.contracts.length}/{contractCapacity(game)}
        </span>
      </div>
      <div className="small muted">
        Companies sign multi-month contracts if our model, safety and compliance meet their bar. Each product manager handles{' '}
        {TUNING.contractsPerProductManager} accounts. Serving below {pct(TUNING.slaThreshold)} breaches the SLA: credits, and
        customers may leave.
      </div>

      {game.offers.length === 0 && <div className="small muted">No open offers. They arrive while a model is live.</div>}
      {game.offers.map((o) => {
        const check = offerCheck(game, content, o);
        return (
          <div key={o.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row between">
              <strong>
                {o.client} <span className="small muted">· {o.sector}</span>
              </strong>
              <span className="small muted">expires wk {o.expiresWeek}</span>
            </div>
            <div className="small">
              {big(o.seats)} seats × ${o.pricePerSeat.toFixed(2)}/wk = <strong>{money(o.seats * o.pricePerSeat)}/wk</strong> for{' '}
              {o.termWeeks} weeks
            </div>
            <div className="chips">
              {check.checks.map((c) => (
                <span key={c.label} className="chip" style={{ ['--c' as string]: c.ok ? LAYER.env : '#c2413b' }}>
                  {c.ok ? '✓' : '✗'} {c.label}
                </span>
              ))}
            </div>
            <div className="row">
              <button className="btn primary" disabled={!check.canAccept} onClick={() => send({ type: 'acceptOffer', offerId: o.id })}>
                Sign
              </button>
              <button className="btn" onClick={() => send({ type: 'declineOffer', offerId: o.id })}>
                Decline
              </button>
            </div>
          </div>
        );
      })}

      {game.contracts.length > 0 && (
        <table className="t">
          <thead>
            <tr>
              <th>Client</th>
              <th>Seats</th>
              <th>$/wk</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {game.contracts.map((c) => (
              <tr key={c.id}>
                <td>{c.client}</td>
                <td>{big(c.seats)}</td>
                <td>{money(c.seats * c.pricePerSeat)}</td>
                <td>{c.weeksLeft} wk</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
