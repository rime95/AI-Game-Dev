import { content, type AcquisitionGains } from '@stm/content';
import { availableDeals, DISCIPLINE_LABEL, type Deal, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { BAD, LAYER } from '../ui/layers';
import { Advisor, Bar } from './Panel';

const KIND: Record<Deal['kind'], { label: string; color: string }> = {
  team: { label: 'Team', color: LAYER.gold },
  ip: { label: 'Know-how', color: LAYER.models },
  data: { label: 'Data', color: LAYER.models },
  infra: { label: 'Infrastructure', color: LAYER.power },
  customers: { label: 'Customers', color: LAYER.products },
  rival: { label: 'Rival lab', color: BAD },
};

export function gainsText(g: AcquisitionGains): string[] {
  const out: string[] = [];
  for (const s of g.staff ?? []) out.push(`+${s.count} ${DISCIPLINE_LABEL[s.discipline]}${s.count > 1 ? 's' : ''}`);
  if (g.dataTokensB) out.push(`+${big(g.dataTokensB * 1e9)} tokens of training data`);
  if (g.users) out.push(`+${big(g.users)} users`);
  if (g.ipBonus) out.push(`+${Math.round(g.ipBonus * 100)}% smarter training`);
  if (g.powerMW) out.push(`+${g.powerMW} MW of power`);
  if (g.chips) out.push(`+${big(g.chips.count)} ${content.chips.find((c) => c.id === g.chips!.chipId)?.name ?? 'chips'}`);
  return out;
}

export function DealsPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const deals = availableDeals(game, content).sort((a, b) => (a.kind === 'rival' ? -1 : 0) - (b.kind === 'rival' ? -1 : 0) || a.price - b.price);
  const upcoming = content.startups.filter((s) => s.availableFromWeek > game.week).sort((a, b) => a.availableFromWeek - b.availableFromWeek)[0];

  return (
    <>
      <Advisor who="deals" color={LAYER.gold}>
        Buying a company is the fastest way to get people, data, power or users. Merging takes a few weeks. Teams can clash with ours
        (ops engineers help), and once we're big, regulators look at every deal (compliance helps).
      </Advisor>

      {game.integrations.map((d) => (
        <div className="card" key={d.dealId} style={{ ['--c' as string]: LAYER.gold }}>
          <div className="row between">
            <h3>Merging with {d.name}</h3>
            <span className="small muted">{d.weeksLeft} weeks left</span>
          </div>
          <Bar value={1 - d.weeksLeft / d.totalWeeks} color={LAYER.gold} />
          <div className="small muted">
            {gainsText(d.gives).join(' · ')}
            {d.antitrustChance > 0 ? ` · ${pct(d.antitrustChance)} chance regulators block it` : ''}
            {d.clashChance > 0 ? ` · ${pct(d.clashChance)} chance of a culture clash` : ''}
          </div>
        </div>
      ))}

      {deals.length === 0 && <div className="card muted">No companies for sale right now.</div>}
      {deals.map((d) => (
        <div className="card" key={d.id} style={{ borderTop: `4px solid ${KIND[d.kind].color}` }}>
          <div className="row between">
            <h3>{d.name}</h3>
            <span className="chip" style={{ ['--c' as string]: KIND[d.kind].color }}>
              {KIND[d.kind].label}
            </span>
          </div>
          <div className="small">{d.blurb}</div>
          <div className="chips">
            {gainsText(d.gives).map((t) => (
              <span key={t} className="chip" style={{ ['--c' as string]: LAYER.env }}>
                {t}
              </span>
            ))}
            {d.clashChance > 0 && (
              <span className="chip" style={{ ['--c' as string]: BAD }}>
                {pct(d.clashChance)} chance of culture clash
              </span>
            )}
            {d.antitrustChance > 0 && (
              <span className="chip" style={{ ['--c' as string]: BAD }}>
                {pct(d.antitrustChance)} chance regulators block it
              </span>
            )}
          </div>
          <div className="row between">
            <span className="small muted">
              {money(d.price)} · {d.integrationWeeks} weeks to merge
            </span>
            <button
              className="btn primary"
              style={{ ['--c' as string]: LAYER.gold }}
              disabled={d.price > game.cash}
              onClick={() => send({ type: 'acquire', dealId: d.id })}
            >
              Buy
            </button>
          </div>
        </div>
      ))}

      {upcoming && (
        <div className="card muted small">
          Next on the market: {upcoming.name} around week {upcoming.availableFromWeek}. Struggling rival labs (under{' '}
          {pct(0.03)} share) go up for sale from week 52.
        </div>
      )}

      {game.acquired.length > 0 && (
        <div className="card">
          <h3>Acquired</h3>
          <div className="small">
            {game.acquired
              .map((id) => content.startups.find((s) => s.id === id)?.name ?? content.rivals.find((r) => `rival:${r.id}` === id)?.name ?? id)
              .join(' · ')}
          </div>
          {game.ipBonus > 0 && <div className="small muted">Their know-how makes our training {Math.round(game.ipBonus * 100)}% more effective.</div>}
        </div>
      )}
    </>
  );
}
