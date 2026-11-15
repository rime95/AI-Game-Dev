import { useEffect, useState } from 'react';
import { content } from '@stm/content';
import type { GameState } from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { turnLabel } from './TimeControls';
import { LAYER } from './layers';

/**
 * Launch day in the chip-company years: the press reviews our new chip one magazine at a time,
 * then the average and how the launch landed with the buzz we built. Great chips get confetti.
 */
export function ReviewCard({ game }: { game: GameState }) {
  const id = useStore((s) => s.review);
  const close = useStore((s) => s.closeReview);
  const chip = game.founding?.products.find((c) => c.id === id);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!chip) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(chip.reviews.length + 1);
    const timers = Array.from({ length: chip.reviews.length + 1 }, (_, i) => setTimeout(() => setShown(i + 1), 450 + i * 550));
    return () => timers.forEach(clearTimeout);
  }, [chip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!chip) return null;
  const done = shown > chip.reviews.length;
  const type = content.founding.types.find((t) => t.id === chip.design.type)!;
  const gen = content.founding.generations.find((g) => g.id === chip.design.genId)?.name ?? '';
  const great = chip.reception >= 8;
  const landed =
    chip.buzz === 0
      ? 'A quiet launch: no buzz, just the reviews.'
      : chip.reception > chip.score
        ? 'The buzz paid off: shops sold out on day one.'
        : chip.reception < chip.score
          ? 'People expected more after all that buzz.'
          : 'The buzz matched the chip.';
  const verdict = reception(chip.reception);
  const ring = 2 * Math.PI * 40;
  return (
    <div className="milestone" role="dialog" aria-label={`Reviews for ${chip.design.name}`}>
      <div className="milestone-card review-card" style={{ ['--c' as string]: great ? LAYER.gold : LAYER.silicon }}>
        <div className="ms-mast">
          <span>THE REVIEWS ARE IN</span>
          <span>{turnLabel(game, chip.month)}</span>
        </div>
        <div className="rv-head">
          <span className="rv-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4" />
            </svg>
          </span>
          <div>
            <h2>Launch day: {chip.design.name}</h2>
            <p>
              {type.name} · {gen} · {money(chip.price)}. Here's what the magazines think.
            </p>
          </div>
        </div>
        <div className="rv-grid">
          {chip.reviews.map((r, i) => {
            const mag = content.founding.reviewers.find((x) => x.id === r.reviewerId)?.name ?? r.reviewerId;
            const open = i < shown;
            return (
              <div key={r.reviewerId} className={`rv-tile${open ? ' in' : ''}`}>
                <div className="rv-top">
                  <span className="rv-logo" aria-hidden="true">
                    {mag.charAt(0)}
                  </span>
                  <span className="rv-name">{mag}</span>
                  <span className="rv-score">
                    {open ? r.score : '?'}
                    <small>/10</small>
                  </span>
                </div>
                <p className="rv-quote">{open ? `“${r.quote}”` : 'Reading…'}</p>
              </div>
            );
          })}
        </div>
        <div className="rv-foot">
          <div className="rv-avg">
            <span>Average score</span>
            <span className="rv-ring">
              <svg viewBox="0 0 92 92" aria-hidden="true">
                <defs>
                  <linearGradient id="rv-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={LAYER.silicon} />
                    <stop offset="1" stopColor={LAYER.models} />
                  </linearGradient>
                </defs>
                <circle className="track" cx="46" cy="46" r="40" />
                <circle
                  className="fill"
                  cx="46"
                  cy="46"
                  r="40"
                  stroke="url(#rv-grad)"
                  strokeDasharray={`${done ? (chip.score / 10) * ring : 0} ${ring}`}
                />
              </svg>
              <b>
                {done ? chip.score.toFixed(1) : '–'}
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
                  {verdict.label} · {chip.reception.toFixed(1)}
                </span>
                <p>{landed}</p>
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

/** How a launch landed, as one word and a color. */
function reception(r: number): { label: string; color: string } {
  if (r >= 8) return { label: 'Hit', color: LAYER.silicon };
  if (r >= 6) return { label: 'Solid', color: LAYER.models };
  if (r >= 4) return { label: 'Mixed', color: LAYER.power };
  return { label: 'Flop', color: '#ff7b8a' };
}
