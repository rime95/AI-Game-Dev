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
  type TrainingSpec,
} from '@stm/sim';
import { TRACK_COLOR } from './LicensePanel';
import { useStore } from '../store';
import { big, money, pct, sci } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

/** The run in progress: progress, what incidents did to it, and the early-release option. */
function RunCard({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const run = game.training!;
  const progress = runProgress(run);
  const finalScore = scoreNow(game, run.projectedCapability + run.capabilityDelta);
  const checkpointScore = scoreNow(game, checkpointCapability(run));
  const rates = runIncidentRates(game, content, run);
  const canCheckpoint = progress >= TUNING.checkpointMinProgress;
  return (
    <div className="card">
      <div className="row between">
        <h3>Training: {run.spec.name}</h3>
        <span className="small muted">Final score ≈ {finalScore.toFixed(1)}</span>
      </div>
      <Bar value={progress} color={LAYER.models} />
      <div className="small muted">
        {pct(progress)} of {sci(run.flopsTotal)} FLOPs · {big(run.spec.chipCount)} chips busy · speed {pct(run.speedFactor)}
      </div>
      <div className="chips">
        <span className="chip" style={{ ['--c' as string]: LAYER.models }}>
          {run.incidents} incident{run.incidents === 1 ? '' : 's'} so far
        </span>
        {run.capabilityDelta < 0 && (
          <span className="chip" style={{ ['--c' as string]: '#c2413b' }}>
            Damaged: −{(scoreNow(game, run.projectedCapability) - finalScore).toFixed(1)} score
          </span>
        )}
        {run.scandalChance > 0 && (
          <span className="chip" style={{ ['--c' as string]: '#c2413b' }}>
            {pct(run.scandalChance)} contamination scandal risk
          </span>
        )}
        <span className="chip" style={{ ['--c' as string]: '#6f7079' }}>
          Weekly risk: hardware {pct(rates.hardware)} · instability {pct(rates.lossSpike)} · data {pct(rates.contamination)}
        </span>
      </div>
      <div className="row between">
        <span className="small muted">
          {canCheckpoint
            ? `Ship the latest checkpoint now: score ≈ ${checkpointScore.toFixed(1)}.`
            : `Checkpoints can ship from ${pct(TUNING.checkpointMinProgress)}.`}
        </span>
        <button className="btn" disabled={!canCheckpoint} onClick={() => send({ type: 'releaseCheckpoint' })}>
          Release checkpoint
        </button>
      </div>
    </div>
  );
}

const PARAM_OPTIONS = [1, 3, 7, 13, 34, 70, 180, 400, 1000, 2000];
const PRECISIONS: Precision[] = ['fp16', 'fp8', 'fp4'];

export function ModelsPanel({ game }: { game: GameState }) {
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
      <Advisor who="Model engineering lead" color={LAYER.models}>
        Pick an architecture, a size and a chip. The fit bars show how well the chip feeds this architecture — a bad fit
        wastes most of the compute you pay for.
      </Advisor>

      {game.training && <RunCard game={game} />}

      <div className="card">
        <h3>Design a training run</h3>
        <div className="field">
          <label htmlFor="m-name">Name</label>
          <input id="m-name" value={spec.name} onChange={(e) => update({ name: e.target.value })} />
        </div>

        <div className="field">
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Architecture</span>
          <div className="seg" style={{ ['--c' as string]: LAYER.models }}>
            {content.archs.map((a) => (
              <button key={a.id} aria-pressed={spec.archId === a.id} onClick={() => update({ archId: a.id })}>
                {a.name}
              </button>
            ))}
          </div>
          <div className="small muted">{content.archs.find((a) => a.id === spec.archId)?.blurb}</div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="m-params">Parameters</label>
            <select id="m-params" value={spec.paramsB} onChange={(e) => update({ paramsB: Number(e.target.value) })}>
              {PARAM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p >= 1000 ? `${p / 1000}T` : `${p}B`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-tokens">Tokens (billions)</label>
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
            Data owned: {big(game.dataTokensB * 1e9)} tokens · optimal ≈ 20 tokens per parameter
          </span>
          <button className="btn" onClick={() => update({ tokensB: spec.paramsB * 20 })}>
            Use 20×
          </button>
        </div>

        <div className="field">
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Precision</span>
          <div className="seg" style={{ ['--c' as string]: LAYER.models }}>
            {PRECISIONS.map((p) => (
              <button key={p} aria-pressed={spec.precision === p} onClick={() => update({ precision: p })}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          {!precisionSupported && (
            <div className="small" style={{ color: 'var(--bad)' }}>
              {chip?.name} has no {spec.precision.toUpperCase()} units — it will run at FP16 speed.
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
          <Stat k={`Projected · Suite v${game.suite.version}`} v={preview.projectedScore.toFixed(1)} c={LAYER.models} />
        </div>
        {preview.fit && (
          <>
            <div className="small">Memory fit {pct(preview.fit.memory)}</div>
            <Bar value={preview.fit.memory} color={preview.fit.memory < 0.6 ? '#c2413b' : LAYER.compute} />
            <div className="small">Interconnect fit {pct(preview.fit.interconnect)}</div>
            <Bar value={preview.fit.interconnect} color={preview.fit.interconnect < 0.6 ? '#c2413b' : LAYER.compute} />
          </>
        )}
        <div className="grid3">
          <Stat k="Training FLOPs" v={sci(preview.flops)} />
          <Stat k="Utilization" v={pct(preview.utilization)} c={LAYER.compute} />
          <Stat k="Duration" v={`${preview.weeks} wk`} />
          <Stat k="Chip cost / wk" v={money(preview.weeklyChipCost)} />
          <Stat k="Total chip cost" v={money(preview.weeklyChipCost * preview.weeks)} />
          <Stat k="Max FLOPs / wk" v={sci(preview.flopsPerWeek)} />
        </div>
        <div className="small muted">
          Training FLOPs = 6 × active params × tokens. Utilization = {TUNING.baseUtilization * 100}% × fit × scaling.
        </div>
        <div className="small muted">
          Weekly incident risk: hardware {pct(preview.incidents.hardware)} · instability {pct(preview.incidents.lossSpike)} · data{' '}
          {pct(preview.incidents.contamination)}. Bigger clusters, lower precision and bigger models are riskier; ops engineers
          cut hardware failures.
        </div>
        <div className="small" style={{ fontWeight: 600 }}>
          License to Scale · {tierName(content, preview.tier)}
        </div>
        <div className="chips">
          {preview.requirements.map((r) => (
            <span key={r.track} className="chip" style={{ ['--c' as string]: r.gap === 0 ? TRACK_COLOR[r.track] : '#c2413b' }}>
              {r.gap === 0
                ? `✓ ${trackDef(content, r.track).name}`
                : r.track === 'power'
                  ? `✗ Power ${r.have}/${r.need} · ${pct(1 - preview.speedFactor)} slower`
                  : `✗ ${trackDef(content, r.track).name} ${r.have}/${r.need} · ${pct(r.risk)} risk`}
            </span>
          ))}
        </div>
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
          <h3>Training data</h3>
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

      <div className="card">
        <h3>Released models</h3>
        {game.models.length === 0 ? (
          <div className="muted">Nothing released yet.</div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Model</th>
                <th>Arch</th>
                <th>Size</th>
                <th>Score</th>
                <th>Live</th>
              </tr>
            </thead>
            <tbody>
              {[...game.models].reverse().map((m) => (
                <tr key={m.id} className={m.id === game.liveModelId ? 'you' : undefined}>
                  <td>{m.name}</td>
                  <td>{m.archId === 'moe' ? 'MoE' : 'Dense'}</td>
                  <td>{m.paramsB >= 1000 ? `${m.paramsB / 1000}T` : `${m.paramsB}B`}</td>
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
    </>
  );
}
