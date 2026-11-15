import type { ReactNode } from 'react';
import './kit.css';

/**
 * The simple look: one question at a time, big choices that say what they do, three numbers that
 * matter, and component rows with one action each. Every reworked screen is built from these.
 */

/** Numbered steps, the current one named: (1 Brief) — 2 — 3 … */
export function Stepper({ steps, at, onPick }: { steps: string[]; at: number; onPick?: (i: number) => void }) {
  return (
    <div className="k-stepper" role="list">
      {steps.map((label, i) => (
        <span key={label} className="k-step-wrap" role="listitem">
          {i > 0 && <span className={`k-step-line${i <= at ? ' done' : ''}`} />}
          <button
            className={`k-step${i === at ? ' now' : i < at ? ' done' : ''}`}
            disabled={!onPick || i > at}
            onClick={() => onPick?.(i)}
            aria-current={i === at ? 'step' : undefined}
            title={label}
          >
            <span className="n">{i + 1}</span>
            {i === at && <span className="l">{label}</span>}
          </button>
        </span>
      ))}
    </div>
  );
}

export interface Choice<T extends string | number> {
  id: T;
  title: string;
  /** One line: what this choice does ("+12% speed", "−20 days"). */
  effect?: string;
  disabled?: boolean;
  /** Why it is disabled. */
  note?: string;
}

/** A row of big buttons; one is picked. */
export function Choices<T extends string | number>({
  label,
  options,
  value,
  onChange,
  cols,
  color,
}: {
  label?: string;
  options: Choice<T>[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
  color?: string;
}) {
  return (
    <div className="k-choices" style={color ? { ['--c' as string]: color } : undefined}>
      {label && <div className="k-label">{label}</div>}
      <div className="k-choice-grid" style={{ gridTemplateColumns: `repeat(${cols ?? Math.min(4, options.length)}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button key={String(o.id)} className="k-choice" aria-pressed={o.id === value} disabled={o.disabled} onClick={() => onChange(o.id)}>
            <span className="t">{o.title}</span>
            {(o.disabled ? o.note : o.effect) && <span className="e">{o.disabled ? o.note : o.effect}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A titled group of controls. */
export function Section({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="k-section">
      <div className="k-section-head">
        <span className="k-label">{label}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Three big numbers that matter, with an optional bar under one. */
export function StatStrip({ items }: { items: { k: string; v: ReactNode; bar?: number; tone?: 'up' | 'neg' }[] }) {
  return (
    <div className="k-stats">
      {items.map((it) => (
        <div key={it.k} className="k-stat">
          <span className="k">{it.k}</span>
          <span className={`v${it.tone ? ` ${it.tone}` : ''}`}>{it.v}</span>
          {it.bar !== undefined && (
            <span className="k-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, it.bar * 100))}%` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** One part of a place you own: what it is now, what it does, and one action (or "Top tier"). */
export function ComponentRow({
  icon,
  label,
  value,
  effect,
  action,
  top,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  effect?: ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean; title?: string };
  /** Shown instead of an action when there is nothing better ("Top tier", "Largest"). */
  top?: string;
}) {
  return (
    <div className="k-row">
      <span className="k-row-icon">{icon}</span>
      <span className="k-row-main">
        <span className="k-label">{label}</span>
        <span className="k-row-value">{value}</span>
        {effect && <span className="k-row-effect">{effect}</span>}
      </span>
      {action ? (
        <button className="k-row-btn" disabled={action.disabled} title={action.title} onClick={action.onClick}>
          {action.label}
        </button>
      ) : top ? (
        <span className="k-row-top">✓ {top}</span>
      ) : null}
    </div>
  );
}

/** A screen title: small step line above a big question. */
export function Question({ over, title }: { over: string; title: string }) {
  return (
    <div className="k-question">
      <div className="k-over">{over}</div>
      <h2>{title}</h2>
    </div>
  );
}
