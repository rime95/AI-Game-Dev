import { useEffect, useState } from 'react';
import { v2 } from '@stm/sim';
import { useStore } from '../store';
import { LAYER } from '../ui/layers';

type G = v2.GameV2;

/** A decision card. It waits for you; every choice states its numbers. */
export function CardModal2({ card }: { g: G; card: v2.PendingCard }) {
  const send = useStore((s) => s.send2);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      const c = card.choices[i];
      if (c) send({ type: 'resolveCard', cardId: card.id, choiceId: c.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, send]);
  return (
    <div className="overlay" role="dialog" aria-label={card.title}>
      <div className="modal" style={{ ['--c' as string]: LAYER.gold }}>
        <div className="media">
          <div className="tag">{card.speaker ?? 'A decision'}</div>
          <h2>{card.title}</h2>
        </div>
        <div className="body">
          <p>{card.body}</p>
          {card.choices.map((c, i) => (
            <button key={c.id} className="choice" onClick={() => send({ type: 'resolveCard', cardId: card.id, choiceId: c.id })}>
              <span className="label">
                <kbd>{i + 1}</kbd> {c.label}
              </span>
              <span className="detail">{c.detail}</span>
            </button>
          ))}
          <p className="small muted">The clock waits until you choose.</p>
        </div>
      </div>
    </div>
  );
}

/** Launch day: the magazines review the chip one by one, then the average and the reception. */
export function Review2({ g }: { g: G }) {
  const id = useStore((s) => s.review2);
  const close = useStore((s) => s.closeReview2);
  const p = g.products.find((x) => x.id === id);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!p) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(p.reviews.length + 1);
    const timers = Array.from({ length: p.reviews.length + 1 }, (_, i) => setTimeout(() => setShown(i + 1), 450 + i * 550));
    return () => timers.forEach(clearTimeout);
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const done = shown > p.reviews.length;
  const great = p.score >= 8;
  const ring = 2 * Math.PI * 40;
  const verdict = p.score >= 8 ? { label: 'Hit', color: LAYER.silicon } : p.score >= 6.5 ? { label: 'Solid', color: LAYER.models } : p.score >= 5 ? { label: 'Mixed', color: LAYER.power } : { label: 'Flop', color: '#ff7b8a' };
  const m = v2.market(p.marketId);
  const known = g.notebook.tastes[p.marketId] ?? [];
  const learned = known[known.length - 1];
  return (
    <div className="milestone" role="dialog" aria-label={`Reviews for ${p.name}`}>
      <div className="milestone-card review-card" style={{ ['--c' as string]: great ? LAYER.gold : LAYER.silicon }}>
        <div className="ms-mast">
          <span>THE REVIEWS ARE IN</span>
          <span>{v2.monthLabelV2(p.launchDay)}</span>
        </div>
        <div className="rv-head">
          <span className="rv-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4" />
            </svg>
          </span>
          <div>
            <h2>Launch day: {p.name}</h2>
            <p>
              {v2.kind(p.kind).name} for {m.name} · {v2.node(p.nodeId).name} · {v2.moneyV2(p.price)}
            </p>
          </div>
        </div>
        <div className="rv-grid">
          {p.reviews.map((r, i) => (
            <div key={r.outlet} className={`rv-tile${i < shown ? ' in' : ''}`}>
              <div className="rv-top">
                <span className="rv-logo" aria-hidden="true">
                  {r.outlet.charAt(0)}
                </span>
                <span className="rv-name">{r.outlet}</span>
                <span className="rv-score">
                  {i < shown ? r.score : '?'}
                  <small>/10</small>
                </span>
              </div>
              <p className="rv-quote">{i < shown ? `“${r.quote}”` : 'Reading…'}</p>
            </div>
          ))}
        </div>
        <div className="rv-foot">
          <div className="rv-avg">
            <span>Average score</span>
            <span className="rv-ring">
              <svg viewBox="0 0 92 92" aria-hidden="true">
                <defs>
                  <linearGradient id="rv2-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={LAYER.silicon} />
                    <stop offset="1" stopColor={LAYER.models} />
                  </linearGradient>
                </defs>
                <circle className="track" cx="46" cy="46" r="40" />
                <circle className="fill" cx="46" cy="46" r="40" stroke="url(#rv2-grad)" strokeDasharray={`${done ? (p.score / 10) * ring : 0} ${ring}`} />
              </svg>
              <b>
                {done ? p.score.toFixed(1) : '–'}
                <small>/10</small>
              </b>
            </span>
          </div>
          <i aria-hidden="true" />
          <div className="rv-rec">
            <span className="k">Reception</span>
            {done ? (
              <>
                <span className="rv-pill" style={{ ['--rc' as string]: verdict.color }}>
                  {verdict.label}
                </span>
                <p>
                  {p.bugsShipped > 0 ? `Shipped with ${p.bugsShipped} known or hidden bug${p.bugsShipped > 1 ? 's' : ''}. ` : 'Clean silicon. '}
                  {learned ? `You learned: ${m.name} buyers care about ${v2.STAT_NAMES[learned].toLowerCase()}.` : ''}
                </p>
              </>
            ) : (
              <p>Waiting for the last review…</p>
            )}
          </div>
          {done && great && (
            <div className="confetti small" aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.08}s`, ['--h' as string]: `${(i * 53) % 360}` }} />
              ))}
            </div>
          )}
        </div>
        <div className="rv-actions">
          <button className="btn primary" disabled={!done} onClick={close}>
            {done ? 'Back to work →' : 'Reading the reviews…'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A breakthrough opens a new chapter of the story. */
export function Breakthrough2({ g }: { g: G }) {
  const id = useStore((s) => s.breakthrough2);
  const close = useStore((s) => s.closeBreakthrough2);
  if (!id) return null;
  const t = v2.tech(id);
  return (
    <div className="milestone" role="dialog" aria-label={t.name}>
      <div className="milestone-card" style={{ ['--c' as string]: LAYER.models }}>
        <div className="ms-mast">
          <span>BREAKTHROUGH</span>
          <span>{v2.monthLabelV2(g.day)}</span>
        </div>
        <h2>{t.breakthrough}</h2>
        <p>
          {g.companyName} cracked <b>{t.name}</b>.
        </p>
        <ul className="goal-list">
          {t.effects.map((e) => (
            <li key={e} className="goal ok">
              ✦ {e}
            </li>
          ))}
        </ul>
        <p className="small">Rivals will follow in a few months. You're ahead; stay there.</p>
        <button className="btn primary" onClick={close}>
          Let's build it
        </button>
      </div>
    </div>
  );
}
