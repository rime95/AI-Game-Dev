import { useMemo, useState } from 'react';
import { v2 } from '@stm/sim';
import { useStore } from '../store';
import { LAYER } from '../ui/layers';
import { LineChart, Sparkline } from './charts';

type G = v2.GameV2;
const $ = v2.moneyV2;
const $2 = (n: number) => `$${n.toFixed(2)}`;

/** Company logo from its website icon (loaded live; a monogram if it can't load), as in Grounds Up. */
export function StockLogo({ ticker, size = 20 }: { ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const d = v2.STOCKS.find((x) => x.ticker === ticker);
  const box = { width: size, height: size };
  if (!d || failed)
    return (
      <span className="stock-mono" style={box}>
        {ticker.slice(0, 2)}
      </span>
    );
  return <img className="stock-logo" style={box} alt="" src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=64`} onError={() => setFailed(true)} />;
}

export function WealthPanel({ g }: { g: G }) {
  const [view, setView] = useState<'you' | 'market' | 'ipo'>('you');
  return (
    <>
      <div className="seg sm">
        {(
          [
            ['you', 'Your fortune'],
            ['market', 'Stock market'],
            ['ipo', g.ipo ? 'Your shares' : 'IPO'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
      </div>
      {view === 'you' && <Fortune g={g} />}
      {view === 'market' && <Market g={g} />}
      {view === 'ipo' && <Ipo g={g} />}
    </>
  );
}

function Fortune({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const [salary, setSalary] = useState(g.personal.salary);
  const [inject, setInject] = useState(0);
  const worth = v2.netWorth(g);
  const rank = v2.richRank(g);
  const cap = v2.salaryCap(g);
  return (
    <>
      <div className="card chapter-card" style={{ ['--c' as string]: LAYER.gold }}>
        <h3>Net worth</h3>
        <div className="forecast">
          <span className="big">{$(worth)}</span>
          <span className="small muted">
            #{rank} on the rich list
          </span>
        </div>
        <div className="grid3">
          <div className="stat">
            <div className="k">Your cash</div>
            <div className="v">{$(g.personal.cash)}</div>
          </div>
          <div className="stat">
            <div className="k">Shares</div>
            <div className="v">{$(v2.portfolioValue(g))}</div>
          </div>
          <div className="stat">
            <div className="k">Your stake</div>
            <div className="v">{$(v2.ownership(g) * v2.companyValue(g))}</div>
          </div>
        </div>
        <p className="small muted">
          You own {Math.round(v2.ownership(g) * 100)}% of {g.companyName}, worth {$(v2.companyValue(g))} {g.ipo ? 'on the market' : '(ten years of profit plus cash)'}.
        </p>
      </div>
      <div className="card">
        <h3>Your salary</h3>
        <p className="small muted">Paid monthly from the company into your own account. Up to {$(cap)} a month for now (1% of last month's sales).</p>
        <input type="range" min={0} max={Math.round(cap)} step={500} value={Math.min(salary, cap)} onChange={(e) => setSalary(Number(e.target.value))} />
        <div className="row between">
          <b>{$(salary)}/mo</b>
          <button className="btn sm primary" onClick={() => send({ type: 'setSalary', amount: Math.min(salary, cap) })}>
            Set
          </button>
        </div>
        <div className="row between">
          <span className="small">Put your own money in:</span>
          <span className="row">
            <input type="number" min={0} step={10000} value={inject} onChange={(e) => setInject(Number(e.target.value))} style={{ width: 110 }} />
            <button className="btn sm" disabled={!(inject > 0) || inject > g.personal.cash} onClick={() => send({ type: 'injectCash', amount: inject })}>
              Invest
            </button>
          </span>
        </div>
      </div>
      <div className="card">
        <h3>Rich list</h3>
        <table className="t">
          <tbody>
            {[...v2.RICH_LIST, { name: 'You', worth }]
              .sort((a, b) => b.worth - a.worth)
              .map((p, i) => (
                <tr key={p.name} className={p.name === 'You' ? 'you' : ''}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{$(p.worth)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="small muted">Real names, fixed fortunes: they never move, so the list is a target to climb.</p>
      </div>
    </>
  );
}

function Market({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const [sel, setSel] = useState<string | null>(null);
  const [sort, setSort] = useState<'sector' | 'change' | 'yield'>('sector');
  const list = v2.tradable(g);
  const rows = useMemo(() => {
    const r = list.map((l) => {
      const d = v2.stockDef(l.ticker);
      const prev = l.history[l.history.length - 5] ?? l.history[0]!;
      return { l, d, change: prev ? l.price / prev - 1 : 0, yld: (l.eps * 4 * d.payout) / l.price };
    });
    return r.sort((a, b) => (sort === 'change' ? b.change - a.change : sort === 'yield' ? b.yld - a.yld : a.d.sector.localeCompare(b.d.sector) || a.d.name.localeCompare(b.d.name)));
  }, [list, sort]);
  const held = Object.entries(g.personal.portfolio);
  return (
    <>
      {held.length > 0 && (
        <div className="card">
          <h3>Your holdings</h3>
          <table className="t">
            <tbody>
              {held.map(([t, h]) => {
                const l = g.stocks.find((x) => x.ticker === t)!;
                const value = h.shares * l.price;
                return (
                  <tr key={t} className="you" onClick={() => setSel(t)}>
                    <td>
                      <StockLogo ticker={t} size={16} /> {t}
                    </td>
                    <td>{h.shares.toLocaleString('en-US')}</td>
                    <td>{$(value)}</td>
                    <td className={value >= h.cost ? 'up' : 'neg'}>{$(value - h.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Dividends so far: {$(g.personal.dividends)}</p>
        </div>
      )}
      {sel && <Trade g={g} ticker={sel} onClose={() => setSel(null)} />}
      <div className="card">
        <div className="row between">
          <h3>Stock market</h3>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="sector">By sector</option>
            <option value="change">Biggest movers</option>
            <option value="yield">Highest yield</option>
          </select>
        </div>
        <p className="small muted">Your own money (not the company's). Real companies, simulated behaviour: all results are fictional. Rival stocks follow how they do against you.</p>
        <table className="t stocks">
          <tbody>
            {rows.map(({ l, d, change, yld }) => (
              <tr key={l.ticker} onClick={() => setSel(l.ticker)} className={g.personal.portfolio[l.ticker] ? 'you' : ''}>
                <td>
                  <StockLogo ticker={l.ticker} size={16} /> <b>{l.ticker}</b>
                  <div className="small muted">{d.name}</div>
                </td>
                <td>
                  <Sparkline values={l.history.slice(-26)} color={change >= 0 ? LAYER.env : '#ff7b8a'} width={56} height={18} />
                </td>
                <td>{$2(l.price)}</td>
                <td className={change >= 0 ? 'up' : 'neg'}>
                  {change >= 0 ? '+' : ''}
                  {(change * 100).toFixed(1)}%
                </td>
                <td className="small muted">{(yld * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.personal.orders.length > 0 && (
        <div className="card">
          <h3>Standing orders</h3>
          {g.personal.orders.map((o) => (
            <div key={o.id} className="row between small">
              <span>
                {o.kind === 'stopLoss' ? 'Stop-loss' : o.kind === 'takeProfit' ? 'Take profit' : 'Buy below'} {o.shares.toLocaleString('en-US')} {o.ticker} at {$2(o.trigger)}
              </span>
              <button className="btn sm ghost" onClick={() => send({ type: 'cancelOrder', id: o.id })}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Trade({ g, ticker, onClose }: { g: G; ticker: string; onClose: () => void }) {
  const send = useStore((s) => s.send2);
  const l = g.stocks.find((x) => x.ticker === ticker)!;
  const d = v2.stockDef(ticker);
  const held = g.personal.portfolio[ticker]?.shares ?? 0;
  const maxBuy = Math.floor(g.personal.cash / (l.price * 1.002));
  const [n, setN] = useState(Math.max(1, Math.min(100, maxBuy || held || 1)));
  const [trigger, setTrigger] = useState(Math.round(l.price * 90) / 100);
  return (
    <div className="card selection" style={{ ['--c' as string]: LAYER.compute }}>
      <div className="row between">
        <h3>
          <StockLogo ticker={ticker} /> {d.name}
        </h3>
        <button className="btn sm ghost" onClick={onClose}>
          ×
        </button>
      </div>
      <LineChart labels={l.history.map((_, i) => `w${i}`)} series={[{ name: ticker, color: LAYER.compute, values: l.history }]} format={(v) => `$${v.toFixed(0)}`} zero={false} height={120} />
      <div className="small muted">
        {d.sector} · P/E {l.pe.toFixed(0)} · growth {(l.growth * 100).toFixed(0)}% · {l.lastResult ? `last results ${(l.lastResult.change * 100).toFixed(1)}% vs ${(l.lastResult.expected * 100).toFixed(1)}% expected` : 'no results yet'}
      </div>
      <input type="range" min={1} max={Math.max(1, maxBuy, held)} value={n} onChange={(e) => setN(Number(e.target.value))} />
      <div className="row between">
        <b>
          {n.toLocaleString('en-US')} shares ≈ {$(n * l.price)}
        </b>
        <span className="row">
          <button className="btn sm primary" disabled={n > maxBuy} onClick={() => send({ type: 'buyStock', ticker, shares: n })}>
            Buy
          </button>
          <button className="btn sm" disabled={n > held} onClick={() => send({ type: 'sellStock', ticker, shares: n })}>
            Sell
          </button>
        </span>
      </div>
      <div className="row between small">
        <span className="row">
          Trigger $<input type="number" step={0.01} value={trigger} onChange={(e) => setTrigger(Number(e.target.value))} style={{ width: 80 }} />
        </span>
        <span className="row">
          <button className="btn sm" disabled={n > held} onClick={() => send({ type: 'placeOrder', ticker, kind: 'stopLoss', trigger, shares: n })}>
            Stop-loss
          </button>
          <button className="btn sm" disabled={n > held} onClick={() => send({ type: 'placeOrder', ticker, kind: 'takeProfit', trigger, shares: n })}>
            Take profit
          </button>
          <button className="btn sm" onClick={() => send({ type: 'placeOrder', ticker, kind: 'buyBelow', trigger, shares: n })}>
            Buy below
          </button>
        </span>
      </div>
      <p className="small muted">Orders fill on the weekly close, so a stop can fill below its trigger after a sharp drop.</p>
    </div>
  );
}

function Ipo({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const [pct, setPct] = useState(25);
  const [payout, setPayout] = useState(Math.round((g.ipo?.payout ?? 0) * 100));
  if (g.ipo) {
    const ipo = g.ipo;
    return (
      <div className="card">
        <h3>{g.companyName} on the market</h3>
        <div className="grid3">
          <div className="stat">
            <div className="k">Share price</div>
            <div className="v">{$2(ipo.price)}</div>
          </div>
          <div className="stat">
            <div className="k">Market value</div>
            <div className="v">{$(ipo.price * ipo.shares)}</div>
          </div>
          <div className="stat">
            <div className="k">You own</div>
            <div className="v">{Math.round(ipo.ownership * 100)}%</div>
          </div>
        </div>
        <LineChart labels={ipo.history.map((_, i) => `w${i}`)} series={[{ name: 'Share price', color: LAYER.silicon, values: ipo.history }]} format={(v) => `$${v.toFixed(2)}`} zero={false} height={120} />
        <div className="field">
          <label>Dividend payout: {payout}% of quarterly profit</label>
          <input type="range" min={0} max={80} value={payout} onChange={(e) => setPayout(Number(e.target.value))} />
          <button className="btn sm" onClick={() => send({ type: 'setPayout', payout: payout / 100 })}>
            Set payout
          </button>
        </div>
      </div>
    );
  }
  const err = v2.ipoCheck(g);
  const val = v2.ipoValuation(g);
  return (
    <div className="card">
      <h3>Go public</h3>
      <p className="small muted">
        Sell part of the company on the stock market. Half the money goes to the company (new shares), half to you (your own shares). You need a CFO, {v2.IPO.quarters} profitable quarters in a row and {$(v2.IPO.revenue)} a year in sales.
      </p>
      {err ? (
        <p className="small neg">{err}</p>
      ) : (
        <>
          <p className="small">Valuation today: {$(val)}</p>
          <input type="range" min={10} max={49} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
          <div className="row between">
            <b>
              Sell {pct}% · raise {$(val * (pct / 100) * (1 - v2.IPO.fee))}
            </b>
            <button className="btn primary" onClick={() => confirm(`Take ${g.companyName} public, selling ${pct}%?`) && send({ type: 'ipo', percent: pct / 100 })}>
              Go public
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Loans, sales offices and the HR department, on the Company tab. */
export function GrowCards({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const [amount, setAmount] = useState(0);
  const limit = v2.loanLimit(g);
  const nextHr = v2.HR_LEVELS[g.hr + 1];
  return (
    <>
      <div className="card">
        <h3>Sales offices</h3>
        <p className="small muted">You sell in North America. Offices let the rest of the world buy: you reach {Math.round(v2.reach(g) * 100)}% of buyers today.</p>
        {v2.REGIONS.filter((r) => r.id !== 'na').map((r) => (
          <div key={r.id} className="row between small">
            <span>
              {r.name} <span className="muted">(+{Math.round((r.weight / v2.WORLD_WEIGHT) * 100)}% of buyers)</span>
            </span>
            {g.offices.includes(r.id) ? (
              <span className="up">Open · {$(v2.officeMonthly(g, r))}/mo</span>
            ) : (
              <button className="btn sm" disabled={g.cash < v2.officeCost(g, r)} onClick={() => send({ type: 'openOffice', region: r.id })}>
                Open ({$(v2.officeCost(g, r))}, then {$(v2.officeMonthly(g, r))}/mo)
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="row between">
          <h3>Bank loans</h3>
          <span className="small muted">base rate {(g.baseRate * 100).toFixed(1)}%</span>
        </div>
        <p className="small muted">
          Borrow up to {v2.LOANS.multiple}× a year of profit, repaid monthly over {v2.LOANS.termMonths / 12} years. You can borrow {$(limit)} at {(v2.loanRate(g) * 100).toFixed(1)}%.
        </p>
        {g.loans.map((l) => (
          <div key={l.id} className="row between small">
            <span>
              {$(l.left)} left · {(l.rate * 100).toFixed(1)}% · {$(l.monthly)}/mo
            </span>
            <button className="btn sm ghost" disabled={g.cash < l.left} onClick={() => send({ type: 'repayLoan', id: l.id })}>
              Pay off
            </button>
          </div>
        ))}
        {limit > 0 && (
          <div className="row between">
            <input type="range" min={0} max={Math.round(limit)} step={Math.max(1000, Math.round(limit / 100))} value={Math.min(amount, limit)} onChange={(e) => setAmount(Number(e.target.value))} />
            <button className="btn sm" disabled={!(amount > 0)} onClick={() => send({ type: 'takeLoan', amount: Math.min(amount, limit) })}>
              Borrow {$(Math.min(amount, limit))}
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <div className="row between">
          <h3>HR department</h3>
          <span className="small muted">level {g.hr}</span>
        </div>
        <p className="small muted">
          {g.hr ? `Morale +${v2.hrLevel(g).morale}, ${Math.round((1 - v2.hrLevel(g).quit) * 100)}% fewer people quit, better candidates. ${$(v2.hrPrice(g, g.hr)?.monthly ?? 0)}/mo.` : 'Happier people, fewer leaving, better candidates.'}
        </p>
        {nextHr && (
          <button className="btn sm" disabled={g.cash < (v2.hrPrice(g, g.hr + 1)?.cost ?? 0)} onClick={() => send({ type: 'upgradeHr' })}>
            {g.hr ? 'Upgrade' : 'Open'} HR level {nextHr.level} ({$(v2.hrPrice(g, g.hr + 1)?.cost ?? 0)}, then {$(v2.hrPrice(g, g.hr + 1)?.monthly ?? 0)}/mo)
          </button>
        )}
      </div>
    </>
  );
}
