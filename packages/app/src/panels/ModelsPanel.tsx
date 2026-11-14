import { useEffect, useMemo, useState } from 'react';
import { content, type Precision } from '@stm/content';
import {
  allChips,
  checkpointCapability,
  freeChips,
  previewTraining,
  runIncidentRates,
  runProgress,
  scoreNow,
  tierName,
  trackDef,
  TUNING,
  type GameState,
  type TrainingPreview,
  type TrainingSpec,
} from '@stm/sim';
import { TRACK_COLOR } from './LicensePanel';
import { useStore } from '../store';
import { big, books, money, pct, riskLabel, sci, weeks } from '../format';
import { BAD, LAYER } from '../ui/layers';
import { Term } from '../ui/Term';
import { ARCH_NAME, PRECISION_NAME, sizeName } from '../words';
import { modelPresets, PARAM_OPTIONS } from '../presets';
import { Advisor, Bar, Stat, useDetails, useSubTab } from './Panel';

const ARCH_PLAIN: Record<string, string> = {
  dense: 'Uses its whole brain for every word. Steady, and happy on any chip.',
  moe: 'Only wakes the experts it needs. Cheaper to train for its size, but wants chips with lots of memory and fast links.',
};

function rivalsBest(game: GameState): number {
  return Math.max(0, ...game.rivals.map((r) => r.score));
}

function sizeLabel(paramsB: number): string {
  return paramsB >= 1000 ? `${paramsB / 1000}T` : `${paramsB}B`;
}

/** Weeks left on the run at the pace so far. */
function weeksLeft(game: GameState): number | null {
  const run = game.training!;
  const elapsed = game.week - run.startedWeek;
  if (elapsed <= 0 || run.flopsDone <= 0) return null;
  return Math.ceil((run.flopsTotal - run.flopsDone) / (run.flopsDone / elapsed));
}

/** The run in progress: progress, what incidents did to it, and the early-release option. */
function RunCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const details = useDetails();
  const run = game.training!;
  const progress = runProgress(run);
  const finalScore = scoreNow(game, run.projectedCapability + run.capabilityDelta);
  const checkpointScore = scoreNow(game, checkpointCapability(run));
  const rates = runIncidentRates(game, content, run);
  const canCheckpoint = progress >= TUNING.checkpointMinProgress;
  const left = weeksLeft(game);
  const worst = Math.max(rates.hardware, rates.lossSpike, rates.contamination);
  return (
    <div className="card">
      <div className="row between">
        <h3>Training {run.spec.name}</h3>
        <span className="small muted">
          Expected <Term k="smarts" /> ≈ {finalScore.toFixed(1)}
        </span>
      </div>
      <Bar value={progress} color={LAYER.models} />
      <div className="small muted">
        {details
          ? `${pct(progress)} of ${sci(run.flopsTotal)} FLOPs · ${big(run.spec.chipCount)} chips busy · speed ${pct(run.speedFactor)}`
          : `${pct(progress)} done${left !== null ? ` · about ${weeks(left)} to go` : ''} · ${big(run.spec.chipCount)} chips at work`}
      </div>
      <div className="chips">
        {run.incidents > 0 && (
          <span className="chip" style={{ ['--c' as string]: LAYER.models }}>
            {run.incidents} setback{run.incidents === 1 ? '' : 's'} so far
          </span>
        )}
        {run.capabilityDelta < 0 && (
          <span className="chip" style={{ ['--c' as string]: BAD }}>
            Damaged: −{(scoreNow(game, run.projectedCapability) - finalScore).toFixed(1)} smarts
          </span>
        )}
        {run.scandalChance > 0 && (
          <span className="chip" style={{ ['--c' as string]: BAD }}>
            {pct(run.scandalChance)} chance of a cheating scandal
          </span>
        )}
        <span className="chip" style={{ ['--c' as string]: LAYER.trust }}>
          {details
            ? `Weekly risk: hardware ${pct(rates.hardware)} · instability ${pct(rates.lossSpike)} · data ${pct(rates.contamination)}`
            : `Trouble this week: ${riskLabel(worst)}`}
        </span>
      </div>
      <div className="row between">
        <span className="small muted">
          {canCheckpoint
            ? `Ship what we have now: smarts ≈ ${checkpointScore.toFixed(1)}.`
            : `We can ship early once it's ${pct(TUNING.checkpointMinProgress)} done.`}
        </span>
        <button className="btn" disabled={!canCheckpoint} onClick={() => send({ type: 'releaseCheckpoint' })}>
          Ship it early
        </button>
      </div>
    </div>
  );
}

