import { conversion, liveModel, totalUsers, type GameState } from '@stm/sim';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';

/**
 * Product visuals (world-and-facilities §8): opening Products shows what we sell. The consumer app
 * on a phone, the developer API console, and enterprise clients as lit buildings in the city.
 */
export function ProductsShowcase({ game }: { game: GameState }) {
  return (
    <div className="showcase">
      <Phone game={game} />
      <ApiConsole game={game} />
      <ClientCity game={game} />
    </div>
  );
}

function Phone({ game }: { game: GameState }) {
  const live = liveModel(game);
  const app = game.consumer;
  const paid = app.users * conversion(game);
  return (
    <figure className="sc-card">
      <div className={`phone${app.launched ? '' : ' off'}`}>
        <div className="notch" />
        <div className="app-head" style={{ background: LAYER.products }}>
          <strong>{game.companyName}</strong>
          <span>{live ? live.name : 'no model'}</span>
        </div>
        <div className="chat">
          <div className="bubble me">Explain chips and models like I'm five.</div>
          <div className="bubble ai">
            Chips are the muscles, models are the brain. We design both, so they fit together{live ? ` — this is ${live.name}` : ''}.
          </div>
          <div className="bubble me">Okay, I'm subscribing.</div>
        </div>
        <div className="app-foot">Pro · ${app.subPrice}/month</div>
        {!app.launched && <div className="phone-off">Not launched yet: launch the app in the Products panel</div>}
      </div>
      <figcaption>
        <strong>Consumer app</strong>
        <span>
          {big(app.users)} monthly users · {big(paid)} paying ({pct(conversion(game))})
        </span>
        <span>{money(game.lastWeek?.consumerRevenue ?? 0)} last week</span>
      </figcaption>
    </figure>
  );
}

function ApiConsole({ game }: { game: GameState }) {
  const live = liveModel(game);
  const lw = game.lastWeek;
  const slug = game.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'lab';
  const covered = lw && lw.demandTokens > 0 ? Math.min(1, lw.servedTokens / lw.demandTokens) : 1;
  return (
    <figure className="sc-card">
      <pre className="console" aria-label="API console">
        <span className="c-dim">$ </span>curl https://api.{slug}.ai/v1/chat \{'\n'}
        {'    '}-d '{'{'}"model": "{live ? live.name.toLowerCase().replace(/\s+/g, '-') : 'none'}"{'}'}'{'\n'}
        {'\n'}
        <span className="c-ok">200 OK</span> · {live ? `score ${live.score.toFixed(1)}` : 'no model deployed'}
        {'\n'}
        <span className="c-dim"># pricing</span>
        {'\n'}${game.apiPrice.toFixed(2)} per 1M tokens{'\n'}
        <span className="c-dim"># last week</span>
        {'\n'}
        {big(lw?.servedTokens ?? 0)} tokens served{'\n'}
        {pct(covered)} of demand covered{covered < 0.95 ? '  ← add serving chips' : ''}
        {'\n'}
        {money(lw?.apiRevenue ?? 0)} revenue
      </pre>
      <figcaption>
        <strong>Developer API</strong>
        <span>{big(game.users)} API users</span>
        <span>{big(totalUsers(game))} users across all products</span>
      </figcaption>
    </figure>
  );
}

function ClientCity({ game }: { game: GameState }) {
  const W = 320;
  const H = 220;
  const base = H - 24;
  const buildings = [
    ...game.contracts.map((c) => ({ key: c.id, label: c.client, seats: c.seats, lit: true, offer: false })),
    ...game.offers.map((o) => ({ key: o.id, label: o.client, seats: o.seats, lit: false, offer: true })),
  ];
  // Fill the skyline with dark filler buildings so the city reads as a city.
  const filler = Math.max(0, 10 - buildings.length);
  const all = [
    ...buildings,
    ...Array.from({ length: filler }, (_, i) => ({ key: `f${i}`, label: '', seats: 400 + ((i * 397) % 1500), lit: false, offer: false })),
  ];
  const maxSeats = Math.max(2000, ...all.map((b) => b.seats));
  const bw = Math.min(40, (W - 20) / all.length - 4);
  const sectors = new Set(game.contracts.map((c) => c.sector)).size;
  return (
    <figure className="sc-card">
      <svg width={W} height={H} className="city" role="img" aria-label={`${game.contracts.length} enterprise clients`}>
        <rect x={0} y={base} width={W} height={24} fill="#d9cfba" />
        {all.map((b, i) => {
          const h = 40 + (b.seats / maxSeats) * (base - 70);
          const x = 10 + i * (bw + 4);
          const rows = Math.floor(h / 12);
          return (
            <g key={b.key}>
              <rect
                x={x}
                y={base - h}
                width={bw}
                height={h}
                fill={b.lit ? '#fbe3dc' : b.offer ? '#fffdf8' : '#cfc8bb'}
                stroke={b.lit ? LAYER.products : b.offer ? LAYER.products : 'none'}
                strokeDasharray={b.offer ? '3 3' : undefined}
              />
              {b.lit &&
                Array.from({ length: rows }, (_, r) => (
                  <rect key={r} x={x + 4} y={base - h + 6 + r * 12} width={bw - 8} height={4} fill={LAYER.gold} opacity={0.8} />
                ))}
              {b.label && (
                <text
                  x={x + bw / 2}
                  y={base - h - 4}
                  textAnchor="middle"
                  className="city-label"
                  transform={`rotate(-30 ${x + bw / 2} ${base - h - 4})`}
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <strong>Enterprise</strong>
        <span>
          {game.contracts.length} client{game.contracts.length === 1 ? '' : 's'} lit up across {sectors} sector{sectors === 1 ? '' : 's'} ·{' '}
          {game.offers.length} offer{game.offers.length === 1 ? '' : 's'} waiting (dashed)
        </span>
        <span>{money(game.lastWeek?.enterpriseRevenue ?? 0)} last week</span>
      </figcaption>
    </figure>
  );
}
