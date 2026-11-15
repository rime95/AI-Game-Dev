import { useEffect, useMemo } from 'react';
import { content } from '@stm/content';
import { v2 } from '@stm/sim';
import { useStore, type Tab2 } from '../store';
import { Icon, LAYER } from '../ui/layers';
import { PauseMenu } from '../ui/PauseMenu';
import { HqView } from '../world/HqView';
import { Sparkline } from './charts';
import { needsOf } from './needs';
import { CompanyPanel, HqPanel, MarketsPanel, ProductsPanel, ResearchPanel, StatsPanel, TeamPanel } from './Panels';
import { DieBoardView, StudioPanel } from './Studio';
import { DesignWizard, WizardStage } from './DesignWizard';
import { ProductHero } from './hero/ProductHero';
import { CampusStage, ComputePanel } from './Campus';
import { WorldPanel, WorldStage } from './WorldView';
import { WaferReveal } from './art/WaferReveal';
import { Breakthrough2, CardModal2, Review2, YearReview2 } from './Modals';
import { WealthPanel } from './Wealth';
import type { GameState } from '@stm/sim';

type G = v2.GameV2;

export const TABS2: { id: Tab2; label: string; color: string; icon: string; key: string; tech?: string }[] = [
  { id: 'company', label: 'Company', color: LAYER.trust, icon: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6', key: '1' },
  { id: 'studio', label: 'Studio', color: LAYER.silicon, icon: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4M10 10h4v4h-4z', key: '2' },
  { id: 'products', label: 'Products', color: LAYER.products, icon: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2', key: '3' },
  { id: 'markets', label: 'Markets', color: LAYER.compute, icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4', key: '4' },
  { id: 'team', label: 'Team', color: LAYER.gold, icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-5-5.9', key: '5' },
  { id: 'research', label: 'Research', color: LAYER.models, icon: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9', key: '6' },
  { id: 'stats', label: 'Stats', color: LAYER.env, icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', key: '7' },
  { id: 'hq', label: 'HQ', color: LAYER.power, icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01', key: '8' },
  { id: 'wealth', label: 'Wealth', color: LAYER.gold, icon: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', key: '9' },
  { id: 'world', label: 'World', color: LAYER.env, icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z', key: '-' },
  { id: 'compute', label: 'Compute', color: LAYER.compute, icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', key: '0', tech: 'datacenters' },
];

/** Milliseconds per clock step; each step advances `speed` days. */
const STEP_MS = 250;

/** The real-time clock: days tick while unpaused; anything that needs you pauses it. */
function useClock2() {
  const speed = useStore((s) => s.speed);
  const day = useStore((s) => s.v2?.day);
  const pauseOpen = useStore((s) => s.pauseOpen);
  const building = useStore((s) => !!s.build);
  const review = useStore((s) => !!s.review2);
  const bt = useStore((s) => !!s.breakthrough2);
  const card = useStore((s) => (s.v2?.cards.length ?? 0) > 0 || s.year2 !== null);
  const playing = useStore((s) => s.v2?.status === 'playing');
  const held = pauseOpen || building || review || bt || card || !playing;
  useEffect(() => {
    if (!speed || held) return;
    const t = setTimeout(() => useStore.getState().send2({ type: 'tick', days: speed }), STEP_MS);
    return () => clearTimeout(t);
  }, [speed, held, day]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      const st = useStore.getState();
      if (!st.v2) return;
      if (e.code === 'Space') {
        e.preventDefault();
        st.setSpeed(st.speed ? 0 : 1);
        useStore.setState({ autoPaused: null });
      }
      if (e.key === 'Escape') {
        if (st.build) return st.cancelBuild();
        if (st.selectedRoom) return st.selectRoom(null);
        st.setPauseOpen(!st.pauseOpen);
      }
      const t = TABS2.find((x) => x.key === e.key);
      if (t && !e.ctrlKey && !e.altKey) st.setTab2(t.id);
      if ((e.key === 'r' || e.key === 'R') && st.build) st.rotateBuild();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Shell2({ g }: { g: G }) {
  useClock2();
  const tab = useStore((s) => s.tab2);
  const pauseOpen = useStore((s) => s.pauseOpen);
  const shim = useStore((s) => s.game);
  const project = useStore((s) => s.project2);
  const wizard = useStore((s) => s.wizard);
  const showcaseId = useStore((s) => s.showcase);
  const showcase = g.products.find((p) => p.id === showcaseId);
  const inStudio = tab === 'studio';
  const opened = inStudio ? g.projects.find((p) => p.id === project) : undefined;
  const editing = opened?.phase === 'architecture' ? opened : undefined;
  const showWizard = inStudio && wizard;
  return (
    <div className="shell v2">
      <TopBar2 g={g} />
      <Rail2 g={g} />
      <div className="world">
        {showWizard ? (
          <WizardStage g={g} d={wizard} />
        ) : editing ? (
          <DieBoardView g={g} pr={editing} />
        ) : opened ? (
          <ProductHero spec={opened} />
        ) : tab === 'products' && showcase ? (
          <ProductHero spec={showcase} caption={`${showcase.name} · shipped ${v2.monthLabelV2(showcase.launchDay)} · drag to rotate`} />
        ) : tab === 'compute' ? (
          <CampusStage g={g} />
        ) : tab === 'world' ? (
          <WorldStage g={g} />
        ) : (
          shim && <HqView game={shim as GameState} />
        )}
        <NeedsStrip g={g} />
        <Ticker2 g={g} />
        {!editing && !showWizard && !opened && tab !== 'compute' && tab !== 'world' && <Timeline g={g} />}
        <UndoChip />
      </div>
      <aside className="panel" style={{ ['--c' as string]: TABS2.find((t) => t.id === tab)!.color }}>
        <div className="panel-head">
          <div className="panel-title">
            <span className="dot" />
            <h2>{TABS2.find((t) => t.id === tab)!.label}</h2>
          </div>
        </div>
        <div className="panel-body">
          {tab === 'company' && <CompanyPanel g={g} />}
          {tab === 'studio' && (wizard ? <DesignWizard g={g} d={wizard} /> : <StudioPanel g={g} />)}
          {tab === 'products' && <ProductsPanel g={g} />}
          {tab === 'markets' && <MarketsPanel g={g} />}
          {tab === 'team' && <TeamPanel g={g} />}
          {tab === 'research' && <ResearchPanel g={g} />}
          {tab === 'stats' && <StatsPanel g={g} />}
          {tab === 'hq' && <HqPanel g={g} />}
          {tab === 'wealth' && <WealthPanel g={g} />}
          {tab === 'compute' && <ComputePanel g={g} />}
          {tab === 'world' && <WorldPanel g={g} />}
        </div>
      </aside>
      {g.cards[0] && !pauseOpen && <CardModal2 g={g} card={g.cards[0]} />}
      <WaferReveal g={g} />
      <Review2 g={g} />
      <Breakthrough2 g={g} />
      <YearReview2 g={g} />
      {g.status !== 'playing' && <GameOver2 g={g} />}
      {pauseOpen && shim && <PauseMenu game={shim as GameState} />}
    </div>
  );
}

// ---------------------------------------------------------------- Top bar

function TopBar2({ g }: { g: G }) {
  const setPauseOpen = useStore((s) => s.setPauseOpen);
  const weekly = g.history.weekly;
  const cashTrend = weekly.slice(-26).map((w) => w.cash);
  const lastBook = g.books[g.books.length - 1];
  const monthly = v2.salaryBill(g) + v2.facilitiesPerMonth(g, content).rent + v2.facilitiesPerMonth(g, content).upkeep;
  const runway = lastBook && lastBook.profit < 0 && g.cash > 0 ? Math.floor(g.cash / -lastBook.profit) : null;
  const onSale = v2.activeProducts(g);
  const cap = v2.capacity(g, content);
  return (
    <header className="topbar">
      <button className="icon-btn" aria-label="Open menu" title="Menu (Esc)" onClick={() => setPauseOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="brand">
        <span>{g.companyName}</span>
        <span className="brand-sub">Sand to Mind</span>
      </div>
      <div className="hud">
        <div className="res cash" style={{ ['--c' as string]: LAYER.gold }} tabIndex={0}>
          <span className={`v${g.cash < 0 ? ' neg' : ''}`}>{v2.moneyV2(g.cash)}</span>
          <span className="k">Cash</span>
          <span className="s">{lastBook ? `${lastBook.profit >= 0 ? '▲' : '▼'} ${v2.moneyV2(Math.abs(lastBook.profit))}/mo${runway !== null && runway < 12 ? ` · ${runway} mo left` : ''}` : `costs ${v2.moneyV2(monthly)}/mo`}</span>
          <Sparkline values={cashTrend} color={LAYER.gold} />
        </div>
        <div className="hud-group">
          <div className="res" style={{ ['--c' as string]: LAYER.gold }} tabIndex={0}>
            <span className={`v${g.staff.length > cap ? ' neg' : ''}`}>
              {g.staff.length}/{cap}
            </span>
            <span className="k">Team</span>
            <span className="s">morale {Math.round(g.hq.morale)}</span>
          </div>
          <div className="res" style={{ ['--c' as string]: LAYER.trust }} tabIndex={0}>
            <span className="v">{Math.round(g.brand)}</span>
            <span className="k">Brand</span>
          </div>
          <div className="res" style={{ ['--c' as string]: LAYER.products }} tabIndex={0}>
            <span className="v">{onSale.length}</span>
            <span className="k">On sale</span>
            <span className="s">{Math.round(onSale.reduce((n, p) => n + p.rate, 0)).toLocaleString('en-US')} a day</span>
          </div>
          <div className="res opt" style={{ ['--c' as string]: LAYER.models }} tabIndex={0}>
            <span className="v">{Math.floor(g.research.points)}</span>
            <span className="k">Research</span>
          </div>
        </div>
      </div>
      <Clock2 g={g} />
    </header>
  );
}

const SPEEDS = [
  { v: 0 as const, label: 'Pause (Space)', glyph: 'M7 5h3v14H7zM14 5h3v14h-3z' },
  { v: 1 as const, label: 'Play', glyph: 'M8 5l10 7-10 7z' },
  { v: 2 as const, label: 'Fast', glyph: 'M4 5l8 7-8 7zM12 5l8 7-8 7z' },
  { v: 4 as const, label: 'Fastest', glyph: 'M2 5l6.5 7L2 19zM8.5 5l6.5 7-6.5 7zM15 5l6.5 7-6.5 7z' },
];

function Clock2({ g }: { g: G }) {
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const autoPaused = useStore((s) => s.autoPaused);
  return (
    <div className="clock">
      <div className="clock-date">
        <span className="v">{v2.dateLabel(g.day)}</span>
        <span className="k">{speed === 0 && autoPaused ? <span className="held">Paused: {autoPaused}</span> : speed ? `${speed}× speed` : 'Paused'}</span>
      </div>
      <div className="speeds" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s.v}
            aria-pressed={speed === s.v}
            title={s.label}
            aria-label={s.label}
            onClick={() => {
              setSpeed(s.v);
              useStore.setState({ autoPaused: null });
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={s.glyph} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Rail

function Rail2({ g }: { g: G }) {
  const tab = useStore((s) => s.tab2);
  const setTab = useStore((s) => s.setTab2);
  const needs = useMemo(() => needsOf(g), [g]);
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-group">
        {TABS2.map((t) => {
          const alert = needs.find((n) => n.tab === t.id);
          return (
            <button
              key={t.id}
              className={t.tech && !g.research.done.includes(t.tech) ? 'sleep' : undefined}
              style={{ ['--c' as string]: t.color }}
              aria-current={tab === t.id ? 'page' : undefined}
              title={`${t.label} (${t.key})${t.tech && !g.research.done.includes(t.tech) ? ` · wakes up with ${v2.tech(t.tech).name}` : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="rail-icon">
                <Icon d={t.icon} />
              </span>
              <span className="rail-text">{t.label}</span>
              {alert && <span className={`dot${alert.tone === 'warn' ? ' bad' : ''}`} />}
              <kbd>{t.key}</kbd>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- World overlays

function NeedsStrip({ g }: { g: G }) {
  const needs = useMemo(() => needsOf(g), [g]);
  const setTab = useStore((s) => s.setTab2);
  const openProject = useStore((s) => s.openProject2);
  if (!needs.length) return null;
  return (
    <div className="needs" aria-label="Needs you">
      <span className="needs-k">Needs you</span>
      {needs.slice(0, 5).map((n) => (
        <button
          key={n.key}
          className={`need ${n.tone}`}
          onClick={() => {
            if (n.project) openProject(n.project);
            else setTab(n.tab);
          }}
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}

function Ticker2({ g }: { g: G }) {
  const recent = g.log.filter((l) => g.day - l.day <= 6 && l.tone !== 'info').slice(-3);
  return (
    <div className="ticker">
      {recent.map((l, i) => (
        <div key={`${l.day}-${i}-${l.text}`} className={`tick ${l.tone}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

/** What's coming in the next four months: project milestones, rival launches, research. */
function Timeline({ g }: { g: G }) {
  const openProject = useStore((s) => s.openProject2);
  const span = 120;
  const events: { day: number; label: string; kind: 'you' | 'rival' | 'research'; project?: string }[] = [];
  for (const pr of g.projects) {
    const team = g.staff.filter((p) => p.task === pr.id);
    const skill = pr.phase === 'architecture' ? 'design' : 'eng';
    const morale = team.length ? team.reduce((n, p) => n + p.morale, 0) / team.length : 70;
    const rate = pr.phase === 'tapeout' ? 1 : team.reduce((n, p) => n + v2.workRate(g, p, skill, pr.crunch, morale), 0);
    if (pr.phase === 'ready') events.push({ day: g.day, label: `${pr.name}: launch`, kind: 'you', project: pr.id });
    else if (rate > 0) {
      const left = Math.max(0, pr.need - pr.progress);
      events.push({ day: g.day + Math.ceil(left / rate), label: `${pr.name}: ${pr.phase === 'architecture' ? 'design done' : pr.phase === 'verification' ? 'testing done' : 'back from fab'}`, kind: 'you', project: pr.id });
    }
  }
  for (const p of v2.visiblePlans(g)) events.push({ day: p.launchDay, label: `${p.rival} ${p.name}`, kind: 'rival' });
  if (g.research.current) {
    const t = v2.tech(g.research.current);
    const rate = g.staff.filter((p) => p.task === 'research').reduce((n, p) => n + v2.T.researchPerDay * (p.skills.research / 5), 0) + v2.rdPointsPerDay(g.rdBudget ?? 0);
    if (rate > 0) events.push({ day: g.day + Math.ceil(Math.max(0, t.cost - g.research.progress - g.research.points) / rate), label: t.name, kind: 'research' });
  }
  const shown = events.filter((e) => e.day - g.day <= span).sort((a, b) => a.day - b.day);
  if (!shown.length) return null;
  return (
    <div className="timeline" aria-label="Coming up">
      <div className="tl-track">
        {[30, 60, 90].map((d) => (
          <span key={d} className="tl-tick" style={{ left: `${(d / span) * 100}%` }}>
            {d}d
          </span>
        ))}
        {shown.map((e, i) => (
          <button
            key={i}
            className={`tl-ev ${e.kind}`}
            style={{ left: `${Math.min(98, ((e.day - g.day) / span) * 100)}%`, top: `${(i % 3) * 18}px` }}
            title={`${e.label} · ${v2.dateLabel(e.day)}`}
            onClick={() => e.project && openProject(e.project)}
          >
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UndoChip() {
  const undo = useStore((s) => s.undo2);
  const undoV2 = useStore((s) => s.undoV2);
  if (!undo) return null;
  return (
    <button className="undo-chip" onClick={undoV2} title="Undo works until anything else changes">
      ↶ Undo: {undo.label}
    </button>
  );
}

const ENDINGS: Record<string, { tag: string; title: string; body: string; cls: string }> = {
  safe: { tag: 'Ending · The safe frontier', title: 'AGI, built to help', body: 'Your alignment work and the trust you earned paid off. The most powerful technology ever made arrived safely, from a company that started in a garage.', cls: 'victory' },
  reckless: { tag: 'Ending · The reckless frontier', title: 'AGI, untamed', body: 'You got there first. Whether that was wise is a question the whole world now has to live with.', cls: 'incident' },
  leader: { tag: 'Ending · Market leader', title: 'The undisputed leader', body: 'For four years you led more markets than anyone. Every rival measures itself against you now.', cls: 'victory' },
};

function GameOver2({ g }: { g: G }) {
  const quit = useStore((s) => s.quitToMenu);
  const send = useStore((s) => s.send2);
  const end = g.status === 'won' && g.ending ? ENDINGS[g.ending] : null;
  if (end)
    return (
      <div className="overlay">
        <div className="modal" style={{ ['--c' as string]: LAYER.silicon }}>
          <div className={`media ${end.cls}`}>
            <div className="tag">{end.tag}</div>
            <h2>{end.title}</h2>
          </div>
          <div className="body">
            <p>{end.body}</p>
            <p className="small muted">
              {v2.monthLabelV2(g.day)} · {g.products.length} products shipped · best review {g.records.bestScore.toFixed(1)} · all-time sales {v2.moneyV2(g.acc.totalRevenue)}
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => send({ type: 'keepPlaying' })}>
                Keep playing
              </button>
              <button className="btn" onClick={() => void quit()}>
                Back to the menu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="overlay">
      <div className="modal" style={{ ['--c' as string]: LAYER.products }}>
        <div className="media incident">
          <div className="tag">Game over</div>
          <h2>{g.companyName} closed its doors</h2>
        </div>
        <div className="body">
          <p>
            You shipped {g.products.length} chips. Best review {g.records.bestScore.toFixed(1)}, peak cash {v2.moneyV2(g.records.peakCash)}.
          </p>
          <button className="btn primary" onClick={() => void quit()}>
            Back to the menu
          </button>
        </div>
      </div>
    </div>
  );
}
