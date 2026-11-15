import { useEffect, useMemo, useState } from 'react';
import { v2 } from '@stm/sim';
import { useStore } from '../store';
import { LAYER } from '../ui/layers';

type G = v2.GameV2;
type Pr = v2.Project;

const PHASES: { id: v2.Phase; label: string }[] = [
  { id: 'architecture', label: 'Design' },
  { id: 'verification', label: 'Test' },
  { id: 'tapeout', label: 'At the fab' },
  { id: 'ready', label: 'Launch' },
];

const BLOCK_COLOR: Record<string, string> = { compute: 'compute', cache: 'sram', memory: 'memory', link: 'link', gfx: 'gfx' };

export function StudioPanel({ g }: { g: G }) {
  const open = useStore((s) => s.project2);
  const openProject = useStore((s) => s.openProject2);
  const pr = g.projects.find((p) => p.id === open);
  if (pr) return <ProjectDetail g={g} pr={pr} onBack={() => openProject(null)} />;
  return (
    <>
      {g.projects.length > 0 && (
        <div className="card">
          <h3>In development</h3>
          {g.projects.map((p) => (
            <button key={p.id} className="proj-row" onClick={() => openProject(p.id)}>
              <span className="proj-name">{p.name}</span>
              <span className="muted small">
                {v2.market(p.marketId).name} · {PHASES.find((x) => x.id === p.phase)!.label}
              </span>
              <span className="bar">
                <div style={{ width: `${phasePct(p)}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
      <NewProject g={g} />
    </>
  );
}

const phasePct = (p: Pr) => (p.phase === 'ready' ? 100 : Math.round((Math.min(p.progress, p.need) / Math.max(1, p.need)) * 100));

function NewProject({ g }: { g: G }) {
  const send = useStore((s) => s.send2);
  const openProject = useStore((s) => s.openProject2);
  const kinds = v2.KINDS.filter((k) => v2.kindUnlocked(g, k.id));
  const [kind, setKind] = useState<v2.ProductKind>(kinds[0]!.id);
  const markets = g.markets.map((m) => v2.market(m.id)).filter((m) => m.kind === kind);
  const [marketId, setMarket] = useState(markets[0]?.id ?? '');
  const [size, setSize] = useState<v2.ProjectSize>('S');
  const nodes = v2.NODES.filter((n) => v2.nodeUnlocked(g, n.id));
  const [nodeId, setNode] = useState(nodes[nodes.length - 1]!.id);
  const [name, setName] = useState('');
  const count = g.products.length + g.projects.length + 1;
  const suggested = `${g.companyName.split(' ')[0]} ${kind === 'gpu' ? 'G' : kind === 'cpu' ? 'X' : kind[0]!.toUpperCase()}${count}`;
  const m = markets.find((x) => x.id === marketId) ?? markets[0];
  useEffect(() => {
    if (!markets.some((x) => x.id === marketId)) setMarket(markets[0]?.id ?? '');
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const costs = v2.chipCosts(size, nodeId);
  const sz = v2.SIZES[size];
  const known = m ? g.notebook.tastes[m.id] ?? [] : [];
  const best = m ? v2.playerBest(g, m.id) : null;
  const rivalTop = m ? Math.max(0, ...g.rivals.flatMap((r) => r.products.filter((p) => p.marketId === m.id).map((p) => v2.rivalScore(g, p)))) : 0;
  const idle = g.staff.filter((p) => p.task === null).length;
  return (
    <div className="card">
      <h3>Design a new chip</h3>
      <div className="field">
        <label>Name</label>
        <input value={name} placeholder={suggested} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </div>
      <div className="field">
        <span className="label">What kind of chip?</span>
        <div className="pick-grid">
          {kinds.map((k) => (
            <button key={k.id} className="pick" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} style={{ ['--c' as string]: LAYER.silicon }}>
              <span className="pick-title">{k.name}</span>
              <span className="pick-sub">{k.blurb}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">For which buyers?</span>
        <div className="pick-grid">
          {markets.map((mk) => (
            <button key={mk.id} className="pick" aria-pressed={m?.id === mk.id} onClick={() => setMarket(mk.id)} style={{ ['--c' as string]: LAYER.compute }}>
              <span className="pick-title">{mk.name}</span>
              <span className="pick-sub">{mk.blurb}</span>
            </button>
          ))}
        </div>
        {m && (
          <p className="small muted">
            {known.length ? `You know they care about: ${known.map((k) => v2.STAT_NAMES[k].toLowerCase()).join(', then ')}.` : 'You don’t know what they care about yet; launches will teach you.'}{' '}
            {best !== null ? `Your best here: ${best.toFixed(1)}.` : ''} Best rival: {rivalTop.toFixed(1)}.
          </p>
        )}
      </div>
      <div className="field">
        <span className="label">How big?</span>
        <div className="pick-grid three">
          {(['S', 'M', 'L', 'XL'] as const)
            .filter((k) => !v2.SIZES[k].tech || g.research.done.includes(v2.SIZES[k].tech!))
            .map((k) => (
            <button key={k} className="pick" aria-pressed={size === k} onClick={() => setSize(k)} style={{ ['--c' as string]: LAYER.models }}>
              <span className="pick-title">{v2.SIZES[k].name}</span>
              <span className="pick-sub">
                {v2.SIZES[k].w}×{v2.SIZES[k].h} die · {v2.SIZES[k].work}× work · best with {v2.SIZES[k].minTeam}+ people
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Process</label>
        <select value={nodeId} onChange={(e) => setNode(e.target.value)}>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} · masks {v2.moneyV2(v2.chipCosts(size, n.id).maskCost)}
            </option>
          ))}
        </select>
      </div>
      <div className="outcomes">
        <div>
          <span className="k">Masks (at tape-out)</span>
          <span className="v">{v2.moneyV2(costs.maskCost)}</span>
        </div>
        <div>
          <span className="k">Cost per chip</span>
          <span className="v">{v2.moneyV2(costs.unitCost)}</span>
        </div>
        <div>
          <span className="k">At the fab</span>
          <span className="v">{costs.fabDays} days</span>
        </div>
        <div>
          <span className="k">Die</span>
          <span className="v">
            {sz.w}×{sz.h}
          </span>
        </div>
      </div>
      <button
        className="btn primary"
        disabled={!m}
        onClick={() => {
          if (!m) return;
          send({ type: 'startProject', name: name.trim() || suggested, kind, marketId: m.id, size, nodeId });
          setName('');
          setTimeout(() => {
            const last = useStore.getState().v2?.projects.at(-1);
            if (last) openProject(last.id);
          }, 80);
        }}
      >
        Start designing{idle ? ` (${idle} free ${idle === 1 ? 'person joins' : 'people join'})` : ''}
      </button>
    </div>
  );
}

function teamRate(g: G, pr: Pr): number {
  const team = g.staff.filter((p) => p.task === pr.id);
  const skill = pr.phase === 'architecture' ? 'design' : 'eng';
  const morale = team.length ? team.reduce((n, p) => n + p.morale, 0) / team.length : 70;
  return team.reduce((n, p) => n + v2.workRate(g, p, skill, pr.crunch, morale), 0);
}

function ProjectDetail({ g, pr, onBack }: { g: G; pr: Pr; onBack: () => void }) {
  const send = useStore((s) => s.send2);
  const f = v2.projectForecast(g, pr);
  const rate = teamRate(g, pr);
  const left = Math.max(0, pr.need - pr.progress);
  const fixing = pr.bugs.filter((b) => b.found && !b.ignored && (b.fixLeft ?? 0) > 0).reduce((n, b) => n + b.fixLeft!, 0);
  const eta = pr.phase === 'tapeout' ? Math.ceil(left) : rate > 0 ? Math.ceil((left + fixing) / rate) : null;
  const team = g.staff.filter((p) => p.task === pr.id);
  const free = g.staff.filter((p) => p.task !== pr.id);
  const idx = PHASES.findIndex((p) => p.id === pr.phase);
  const costs = v2.chipCosts(pr.size, pr.nodeId);
  return (
    <>
      <button className="btn ghost sm" onClick={onBack}>
        ← All projects
      </button>
      <div className="card selection" style={{ ['--c' as string]: LAYER.silicon }}>
        <div className="row between">
          <h3>{pr.name}</h3>
          <span className="chip" style={{ ['--c' as string]: LAYER.compute }}>
            {v2.SIZES[pr.size].name} · {v2.node(pr.nodeId).name}
          </span>
        </div>
        <div className="sub">
          {v2.kind(pr.kind).name} for {v2.market(pr.marketId).name}
        </div>
        <div className="phases">
          {PHASES.map((p, i) => (
            <span key={p.id} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
              {p.label}
            </span>
          ))}
        </div>
        {pr.phase !== 'ready' && (
          <>
            <div className="bar">
              <div style={{ width: `${phasePct(pr)}%` }} />
            </div>
            <div className="small muted">
              {pr.phase === 'tapeout' ? `${eta} days until the chips come back.` : eta === null ? 'Nobody is working on it.' : pr.progress >= pr.need ? `Done. Extra testing: ${pr.polishDays} days (finds bugs twice as fast).` : `About ${eta} days to go${fixing ? ' (including bug fixes)' : ''}.`}
            </div>
          </>
        )}
        <div className="forecast">
          <span className="k">Expected review</span>
          <span className="big">{f.total.toFixed(1)}</span>
          <span className="small muted">
            die {f.board.toFixed(1)} · team {f.team >= 0 ? '+' : ''}
            {f.team.toFixed(1)} · testing +{f.polish.toFixed(1)}
            {f.bugs > 0 ? ` · bugs −${f.bugs.toFixed(1)}` : ''}
          </span>
        </div>
      </div>

      {pr.phase === 'architecture' && (
        <div className="card">
          <h3>Die layout</h3>
          <p className="small muted">Place blocks on the die in the main view. Neighbours give bonuses; watch the heat budget. Empty tiles are trimmed off: a cheaper chip.</p>
          <div className="row">
            <LayoutHelp g={g} pr={pr} className="btn" />
          </div>
          {!v2.execOf(g, 'engineer') && <p className="small muted">A Chief Engineer can draft whole layouts for you (Team tab).</p>}
        </div>
      )}

      {pr.phase === 'verification' && (
        <div className="card">
          <h3>Bugs</h3>
          {pr.bugs.filter((b) => b.found).length === 0 && <p className="small muted">None found yet.</p>}
          {pr.bugs
            .filter((b) => b.found)
            .map((b) => (
              <div key={b.id} className="row between bug-row">
                <span>
                  <b className={b.severity >= 3 ? 'neg' : ''}>{['Minor', 'Serious', 'Nasty'][b.severity - 1]}</b>{' '}
                  <span className="small muted">{b.ignored ? 'shipping with it' : (b.fixLeft ?? 0) > 0 ? `fixing (${Math.ceil(b.fixLeft!)} pts left)` : 'fixed'}</span>
                </span>
                {(b.fixLeft ?? 0) > 0 && (
                  <button className="btn sm" onClick={() => send({ type: b.ignored ? 'fixBug' : 'ignoreBug', projectId: pr.id, bugId: b.id })}>
                    {b.ignored ? 'Fix it' : 'Ship with it'}
                  </button>
                )}
              </div>
            ))}
          <p className="small muted">Hidden bugs may remain; more testing finds them faster. Each one costs review points at launch.</p>
          <button className="btn primary" disabled={pr.progress < pr.need} onClick={() => send({ type: 'finishVerification', projectId: pr.id })}>
            Tape out ({v2.moneyV2(costs.maskCost)} for masks)
          </button>
        </div>
      )}

      {pr.phase === 'ready' && <LaunchForm g={g} pr={pr} />}

      {(pr.phase === 'architecture' || pr.phase === 'verification') && (
        <div className="card">
          <div className="row between">
            <h3>Team</h3>
            <label className="check">
              <input type="checkbox" checked={pr.crunch} onChange={(e) => send({ type: 'setCrunch', projectId: pr.id, on: e.target.checked })} />
              Crunch (+40% speed, burns people out)
            </label>
          </div>
          {team.map((p) => (
            <div key={p.id} className="row between person-row">
              <span>
                <b>{p.name}</b>{' '}
                <span className="small muted">
                  {pr.phase === 'architecture' ? `design ${p.skills.design}` : `eng ${p.skills.eng}`} · burnout {Math.round(p.burnout)}
                </span>
              </span>
              <button className="btn sm ghost" onClick={() => send({ type: 'assign', personId: p.id, task: null })}>
                Take off
              </button>
            </div>
          ))}
          {free.length > 0 && (
            <div className="chips">
              {free.map((p) => (
                <button key={p.id} className="btn sm" onClick={() => send({ type: 'assign', personId: p.id, task: pr.id })}>
                  + {p.name}
                  {p.task ? ` (from ${p.task === 'research' ? 'research' : g.projects.find((x) => x.id === p.task)?.name ?? 'work'})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        className="btn ghost sm"
        onClick={() => {
          if (confirm(`Cancel the ${pr.name}? Money spent is lost.`)) {
            send({ type: 'cancelProject', projectId: pr.id });
            onBack();
          }
        }}
      >
        Cancel project
      </button>
    </>
  );
}

function LaunchForm({ g, pr }: { g: G; pr: Pr }) {
  const send = useStore((s) => s.send2);
  const f = v2.projectForecast(g, pr);
  const fair = Math.round(v2.fairPrice(pr.marketId, f.total));
  const [price, setPrice] = useState(fair);
  const [push, setPush] = useState<0 | 1 | 2 | 3>(0);
  const unit = v2.chipCosts(pr.size, pr.nodeId, v2.usedTiles(pr.board)).unitCost;
  const plans = v2.visiblePlans(g).filter((p) => p.marketId === pr.marketId);
  const ratio = price / fair;
  return (
    <div className="card">
      <h3>Launch</h3>
      <div className="field">
        <label>
          Price: <b>{v2.moneyV2(price)}</b> <span className="muted small">(fair price for a {f.total.toFixed(1)} chip: {v2.moneyV2(fair)} · costs {v2.moneyV2(unit)} to make)</span>
        </label>
        <input type="range" min={Math.max(1, Math.round(unit))} max={Math.round(fair * 2.2)} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        <div className="gauge">
          <span style={{ left: `${Math.min(100, (ratio / 2.2) * 100)}%` }} />
          <i style={{ left: `${(1 / 2.2) * 100}%` }} title="Fair price" />
        </div>
        <p className="small muted">{ratio > 1.15 ? 'Above fair: fewer buyers, more margin.' : ratio < 0.85 ? 'Below fair: more buyers, thinner margin.' : 'Around fair price.'} Margin {v2.moneyV2(price - unit)} a chip.</p>
      </div>
      <div className="field">
        <span className="label">Launch push</span>
        <div className="pick-grid">
          {v2.T.marketing.map((mk, i) => (
            <button key={mk.label} className="pick" aria-pressed={push === i} onClick={() => setPush(i as 0 | 1 | 2 | 3)} style={{ ['--c' as string]: LAYER.products }}>
              <span className="pick-title">{mk.label}</span>
              <span className="pick-sub">{mk.costShare ? `${v2.moneyV2(Math.round(mk.costShare * pr.spent))} · hype +${mk.hype}` : 'Free'}</span>
            </button>
          ))}
        </div>
      </div>
      {plans.length > 0 && (
        <p className="small neg">
          {plans.map((p) => `${p.rival} launches the ${p.name} here in ${Math.max(0, Math.round((p.launchDay - g.day) / 30))} months`).join('. ')}. Launching within 15 days of a rival halves your buzz.
        </p>
      )}
      <button className="btn primary big" onClick={() => send({ type: 'launch', projectId: pr.id, price, marketing: push })}>
        Launch the {pr.name}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- The die board (world area)

export function DieBoardView({ g, pr }: { g: G; pr: Pr }) {
  const send = useStore((s) => s.send2);
  const blocks = v2.BLOCKS.filter((b) => v2.blockUnlocked(g, b.id));
  const [brush, setBrush] = useState<string | null>('core');
  const { w, h } = v2.SIZES[pr.size];
  const ev = useMemo(() => v2.evaluateBoard(pr.board, pr.size, pr.nodeId, pr.kind), [pr.board, pr.size, pr.nodeId, pr.kind]);
  const f = v2.projectForecast(g, pr);
  const m = v2.market(pr.marketId);
  const known = g.notebook.tastes[pr.marketId] ?? [];
  const best = g.notebook.best[`${pr.kind}:${pr.marketId}`];
  const setCell = (i: number, id: string | null) => {
    const board = [...pr.board];
    board[i] = id;
    send({ type: 'setBoard', projectId: pr.id, board });
  };
  const heatPct = Math.min(140, (ev.heat / ev.budget) * 100);
  return (
    <div className="dieboard">
      <div className="db-head">
        <span className="bp-tag">Die layout</span>
        <div>
          <div className="bp-title">{pr.name}</div>
          <div className="bp-sub">
            {v2.kind(pr.kind).name} for {m.name} · needs {v2.kind(pr.kind).needs.map((b) => v2.block(b).short).join(', ')}
          </div>
        </div>
      </div>
      <div className="db-main">
        <div className="db-palette">
          {blocks.map((b) => (
            <button key={b.id} className={`db-block blk ${BLOCK_COLOR[b.color] ?? 'compute'}`} aria-pressed={brush === b.id} onClick={() => setBrush(b.id)} title={`${b.name}: ${b.blurb}`}>
              <b>{b.short}</b>
              <small>heat {b.heat}</small>
            </button>
          ))}
          <button className="db-block erase" aria-pressed={brush === null} onClick={() => setBrush(null)}>
            <b>Erase</b>
            <small>right-click</small>
          </button>
        </div>
        <div className="db-grid die" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, aspectRatio: `${w} / ${h}` }}>
          {pr.board.map((c, i) => {
            const b = c ? v2.block(c) : null;
            const dead = ev.dead.includes(i);
            const gain = ev.cells[i];
            return (
              <button
                key={i}
                className={`db-cell${b ? ` blk ${BLOCK_COLOR[b.color] ?? 'compute'}` : ''}${dead ? ' dead' : ''}`}
                onClick={() => setCell(i, brush)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCell(i, null);
                }}
                title={b ? `${b.name}${dead ? ' (does nothing here: needs the edge)' : ''}` : 'Empty'}
              >
                {b && <span>{b.short}</span>}
                {b && gain && !dead && <small>{Object.entries(gain).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${v2.STAT_NAMES[k as v2.Stat][0]}${Math.round((v as number) * 10) / 10}`).join(' ')}</small>}
              </button>
            );
          })}
        </div>
        <div className="db-stats">
          <div className="db-score">
            <span className="k">Expected review</span>
            <span className="big">{f.total.toFixed(1)}</span>
          </div>
          {(['perf', 'gfx', 'eff', 'feat'] as v2.Stat[]).map((k) => (
            <div key={k} className="db-stat">
              <span>
                {v2.STAT_NAMES[k]} {known.includes(k) && <span className="chip" style={{ ['--c' as string]: LAYER.silicon }}>buyers want #{known.indexOf(k) + 1}</span>}
              </span>
              <span className="bar">
                <div style={{ width: `${Math.min(100, (ev.stats[k] / (v2.STAT_PAR[k] * 2.2)) * 100)}%` }} />
              </span>
              <b>{Math.round(ev.stats[k])}</b>
            </div>
          ))}
          <div className="db-stat">
            <span>Heat</span>
            <span className={`bar heat${ev.heat > ev.budget ? ' over' : ''}`}>
              <div style={{ width: `${Math.min(100, heatPct / 1.4)}%` }} />
              <i style={{ left: `${100 / 1.4}%` }} />
            </span>
            <b>
              {ev.heat.toFixed(1)}/{ev.budget.toFixed(0)}
            </b>
          </div>
          <div className="db-stat">
            <span>Chip cost</span>
            <span className="small muted">
              {ev.used}/{pr.board.length} tiles · empty ones are trimmed
            </span>
            <b>{v2.moneyV2(v2.chipCosts(pr.size, pr.nodeId, ev.used).unitCost)}</b>
          </div>
          {best !== undefined && (
            <p className="small muted">
              Your best launch here so far: <b>{best.toFixed(1)}</b>. Beat it.
            </p>
          )}
          {ev.throttle < 1 && <p className="small neg">Too hot: speed throttled to {Math.round(ev.throttle * 100)}% and more bugs.</p>}
          {ev.missing.length > 0 && <p className="small neg">Missing: {ev.missing.map((b) => v2.block(b).name).join(', ')}.</p>}
          {ev.dead.length > 0 && <p className="small neg">{ev.dead.length} block(s) need the die edge.</p>}
          <div className="row">
            <LayoutHelp g={g} pr={pr} className="bp-btn" />
            <button className="bp-btn" onClick={() => send({ type: 'setBoard', projectId: pr.id, board: pr.board.map(() => null) })}>
              Clear
            </button>
          </div>
          <p className="bp-hint">Click to place the selected block, right-click to clear. Adjacency: cache next to cores (+speed), FPU next to a core, pixel pipes next to memory, texture next to pixel.</p>
        </div>
      </div>
    </div>
  );
}

/** Without a Chief Engineer: a starter layout (just the blocks the chip needs). With one: their draft, better the more stars. */
function LayoutHelp({ g, pr, className }: { g: G; pr: Pr; className: string }) {
  const send = useStore((s) => s.send2);
  const eng = v2.execOf(g, 'engineer');
  if (!eng)
    return (
      <button className={className} title="Places only the blocks this chip must have. Making it good is up to you." onClick={() => send({ type: 'setBoard', projectId: pr.id, board: v2.starterBoard(g, pr) })}>
        Starter layout
      </button>
    );
  const gaps = v2.engineerGaps(eng.stars, pr.board.length);
  return (
    <button
      className={className}
      title={gaps ? `${eng.name} drafts a full layout but leaves ${gaps} tile${gaps > 1 ? 's' : ''} for you to finish.` : `${eng.name} drafts a full layout.`}
      onClick={() => send({ type: 'setBoard', projectId: pr.id, board: v2.engineerBoard(g, pr) })}
    >
      Ask {eng.name.split(' ')[0]} for a draft ({'★'.repeat(eng.stars)})
    </button>
  );
}
