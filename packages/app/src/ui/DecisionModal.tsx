import { useEffect } from 'react';
import type { PendingEvent } from '@stm/sim';
import { useStore } from '../store';
import { EffectChips } from './EffectChips';

/** Each deck gets its own "medium" header (art-direction §6); the choice cards stay consistent. */
const DECK_TAG: Record<PendingEvent['deck'], string> = {
  press: 'Breaking news',
  board: 'Memo from the board',
  regulation: 'Official notice',
  talent: 'Message from the team',
  supply: 'Supply chain alert',
  incident: 'Incident',
};

export function DecisionModal({ event }: { event: PendingEvent }) {
  const send = useStore((s) => s.send);
  // 1, 2, 3… pick a choice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      const c = event.choices[i];
      if (c && !e.ctrlKey && !e.altKey) send({ type: 'resolveEvent', choiceId: c.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, send]);
  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ev-title">
        <div className={`media ${event.deck}`}>
          <div className="tag">{DECK_TAG[event.deck]}</div>
          <h2 id="ev-title">{event.title}</h2>
        </div>
        <div className="body">
          <div className="row">
            <div className="avatar" aria-hidden="true">
              {event.speaker.slice(0, 1)}
            </div>
            <div>
              <div className="small muted">{event.speaker}</div>
              <div>{event.body}</div>
            </div>
          </div>
          {event.choices.map((c, i) => (
            <button key={c.id} className="choice" onClick={() => send({ type: 'resolveEvent', choiceId: c.id })}>
              <span className="label">
                <kbd>{i + 1}</kbd> {c.label}
              </span>
              <span className="detail">{c.detail}</span>
              <EffectChips effects={c.effects} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
