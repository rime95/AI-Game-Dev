// Quick headless playthrough with a simple scripted strategy, to sanity-check the economy.
// Run: npx vite-node packages/sim/test/balance.ts  (or via vitest's node runner)
import { content } from '@stm/content';
import {
  applyCommand,
  bestScore,
  cloudSupply,
  createGame,
  freeChips,
  getChip,
  maxClusterChips,
  previewTraining,
  rentedChips,
  type Command,
  type GameState,
} from '../src';

function act(s: GameState, cmd: Command): GameState {
  const r = applyCommand(s, content, cmd);
  return r.state;
}

let s = createGame(content, 123);
s = act(s, { type: 'rentChips', chipId: 'kite-k1', count: 64 });
let gen = 0;
const plan = [
  { paramsB: 7, tokensB: 140, chips: 64 },
  { paramsB: 13, tokensB: 260, chips: 512 },
  { paramsB: 34, tokensB: 680, chips: 1024 },
  { paramsB: 70, tokensB: 1400, chips: 2048 },
];

for (let w = 0; w < 156 && s.status === 'playing'; w++) {
  if (s.pendingEvent) s = act(s, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id });
  const next = plan[gen];
  if (!s.training && next) {
    if (s.dataTokensB < next.tokensB) s = act(s, { type: 'buyData', billions: next.tokensB - s.dataTokensB });
    while (maxClusterChips(s) < next.chips) s = act(s, { type: 'hire', discipline: 'modelEng' });
    const k1 = getChip(content, 'kite-k1')!;
    const canRent = cloudSupply(k1, s.week) - rentedChips(s, 'kite-k1');
    const want = next.chips - freeChips(s, 'kite-k1');
    if (want > 0 && canRent > 0) s = act(s, { type: 'rentChips', chipId: 'kite-k1', count: Math.min(want, canRent) });
    const chips = Math.min(next.chips, freeChips(s, 'kite-k1'));
    const spec = { name: `G${gen + 1}`, archId: 'dense', paramsB: next.paramsB, tokensB: next.tokensB, precision: 'fp8' as const, chipId: 'kite-k1', chipCount: chips };
    const p = previewTraining(s, content, spec);
    if (!p.errors.length) {
      s = act(s, { type: 'startTraining', spec });
      console.log(`wk ${s.week}: start G${gen + 1} ${next.paramsB}B → proj ${p.projectedScore.toFixed(1)}, ${p.weeks} wk`);
      gen++;
    }
  }
  s = act(s, { type: 'advanceWeek' });
  if (s.week % 13 === 0) {
    const lw = s.lastWeek!;
    const top = Math.max(...s.rivals.map((r) => r.score));
    console.log(
      `wk ${s.week}: cash ${(s.cash / 1e6).toFixed(1)}M users ${(s.users / 1e6).toFixed(2)}M rev ${(lw.revenue / 1e3).toFixed(0)}K ` +
        `cost ${((lw.salaries + lw.rent + lw.power) / 1e3).toFixed(0)}K best ${bestScore(s).toFixed(1)} topRival ${top.toFixed(1)} served ${(lw.servedTokens / Math.max(1, lw.demandTokens) * 100).toFixed(0)}%`,
    );
  }
}
console.log('status', s.status, 'week', s.week);