/** License and power problems a run would hit, in plain words. Empty when all is fine. */
function LicenseChips({ preview, all }: { preview: TrainingPreview; all?: boolean }) {
  const shown = all ? preview.requirements : preview.requirements.filter((r) => r.gap > 0);
  if (shown.length === 0) return null;
  return (
    <>
      <div className="small" style={{ fontWeight: 600 }}>
        <Term k="license" /> · {tierName(content, preview.tier)}
      </div>
      <div className="chips">
        {shown.map((r) => (
          <span key={r.track} className="chip" style={{ ['--c' as string]: r.gap === 0 ? TRACK_COLOR[r.track] : BAD }}>
            {r.gap === 0
              ? `✓ ${trackDef(content, r.track).name}`
              : r.track === 'power'
                ? `Not enough power: ${pct(1 - preview.speedFactor)} slower`
                : `${trackDef(content, r.track).name} level ${r.have} of ${r.need}: ${pct(r.risk)} chance of trouble at launch`}
          </span>
        ))}
      </div>
    </>
  );
}

/** Simple mode: pick a style and a size card; we fill in the rest. */
function QuickDesigner({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const setTab = useStore((s) => s.setTab);
  const setModelDraft = useStore((s) => s.setModelDraft);
  const [name, setName] = useState(`Model ${game.models.length + 1}`);
  const [archId, setArchId] = useState('dense');
  const [picked, setPicked] = useState<string | null>(null);
  const presets = useMemo(() => modelPresets(game, content, archId, name), [game, archId, name]);
  const preset = presets.find((p) => p.id === picked) ?? presets.find((p) => !p.blocked) ?? presets[0];
  useEffect(() => setModelDraft(preset?.spec ?? null), [preset?.spec, setModelDraft]);
  useEffect(() => setName(`Model ${game.models.length + 1}`), [game.models.length]);
  const best = rivalsBest(game);

  if (presets.length === 0) {
    return (
      <div className="card empty-card">
        <h3>Train a new model</h3>
        <p className="muted">
          {game.training
            ? 'Every chip is busy with the current run. Rent more to train two things at once.'
            : 'We need chips to train on. Rent a few in Compute and come back.'}
        </p>
        <button className="btn primary" style={{ ['--c' as string]: LAYER.compute }} onClick={() => setTab('compute')}>
          Go to Compute
        </button>
      </div>
    );
  }

  const chip = allChips(game, content).find((c) => c.id === preset!.spec.chipId);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.models }}>
      <h3>Train a new model</h3>
      <div className="field">
        <label htmlFor="m-name">Name</label>
        <input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          <Term k="style" />
        </span>
        <div className="seg">
          {content.archs.map((a) => (
            <button key={a.id} aria-pressed={archId === a.id} onClick={() => setArchId(a.id)}>
              {ARCH_NAME[a.id] ?? a.name}
            </button>
          ))}
        </div>
        <div className="small muted">{ARCH_PLAIN[archId]}</div>
      </div>

      <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
        How big?
      </div>
      <div className="pick-grid">
        {presets.map((p) => (
          <button
            key={p.id}
            className="pick"
            aria-pressed={preset!.id === p.id}
            onClick={() => setPicked(p.id)}
            title={p.blocked ?? undefined}
          >
            <span className="pick-title">{p.label}</span>
            <span className="pick-sub">
              {sizeName(p.spec.paramsB)} model · {weeks(p.preview.weeks)}
            </span>
            <span className="pick-big">{p.preview.projectedScore.toFixed(1)}</span>
            <span className="pick-sub">smarts</span>
            {p.blocked && <span className="pick-warn">Can't start yet</span>}
          </button>
        ))}
      </div>
      <div className="small muted">{preset!.blurb}</div>

      <div className="outcomes">
        <div>
          <span className="k">Ready in</span>
          <span className="v">{weeks(preset!.preview.weeks)}</span>
        </div>
        <div>
          <span className="k">Costs</span>
          <span className="v">{money(preset!.totalCost)}</span>
        </div>
        <div>
          <span className="k">
            <Term k="smarts" />
          </span>
          <span className="v" style={{ color: preset!.preview.projectedScore > best ? 'var(--good)' : undefined }}>
            {preset!.preview.projectedScore.toFixed(1)}
          </span>
          <span className="s">rivals' best {best.toFixed(1)}</span>
        </div>
        <div>
          <span className="k">Risk</span>
          <span className="v">{riskLabel(Math.max(preset!.preview.incidents.hardware, preset!.preview.incidents.lossSpike))}</span>
        </div>
      </div>
      <div className="small muted">
        Trains on {big(preset!.spec.chipCount)} {chip?.name} chips with {PRECISION_NAME[preset!.spec.precision].toLowerCase()} math, reading{' '}
        {books(preset!.spec.tokensB)}.
        {preset!.dataShortB > 0 && ` We'll buy the missing data for ${money(preset!.dataCost)} first.`}
      </div>
      <LicenseChips preview={preset!.preview} />
      {preset!.blocked && <div className="small" style={{ color: 'var(--bad)' }}>{preset!.blocked}</div>}
      <button
        className="btn primary big"
        disabled={!!preset!.blocked || !name.trim()}
        onClick={() => {
          if (preset!.dataShortB > 0) send({ type: 'buyData', billions: preset!.dataShortB });
          send({ type: 'startTraining', spec: preset!.spec });
          setPicked(null);
        }}
      >
        Start training
      </button>
    </div>
  );
}

