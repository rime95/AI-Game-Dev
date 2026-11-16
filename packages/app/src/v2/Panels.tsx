import { useState } from 'react';
import { content } from '@stm/content';
import { templateDef, v2 } from '@stm/sim';
import { useStore } from '../store';
import { LAYER } from '../ui/layers';
import { BoxArt } from './art/BoxArt';
import { StatStrip } from './kit';
import { Bars, LineChart, OWNER_COLORS, Sparkline } from './charts';
import { GrowCards } from './Wealth';

type G = v2.GameV2;
const $ = v2.moneyV2;

// ---------------------------------------------------------------- Company

/** Why the numbers moved last month, built only from what the simulation recorded. */
function explain(g: G): string[] {
  const out: string[] = [];
  const [prev, last] = g.books.slice(-2);
  if (!last) return ['The first month isn’t over yet.'];
  if (prev && prev.revenue > 0) {
    const d = (last.revenue - prev.revenue) / prev.revenue;
    out.push(`Revenue ${d >= 0 ? 'rose' : 'fell'} ${Math.abs(Math.round(d * 100))}% to ${$(last.revenue)}.`);
  } else out.push(`Revenue: ${$(last.revenue)}.`);
  const from = g.day - (g.day % 30) - 30;
  const lines = g.log.filter((l) => l.day >= from && l.day < from + 30);
  const launches = lines.filter((l) => l.text.includes(' launched at '));
  if (launches.length) out.push(`You launched ${launches.length} chip${launches.length > 1 ? 's' : ''}.`);
  const rivals = lines.filter((l) => l.tone === 'rival' && (l.text.includes(' launched the ') || l.text.includes(' cut the price')));
  for (const r of rivals.slice(0, 3)) out.push(r.text);
  const [m1, m2] = g.history.monthly.slice(-2);
  if (m1 && m2)
    for (const id of Object.keys(m2.share)) {
      const d = (m2.share[id] ?? 0) - (m1.share[id] ?? 0);
      if (Math.abs(d) >= 0.03) out.push(`Your share of ${v2.market(id).name} ${d > 0 ? 'grew' : 'shrank'} ${Math.abs(Math.round(d * 100))} points.`);
    }
  const old = v2.activeProducts(g).filter((p) => g.day - p.launchDay > 540);
  if (old.length === 1) out.push(`${old[0]!.name} is over 18 months old and slipping behind the market.`);
  else if (old.length > 1)
    out.push(`${old.length} chips are over 18 months old and slipping behind the market${old.length > 3 ? '; retire the ones a newer chip has replaced (a CMO on autopilot does it)' : ''}.`);
  const costs = last.salaries + last.facilities + last.projects + last.marketing + last.hiring + (last.research ?? 0) + (last.tax ?? 0) + last.other + last.cogs;
  out.push(`Costs ${$(costs)}: salaries ${$(last.salaries)}, chips made ${$(last.cogs)}${last.projects ? `, masks ${$(last.projects)}` : ''}${last.marketing ? `, marketing ${$(last.marketing)}` : ''}.`);
  return out;
}

