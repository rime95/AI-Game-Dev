import { useEffect, useState } from 'react';
import { v2, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { isDesktop } from '../saves';
import { SaveList, SettingsForm } from './SaveList';

type View = 'home' | 'save' | 'load' | 'settings';

export function PauseMenu({ game }: { game: GameState }) {
  const when = v2.monthLabelV2(game.week);
  const [view, setView] = useState<View>('home');
  const [label, setLabel] = useState(`${game.companyName} · ${when}`);
  const saves = useStore((s) => s.saves);
  const setPauseOpen = useStore((s) => s.setPauseOpen);
  const saveTo = useStore((s) => s.saveTo);
  const quitToMenu = useStore((s) => s.quitToMenu);
  const refreshSaves = useStore((s) => s.refreshSaves);

  useEffect(() => {
    void refreshSaves();
  }, [refreshSaves]);

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div className="media press">
          <div className="tag">Paused · {when}</div>
          <h2 id="pause-title">{game.companyName}</h2>
        </div>
        <div className="body">
          {view === 'home' && (
            <>
              <button className="btn primary big" onClick={() => setPauseOpen(false)}>
                Resume
              </button>
              <button className="btn big" onClick={() => setView('save')}>
                Save game
              </button>
              <button className="btn big" onClick={() => setView('load')}>
                Load game
              </button>
              <button className="btn big" onClick={() => setView('settings')}>
                Settings
              </button>
              <button className="btn big" onClick={() => void quitToMenu()}>
                Save &amp; quit to main menu
              </button>
              {isDesktop && (
                <button
                  className="btn big"
                  onClick={async () => {
                    await quitToMenu();
                    window.stmDesktop?.quit();
                  }}
                >
                  Save &amp; quit game
                </button>
              )}
              <span className="small muted">Esc to resume.</span>
            </>
          )}

          {view === 'save' && (
            <form
              className="menu-section"
              onSubmit={async (e) => {
                e.preventDefault();
                await saveTo(label);
                setView('home');
              }}
            >
              <div className="field">
                <label htmlFor="save-label">Save name</label>
                <input id="save-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoFocus />
              </div>
              <div className="row">
                <button type="submit" className="btn primary">
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setView('home')}>
                  Back
                </button>
              </div>
            </form>
          )}

          {view === 'load' && (
            <>
              <span className="small muted">Unsaved progress since the last save will be lost.</span>
              <SaveList saves={saves} />
              <button className="btn" onClick={() => setView('home')}>
                Back
              </button>
            </>
          )}

          {view === 'settings' && (
            <>
              <SettingsForm />
              <button className="btn" onClick={() => setView('home')}>
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
