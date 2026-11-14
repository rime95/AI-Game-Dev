import { content } from '@stm/content';
import { allChips, archFit, buyAllowance, cloudSupply, freeChips, ownedPowerMW, rentedChips, reservedChips, serverLayout, totalChips, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { big, homes, money, pct, times } from '../format';
import { BAD, LAYER } from '../ui/layers';
import { Term } from '../ui/Term';
import { Advisor, Bar, Stat, useDetails, useSubTab } from './Panel';
import { STARTER_CHIP } from './SiliconPanel';

export function ComputePanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const power = ownedPowerMW(game, content);
  const servers = serverLayout(game, content);
  const ownedTotal = game.fleet.filter((f) => f.owned).reduce((n, f) => n + f.count, 0);
  const sub = useSubTab('compute');
  const details = useDetails();

  return (
    <>
      <Advisor who="infra" color={LAYER.compute}>
        {game.fleet.length === 0
          ? 'Start by renting a few chips: 64 Kite K1s are plenty for a first model. Renting costs a little every week; buying costs more up front but is cheaper in the long run.'
          : 'Rented chips cost rent every week. Bought chips cost cash up front, then power, and they need a home: a server room in HQ, or rented rack space until we have one.'}
      </Advisor>
      {sub === 'fleet' && ownedTotal > 0 && (
        <div className="card">
          <h3>Where our chips live</h3>
          <div className="small">
            {ownedTotal - servers.colo} in our HQ server rooms{servers.rooms.some((r) => r.throttle < 1) ? ' (some are running hot: add cooling in HQ)' : ''} ·{' '}
            {servers.colo} in <Term k="rackSpace">rented rack space</Term> at {money(TUNING.colocationPerChipWeek)} per chip each week. Build server rooms in
            HQ to bring them home.
          </div>
        </div>
      )}

      {sub === 'market' && (<>
      <div className="card" style={{ ['--c' as string]: LAYER.power }}>
        <div className="row between">
          <h3>
            <Term k="power" /> we use
          </h3>
          <span className="small muted">
            {power.toFixed(2)} of {game.powerCapMW} MW · enough for {homes(game.powerCapMW)}
          </span>
        </div>
        <Bar value={power / game.powerCapMW} color={LAYER.power} />
        <div className="small muted">Only chips we own use our power. Rented chips run in someone else's data center.</div>
      </div>

      {allChips(game, content).map((chip) => {
        const dense = archFit(chip, content.archs.find((a) => a.id === 'dense')!);
        const moe = archFit(chip, content.archs.find((a) => a.id === 'moe')!);
        const custom = game.customChips.some((c) => c.id === chip.id);
        return (
          <div className="card" key={chip.id} style={custom ? { ['--c' as string]: LAYER.silicon, borderColor: LAYER.silicon } : undefined}>
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
            {details ? (
            <div className="grid3">
              <Stat k="TFLOPS FP16 / FP8 / FP4" v={`${chip.tflops.fp16}/${chip.tflops.fp8}/${chip.tflops.fp4 || '—'}`} c={LAYER.compute} />
              <Stat k="Memory (HBM)" v={`${chip.memGB} GB`} />
              <Stat k="Bandwidth" v={`${chip.memBwTBs} TB/s`} />
              <Stat k="Links" v={`${chip.interconnectGBs} GB/s`} />
              <Stat k="Power" v={`${chip.watts} W`} c={LAYER.power} />
              <Stat k={custom ? 'Factory price' : 'Rent / Buy'} v={custom ? money(chip.priceUsd) : `${money(chip.rentPerWeekUsd)}/wk · ${money(chip.priceUsd)}`} />
            </div>
            ) : (
            <div className="grid3">
              <Stat k="Speed" v={times(chip.tflops.fp16 / STARTER_CHIP.tflops.fp16)} c={LAYER.compute} />
              <Stat k="Memory" v={`${chip.memGB} GB`} />
              <Stat k={custom ? 'Price to make' : 'Rent per week'} v={money(custom ? chip.priceUsd : chip.rentPerWeekUsd)} />
            </div>
            )}
            {details && (
            <div className="small muted">
              {custom
                ? 'Our own silicon: bought from the foundry at cost, never rented.'
                : cloudSupply(chip, game.week) === 0
                ? `Not on the cloud market until week ${chip.cloudFromWeek}.`
                : `Cloud can rent you ${big(Math.max(0, cloudSupply(chip, game.week) - rentedChips(game, chip.id)))} more (supply grows ${pct(chip.cloudGrowth)}/wk).`}
              {' '}
              {custom ? 'The factory' : chip.vendor} ships up to {big(buyAllowance(game, chip))} more units this week.
            </div>
            )}
            <div className="chips">
              {details ? (
                <>
                  <span className="chip" style={{ ['--c' as string]: LAYER.models }}>
                    All-rounder fit {pct(dense.fit)}
                  </span>
                  <span className="chip" style={{ ['--c' as string]: moe.fit < 0.6 ? BAD : LAYER.models }}>
                    Team-of-experts fit {pct(moe.fit)}
                  </span>
                </>
              ) : (
                <>
                  {!custom && <span className="chip" style={{ ['--c' as string]: LAYER.gold }}>Buy for {money(chip.priceUsd)} each</span>}
                  <span className="chip" style={{ ['--c' as string]: moe.fit < 0.6 ? LAYER.models : LAYER.silicon }}>
                    {moe.fit < 0.6 ? 'Best for all-rounder models' : 'Great for any model'}
                  </span>
                  {!custom && cloudSupply(chip, game.week) === 0 && (
                    <span className="chip" style={{ ['--c' as string]: LAYER.trust }}>For rent from week {chip.cloudFromWeek}</span>
                  )}
                </>
              )}
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
      </>)}

      {sub === 'fleet' && (
      <div className="card">
        <h3>Our chips</h3>
        {game.fleet.length === 0 && <div className="muted">No chips yet. Rent some in Chip market.</div>}
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
      )}
    </>
  );
}
