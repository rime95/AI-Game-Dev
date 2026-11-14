import { content } from '@stm/content';
import { allChips, archFit, buyAllowance, cloudSupply, freeChips, ownedPowerMW, rentedChips, reservedChips, serverLayout, totalChips, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, money, pct } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, Bar, Stat } from './Panel';

export function ComputePanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const power = ownedPowerMW(game, content);
  const servers = serverLayout(game, content);
  const ownedTotal = game.fleet.filter((f) => f.owned).reduce((n, f) => n + f.count, 0);

  return (
    <>
      <Advisor who="Infrastructure lead" color={LAYER.compute}>
        Rented chips cost rent every week. Bought chips cost cash up front, then power — they need site power, and a rack in an HQ server room (or colocation space).
        Match the chip to the model: check the fit chips below.
      </Advisor>
      {ownedTotal > 0 && (
        <div className="card">
          <h3>Where owned chips live</h3>
          <div className="small">
            {ownedTotal - servers.colo} racked at HQ{servers.rooms.some((r) => r.throttle < 1) ? ' (some throttled: add cooling in HQ)' : ''} ·{' '}
            {servers.colo} in colocation at {money(TUNING.colocationPerChipWeek)}/chip/week. Build server rooms in HQ to bring them home.
          </div>
        </div>
      )}

      <div className="card" style={{ ['--c' as string]: LAYER.power }}>
        <div className="row between">
          <h3>Colo site power</h3>
          <span className="small muted">
            {power.toFixed(2)} / {game.powerCapMW} MW
          </span>
        </div>
        <Bar value={power / game.powerCapMW} color={LAYER.power} />
        <div className="small muted">Only owned chips draw from your site. Rented chips run in someone else's data center.</div>
      </div>

      {allChips(game, content).map((chip) => {
        const dense = archFit(chip, content.archs.find((a) => a.id === 'dense')!);
        const moe = archFit(chip, content.archs.find((a) => a.id === 'moe')!);
        const custom = game.customChips.some((c) => c.id === chip.id);
        return (
          <div className="card" key={chip.id} style={custom ? { borderColor: LAYER.silicon, borderWidth: 2 } : undefined}>
            <div className="row between">
              <div>
                <h3>{chip.name}</h3>
                <div className="sub">{chip.vendor}</div>
              </div>
              <div className="small muted" style={{ textAlign: 'right' }}>
                You have {big(totalChips(game, chip.id))}
                <br />
                {reservedChips(game, chip.id) > 0 && `${big(reservedChips(game, chip.id))} training`}
              </div>
            </div>
            <div className="small">{chip.blurb}</div>
            <div className="grid3">
              <Stat k="FP16 / FP8 / FP4" v={`${chip.tflops.fp16}/${chip.tflops.fp8}/${chip.tflops.fp4 || '—'}`} c={LAYER.compute} />
              <Stat k="Memory" v={`${chip.memGB} GB`} />
              <Stat k="Bandwidth" v={`${chip.memBwTBs} TB/s`} />
              <Stat k="Links" v={`${chip.interconnectGBs} GB/s`} />
              <Stat k="Power" v={`${chip.watts} W`} c={LAYER.power} />
              <Stat k={custom ? 'Foundry price' : 'Rent / Buy'} v={custom ? money(chip.priceUsd) : `${money(chip.rentPerWeekUsd)}/wk · ${money(chip.priceUsd)}`} />
            </div>
            <div className="small muted">
              {custom
                ? 'Our own silicon: bought from the foundry at cost, never rented.'
                : cloudSupply(chip, game.week) === 0
                ? `Not on the cloud market until week ${chip.cloudFromWeek}.`
                : `Cloud can rent you ${big(Math.max(0, cloudSupply(chip, game.week) - rentedChips(game, chip.id)))} more (supply grows ${pct(chip.cloudGrowth)}/wk).`}
              {' '}
              {custom ? 'The foundry' : chip.vendor} ships up to {big(buyAllowance(game, chip))} more units this week.
            </div>
            <div className="chips">
              <span className="chip" style={{ ['--c' as string]: LAYER.models }}>
                Dense fit {pct(dense.fit)}
              </span>
              <span className="chip" style={{ ['--c' as string]: moe.fit < 0.6 ? '#c2413b' : LAYER.models }}>
                MoE fit {pct(moe.fit)}
              </span>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {(custom ? [] : [8, 64, 512]).map((n) => (
                <button key={`r${n}`} className="btn" onClick={() => send({ type: 'rentChips', chipId: chip.id, count: n })}>
                  Rent {n}
                </button>
              ))}
              {(custom ? [8, 64, 512] : [8, 64, 256]).map((n) => (
                <button key={`b${n}`} className="btn" onClick={() => send({ type: 'buyChips', chipId: chip.id, count: n })}>
                  Buy {n}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="card">
        <h3>Your fleet</h3>
        {game.fleet.length === 0 && <div className="muted">No chips yet.</div>}
        {game.fleet.map((f) => {
          const chip = allChips(game, content).find((c) => c.id === f.chipId);
          const free = Math.min(f.count, freeChips(game, f.chipId));
          return (
            <div className="row between" key={f.id}>
              <span>
                {big(f.count)} × {chip?.name} <span className="muted small">{f.owned ? 'owned' : 'rented'}</span>
              </span>
              <span className="row">
                <button
                  className="btn"
                  disabled={free < Math.min(8, f.count)}
                  onClick={() => send({ type: 'releaseChips', fleetId: f.id, count: Math.min(8, f.count) })}
                >
                  {f.owned ? 'Sell' : 'Return'} {Math.min(8, f.count)}
                </button>
                <button className="btn" disabled={free < f.count} onClick={() => send({ type: 'releaseChips', fleetId: f.id, count: f.count })}>
                  All
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