const PRECISIONS: Precision[] = ['fp16', 'fp8', 'fp4'];

/** Details mode: every knob. */
function DetailDesigner({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const defaultChip = allChips(game, content).find((c) => freeChips(game, c.id) > 0) ?? content.chips[0]!;
  const [spec, setSpec] = useState<TrainingSpec>(() => ({
    name: `Model ${game.models.length + 1}`,
    archId: 'dense',
    paramsB: 7,
    tokensB: 140,
    precision: 'fp16',
    chipId: defaultChip.id,
    chipCount: Math.min(64, Math.max(1, freeChips(game, defaultChip.id))),
  }));
  const update = (patch: Partial<TrainingSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const preview = useMemo(() => previewTraining(game, content, spec), [game, spec]);
  const setModelDraft = useStore((s) => s.setModelDraft);
  useEffect(() => setModelDraft(spec), [spec, setModelDraft]);
  const chip = allChips(game, content).find((c) => c.id === spec.chipId);
  const precisionSupported = chip ? chip.tflops[spec.precision] > 0 : true;

  return (
    <>
      <div className="card">
        <h3>Design a training run</h3>
        <div className="field">
          <label htmlFor="m-name">Name</label>
          <input id="m-name" value={spec.name} onChange={(e) => update({ name: e.target.value })} />
        </div>

        <div className="field">
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            <Term k="style" /> (architecture)
          </span>
          <div className="seg" style={{ ['--c' as string]: LAYER.models }}>
            {content.archs.map((a) => (
              <button key={a.id} aria-pressed={spec.archId === a.id} onClick={() => update({ archId: a.id })}>
                {ARCH_NAME[a.id] ?? a.name}
              </button>
            ))}
          </div>
          <div className="small muted">{content.archs.find((a) => a.id === spec.archId)?.blurb}</div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="m-params">Model size (parameters)</label>
            <select id="m-params" value={spec.paramsB} onChange={(e) => update({ paramsB: Number(e.target.value) })}>
              {PARAM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {sizeLabel(p)} · {sizeName(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-tokens">Training data (billion tokens)</label>
            <input
              id="m-tokens"
              type="number"
              min={1}
              value={spec.tokensB}
              onChange={(e) => update({ tokensB: Math.max(0, Number(e.target.value)) })}
            />
          </div>
        </div>
        <div className="row between small">
          <span className="muted">
            We own {big(game.dataTokensB * 1e9)} tokens. The sweet spot is about 20 tokens per parameter.
          </span>
          <button className="btn" onClick={() => update({ tokensB: spec.paramsB * 20 })}>
            Use 20×
          </button>
        </div>

        <div className="field">
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            <Term k="precision" />
          </span>
          <div className="seg" style={{ ['--c' as string]: LAYER.models }}>
            {PRECISIONS.map((p) => (
              <button key={p} aria-pressed={spec.precision === p} onClick={() => update({ precision: p })}>
                {PRECISION_NAME[p]} · {p.toUpperCase()}
              </button>
            ))}
          </div>
          {!precisionSupported && (
            <div className="small" style={{ color: 'var(--bad)' }}>
              {chip?.name} can't do {PRECISION_NAME[spec.precision].toLowerCase()} math. It will run at careful speed.
            </div>
          )}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="m-chip">Chip</label>
            <select id="m-chip" value={spec.chipId} onChange={(e) => update({ chipId: e.target.value })}>
              {allChips(game, content).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({big(freeChips(game, c.id))} free)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-count">Chips to use</label>
            <input
              id="m-count"
              type="number"
              min={1}
              value={spec.chipCount}
              onChange={(e) => update({ chipCount: Math.max(0, Math.floor(Number(e.target.value))) })}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ ['--c' as string]: LAYER.models }}>
        <div className="row between">
          <h3>Preview</h3>
          <Stat k={`Smarts · test v${game.suite.version}`} v={preview.projectedScore.toFixed(1)} c={LAYER.models} />
        </div>
        {preview.fit && (
          <>
            <div className="small">
              <Term k="memory" /> fit {pct(preview.fit.memory)}
            </div>
            <Bar value={preview.fit.memory} color={preview.fit.memory < 0.6 ? BAD : LAYER.compute} />
            <div className="small">
              <Term k="links" /> fit {pct(preview.fit.interconnect)}
            </div>
            <Bar value={preview.fit.interconnect} color={preview.fit.interconnect < 0.6 ? BAD : LAYER.compute} />
          </>
        )}
        <div className="grid3">
          <Stat k="Training work (FLOPs)" v={sci(preview.flops)} />
          <Stat k="Chips kept busy" v={pct(preview.utilization)} c={LAYER.compute} />
          <Stat k="Duration" v={`${preview.weeks} wk`} />
          <Stat k="Chip cost / wk" v={money(preview.weeklyChipCost)} />
          <Stat k="Total chip cost" v={money(preview.weeklyChipCost * preview.weeks)} />
          <Stat k="Work per week" v={sci(preview.flopsPerWeek)} />
        </div>
        <div className="small muted">
          Training work = 6 × active parameters × tokens. Chips kept busy = {TUNING.baseUtilization * 100}% × fit × scaling.
        </div>
        <div className="small muted">
          Weekly setback risk: hardware {pct(preview.incidents.hardware)} · instability {pct(preview.incidents.lossSpike)} · data{' '}
          {pct(preview.incidents.contamination)}. Bigger clusters, faster math and bigger models are riskier. Ops engineers cut hardware
          failures.
        </div>
        <LicenseChips preview={preview} all />
        {preview.errors.length > 0 && (
          <ul className="errors">
            {preview.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button
          className="btn primary big"
          disabled={preview.errors.length > 0}
          onClick={() => {
            send({ type: 'startTraining', spec });
            update({ name: `Model ${game.models.length + 2}` });
          }}
        >
          Start training
        </button>
      </div>

      <div className="card">
        <div className="row between">
          <h3>
            <Term k="data" />
          </h3>
          <span className="small muted">{money(TUNING.dataCostPerBillionTokens * 1e3)} per 1T tokens</span>
        </div>
        <div className="row">
          {[100, 1000, 5000].map((b) => (
            <button key={b} className="btn" onClick={() => send({ type: 'buyData', billions: b })}>
              +{b >= 1000 ? `${b / 1000}T` : `${b}B`} tokens
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function ModelsPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const sub = useSubTab('models');
  const details = useDetails();

  return (
    <>
      <Advisor who="models" color={LAYER.models}>
        {details
          ? 'Pick a style, a size and a chip. The fit bars show how well the chip feeds this style. A bad fit wastes most of the chip time we pay for.'
          : 'Pick how long we can wait and I will size the model to match. Bigger takes longer but scores higher. Beat the rivals’ best and users come to us.'}
      </Advisor>

      {game.training && <RunCard game={game} />}

      {sub === 'train' && (details ? <DetailDesigner game={game} /> : <QuickDesigner game={game} />)}

      {sub === 'library' && (
        <div className="card">
          <h3>Released models</h3>
          {game.models.length === 0 ? (
            <div className="muted">Nothing released yet.</div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Style</th>
                  <th>Size</th>
                  <th>Smarts</th>
                  <th>Live</th>
                </tr>
              </thead>
              <tbody>
                {[...game.models].reverse().map((m) => (
                  <tr key={m.id} className={m.id === game.liveModelId ? 'you' : undefined}>
                    <td>{m.name}</td>
                    <td>{ARCH_NAME[m.archId] ?? m.archId}</td>
                    <td>{details ? sizeLabel(m.paramsB) : sizeName(m.paramsB)}</td>
                    <td>{m.score.toFixed(1)}</td>
                    <td>
                      {m.id === game.liveModelId ? (
                        'Live'
                      ) : (
                        <button className="btn" onClick={() => send({ type: 'setLiveModel', modelId: m.id })}>
                          Serve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
