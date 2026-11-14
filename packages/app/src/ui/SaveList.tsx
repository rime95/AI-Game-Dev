import { useStore } from '../store';
import { money, big } from '../format';
import type { SaveMeta } from '../saves';

/** Shared save list for the main menu and pause menu. */
export function SaveList({ saves, onLoad }: { saves: SaveMeta[]; onLoad?: (id: string) => void }) {
  const loadSave = useStore((s) => s.loadSave);
  const removeSave = useStore((s) => s.removeSave);
  if (!saves.length) return <div className="muted small">No saved games yet.</div>;
  return (
    <ul className="save-list">
      {saves.map((s) => (
        <li key={s.id}>
          <div className="save-info">
            <strong>{s.label}</strong>
            <span className="small muted">
              {s.companyName} · week {s.week} · {money(s.cash)} · {big(s.users)} users
            </span>
            <span className="small muted">{new Date(s.savedAt).toLocaleString()}</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => (onLoad ? onLoad(s.id) : loadSave(s.id))}>
              Load
            </button>
            <button
              className="btn"
              aria-label={`Delete ${s.label}`}
              onClick={() => confirm(`Delete "${s.label}"? This can't be undone.`) && removeSave(s.id)}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SettingsForm() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  return (
    <div className="settings">
      <div className="field">
        <span className="label">Interface size</span>
        <div className="seg">
          {[90, 100, 115, 130].map((v) => (
            <button key={v} aria-pressed={settings.uiScale === v} onClick={() => update({ uiScale: v })}>
              {v}%
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Game speed when a game opens</span>
        <div className="seg">
          {([0, 1, 2, 4] as const).map((v) => (
            <button key={v} aria-pressed={settings.defaultSpeed === v} onClick={() => update({ defaultSpeed: v })}>
              {v === 0 ? 'Paused' : `${v}×`}
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.pauseOnMilestones} onChange={(e) => update({ pauseOnMilestones: e.target.checked })} />
        Pause on news cards (big milestones)
      </label>
      <div className="field">
        <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Numbers on screen</span>
        <div className="seg">
          <button aria-pressed={settings.detail === 'simple'} onClick={() => update({ detail: 'simple' })}>
            Simple
          </button>
          <button aria-pressed={settings.detail === 'full'} onClick={() => update({ detail: 'full' })}>
            Every detail
          </button>
        </div>
        <span className="small muted">Simple shows what matters. Any panel can still open its details.</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.showGuide} onChange={(e) => update({ showGuide: e.target.checked })} />
        Show the "Next step" guide
      </label>
      <AutosaveField />
    </div>
  );
}

function AutosaveField() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  return (
    <div className="field">
      <label htmlFor="autosave">Autosave</label>
      <select
        id="autosave"
        value={settings.autosaveEveryWeeks}
        onChange={(e) => update({ autosaveEveryWeeks: Number(e.target.value) })}
      >
        <option value={1}>Every week</option>
        <option value={4}>Every 4 weeks</option>
        <option value={13}>Every quarter (13 weeks)</option>
        <option value={0}>Off</option>
      </select>
      <span className="small muted">The autosave slot is also written when you return to the main menu.</span>
    </div>
  );
}
