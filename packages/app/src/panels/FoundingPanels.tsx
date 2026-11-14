import { useEffect, useMemo, useState } from 'react';
import { content, type ProductTypeId } from '@stm/content';
import {
  aiReady,
  buzzCost,
  companyYear,
  designPreview,
  designSlots,
  goalMet,
  isUnlocked,
  moveCheck,
  normalizeSplit,
  researchError,
  scoreNowFor,
  segmentShares,
  TUNING,
  type DieSplit,
  type GameState,
  type Product,
  type ProductDesign,
} from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat, useDetails } from './Panel';
import { Floorplan } from './SiliconPanel';

const typeOf = (id: ProductTypeId) => content.founding.types.find((t) => t.id === id)!;
const genName = (id: string) => content.founding.generations.find((g) => g.id === id)?.name ?? id;
const rivalDef = (id: string) => content.founding.rivals.find((r) => r.id === id)!;

/** Our best chip of a kind, as it rates today, and the best rival's. */
function standing(game: GameState, type: ProductTypeId): { ours: number | null; theirs: number | null; theirName: string } {
  const f = game.founding!;
  const ours = f.products.filter((p) => p.design.type === type).map((p) => scoreNowFor(p.score, game.week - p.month));
  const rivals = f.rivals
    .filter((r) => r.chips > 0 && rivalDef(r.id).type === type)
    .map((r) => ({ name: rivalDef(r.id).name, v: scoreNowFor(r.score, game.week - r.month) }))
    .sort((a, b) => b.v - a.v);
  return { ours: ours.length ? Math.max(...ours) : null, theirs: rivals[0]?.v ?? null, theirName: rivals[0]?.name ?? '' };
}