export function CompanyPanel({ g }: { g: G }) {
  const ch = v2.CHAPTERS[g.chapter.index];
  const last = g.books[g.books.length - 1];
  return (
    <>
      {ch ? (
        <div className="card chapter-card" style={{ ['--c' as string]: LAYER.gold }}>
          <div className="row between">
            <h3>
              Chapter {g.chapter.index + 1}: {ch.name}
            </h3>
            <span className="muted small">
              {g.chapter.index + 1} of {v2.CHAPTERS.length}
            </span>
          </div>
          <div className="sub">{ch.blurb}</div>
          <ul className="goal-list">
            {ch.goals.map((goal) => (
              <li key={goal.id} className={`goal${g.chapter.done.includes(goal.id) ? ' ok' : ''}`}>
                {g.chapter.done.includes(goal.id) ? '✓' : '○'} {goal.label}
              </li>
            ))}
          </ul>
          <div className="small">
            Reward:{' '}
            {[ch.reward.cash && $(ch.reward.cash), ch.reward.research && `${ch.reward.research} research points`, ch.reward.brand && `+${ch.reward.brand} brand`].filter(Boolean).join(' · ')}
          </div>
        </div>
      ) : (
        <div className="card chapter-card">
          <h3>Every chapter done</h3>
          <p className="small">The industry is yours. Keep pushing the frontier.</p>
        </div>
      )}
      <div className="card">
        <h3>Last month</h3>
        <ul className="explain">
          {explain(g).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {last && (
          <div className="grid3">
            <div className="stat">
              <div className="k">Revenue</div>
              <div className="v">{$(last.revenue)}</div>
            </div>
            <div className="stat">
              <div className="k">Profit</div>
              <div className={`v ${last.profit < 0 ? 'neg' : 'up'}`}>{$(last.profit)}</div>
            </div>
            <div className="stat">
              <div className="k">Cash</div>
              <div className="v">{$(last.cash)}</div>
            </div>
          </div>
        )}
      </div>
      <InvestorCard g={g} />
      <CfoCard g={g} />
      <GrowCards g={g} />
      <div className="card">
        <h3>News</h3>
        <div className="log">
          {[...g.log]
            .reverse()
            .slice(0, 18)
            .map((l, i) => (
              <div key={i} className={`e ${l.tone}`}>
                <span className="muted small">{v2.dateLabel(l.day)}</span> {l.text}
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Products

export function ProductsPanel({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const openWizard = useStore((s) => s.openWizard);
  const onSale = v2.activeProducts(g);
  const retired = g.products.filter((p) => p.retiredDay !== undefined);
  const showcase = useStore((s) => s.showcase);
  const setShowcase = useStore((s) => s.setShowcase);
  if (!g.products.length) return <div className="empty">Nothing on the shelf yet. Design your first chip in the Studio.</div>;
  const shelf = [...onSale].sort((a, b) => b.launchDay - a.launchDay).slice(0, 12);
  return (
    <>
      <div className="shelf">
        {shelf.map((p) => (
          <button key={p.id} className="shelf-item" aria-pressed={showcase === p.id} onClick={() => setShowcase(showcase === p.id ? null : p.id)} title="Show it in 3D">
            <BoxArt product={p} company={g.companyName} width={124} />
            <small>{v2.monthLabelV2(p.launchDay)}</small>
          </button>
        ))}
      </div>
      {onSale.map((p) => {
        const now = v2.currentScore(p, g.day);
        const fair = v2.fairPrice(p.marketId, now);
        const share = g.markets.find((m) => m.id === p.marketId)?.shares.you ?? 0;
        const ratio = p.price / fair;
        return (
          <div key={p.id} className="card">
            <div className="row between">
              <h3>{p.name}</h3>
              <span className="chip" style={{ ['--c' as string]: now >= 7 ? LAYER.silicon : now >= 5.5 ? LAYER.models : LAYER.products }}>
                {p.score.toFixed(1)} → {now.toFixed(1)} today
              </span>
            </div>
            <div className="sub">
              {v2.market(p.marketId).name} · launched {v2.monthLabelV2(p.launchDay)} · {Math.round(share * 100)}% of the market
            </div>
            <div className="grid3">
              <div className="stat">
                <div className="k">Sells a day</div>
                <div className="v">{Math.round(p.rate).toLocaleString('en-US')}</div>
              </div>
              <div className="stat">
                <div className="k">Revenue</div>
                <div className="v">{$(p.revenue)}</div>
              </div>
              <div className="stat">
                <div className="k">Profit</div>
                <div className="v">{$(p.profit)}</div>
              </div>
            </div>
            <div className="row between">
              <span className="small">
                Price <b>{$(p.price)}</b> <span className="muted">(fair {$(fair)}, {ratio > 1.1 ? 'above' : ratio < 0.9 ? 'below' : 'about fair'})</span>
              </span>
              <span className="row">
                <button className="btn sm" onClick={() => send({ type: 'setPrice', productId: p.id, price: Math.max(1, Math.round(p.price * 0.92)) })}>
                  −8%
                </button>
                <button className="btn sm" onClick={() => send({ type: 'setPrice', productId: p.id, price: Math.round(fair) })}>
                  Fair
                </button>
                <button className="btn sm" onClick={() => send({ type: 'setPrice', productId: p.id, price: Math.round(p.price * 1.08) })}>
                  +8%
                </button>
              </span>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => openWizard(p.id)} title="Starts from this die layout and keeps its learnings: +5% performance, fewer bugs, 40% less design work.">
                Build on this
              </button>
              <button className="btn sm ghost" onClick={() => send({ type: 'retireProduct', productId: p.id })}>
                Retire
              </button>
            </div>
          </div>
        );
      })}
      {retired.length > 0 && (
        <div className="card">
          <h3>Retired</h3>
          <table className="t">
            <tbody>
              {retired.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.score.toFixed(1)}</td>
                  <td>{Math.round(p.units).toLocaleString('en-US')} sold</td>
                  <td>{$(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Markets and rivals

export function MarketsPanel({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const plans = v2.visiblePlans(g);
  const moodLabel: Record<v2.Mood, string> = { confident: 'Confident', rattled: 'Rattled', desperate: 'Desperate', forSale: 'Looking for a buyer' };
  const reachNow = v2.reach(g);
  return (
    <>
      <Supply g={g} />
      <div className="card">
        <h3>Launch calendar</h3>
        {plans.length === 0 && <p className="small muted">No rival launches announced.</p>}
        {plans.map((p) => (
          <div key={`${p.rivalId}-${p.marketId}`} className="row between small">
            <span>
              <i className="swatch" style={{ background: OWNER_COLORS[p.rivalId] }} /> <b>{p.rival}</b> {p.name} · {v2.market(p.marketId).name}
            </span>
            <span className="muted">
              in {Math.max(0, Math.round((p.launchDay - g.day) / 30))} mo · about {p.estimate.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      {g.markets.map((ms) => {
        const m = v2.market(ms.id);
        const owners = Object.entries(ms.shares).sort((a, b) => b[1] - a[1]);
        const best = v2.playerBest(g, ms.id);
        const rivalRows = g.rivals.flatMap((r) => r.products.filter((p) => p.marketId === ms.id).map((p) => ({ r, p, score: v2.rivalScore(g, p) }))).sort((a, b) => b.score - a.score);
        return (
          <div key={ms.id} className="card">
            <div className="row between">
              <h3>{m.name}</h3>
              <span className="muted small">{Math.round(ms.size).toLocaleString('en-US')} chips a day</span>
            </div>
            <div className="stack">
              {owners.map(([o, v]) => (
                <span key={o} style={{ width: `${v * 100}%`, background: OWNER_COLORS[o] ?? '#53608a' }} title={`${o === 'you' ? 'You' : o === 'others' ? 'Small makers' : g.rivals.find((r) => r.id === o)?.name}: ${Math.round(v * 100)}%`} />
              ))}
            </div>
            <table className="t">
              <tbody>
                {best !== null && (
                  <tr className="you">
                    <td>You</td>
                    <td>{best.toFixed(1)}</td>
                    <td title="Share of the whole world market (and of the buyers who can get your chips)">
                      {Math.round((ms.shares.you ?? 0) * 100)}%{reachNow < 0.999 && <span className="muted"> · {Math.round(((ms.shares.you ?? 0) / reachNow) * 100)}% where you sell</span>}
                    </td>
                  </tr>
                )}
                {rivalRows.map(({ r, p, score }) => (
                  <tr key={r.id}>
                    <td>
                      <i className="swatch" style={{ background: OWNER_COLORS[r.id] }} /> {r.name} {p.name}
                    </td>
                    <td>
                      {score.toFixed(1)}
                      {best !== null && best - score < 0.5 && <span className="neg small"> close!</span>}
                    </td>
                    <td>{Math.round((ms.shares[r.id] ?? 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="card">
        <h3>Rivals</h3>
        {g.rivals
          .filter((r) => v2.rivalActive(g, r) && !r.acquired)
          .map((r) => (
            <div key={r.id} className="rival-row">
              <div className="row between">
                <b>
                  <i className="swatch" style={{ background: OWNER_COLORS[r.id] }} /> {r.name}
                </b>
                <span className={`chip mood-${r.mood}`}>{moodLabel[r.mood]}</span>
              </div>
              <div className="small muted">
                CEO {r.ceo} · brand {r.brand.toFixed(1)} · strength {Math.round(r.strength)}
                {r.truceUntil > g.day ? ` · truce until ${v2.monthLabelV2(r.truceUntil)}` : ''}
              </div>
              <button
                className="btn sm"
                disabled={g.cash < v2.takeoverPrice(g, r)}
                onClick={() => confirm(`Buy ${r.name} for ${$(v2.takeoverPrice(g, r))}?`) && send({ type: 'acquireRival', rivalId: r.id })}
              >
                Buy {r.name} ({$(v2.takeoverPrice(g, r))})
              </button>
            </div>
          ))}
        <p className="small muted">Rivals push hard, but never get ahead of your best chip. Beat them on sales and they lose heart, get cheaper to buy, and in the end put themselves up for sale.</p>
      </div>
      {g.rivals.some((r) => r.acquired) && (
        <div className="card chapter-card" style={{ ['--c' as string]: LAYER.gold }}>
          <h3>Trophy wall</h3>
          {g.rivals
            .filter((r) => r.acquired)
            .map((r) => (
              <div key={r.id} className="rival-row">
                <b>🏆 {r.name}</b> <span className="muted small">bought {v2.monthLabelV2(r.acquiredDay ?? 0)}</span>
                <div className="small">
                  {r.ceo}: “{r.farewell}”
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Team

export function TeamPanel({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const cap = v2.capacity(g, content);
  const traitName = (id: string) => v2.TRAITS.find((t) => t.id === id);
  const taskLabel = (t: string | null) => (t === null ? 'Free' : t === 'research' ? 'Research' : g.projects.find((p) => p.id === t)?.name ?? 'Work');
  return (
    <>
      <div className="card">
        <div className="row between">
          <h3>
            People {g.staff.length}/{cap}
          </h3>
          <span className="muted small">Salaries {$(v2.salaryBill(g))}/mo</span>
        </div>
        {g.staff.length >= cap && <p className="small neg">Every desk is taken. Build a desk pod in HQ to hire more.</p>}
      </div>
      {g.staff.map((p) => (
        <div key={p.id} className="card person">
          <div className="row between">
            <b>
              {p.name} <span className="muted small">level {p.level}</span>
            </b>
            <select value={p.task ?? ''} onChange={(e) => send({ type: 'assign', personId: p.id, task: e.target.value || null })}>
              <option value="">Free</option>
              <option value="research">Research</option>
              {g.projects
                .filter((x) => x.phase === 'architecture' || x.phase === 'verification')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="skills">
            {(['design', 'eng', 'research'] as v2.Skill[]).map((k) => (
              <div key={k} className="skill">
                <span>{k === 'eng' ? 'Engineering' : k[0]!.toUpperCase() + k.slice(1)}</span>
                <span className="bar">
                  <div style={{ width: `${p.skills[k] * 10}%` }} />
                </span>
                <b>{p.skills[k]}</b>
                {p.skills[k] < 10 && (
                  <button className="btn sm ghost" title={`Train: ${$(v2.T.trainingCost * p.skills[k])}`} onClick={() => send({ type: 'train', personId: p.id, skill: k })}>
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="chips">
            {p.traits.map((t) => (
              <span key={t} className="chip" title={traitName(t)?.blurb} style={{ ['--c' as string]: LAYER.models }}>
                {traitName(t)?.name}
              </span>
            ))}
          </div>
          <div className="row between small">
            <span>
              {taskLabel(p.task)} · morale {Math.round(p.morale)} · burnout <span className={p.burnout > 60 ? 'neg' : ''}>{Math.round(p.burnout)}</span>
            </span>
            <span className="muted">{p.founder ? 'Founder' : `${$(p.salary)}/mo`}</span>
          </div>
          {!p.founder && (
            <button className="btn sm ghost" onClick={() => confirm(`Let ${p.name} go? It costs a month’s pay.`) && send({ type: 'fire', personId: p.id })}>
              Let go
            </button>
          )}
        </div>
      ))}
      <Executives g={g} />
      <div className="card">
        <div className="row between">
          <h3>Candidates</h3>
          <button className="btn sm" onClick={() => send({ type: 'postJobAd' })}>
            New job ad ({$(v2.T.jobAdCost)})
          </button>
        </div>
        {g.candidates.length === 0 && <p className="small muted">No one is applying. Post a job ad.</p>}
        {g.candidates.map((c) => (
          <div key={c.id} className="candidate">
            <div className="row between">
              <b>
                {c.name} <span className="muted small">level {c.level}</span>
              </b>
              <button className="btn sm primary" disabled={g.staff.length >= cap} onClick={() => send({ type: 'hire', candidateId: c.id })}>
                Hire ({$(c.fee)})
              </button>
            </div>
            <div className="small">
              Design {c.skills.design} · Engineering {c.skills.eng} · Research {c.skills.research} · {$(c.salary)}/mo
            </div>
            <div className="chips">
              {c.traits.map((t) => (
                <span key={t} className="chip" title={traitName(t)?.blurb} style={{ ['--c' as string]: LAYER.models }}>
                  {traitName(t)?.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Research

export function ResearchPanel({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const cur = g.research.current ? v2.tech(g.research.current) : null;
  const researchers = g.staff.filter((p) => p.task === 'research');
  const available = v2.TECHS.filter((t) => v2.techAvailable(g, t));
  const locked = v2.TECHS.filter((t) => !g.research.done.includes(t.id) && !v2.techAvailable(g, t));
  const done = v2.TECHS.filter((t) => g.research.done.includes(t.id));
  const rate = researchers.reduce((n, p) => n + v2.T.researchPerDay * (p.skills.research / 5), 0) + v2.rdPointsPerDay(g.rdBudget ?? 0);
  return (
    <>
      <div className="card">
        <div className="row between">
          <h3>Research</h3>
          <span className="muted small">{Math.floor(g.research.points)} points banked</span>
        </div>
        <p className="small muted">
          {researchers.length} researcher{researchers.length === 1 ? '' : 's'}{g.rdBudget ? ' and the R&D budget' : ''} ({(rate * 30).toFixed(1)} points a month). Every launch adds points too. There are no year gates: unlock the future as fast as you can.
        </p>
        {cur ? (
          <>
            <div className="row between">
              <b>{cur.name}</b>
              <span className="small">
                {Math.floor(g.research.progress)}/{cur.cost}
              </span>
            </div>
            <div className="bar" style={{ ['--c' as string]: LAYER.models }}>
              <div style={{ width: `${(g.research.progress / cur.cost) * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="small">Nothing being researched.</p>
        )}
      </div>
      <RdBudget g={g} />
      <div className="card">
        <h3>Can research now</h3>
        {available.map((t) => (
          <div key={t.id} className={`research-row row between${t.breakthrough ? ' ai' : ''}`}>
            <div>
              <b>{t.name}</b> {t.breakthrough && <span className="chip" style={{ ['--c' as string]: LAYER.models }}>Breakthrough</span>}
              <div className="small muted">{t.effects.join(' · ')}</div>
            </div>
            <button className="btn sm" aria-pressed={g.research.current === t.id} onClick={() => send({ type: 'research', nodeId: t.id })}>
              {g.research.current === t.id ? 'Researching' : `${t.cost} pts`}
            </button>
          </div>
        ))}
      </div>
      {locked.length > 0 && (
        <div className="card">
          <h3>Later</h3>
          {locked.map((t) => (
            <div key={t.id} className="research-row">
              <b className="muted">{t.name}</b> {t.breakthrough && <span className="chip">Breakthrough</span>}
              <div className="small muted">
                Needs {t.requires.map((r) => v2.tech(r).name).join(' + ')} · {t.cost} pts
              </div>
            </div>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="card">
          <h3>Done</h3>
          <div className="chips">
            {done.map((t) => (
              <span key={t.id} className="chip" style={{ ['--c' as string]: LAYER.silicon }}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Stats

export function StatsPanel({ g }: { g: G }) {
  const [view, setView] = useState<'money' | 'markets' | 'rivals' | 'people' | 'products'>('money');
  const monthly = g.history.monthly;
  const labels = monthly.map((s) => v2.monthLabelV2(s.day - 1).replace(/^(\w{3})\w* /, '$1 '));
  const books = g.books.slice(-18);
  return (
    <>
      <div className="seg sm">
        {(['money', 'markets', 'rivals', 'people', 'products'] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      {view === 'money' && (
        <>
          <div className="card">
            <h3>Cash</h3>
            <LineChart labels={g.history.weekly.map((w) => v2.dateLabel(w.day))} series={[{ name: 'Cash', color: LAYER.gold, values: g.history.weekly.map((w) => w.cash) }]} format={(v) => $(v)} />
          </div>
          <div className="card">
            <h3>Revenue and profit, by month</h3>
            <Bars labels={books.map((b) => v2.monthLabelV2(b.month * 30))} a={books.map((b) => b.revenue)} b={books.map((b) => b.profit)} names={['Revenue', 'Profit']} format={(v) => $(v)} />
          </div>
          <div className="card">
            <h3>Statement</h3>
            <Statement g={g} />
          </div>
        </>
      )}
      {view === 'markets' && (
        <div className="card">
          <h3>Your market share</h3>
          <LineChart
            labels={labels}
            series={g.markets.map((m, i) => ({ name: v2.market(m.id).name, color: Object.values(OWNER_COLORS)[i % 10]!, values: monthly.map((s) => (s.share[m.id] ?? 0) * 100) }))}
            format={(v) => `${v.toFixed(0)}%`}
          />
        </div>
      )}
      {view === 'rivals' && (
        <div className="card">
          <h3>Your lead over the best rival (review points)</h3>
          <LineChart
            labels={labels}
            series={g.markets.map((m, i) => ({ name: v2.market(m.id).name, color: Object.values(OWNER_COLORS)[i % 10]!, values: monthly.map((s) => s.gap[m.id] ?? NaN) }))}
            format={(v) => v.toFixed(1)}
          />
          <p className="small muted">Above zero means you lead. Rivals never pass you, but the closer they get, the more sales they take.</p>
        </div>
      )}
      {view === 'people' && (
        <div className="card">
          <h3>Headcount and morale</h3>
          <LineChart
            labels={labels}
            series={[
              { name: 'People', color: LAYER.gold, values: monthly.map((s) => s.headcount) },
              { name: 'Morale', color: LAYER.silicon, values: monthly.map((s) => s.morale) },
            ]}
          />
        </div>
      )}
      {view === 'products' && (
        <div className="card">
          <h3>Every chip you shipped</h3>
          <table className="t">
            <thead>
              <tr>
                <th>Chip</th>
                <th>Review</th>
                <th>Sold</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {[...g.products].reverse().map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <div className="small muted">
                      {v2.market(p.marketId).name} · {v2.monthLabelV2(p.launchDay)}
                    </div>
                  </td>
                  <td>{p.score.toFixed(1)}</td>
                  <td>{Math.round(p.units).toLocaleString('en-US')}</td>
                  <td className={p.profit < 0 ? 'neg' : ''}>{$(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid3">
            <div className="stat">
              <div className="k">Best review</div>
              <div className="v">{g.records.bestScore.toFixed(1)}</div>
            </div>
            <div className="stat">
              <div className="k">Peak cash</div>
              <div className="v">{$(g.records.peakCash)}</div>
            </div>
            <div className="stat">
              <div className="k">All-time sales</div>
              <div className="v">{$(g.acc.totalRevenue)}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Statement({ g }: { g: G }) {
  const [prev, last] = g.books.slice(-2);
  if (!last) return <p className="small muted">After the first month.</p>;
  const rows: [string, keyof v2.MonthBook, boolean][] = [
    ['Revenue', 'revenue', false],
    ['Chips made', 'cogs', true],
    ['Salaries', 'salaries', true],
    ['Office and rooms', 'facilities', true],
    ['Masks and projects', 'projects', true],
    ['Marketing', 'marketing', true],
    ['Hiring', 'hiring', true],
    ['R&D budget', 'research', true],
    ['Tax', 'tax', true],
    ['Other', 'other', true],
  ];
  return (
    <table className="t statement">
      <thead>
        <tr>
          <th />
          <th>{prev ? v2.monthLabelV2(prev.month * 30) : ''}</th>
          <th>{v2.monthLabelV2(last.month * 30)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, k, cost]) => (
          <tr key={k}>
            <td>{label}</td>
            <td>{prev ? (cost ? `(${$(prev[k] as number)})` : $(prev[k] as number)) : ''}</td>
            <td>{cost ? `(${$(last[k] as number)})` : $(last[k] as number)}</td>
          </tr>
        ))}
        <tr className="you">
          <td>Profit</td>
          <td>{prev ? $(prev.profit) : ''}</td>
          <td className={last.profit < 0 ? 'neg' : ''}>{$(last.profit)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- HQ

export function HqPanel({ g }: { g: G }) {
  const startBuild = useStore((s) => s.startBuild);
  const build = useStore((s) => s.build);
  const cancel = useStore((s) => s.cancelBuild);
  const send = useStore((s) => s.send);
  const stageIdx = content.hq.stages.findIndex((x) => x.id === g.hq.stage);
  const stage = content.hq.stages[stageIdx]!;
  const next = content.hq.stages[stageIdx + 1];
  const terms = next ? v2.stageTerms(next.id) : null;
  const fac = v2.facilitiesPerMonth(g, content);
  const rooms = content.hq.rooms.filter((r) => r.kind !== 'server' && (r.minStage ?? 0) <= stageIdx);
  return (
    <>
      <div className="card">
        <div className="row between">
          <h3>{stage.name}</h3>
          <span className="muted small">
            {g.staff.length}/{v2.capacity(g, content)} seats · {$(fac.rent + fac.upkeep)}/mo
          </span>
        </div>
        <p className="small muted">Desks and lab seats set how many people you can hire. Break rooms keep morale up.</p>
        {next && terms && (
          <button className="btn primary" disabled={g.cash < terms.moveCost} onClick={() => send({ type: 'moveHq' })}>
            Move to the {next.name.toLowerCase()} ({$(terms.moveCost)}, then {$(terms.rentPerMonth)}/mo)
          </button>
        )}
      </div>
      <Facilities g={g} />
      <div className="card">
        <div className="row between">
          <h3>Build</h3>
          {build && (
            <button className="btn sm" onClick={cancel}>
              Stop building (Esc)
            </button>
          )}
        </div>
        {rooms.map((r) => (
          <button key={r.id} className="build-item" aria-pressed={build?.templateId === r.id} onClick={() => startBuild(r.id)}>
            <span className="name">{r.name}</span>
            <span className="meta">
              {$(v2.roomPrice(r.cost))} · {r.desks ? `${r.desks} desks` : r.seats ? `${r.seats.count} seats` : r.serves ? `break space for ${r.serves}` : r.blurb}
            </span>
          </button>
        ))}
        <p className="small muted">Click a spot in the HQ to place it. R turns it.</p>
      </div>
      <div className="card">
        <h3>Rooms</h3>
        {g.hq.rooms.map((r) => (
          <div key={r.id} className="row between small">
            <span>{templateDef(content, r.templateId)?.name}</span>
            <button className="btn sm ghost" onClick={() => send({ type: 'demolishRoom', roomId: r.id })}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export { Sparkline };

/** Data centers, your own fab and the AGI program: the late game's strategic builds. */
function Facilities({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const setTab = useStore((s) => s.setTab2);
  const done = g.research.done;
  if (!done.includes('datacenters') && !done.includes('ownfab') && !done.includes('agi')) return null;
  const f = g.facilities;
  const nextFab = v2.FAC.fab[f.fab];
  const modelDemand = v2.modelProducts(g).reduce((n, p) => n + p.rate, 0);
  return (
    <div className="card">
      <h3>Strategic builds</h3>
      {done.includes('datacenters') && (
        <div className="exec">
          <div className="row between">
            <b>Data center campuses</b>
            <span className="small muted">
              {(g.compute?.campuses.length ?? 0)} campus{(g.compute?.campuses.length ?? 0) === 1 ? '' : 'es'} · {Math.round(v2.totalPf(g)).toLocaleString('en-US')} PF
            </span>
          </div>
          <div className="small muted">
            Your AI models train and serve on your campuses; fill them with your own accelerators for more compute per dollar.
            {modelDemand > 0 && ` Serving ${Math.round(modelDemand).toLocaleString('en-US')} AI customers a day.`}
          </div>
          <button className="btn sm" onClick={() => setTab('compute')}>
            Open Compute
          </button>
        </div>
      )}
      {done.includes('ownfab') && (
        <div className="exec">
          <div className="row between">
            <b>Your fab</b>
            <span className="small muted">{f.fab ? `Level ${f.fab}` : 'None yet'}</span>
          </div>
          <div className="small muted">
            {f.fab ? `Chips cost ${Math.round((1 - v2.unitCostMult(g)) * 100)}% less to make, masks ${Math.round((1 - v2.maskCostMult(g)) * 100)}% less.` : 'Make your own chips: cheaper to produce, cheaper masks.'}
          </div>
          {f.fabBuild && <div className="small">Building level {f.fabBuild.level}: ready {v2.dateLabel(f.fabBuild.doneDay)}</div>}
          {nextFab && !f.fabBuild && (
            <button className="btn sm" disabled={!!v2.buildError(g, 'fab')} title={v2.buildError(g, 'fab') ?? ''} onClick={() => send({ type: 'buildFab' })}>
              Build a level {nextFab.level} fab ({$(nextFab.cost)}, {nextFab.days} days)
            </button>
          )}
        </div>
      )}
      {done.includes('agi') && (
        <div className="exec">
          <div className="row between">
            <b>The AGI program</b>
            <span className="small muted">{g.agi ? `${Math.round(((g.agi.pfDays ?? 0) / (g.agi.need ?? 1)) * 100)}% trained` : 'not started'}</span>
          </div>
          <div className="small muted">
            The final training run. It needs {v2.FAC.agi.mw} MW of campuses and shares your training compute until it has had enough: the more and better your compute, the sooner. With alignment research and a trusted brand (55+) it ends safely; without, recklessly.
          </div>
          {g.agi ? (
            <div className="bar" style={{ ['--c' as string]: LAYER.models }}>
              <div style={{ width: `${Math.min(100, ((g.agi.pfDays ?? 0) / (g.agi.need ?? 1)) * 100)}%` }} />
            </div>
          ) : (
            <button className="btn primary sm" disabled={!!v2.buildError(g, 'agi')} title={v2.buildError(g, 'agi') ?? ''} onClick={() => confirm('Start the AGI program? This is the final chapter.') && send({ type: 'startAgi' })}>
              Start the AGI program ({$(v2.FAC.agi.cost)})
            </button>
          )}
          {v2.buildError(g, 'agi') && !g.agi && <div className="small neg">{v2.buildError(g, 'agi')}</div>}
        </div>
      )}
    </div>
  );
}

function InvestorCard({ g }: { g: G }) {
  const inv = g.investor;
  if (!inv) return null;
  const made = g.acc.totalRevenue - inv.startRevenue;
  return (
    <div className="card">
      <div className="row between">
        <h3>Investor target</h3>
        <span className="muted small">due {v2.dateLabel(inv.dueDay)}</span>
      </div>
      <div className="small">
        {$(made)} of {$(inv.target)} in sales
      </div>
      <div className="bar" style={{ ['--c' as string]: made >= inv.target ? LAYER.silicon : LAYER.gold }}>
        <div style={{ width: `${Math.min(100, (made / inv.target) * 100)}%` }} />
      </div>
    </div>
  );
}

function CfoCard({ g }: { g: G }) {
  const f = v2.cashForecast(g);
  const cfo = v2.execOf(g, 'cfo');
  if (!f || !cfo) return null;
  return (
    <div className="card">
      <div className="row between">
        <h3>CFO forecast</h3>
        <span className="muted small">
          {cfo.name} · {'★'.repeat(cfo.stars)}
        </span>
      </div>
      <div className="grid3">
        <div className="stat">
          <div className="k">Per month</div>
          <div className={`v ${f.monthly < 0 ? 'neg' : 'up'}`}>{$(f.monthly)}</div>
        </div>
        <div className="stat">
          <div className="k">Cash in 3 months</div>
          <div className={`v ${f.in3 < 0 ? 'neg' : ''}`}>{$(f.in3)}</div>
        </div>
        <div className="stat">
          <div className="k">In 6 months</div>
          <div className={`v ${f.in6 < 0 ? 'neg' : ''}`}>{$(f.in6)}</div>
        </div>
      </div>
      <p className="small muted">Based on the last three months, as things stand.</p>
    </div>
  );
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function Executives({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  return (
    <div className="card">
      <h3>Executives</h3>
      <p className="small muted">They take repeat work off your hands. Switch autopilot off to keep a job for yourself.</p>
      {v2.EXEC_ROLES.map((r) => {
        const e = v2.execOf(g, r.role);
        const pool = g.execPool.filter((c) => c.role === r.role);
        return (
          <div key={r.role} className="exec">
            <div className="row between">
              <b>{r.title}</b>
              {e && (
                <label className="check">
                  <input type="checkbox" checked={e.auto} onChange={(ev) => send({ type: 'setExecAuto', role: r.role, on: ev.target.checked })} />
                  Autopilot
                </label>
              )}
            </div>
            <div className="small muted">{r.does}</div>
            {e ? (
              <>
                <div className="small">
                  {e.name} · <span className="stars">{stars(e.stars)}</span> · {$(e.salary)}/mo{' '}
                  <button className="btn sm ghost" onClick={() => confirm(`Let ${e.name} go? Two months' pay.`) && send({ type: 'fireExec', role: r.role })}>
                    Let go
                  </button>
                </div>
                {e.lately.length > 0 && (
                  <ul className="lately">
                    {e.lately.slice(0, 3).map((l, i) => {
                      const [day, text] = l.split('|');
                      return (
                        <li key={i}>
                          <span className="muted">{v2.dateLabel(Number(day))}</span> {text}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              pool.map((c) => (
                <div key={c.id} className="row between small">
                  <span>
                    {c.name} · <span className="stars">{stars(c.stars)}</span> · {$(c.salary)}/mo
                  </span>
                  <button className="btn sm" disabled={g.cash < c.fee} onClick={() => send({ type: 'hireExec', candidateId: c.id })}>
                    Hire ({$(c.fee)})
                  </button>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Turn cash into research: contract labs and university grants, with diminishing returns. */
function RdBudget({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const cur = g.rdBudget ?? 0;
  const sales = g.books[g.books.length - 1]?.revenue ?? 0;
  const steps = [0, 10_000, 50_000, 250_000, 1_000_000, 5_000_000, 25_000_000, 100_000_000].filter((b) => b === 0 || b === cur || b <= Math.max(10_000, sales * 0.5));
  return (
    <div className="card">
      <div className="row between">
        <h3>R&amp;D budget</h3>
        <span className="small muted">{cur ? `${$(cur)}/mo · +${Math.round(v2.rdPointsPerDay(cur) * 30)} pts/mo` : 'none'}</span>
      </div>
      <p className="small muted">Contract labs and university grants turn cash into research points, with diminishing returns. Paid daily; it pauses if cash runs short.</p>
      <div className="row wrap">
        {steps.map((b) => (
          <button key={b} className={`btn sm${b === cur ? '' : ' ghost'}`} onClick={() => send({ type: 'setRdBudget', amount: b })}>
            {b ? `${$(b)} · +${Math.round(v2.rdPointsPerDay(b) * 30)}` : 'Off'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Chip supply: the foundry allotment against what buyers want, and where you can sell. */
function Supply({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const fd = g.foundry ?? { capacity: v2.T.foundry.start, demand: 0 };
  const use = fd.demand / Math.max(1, fd.capacity);
  const short = fd.demand > fd.capacity * 1.02;
  const step = Math.max(500, Math.round((fd.capacity * 0.25) / 100) * 100);
  const cost = step * v2.T.foundry.pricePerChip;
  const reachNow = v2.reach(g);
  return (
    <div className="card">
      <StatStrip
        items={[
          { k: 'Can make', v: `${Math.round(fd.capacity).toLocaleString('en-US')}/day` },
          { k: 'Buyers want', v: `${Math.round(fd.demand).toLocaleString('en-US')}/day`, bar: Math.min(1, use), tone: short ? 'neg' : undefined },
          { k: 'You reach', v: `${Math.round(reachNow * 100)}%`, bar: reachNow },
        ]}
      />
      <p className="small muted">
        {short
          ? `The foundry can't keep up: ${Math.round(fd.demand - fd.capacity).toLocaleString('en-US')} chips a day of demand go to rivals. Book more wafers, or wait: the allotment grows while you use it all.`
          : 'The foundry makes everything buyers want. Your allotment grows while you use it fully.'}
        {reachNow < 0.999 && ` You sell to ${Math.round(reachNow * 100)}% of the world's buyers; sales offices (Company tab) open the rest.`}
      </p>
      <button className="btn sm" disabled={g.cash < cost} onClick={() => send({ type: 'bookCapacity', chips: step })}>
        Book {step.toLocaleString('en-US')} more chips a day · {$(cost)}
      </button>
    </div>
  );
}
