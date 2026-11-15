import { v2 } from '@stm/sim';
import { useStore, type WizardDraft } from '../store';
import { LAYER } from '../ui/layers';
import { Choices, Question, Section, Stepper } from './kit';
import { DieEditor, draftForecast } from './Studio';
import { ProductHero } from './hero/ProductHero';

type G = v2.GameV2;
const $ = v2.moneyV2;

/** The wizard's steps for a draft (memory and cooling don't apply to AI models). */
export function wizardSteps(d: WizardDraft): string[] {
  return d.kind === 'model' ? ['Brief', 'Process', 'Compute plan', 'Team', 'Review'] : ['Brief', 'Process', 'Die layout', 'Memory & cooling', 'Team', 'Review'];
}
const isLayoutStep = (d: WizardDraft) => wizardSteps(d)[d.step] === 'Die layout' || wizardSteps(d)[d.step] === 'Compute plan';

/** The stage (main view) while the wizard is open: the hero, or the die board with a small hero. */
export function WizardStage({ g, d }: { g: G; d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  const spec = { ...d, name: d.name };
  if (isLayoutStep(d))
    return (
      <>
        <DieEditor
          g={g}
          draft={d}
          name={d.name}
          forecast={draftForecast(g, d)}
          onChange={(board) => patch({ board })}
          layoutBoard={() => (v2.execOf(g, 'engineer') ? v2.engineerBoard(g, { ...d, id: d.name }) : v2.starterBoard(g, d))}
        />
      </>
    );
  return (
    <>
      <ProductHero spec={spec} />
      <div className="hero-title">
        <div className="k-over">
          Step {d.step + 1} of {wizardSteps(d).length} · {wizardSteps(d)[d.step]}
        </div>
        <h1>{d.name || 'New chip'}</h1>
        <div className="sub">
          {v2.kind(d.kind).name} · {d.marketId ? v2.market(d.marketId).name : '—'} · {v2.SIZES[d.size].name} · {v2.node(d.nodeId).name}
        </div>
      </div>
    </>
  );
}

/** The right panel while the wizard is open: one question per step, big choices, then Start. */
export function DesignWizard({ g, d }: { g: G; d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  const close = useStore((s) => s.closeWizard);
  const send = useStore((s) => s.send2);
  const openProject = useStore((s) => s.openProject2);
  const steps = wizardSteps(d);
  const step = steps[d.step]!;
  const last = d.step === steps.length - 1;
  const ev = v2.evaluateBoard(d.board, d.size, d.nodeId, d.kind, v2.specOf(d));
  const valid = !!d.marketId && ev.missing.length === 0 && d.name.trim().length > 0;
  const blocked = step === 'Die layout' || step === 'Compute plan' ? (ev.missing.length ? `Place ${ev.missing.map((b) => v2.block(b).short).join(', ')} first.` : null) : null;

  const start = () => {
    send({ type: 'startProject', name: d.name.trim(), kind: d.kind, marketId: d.marketId, size: d.size, nodeId: d.nodeId, refreshOf: d.refreshOf, tier: d.tier, memory: d.memory, cooling: d.cooling, board: d.board });
    const chosen = new Set(d.team);
    close();
    setTimeout(() => {
      const st = useStore.getState();
      const pr = st.v2?.projects.at(-1);
      if (!pr) return;
      // Everyone free joins by default; send back the ones left out.
      for (const p of st.v2!.staff) if (p.task === pr.id && !chosen.has(p.id) && !p.founder) st.send2({ type: 'assign', personId: p.id, task: null });
      openProject(pr.id);
    }, 120);
  };

  return (
    <div className="wizard">
      <Stepper steps={steps} at={d.step} onPick={(i) => patch({ step: i })} />
      {step === 'Brief' && <Brief g={g} d={d} />}
      {step === 'Process' && <Process g={g} d={d} />}
      {(step === 'Die layout' || step === 'Compute plan') && <LayoutStep g={g} d={d} />}
      {step === 'Memory & cooling' && <MemoryCooling d={d} />}
      {step === 'Team' && <TeamStep g={g} d={d} />}
      {step === 'Review' && <Review g={g} d={d} />}
      <div className="wizard-nav">
        <button className="btn ghost" onClick={() => (d.step === 0 ? close() : patch({ step: d.step - 1 }))}>
          {d.step === 0 ? 'Cancel' : 'Back'}
        </button>
        {last ? (
          <button className="btn primary" disabled={!valid} onClick={start}>
            Start designing
          </button>
        ) : (
          <button className="btn primary" disabled={!!blocked || !d.marketId} title={blocked ?? undefined} onClick={() => patch({ step: d.step + 1 })}>
            {blocked ?? 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}

const emptyBoard = (size: v2.ProjectSize) => Array(v2.SIZES[size].w * v2.SIZES[size].h).fill(null) as (string | null)[];

function Brief({ g, d }: { g: G; d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  const kinds = v2.KINDS.filter((k) => v2.kindUnlocked(g, k.id));
  const markets = g.markets.map((m) => v2.market(m.id)).filter((m) => m.kind === d.kind);
  // Earlier chips of this kind you could build on (newest first).
  const lines = g.products.filter((p) => p.kind === d.kind).slice(-3).reverse();
  const base = d.refreshOf ? g.products.find((p) => p.id === d.refreshOf) : undefined;
  const rivalTop = d.marketId ? Math.max(0, ...g.rivals.flatMap((r) => r.products.filter((p) => p.marketId === d.marketId).map((p) => v2.rivalScore(g, p)))) : 0;
  const known = d.marketId ? g.notebook.tastes[d.marketId] ?? [] : [];
  return (
    <>
      <Question over={`Step 1 of ${wizardSteps(d).length} · Brief`} title="What is it for?" />
      <Section label="Design">
        <input className="k-name" value={d.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} />
        {lines.length > 0 && (
          <>
            <Choices
              options={[{ id: '', title: 'From scratch', effect: 'A clean sheet' }, ...lines.map((p) => ({ id: p.id, title: `Build on ${p.name}`, effect: `${v2.node(p.nodeId).name} · scored ${p.score.toFixed(1)}` }))]}
              value={d.refreshOf ?? ''}
              onChange={(id) => {
                const p = g.products.find((x) => x.id === id);
                if (!p) return patch({ refreshOf: undefined, board: emptyBoard(d.size) });
                patch({ refreshOf: p.id, marketId: p.marketId, size: p.size, board: [...p.board], tier: p.tier ?? d.tier, memory: p.memory ?? 0, cooling: p.cooling ?? 0 });
              }}
            />
            <span className="k-hint">{base ? `Keeps ${base.name}'s layout and learnings: +5% performance, fewer bugs, 40% less design work.` : 'Starts from an empty die.'}</span>
          </>
        )}
      </Section>
      <Section label="What kind of chip">
        <Choices
          options={kinds.map((k) => ({ id: k.id, title: k.name, effect: k.blurb }))}
          value={d.kind}
          cols={Math.min(3, kinds.length)}
          onChange={(kind) => {
            const m = g.markets.map((x) => v2.market(x.id)).find((x) => x.kind === kind);
            patch({ kind, marketId: m?.id ?? '', refreshOf: undefined, board: emptyBoard(d.size), memory: kind === 'model' ? 0 : d.memory, cooling: kind === 'model' ? 0 : d.cooling });
          }}
        />
      </Section>
      <Section label="Built for">
        <Choices color={LAYER.compute} options={markets.map((m) => ({ id: m.id, title: m.name, effect: m.blurb }))} value={d.marketId} cols={Math.min(3, markets.length)} onChange={(marketId) => patch({ marketId })} />
        {d.marketId && (
          <span className="k-hint">
            {known.length ? `Buyers here care about ${known.map((k) => v2.STAT_NAMES[k].toLowerCase()).join(', then ')}.` : 'You don’t know what these buyers want yet; launches teach you.'} Best rival: {rivalTop.toFixed(1)}.
          </span>
        )}
      </Section>
      <Section label="Design quality">
        <Choices
          color={LAYER.models}
          options={v2.TIER_ORDER.map((t) => ({ id: t, title: v2.TIERS[t].name, effect: v2.TIERS[t].effect }))}
          value={d.tier}
          onChange={(tier) => patch({ tier })}
        />
      </Section>
    </>
  );
}

function Process({ g, d }: { g: G; d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  const nodes = v2.NODES.filter((n) => v2.nodeUnlocked(g, n.id)).slice(-4);
  const sizes = (['S', 'M', 'L', 'XL'] as const).filter((k) => !v2.SIZES[k].tech || g.research.done.includes(v2.SIZES[k].tech!));
  const base = v2.NODES[0]!;
  return (
    <>
      <Question over={`Step 2 of ${wizardSteps(d).length} · Process`} title="How big, and how small?" />
      <Section label="Die size">
        <Choices
          color={LAYER.models}
          options={sizes.map((k) => ({ id: k, title: `${v2.SIZES[k].name} ${v2.SIZES[k].w}×${v2.SIZES[k].h}`, effect: `${v2.SIZES[k].work}× work · ${v2.SIZES[k].minTeam}+ people` }))}
          value={d.size}
          onChange={(size) => patch({ size, board: size === d.size ? d.board : emptyBoard(size), refreshOf: size === d.size ? d.refreshOf : undefined })}
        />
      </Section>
      <Section label="Process node">
        <Choices
          color={LAYER.silicon}
          cols={2}
          options={[...nodes].reverse().map((n) => ({
            id: n.id,
            title: n.name,
            effect: `${(n.speed / base.speed).toFixed(1)}× speed · masks ${$(v2.chipCosts(d.size, n.id).maskCost)} · ${n.fabDays} days at the fab`,
          }))}
          value={d.nodeId}
          onChange={(nodeId) => patch({ nodeId })}
        />
        <span className="k-hint">Newer nodes are faster and cooler, but their masks cost more.</span>
      </Section>
    </>
  );
}

function LayoutStep({ g, d }: { g: G; d: WizardDraft }) {
  const f = draftForecast(g, d);
  const ev = v2.evaluateBoard(d.board, d.size, d.nodeId, d.kind, v2.specOf(d));
  return (
    <>
      <Question over={`Step 3 of ${wizardSteps(d).length} · ${wizardSteps(d)[d.step]}`} title={d.kind === 'model' ? 'Plan the compute' : 'Lay out the die'} />
      <div className="hero-box">
        <ProductHero spec={d} compact caption="Live preview · drag to rotate" />
      </div>
      <Section label="On the board">
        <div className="k-summary">
          <div>
            <span className="k">Die score</span>
            <span className="v">{f.toFixed(1)}</span>
          </div>
          <div>
            <span className="k">Cost per chip</span>
            <span className="v">{$(v2.chipCosts(d.size, d.nodeId, ev.used, v2.specOf(d)).unitCost)}</span>
          </div>
          <div>
            <span className="k">Heat</span>
            <span className="v">
              {ev.heat.toFixed(1)} / {ev.budget.toFixed(0)}
            </span>
          </div>
          <div>
            <span className="k">Tiles used</span>
            <span className="v">
              {ev.used}/{d.board.length}
            </span>
          </div>
        </div>
        <span className="k-hint">Place blocks on the board in the main view. You can keep changing the layout until testing starts.</span>
      </Section>
    </>
  );
}

function MemoryCooling({ d }: { d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  return (
    <>
      <Question over={`Step 4 of ${wizardSteps(d).length} · Memory & cooling`} title="Feed it and keep it cool" />
      <Section label="Memory">
        <Choices
          color={LAYER.compute}
          options={v2.MEMORY.map((m, i) => ({ id: i, title: v2.memoryName(d.kind, i), effect: i ? `+${Math.round((m.stat - 1) * 100)}% speed · +${Math.round((m.unit - 1) * 100)}% cost` : 'Baseline' }))}
          value={d.memory}
          onChange={(memory) => patch({ memory })}
        />
      </Section>
      <Section label="Cooling">
        <Choices
          color={LAYER.silicon}
          options={v2.COOLING.map((c, i) => ({ id: i, title: v2.coolingName(d.kind, i), effect: i ? `+${Math.round((c.heat - 1) * 100)}% heat budget · +${Math.round((c.unit - 1) * 100)}% cost` : 'Baseline' }))}
          value={d.cooling}
          onChange={(cooling) => patch({ cooling })}
        />
        <span className="k-hint">A bigger heat budget fits more hot blocks, or leaves headroom that counts as efficiency.</span>
      </Section>
    </>
  );
}

function TeamStep({ g, d }: { g: G; d: WizardDraft }) {
  const patch = useStore((s) => s.patchWizard);
  const free = g.staff.filter((p) => p.task === null);
  const team = free.filter((p) => d.team.includes(p.id));
  const work = v2.projectWork(d.size, d.tier, !!d.refreshOf);
  const rate = team.reduce((n, p) => n + v2.workRate(g, p, 'design', false, 70), 0);
  const days = rate > 0 ? Math.ceil(work.design / rate) : null;
  const minTeam = v2.SIZES[d.size].minTeam;
  return (
    <>
      <Question over={`Step ${d.step + 1} of ${wizardSteps(d).length} · Team`} title="Who builds it?" />
      <Section label="Free people" aside={<span className="k-hint">best with {minTeam}+</span>}>
        {free.length === 0 && <span className="k-hint">Nobody is free. You can still start it and move people over later.</span>}
        <div className="k-choice-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {free.map((p) => {
            const on = d.team.includes(p.id);
            return (
              <button key={p.id} className="k-choice" aria-pressed={on} onClick={() => patch({ team: on ? d.team.filter((x) => x !== p.id) : [...d.team, p.id] })}>
                <span className="t">{p.name}</span>
                <span className="e">
                  design {p.skills.design} · eng {p.skills.eng}
                  {p.traits.length ? ` · ${p.traits.map((t) => v2.TRAITS.find((x) => x.id === t)?.name ?? t).join(', ')}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section label="Time">
        <div className="k-summary">
          <div>
            <span className="k">Design</span>
            <span className="v">{days ? `${days} days` : '—'}</span>
          </div>
          <div>
            <span className="k">Then testing</span>
            <span className="v">{rate > 0 ? `${Math.ceil(work.verify / Math.max(0.1, rate))} days` : '—'}</span>
          </div>
        </div>
      </Section>
    </>
  );
}

function Review({ g, d }: { g: G; d: WizardDraft }) {
  const ev = v2.evaluateBoard(d.board, d.size, d.nodeId, d.kind, v2.specOf(d));
  const costs = v2.chipCosts(d.size, d.nodeId, ev.used, v2.specOf(d));
  const f = draftForecast(g, d);
  const rivalTop = Math.max(0, ...g.rivals.flatMap((r) => r.products.filter((p) => p.marketId === d.marketId).map((p) => v2.rivalScore(g, p))));
  const best = v2.playerBest(g, d.marketId);
  return (
    <>
      <Question over={`Step ${d.step + 1} of ${wizardSteps(d).length} · Review`} title={`Ready to start the ${d.name}?`} />
      <Section label="What you get">
        <div className="k-summary">
          <div>
            <span className="k">Expected review</span>
            <span className="v">{f.toFixed(1)}</span>
          </div>
          <div>
            <span className="k">Best rival there</span>
            <span className="v">{rivalTop.toFixed(1)}</span>
          </div>
          <div>
            <span className="k">Cost per chip</span>
            <span className="v">{$(costs.unitCost)}</span>
          </div>
          <div>
            <span className="k">Masks at tape-out</span>
            <span className="v">{$(costs.maskCost)}</span>
          </div>
        </div>
        <span className="k-hint">
          {v2.TIERS[d.tier].name} · {d.kind === 'model' ? 'compute plan' : `${v2.memoryName(d.kind, d.memory)} · ${v2.coolingName(d.kind, d.cooling)}`}
          {best !== null ? ` · your best on sale there: ${best.toFixed(1)}` : ''}. The review also depends on the team and how many bugs you ship.
        </span>
      </Section>
    </>
  );
}