/** Company tab: the books, the chapter we're in, and the road to AI. */
export function FoundingOverview({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const r = f.report;
  const costs = r ? r.costOfGoods + r.salaries + r.rent + r.upkeep : 0;
  const net = r ? r.sales - costs : 0;
  const year = companyYear(game);
  const best = f.products.reduce<Product | null>((b, c) => (!b || c.score > b.score ? c : b), null);
  const ready = aiReady(content, f);
  return (
    <>
      <Advisor who="mentor" color={LAYER.trust}>
        {ready
          ? 'Our graphics chips turn out to be perfect for teaching computers to learn. This is the moment the whole industry changes.'
          : f.products.length === 0
            ? 'Every big chip company started like this: one person, one bench, one idea. Head to Chips and design a processor or a graphics chip.'
            : 'Keep an eye on the reviews and the rivals. A chip sells for a year or two before the industry moves past it, so keep new ones coming.'}
      </Advisor>

      {ready && (
        <div className="card chapter-card" style={{ ['--c' as string]: LAYER.models }}>
          <h3>The AI chapter</h3>
          <div className="small">
            Neural networks run beautifully on graphics chips, and we make the best ones. Start the AI chapter: we keep our people, building, money and history,
            and our best graphics chip becomes the first chip we train on.
          </div>
          <button className="btn primary big" disabled={!!game.pendingEvent} onClick={() => send({ type: 'startAiEra' })}>
            Begin the AI chapter
          </button>
          <div className="small muted">Or keep making chips as long as you like.</div>
        </div>
      )}

      <ChapterCard game={game} />

      <div className="card">
        <h3>Last month</h3>
        {r ? (
          <>
            <div className="grid3">
              <Stat k="Chip sales" v={money(r.sales)} c={LAYER.products} />
              <Stat k="Costs" v={money(costs)} />
              <Stat k="Net" v={money(net)} c={net >= 0 ? 'var(--good)' : 'var(--bad)'} />
            </div>
            <div className="small muted">
              Making the chips {money(r.costOfGoods)} · salaries {money(r.salaries)} · rent {money(r.rent)} · rooms {money(r.upkeep)}. Designing a new chip is
              paid up front.
            </div>
          </>
        ) : (
          <div className="muted">Play a month to see how the books look.</div>
        )}
      </div>

      <div className="card">
        <h3>The story so far</h3>
        <div className="grid3">
          <Stat k="Chips shipped" v={f.products.length} c={LAYER.silicon} />
          <Stat k="Best review" v={best ? best.score.toFixed(1) : '–'} c={LAYER.gold} />
          <Stat k="Total sales" v={money(f.totalSales)} />
        </div>
        <div className="small">
          {year} · customer trust {Math.round(f.trust)}/100
        </div>
        <Bar value={Math.min(1, (year - f.startYear) / 22)} color={LAYER.models} />
        <div className="small muted">From the garage in {f.startYear} to the age of AI. Trust grows with good launches and sells more of every chip.</div>
      </div>
    </>
  );
}

/** The current chapter: its goals and reward. */
export function ChapterCard({ game }: { game: GameState }) {
  const f = game.founding!;
  const ch = content.founding.chapters[f.chapter.index];
  if (!ch) return null;
  const n = f.chapter.index + 1;
  return (
    <div className="card chapter" style={{ ['--c' as string]: LAYER.gold }}>
      <div className="row between">
        <h3>
          Chapter {n}: {ch.name}
        </h3>
        <span className="small muted">
          {n} of {content.founding.chapters.length}
        </span>
      </div>
      <div className="small muted">{ch.blurb}</div>
      <div className="goal-list">
        {ch.goals.map((g) => {
          const ok = f.chapter.done.includes(g.id) || goalMet(game, content, g);
          return (
            <div key={g.id} className={`goal${ok ? ' ok' : ''}`}>
              <span aria-hidden="true">{ok ? '✓' : '○'}</span> {g.label}
            </div>
          );
        })}
      </div>
      <div className="small">
        Reward:{' '}
        {[
          ch.reward.cash ? money(ch.reward.cash) : '',
          ch.reward.researchPoints ? `${ch.reward.researchPoints} research points` : '',
          ch.reward.trust ? `+${ch.reward.trust} trust` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'the next chapter'}
      </div>
    </div>
  );
}

const PRESETS: { id: string; label: string; blurb: string; scale: number }[] = [
  { id: 'value', label: 'Value', blurb: 'A small, cheap chip. Sells on price.', scale: 0.8 },
  { id: 'balanced', label: 'Balanced', blurb: 'The sensible middle.', scale: 1 },
  { id: 'top', label: 'Top of the range', blurb: 'A big, fast chip. Costs more and takes longer.', scale: 1.3 },
];

const BLOCKS: { key: keyof DieSplit; label: string; cpu: string; gpu: string }[] = [
  { key: 'compute', label: 'Cores', cpu: 'Raw speed', gpu: 'Pixels and polygons per second' },
  { key: 'sram', label: 'Cache', cpu: 'Keeps the cores fed', gpu: 'Small help for graphics' },
  { key: 'memory', label: 'Memory bus', cpu: 'Talks to the computer’s memory', gpu: 'Fast video memory: graphics loves it' },
  { key: 'interconnect', label: 'Links', cpu: 'Talks to the rest of the computer', gpu: 'Talks to the rest of the computer' },
];

/** Chips: design a processor or graphics chip, give it some buzz, set its price, watch it sell. */
export function ChipsPanel({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const details = useDetails();
  const types = content.founding.types.filter((t) => isUnlocked(content, f, 'type', t.id));
  const gens = content.founding.generations.filter((g) => isUnlocked(content, f, 'generation', g.id));
  const [type, setType] = useState<ProductTypeId>(types[0]!.id);
  const [genId, setGenId] = useState(gens[gens.length - 1]!.id);
  const [preset, setPreset] = useState('balanced');
  const [scale, setScale] = useState(1);
  const [split, setSplit] = useState<DieSplit>({ ...typeOf(type).ideal });
  const [name, setName] = useState('');
  useEffect(() => setGenId(gens[gens.length - 1]!.id), [gens.length]); // newest generation once researched
  useEffect(() => setSplit({ ...typeOf(type).ideal }), [type]);
  const t = typeOf(type);
  const defaultName = `${t.short} ${f.products.filter((p) => p.design.type === type).length + 1}`;
  const design: ProductDesign = { name: name || defaultName, type, genId, split: details ? split : t.ideal, scale };
  const pv = useMemo(() => designPreview(game, content, design), [game, type, genId, scale, split, details, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = standing(game, type);
  const lockedTypes = content.founding.types.length - types.length;
  const busy = f.projects.length >= designSlots(game);
  const norm = normalizeSplit(design.split);

  return (
    <>
      <Advisor who="mentor" color={LAYER.silicon}>
        {f.products.length === 0
          ? 'Start small: a balanced chip on the generation you have. The factory takes a few months, then the magazines decide what it is worth.'
          : st.theirs !== null && st.ours !== null && st.theirs > st.ours - 0.5
            ? `${st.theirName}'s latest is close to ours. Time for something newer.`
            : 'Each chip sells for a year or two. Keep new designs coming, and research newer generations to stay ahead.'}
      </Advisor>

      {f.projects.map((p) => (
        <FactoryCard key={p.id} game={game} projectId={p.id} />
      ))}

      {busy ? (
        <div className="card muted small">
          {designSlots(game) === 1
            ? 'One chip at a time while we are small. Five chip designers let us design two at once.'
            : `All ${designSlots(game)} design teams are busy. Every five chip designers add another team.`}
        </div>
      ) : (
        <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
          <h3>Design a new chip</h3>
          <div className="field">
            <label htmlFor="chip-name">Name</label>
            <input id="chip-name" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            What kind of chip?
          </div>
          <div className="pick-grid">
            {types.map((x) => (
              <button key={x.id} className="pick" aria-pressed={type === x.id} onClick={() => setType(x.id)} title={x.blurb}>
                <span className="pick-title">{x.name}</span>
                <span className="pick-sub">{x.blurb}</span>
              </button>
            ))}
          </div>
          {lockedTypes > 0 && <div className="small muted">{lockedTypes} more kinds of chip to discover in Research.</div>}

          <div className="field">
            <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
              Generation
            </span>
            <div className="seg">
              {gens.map((g) => (
                <button key={g.id} aria-pressed={genId === g.id} onClick={() => setGenId(g.id)}>
                  {g.name}
                </button>
              ))}
            </div>
            {gens.length === 1 && <div className="small muted">Newer, faster generations come from Research as the years go by.</div>}
          </div>

          <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            How big?
          </div>
          <div className="pick-grid three">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="pick"
                aria-pressed={preset === p.id}
                onClick={() => {
                  setPreset(p.id);
                  setScale(p.scale);
                }}
              >
                <span className="pick-title">{p.label}</span>
                <span className="pick-sub">{p.blurb}</span>
              </button>
            ))}
          </div>

          <Floorplan split={norm} dieMm2={Math.round(pv.areaMm2)} stacks={Math.max(1, Math.round(norm.memory * 8))} details={details} />

          {details && (
            <>
              {BLOCKS.map((b) => (
                <div className="field" key={b.key}>
                  <div className="row between">
                    <label htmlFor={`cs-${b.key}`}>{b.label}</label>
                    <span className="small muted">
                      {Math.round(norm[b.key] * 100)}% · {type === 'cpu' ? b.cpu : b.gpu}
                    </span>
                  </div>
                  <input
                    id={`cs-${b.key}`}
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(split[b.key] * 100)}
                    onChange={(e) => setSplit((s) => ({ ...s, [b.key]: Number(e.target.value) / 100 }))}
                  />
                </div>
              ))}
              <div className="row between small">
                <span className="muted">Fit for a {t.name.toLowerCase()}: {Math.round(pv.fit * 100)}%</span>
                <button className="btn" onClick={() => setSplit({ ...t.ideal })}>
                  Reset to the textbook split
                </button>
              </div>
            </>
          )}

          <div className="outcomes">
            <div>
              <span className="k">Expected review</span>
              <span className="v">{pv.expectedScore.toFixed(1)}</span>
              <span className="s">{st.theirs !== null ? `${st.theirName.split(' ')[0]}'s latest ${st.theirs.toFixed(1)}` : 'no rivals yet'}</span>
            </div>
            <div>
              <span className="k">Ready in</span>
              <span className="v">{pv.months} months</span>
            </div>
            <div>
              <span className="k">Design cost</span>
              <span className="v">{money(pv.devCost)}</span>
            </div>
            <div>
              <span className="k">Sells for</span>
              <span className="v">{money(pv.price)}</span>
              <span className="s">costs {money(pv.unitCost)} to make</span>
            </div>
          </div>
          <div className="small muted">
            Chance of a bug in the first batch: {Math.round(pv.bugChance * 100)}%. A bug means fixing it and sending it again: half as long again and 40% more cost.
          </div>
          {pv.errors.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{pv.errors[0]}</div>}
          <button
            className="btn primary big"
            disabled={pv.errors.length > 0}
            onClick={() => {
              send({ type: 'startDesign', design });
              setName('');
            }}
          >
            Send to the factory
          </button>
        </div>
      )}

      <Shelf game={game} />
    </>
  );
}

function FactoryCard({ game, projectId }: { game: GameState; projectId: string }) {
  const send = useStore((s) => s.send);
  const p = game.founding!.projects.find((x) => x.id === projectId)!;
  const next = buzzCost(game, content, p.id);
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
      <div className="row between">
        <h3>At the factory: {p.design.name}</h3>
        <span className="small muted">
          {p.monthsLeft} month{p.monthsLeft === 1 ? '' : 's'} to go
        </span>
      </div>
      <div className="small">
        {typeOf(p.design.type).name} · {genName(p.design.genId)}
        {p.respun ? ' · fixing a bug from the first batch' : ''}
      </div>
      <Bar value={1 - p.monthsLeft / p.totalMonths} color={LAYER.silicon} />
      <div className="row between">
        <span className="small">
          Buzz {p.buzz}/100{' '}
          <span className="muted">
            {p.buzz === 0 ? '· nobody has heard of it yet' : p.buzz < 50 ? '· people are curious' : '· everyone is waiting for it'}
          </span>
        </span>
        {next && (
          <button className="btn" disabled={game.cash < next.cost} onClick={() => send({ type: 'buyBuzz', projectId: p.id })}>
            {next.label} ({money(next.cost)})
          </button>
        )}
      </div>
      <Bar value={p.buzz / 100} color={LAYER.products} />
      <div className="small muted">Buzz makes a good chip launch big. Too much buzz for a weak chip, and the reviews feel like a letdown.</div>
    </div>
  );
}

