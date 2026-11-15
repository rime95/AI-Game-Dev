import { useState } from 'react';
import { useStore } from '../store';
import { isDesktop } from '../saves';
import { money } from '../format';
import { SaveList, SettingsForm } from './SaveList';

type View = 'home' | 'new' | 'load' | 'settings' | 'credits';

const NAME_IDEAS = ['Sandbox Labs', 'Quartz Mind', 'Lumen Works', 'First Principles AI', 'Copperline Intelligence', 'Northlight'];

export function MainMenu() {
  const [view, setView] = useState<View>('home');
  const saves = useStore((s) => s.saves);
  const loadSave = useStore((s) => s.loadSave);
  const latest = saves[0];

  return (
    <main className="menu-screen">
      <div className="menu-card">
        <div className="menu-title">
          <span className="bp-tag">From sand to mind</span>
          <h1>SAND TO MIND</h1>
          <p className="muted">Design the chips. Train the models. Race to the frontier.</p>
        </div>

        {view === 'home' && (
          <nav className="menu-buttons" aria-label="Main menu">
            {latest && (
              <button className="btn primary big" onClick={() => loadSave(latest.id)}>
                Continue
                <span className="menu-sub">
                  {latest.companyName} · week {latest.week} · {money(latest.cash)}
                </span>
              </button>
            )}
            <button className={`btn big${latest ? '' : ' primary'}`} onClick={() => setView('new')}>
              New game
            </button>
            <button className="btn big" disabled={!saves.length} onClick={() => setView('load')}>
              Load game
            </button>
            <button className="btn big" onClick={() => setView('settings')}>
              Settings
            </button>
            <button className="btn big" onClick={() => setView('credits')}>
              Credits
            </button>
            {isDesktop && (
              <button className="btn big" onClick={() => window.stmDesktop?.quit()}>
                Quit
              </button>
            )}
          </nav>
        )}

        {view === 'new' && <NewGameForm onBack={() => setView('home')} />}

        {view === 'load' && (
          <section className="menu-section">
            <h2>Load game</h2>
            <SaveList saves={saves} />
            <button className="btn" onClick={() => setView('home')}>
              Back
            </button>
          </section>
        )}

        {view === 'settings' && (
          <section className="menu-section">
            <h2>Settings</h2>
            <SettingsForm />
            <button className="btn" onClick={() => setView('home')}>
              Back
            </button>
          </section>
        )}
        {view === 'credits' && (
          <section className="menu-section">
            <h2>Credits</h2>
            <p className="small">Furniture and props: Furniture Kit by Kenney (kenney.nl), CC0.</p>
            <p className="small">Beige computer: “Computer” by Poly by Google, via poly.pizza, CC-BY 3.0.</p>
            <p className="small">Floor texture and studio lighting: Poly Haven (polyhaven.com), CC0.</p>
            <button className="btn" onClick={() => setView('home')}>
              Back
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function NewGameForm({ onBack }: { onBack: () => void }) {
  const newGame = useStore((s) => s.newGame);
  const [name, setName] = useState(() => NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)]!);
  const [seed, setSeed] = useState('');
  const start = () => newGame(name, seed.trim() ? Math.abs(Math.floor(Number(seed))) || undefined : undefined);
  return (
    <form
      className="menu-section"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <h2>New company</h2>
      <div className="field">
        <label htmlFor="company">Company name</label>
        <input id="company" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="seed">Seed (optional)</label>
        <input id="seed" inputMode="numeric" placeholder="Random" value={seed} onChange={(e) => setSeed(e.target.value)} />
        <span className="small muted">Same seed, same rivals and events. Handy for sharing a challenge.</span>
      </div>
      <div className="small muted">
        You start in 1991: one founder, a garage and $80K. Design processors and graphics chips, grow into a giant, and one day build artificial intelligence on your own silicon.
      </div>
      <div className="row">
        <button type="submit" className="btn primary big" disabled={!name.trim()}>
          Start
        </button>
        <button type="button" className="btn big" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}
