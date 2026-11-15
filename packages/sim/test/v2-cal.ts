import { content } from '@stm/content';
import { v2 } from '../src';

// Calibration printout: what an auto-layout scores per market and size. Run: npx tsx packages/sim/test/v2-cal.ts
const s = v2.createGameV2(content, 1, 'Cal');
for (const nodeId of ['n1000', 'n600']) {
  for (const mid of ['business', 'homepc', 'budget', 'gamers', 'office2d']) {
    const m = v2.market(mid);
    const row: string[] = [];
    for (const size of ['S', 'M', 'L'] as const) {
      const { w, h } = v2.SIZES[size];
      const pr = { size, nodeId, kind: m.kind, marketId: mid, board: Array(w * h).fill(null) };
      const b = v2.suggestBoard(s, pr, 3);
      const ev = v2.evaluateBoard(b, size, nodeId, m.kind);
      row.push(`${size} ${v2.boardScore(ev, mid, 0).toFixed(2)} [${Object.entries(ev.stats).map(([k, v]) => k + Math.round(v)).join(' ')}]`);
    }
    console.log(nodeId, mid.padEnd(9), row.join(' | '));
  }
}
