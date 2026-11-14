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
  return (
    <div className="milestone" role="dialog" aria-label={`Reviews for ${chip.design.name}`}>
      <div className="milestone-card review-card" style={{ ['--c' as string]: great ? LAYER.gold : LAYER.silicon }}>
        <div className="ms-mast">
          <span>THE REVIEWS ARE IN</span>
          <span>{turnLabel(game, chip.month)}</span>
        </div>
        <h2>{chip.design.name}</h2>
        <p className="review-sub">
          {type.name} · {gen} · {money(chip.price)}
        </p>
        <div className="reviews">
          {chip.reviews.map((r, i) => {
            const mag = content.founding.reviewers.find((x) => x.id === r.reviewerId)?.name ?? r.reviewerId;
            return (
              <div key={r.reviewerId} className={`review${i < shown ? ' in' : ''}`}>
                <span className="review-score" data-tone={r.score >= 8 ? 'good' : r.score <= 4 ? 'bad' : 'mid'}>
                  {i < shown ? r.score : '?'}
                </span>
                <span className="review-text">
                  <strong>{mag}</strong>
                  <em>{i < shown ? `“${r.quote}”` : '…'}</em>
                </span>
              </div>
            );
          })}
        </div>
        <div className={`review-avg${done ? ' in' : ''}`}>
          Average <strong>{done ? chip.score.toFixed(1) : '–'}</strong> / 10
          {done && (
            <span className="review-fit">
              {' '}
              · launch {chip.reception.toFixed(1)}. {landed}
            </span>
          )}
        </div>
        {done && great && (
          <div className="confetti small" aria-hidden="true">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.08}s`, ['--h' as string]: `${(i * 53) % 360}` }} />
            ))}
          </div>
        )}
        <button className="btn primary" disabled={!done} onClick={close}>
          {done ? 'Back to work' : 'Reading the reviews…'}
        </button>
      </div>
    </div>
  );
}