function Shelf({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const f = game.founding!;
  const onSale = f.products.filter((p) => !p.retired);
  const past = f.products.filter((p) => p.retired);
  if (!f.products.length) return null;
  return (
    <div className="card">
      <h3>On sale</h3>
      {onSale.length === 0 && <div className="muted small">Nothing on sale right now.</div>}
      {[...onSale].reverse().map((p) => {
        const now = scoreNowFor(p.score, game.week - p.month);
        const markup = p.price / p.unitCost;
        return (
          <div key={p.id} className="shelf-row">
            <div className="row between">
              <span>
                <strong>{p.design.name}</strong> <span className="small muted">· {typeOf(p.design.type).short}</span>
              </span>
              <span className="small" style={{ color: p.score >= 8 ? 'var(--good)' : p.score < 5 ? 'var(--bad)' : undefined }}>
                Review {p.score.toFixed(1)}
                <span className="muted"> · today {now.toFixed(1)}</span>
              </span>
            </div>
            <div className="row between small">
              <span className="muted">
                {money(p.lastMonthRevenue)} last month · {money(p.revenue)} in total
              </span>
              <span className="row">
                <button className="btn sm" aria-label="Lower price" onClick={() => send({ type: 'setChipPrice', productId: p.id, price: p.price * 0.9 })}>
                  −
                </button>
                <span title={`Costs ${money(p.unitCost)} to make`}>
                  {money(p.price)} <span className="muted">({markup.toFixed(1)}×)</span>
                </span>
                <button className="btn sm" aria-label="Raise price" onClick={() => send({ type: 'setChipPrice', productId: p.id, price: p.price * 1.1 })}>
                  +
                </button>
              </span>
            </div>
          </div>
        );
      })}
      <div className="small muted">
        The usual price is {TUNING.chipMarkup}× what a chip costs to make. Cheaper sells more; dearer earns more per chip. Old chips drift down as the industry moves on.
      </div>
      {past.length > 0 && <div className="small muted">{past.length} older chips retired.</div>}
    </div>
  );
}

/** Research: points from reviews and researchers buy new generations, kinds of chip and better tools. */
export function ResearchPanel({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const year = companyYear(game);
  const nodes = content.founding.research;
  const done = nodes.filter((r) => f.unlocked.includes(r.id));
  const open = nodes.filter((r) => !f.unlocked.includes(r.id));
  const now = open.filter((r) => !r.year || r.year <= year);
  const later = open.filter((r) => r.year && r.year > year).slice(0, 4);
  const row = (r: (typeof nodes)[number]) => {
    const err = researchError(game, content, r.id);
    return (
      <div className={`row between research-row${r.opensAiEra ? ' ai' : ''}`} key={r.id}>
        <span>
          <strong>{r.name}</strong>
          {r.opensAiEra && <span className="chip" style={{ ['--c' as string]: LAYER.models, marginLeft: 6 }}>Opens the AI chapter</span>}
          <br />
          <span className="small muted">{r.blurb}</span>
        </span>
        <button className="btn primary" disabled={!!err} title={err ?? undefined} onClick={() => send({ type: 'buyResearch', researchId: r.id })}>
          {r.cost} pts
        </button>
      </div>
    );
  };
  return (
    <>
      <Advisor who="mentor" color={LAYER.models}>
        Every chip we ship teaches us something, and researchers add a little every month. Newer generations unlock as the years go by.
      </Advisor>
      <div className="card" style={{ ['--c' as string]: LAYER.models }}>
        <div className="row between">
          <h3>Research points</h3>
          <span className="stat">
            <span className="v" style={{ color: LAYER.models }}>
              {Math.floor(f.researchPoints)}
            </span>
          </span>
        </div>
        {now.length === 0 && <div className="small muted">Nothing new to research this year.</div>}
        {now.map(row)}
      </div>
      {later.length > 0 && (
        <div className="card">
          <h3>Coming up</h3>
          {later.map((r) => (
            <div className="row between small" key={r.id} style={{ opacity: 0.7 }}>
              <span>
                <strong>{r.name}</strong> · {r.blurb}
              </span>
              <span className="muted">{r.year}</span>
            </div>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="card">
          <h3>Done</h3>
          <div className="chips">
            {done.map((r) => (
              <span key={r.id} className="chip" style={{ ['--c' as string]: LAYER.models }}>
                ✓ {r.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Team in the chip-company years: designers, salespeople and researchers, once there's an office. */
export function FoundingTeam({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const inGarage = game.hq.stage === 'garage';
  const move = moveCheck(game, content);
  const roles = [
    { id: 'hardwareEng' as const, label: 'Chip designers', does: 'Better chips, fewer bugs. Every five lets us design another chip at the same time. Best at a workbench or in a hardware lab.', color: LAYER.silicon },
    { id: 'product' as const, label: 'Salespeople', does: 'Sell more of every chip (+5% each). Best in a product studio.', color: LAYER.products },
    { id: 'research' as const, label: 'Researchers', does: 'Bring in research points every month. They need a research lab.', color: LAYER.models },
  ];
  return (
    <>
      <Advisor who="mentor" color={LAYER.gold}>
        {inGarage
          ? `The garage only fits you. ${move.error ?? 'You can afford an office now: see HQ.'}`
          : 'Each person costs a salary every month. Make sure they have a seat, and the right room for their work.'}
      </Advisor>
      {roles.map((r) => (
        <div className="card" key={r.id} style={{ ['--c' as string]: r.color }}>
          <div className="row between">
            <h3>{r.label}</h3>
            <span className="stat">
              <span className="v">{game.staff[r.id]}</span>
            </span>
          </div>
          <div className="small muted">
            {r.does}
            {r.id === 'hardwareEng' ? ' Includes you, the founder.' : ''}
          </div>
          <div className="row">
            <button className="btn" disabled={inGarage || game.cash < TUNING.foundingHireCost} onClick={() => send({ type: 'hire', discipline: r.id })}>
              Hire one ({money(TUNING.foundingHireCost)}, then {money(TUNING.foundingSalaryPerMonth)}/month)
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

/** Rivals: who leads each market, and every maker's latest chip. */
export function FoundingRivals({ game }: { game: GameState }) {
  const f = game.founding!;
  const shares = segmentShares(game, content);
  const segName = (id: string) => content.founding.segments.find((s) => s.id === id)?.name ?? id;
  const behind = shares.find((s) => s.leader !== 'you' && s.leader);
  return (
    <>
      <Advisor who="mentor" color={LAYER.products}>
        {behind
          ? `${rivalDef(behind.leader).name} leads ${segName(behind.segmentId).toLowerCase()}. A new, better chip there would change that.`
          : f.products.length
            ? 'We lead every market we sell in. The rivals will keep trying.'
            : 'The established makers own every market today. Our first chip changes that.'}
      </Advisor>
      <div className="card">
        <h3>Markets</h3>
        <table className="t">
          <thead>
            <tr>
              <th>Market</th>
              <th>Buys</th>
              <th>Our share</th>
              <th>Leader</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => {
              const seg = content.founding.segments.find((x) => x.id === s.segmentId)!;
              return (
                <tr key={s.segmentId} className={s.leader === 'you' ? 'you' : undefined}>
                  <td>
                    {seg.name}
                    <br />
                    <span className="small muted">{money(s.spend)}/month</span>
                  </td>
                  <td className="small">{typeOf(seg.buys).short}</td>
                  <td>{Math.round(s.share * 100)}%</td>
                  <td className="small">{s.leader === 'you' ? 'Us' : s.leader ? rivalDef(s.leader).name : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Their latest chips</h3>
        <table className="t">
          <tbody>
            {f.rivals
              .filter((r) => r.chips > 0)
              .map((r) => {
                const def = rivalDef(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{def.name}</strong>
                      <br />
                      <span className="small muted">{def.personality}</span>
                    </td>
                    <td className="small">{r.lastChip}</td>
                    <td>{scoreNowFor(r.score, game.week - r.month).toFixed(1)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <div className="small muted">Scores are as the chips rate today: every chip slips about a point a year as the industry moves on.</div>
      </div>
    </>
  );
}

