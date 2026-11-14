import { useEffect, useState } from 'react';
import { content, type FitLevel } from '@stm/content';
import {
  chipSales,
  fitKey,
  foundingYear,
  isUnlocked,
  moveCheck,
  projectPreview,
  researchError,
  teamOutput,
  TUNING,
  type FoundingChip,
  type GameState,
} from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { BAD, LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

const FIT_MARK: Record<FitLevel, { mark: string; label: string; color: string }> = {
  great: { mark: '✓', label: 'Great fit', color: LAYER.env },
  ok: { mark: '~', label: 'OK fit', color: LAYER.gold },
  poor: { mark: '✗', label: 'Poor fit', color: BAD },
};

const typeName = (id: string) => content.founding.types.find((t) => t.id === id)?.name ?? id;
const marketName = (id: string) => content.founding.markets.find((m) => m.id === id)?.name ?? id;
const genName = (id: string) => content.founding.generations.find((g) => g.id === id)?.name ?? id;

/** Company tab in the founding years: last month's books, the chapter so far. */
export function FoundingOverview({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const r = f.report;
  const net = r ? r.sales - r.salaries - r.rent - r.upkeep : 0;
  const year = foundingYear(game);
  const fd = content.founding;
  const span = fd.endYear - fd.startYear + 1;
  const best = f.chips.reduce<FoundingChip | null>((b, c) => (!b || c.score > b.score ? c : b), null);
  return (
    <>
      <Advisor who="mentor" color={LAYER.trust}>
        {f.chapterDone
          ? 'What a decade. The chips you made in that garage now sit in millions of machines. Something bigger is coming: computers that learn.'
          : f.chips.length === 0
            ? 'Every big chip company started like this: one person, one bench, one idea. Head to New chip and pick something small to start with.'
            : 'Watch the reviews. They tell you which chips suit which customers, and every chip earns research points for something new.'}
      </Advisor>

      {f.chapterDone && (
        <div className="card chapter-card" style={{ ['--c' as string]: LAYER.models }}>
          <h3>The {fd.startYear}s are over</h3>
          <div className="small">
            {game.companyName} shipped {f.chips.length} chips{best ? `; the best, ${best.name}, reviewed ${best.score.toFixed(1)}/10` : ''}. The next chapter jumps ahead to
            the age of artificial intelligence. You keep your name, your people, your building and your money.
          </div>
          <button className="btn primary big" disabled={!!game.pendingEvent} onClick={() => send({ type: 'startAiEra' })}>
            Continue into the AI era
          </button>
          <div className="small muted">Or keep making chips here as long as you like.</div>
        </div>
      )}

      <div className="card">
        <h3>Last month</h3>
        {r ? (
          <>
            <div className="grid3">
              <Stat k="Sales" v={money(r.sales)} c={LAYER.products} />
              <Stat k="Costs" v={money(r.salaries + r.rent + r.upkeep)} />
              <Stat k="Net" v={money(net)} c={net >= 0 ? 'var(--good)' : 'var(--bad)'} />
            </div>
            <div className="small muted">
              Salaries {money(r.salaries)} · rent {money(r.rent)} · rooms {money(r.upkeep)}. New chips cost money up front when you start them.
            </div>
          </>
        ) : (
          <div className="muted">Play a month to see how the books look.</div>
        )}
      </div>

      <div className="card">
        <h3>The story so far</h3>
        <div className="grid3">
          <Stat k="Chips shipped" v={f.chips.length} c={LAYER.silicon} />
          <Stat k="Best review" v={best ? best.score.toFixed(1) : '–'} c={LAYER.gold} />
          <Stat k="Customer trust" v={Math.round(f.trust)} />
        </div>
        <div className="small">
          {year > fd.endYear ? `Chapter complete` : `${year}: year ${year - fd.startYear + 1} of ${span}`}
        </div>
        <Bar value={Math.min(1, game.week / (span * 12))} color={LAYER.models} />
        <div className="small muted">Trust grows with good reviews and sells more of every chip.</div>
      </div>
    </>
  );
}

/** New chip: pick a type, a market and a generation, then watch it get built. */
export function ProjectPanel({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const fd = content.founding;
  const types = fd.types.filter((t) => isUnlocked(content, f, 'type', t.id));
  const markets = fd.markets.filter((m) => isUnlocked(content, f, 'market', m.id));
  const gens = fd.generations.filter((g) => isUnlocked(content, f, 'generation', g.id));
  const [typeId, setTypeId] = useState(types[0]!.id);
  const [marketId, setMarketId] = useState(markets[0]!.id);
  const [genId, setGenId] = useState(gens[gens.length - 1]!.id);
  const [name, setName] = useState('');
  useEffect(() => setGenId(gens[gens.length - 1]!.id), [gens.length]); // newest generation once researched
  const chipName = name || `${typeName(typeId).split(' ')[0]} ${f.chips.length + 1}`;
  const pv = projectPreview(game, content, typeId, marketId, genId);
  const lockedTypes = fd.types.length - types.length;
  const lockedMarkets = fd.markets.length - markets.length;

  return (
    <>
      <Advisor who="mentor" color={LAYER.silicon}>
        {f.project
          ? 'Nothing to do but keep at it. Speed up the clock if you like; I will tell you when the reviews are in.'
          : f.chips.length === 0
            ? 'Pick a chip and who to sell it to. Some pairs just click, others flop. You only find out from the reviews.'
            : 'Pairs you have tried show ✓ great, ~ OK or ✗ poor. Try new ones to learn, or stick with what works.'}
      </Advisor>

      {f.project ? (
        <ProjectProgress game={game} />
      ) : (
        <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
          <h3>Design a new chip</h3>
          <div className="field">
            <label htmlFor="chip-name">Name</label>
            <input id="chip-name" value={name} placeholder={chipName} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            What kind of chip?
          </div>
          <div className="pick-grid">
            {types.map((t) => (
              <button key={t.id} className="pick" aria-pressed={typeId === t.id} onClick={() => setTypeId(t.id)} title={t.blurb}>
                <span className="pick-title">{t.name}</span>
                <span className="pick-sub">{t.months} months</span>
              </button>
            ))}
          </div>
          {lockedTypes > 0 && <div className="small muted">{lockedTypes} more kinds of chip to discover in Research.</div>}

          <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
            Who will buy it?
          </div>
          <div className="pick-grid">
            {markets.map((m) => {
              const known = f.fitKnown[fitKey(typeId, m.id)];
              return (
                <button key={m.id} className="pick" aria-pressed={marketId === m.id} onClick={() => setMarketId(m.id)} title={m.blurb}>
                  <span className="pick-title">{m.name}</span>
                  <span className="pick-sub" style={known ? { color: FIT_MARK[known].color } : undefined}>
                    {known ? `${FIT_MARK[known].mark} ${FIT_MARK[known].label}` : '? Not tried yet'}
                  </span>
                </button>
              );
            })}
          </div>
          {lockedMarkets > 0 && <div className="small muted">{lockedMarkets} more markets to open up in Research.</div>}

          {gens.length > 1 && (
            <div className="field">
              <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                Generation
              </span>
              <div className="seg">
                {gens.map((g) => (
                  <button key={g.id} aria-pressed={genId === g.id} onClick={() => setGenId(g.id)}>
                    {g.name} · {money(g.devCost)}
                  </button>
                ))}
              </div>
              <div className="small muted">Newer generations make better chips but cost more to design.</div>
            </div>
          )}

          <div className="outcomes">
            <div>
              <span className="k">Ready in</span>
              <span className="v">{pv.months} months</span>
            </div>
            <div>
              <span className="k">Costs</span>
              <span className="v">{money(pv.cost)}</span>
            </div>
            <div>
              <span className="k">Expected review</span>
              <span className="v">{pv.expectedScore.toFixed(1)}</span>
              <span className="s">{pv.knownFit ? FIT_MARK[pv.knownFit].label.toLowerCase() : 'if the fit is OK'}</span>
            </div>
          </div>
          {pv.errors.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{pv.errors[0]}</div>}
          <button
            className="btn primary big"
            disabled={pv.errors.length > 0}
            onClick={() => {
              send({ type: 'startProject', name: chipName, typeId, marketId, genId });
              setName('');
            }}
          >
            Start designing
          </button>
        </div>
      )}

      <ChipShelf game={game} />
    </>
  );
}

function ProjectProgress({ game }: { game: GameState }) {
  const p = game.founding!.project!;
  const out = teamOutput(game, content);
  const done = 1 - p.monthsLeft / p.totalMonths;
  const type = content.founding.types.find((t) => t.id === p.typeId)!;
  const points = p.design + p.polish;
  const share = points ? p.design / points : 0.5;
  return (
    <div className="card" style={{ ['--c' as string]: LAYER.silicon }}>
      <div className="row between">
        <h3>Designing {p.name}</h3>
        <span className="small muted">
          {p.monthsLeft} month{p.monthsLeft === 1 ? '' : 's'} to go
        </span>
      </div>
      <div className="small">
        {typeName(p.typeId)} for {marketName(p.marketId).toLowerCase()} · {genName(p.genId)}
      </div>
      <Bar value={done} color={LAYER.silicon} />
      <div className="grid2">
        <Stat k="Design points" v={Math.round(p.design)} c={LAYER.silicon} />
        <Stat k="Polish points" v={Math.round(p.polish)} c={LAYER.products} />
      </div>
      <div className="small muted">
        The team adds about {Math.round(out.total)} points a month. A {type.name.toLowerCase()} wants about {Math.round(type.design * 100)}% design work;
        this one is at {Math.round(share * 100)}%. {share < type.design - 0.1 ? 'More chip designers would help.' : share > type.design + 0.1 ? 'A salesperson would add polish.' : 'Nicely balanced.'}
      </div>
    </div>
  );
}

function ChipShelf({ game }: { game: GameState }) {
  const f = game.founding!;
  if (!f.chips.length) return null;
  return (
    <div className="card">
      <h3>Our chips</h3>
      <table className="t">
        <thead>
          <tr>
            <th>Chip</th>
            <th>For</th>
            <th>Review</th>
            <th>Sold</th>
          </tr>
        </thead>
        <tbody>
          {[...f.chips].reverse().slice(0, 10).map((c) => {
            const selling = chipSales(c, c.monthsOnSale) > 0;
            return (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {selling && <span className="small muted"> · selling</span>}
                </td>
                <td className="small">{marketName(c.marketId)}</td>
                <td style={{ color: c.score >= 8 ? 'var(--good)' : c.score < 5 ? 'var(--bad)' : undefined }}>{c.score.toFixed(1)}</td>
                <td>{money(c.totalSales)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Research: spend points from reviews on new chips, markets, generations and better tools. */
export function ResearchPanel({ game }: { game: GameState }) {
  const f = game.founding!;
  const send = useStore((s) => s.send);
  const year = foundingYear(game);
  const nodes = content.founding.research;
  const done = nodes.filter((r) => f.unlocked.includes(r.id));
  const open = nodes.filter((r) => !f.unlocked.includes(r.id));
  return (
    <>
      <Advisor who="mentor" color={LAYER.models}>
        Every chip you ship teaches you something: that is your research points. Better reviews and new kinds of chip teach more.
      </Advisor>
      <div className="card" style={{ ['--c' as string]: LAYER.models }}>
        <div className="row between">
          <h3>Research points</h3>
          <span className="stat">
            <span className="v" style={{ color: LAYER.models }}>
              {f.researchPoints}
            </span>
          </span>
        </div>
        {open.map((r) => {
          const err = researchError(game, content, r.id);
          const tooEarly = !!r.year && year < r.year;
          return (
            <div className="row between research-row" key={r.id} style={{ opacity: tooEarly ? 0.55 : 1 }}>
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="small muted">
                  {r.blurb}
                  {tooEarly ? ` Available from ${r.year}.` : ''}
                </span>
              </span>
              <button className="btn primary" disabled={!!err} title={err ?? undefined} onClick={() => send({ type: 'buyResearch', researchId: r.id })}>
                {r.cost} pts
              </button>
            </div>
          );
        })}
      </div>
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

/** Team in the founding years: chip designers and salespeople, once there's an office. */
export function FoundingTeam({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const inGarage = game.hq.stage === 'garage';
  const move = moveCheck(game, content);
  const roles = [
    { id: 'hardwareEng' as const, label: 'Chip designers', does: 'Design work. They do their best at a workbench or in a hardware lab.', color: LAYER.silicon },
    { id: 'product' as const, label: 'Salespeople', does: 'Polish and customer feedback. They do their best in a product studio.', color: LAYER.products },
  ];
  return (
    <>
      <Advisor who="mentor" color={LAYER.gold}>
        {inGarage
          ? `The garage only fits you. ${move.error ?? 'You can afford an office now: see HQ.'}`
          : 'More people means better chips, but each one costs a salary every month. Make sure they have a seat.'}
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

/** The founding-era leaderboard: whose latest chip reviewed best. */
export function FoundingRivals({ game }: { game: GameState }) {
  const f = game.founding!;
  const mine = f.chips.at(-1);
  const rows = [
    ...f.rivals.map((r) => {
      const def = content.founding.rivals.find((d) => d.id === r.id)!;
      return { id: r.id, name: def.name, note: def.personality, chip: r.lastChip || 'Nothing yet', score: r.score, you: false };
    }),
    { id: 'you', name: game.companyName, note: '', chip: mine?.name ?? 'Nothing yet', score: mine?.score ?? 0, you: true },
  ].sort((a, b) => b.score - a.score);
  const rank = rows.findIndex((r) => r.you);
  const ahead = rank > 0 ? rows[rank - 1] : null;
  return (
    <>
      <Advisor who="mentor" color={LAYER.products}>
        {ahead
          ? `${ahead.name}'s latest reviewed ${ahead.score.toFixed(1)}. Beat that with your next chip.`
          : 'Your latest chip is the best on the market. They will try to catch up.'}
      </Advisor>
      <div className="card">
        <h3>Latest chips, by review</h3>
        <table className="t">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.you ? 'you' : undefined}>
                <td>{i + 1}</td>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  <span className="small muted">{r.you ? 'That’s us' : r.note}</span>
                </td>
                <td className="small">{r.chip}</td>
                <td>{r.score ? r.score.toFixed(1) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted">Rivals pace themselves against the industry and against us: they never run away, but they never stand still.</div>
      </div>
    </>
  );
}
