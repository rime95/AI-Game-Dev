import { describe, expect, it } from 'vitest';
import { content } from '@stm/content';
import {
  applyCommand,
  capabilityForScore,
  consumerTarget,
  conversion,
  createGame,
  offerCheck,
  totalUsers,
  type EnterpriseOffer,
  type GameState,
} from '../src';

function step(s: GameState, weeks = 1): GameState {
  for (let i = 0; i < weeks; i++) {
    if (s.pendingEvent) s = applyCommand(s, content, { type: 'resolveEvent', choiceId: s.pendingEvent.choices.at(-1)!.id }).state;
    s = applyCommand(s, content, { type: 'advanceWeek' }).state;
  }
  return s;
}

/** A lab with a competitive (tier 2) model and lots of serving capacity. */
function servingLab(seed = 1): GameState {
  const s = createGame(content, seed);
  s.models.push({
    id: 'm1',
    name: 'Mid',
    archId: 'dense',
    paramsB: 7,
    tokensB: 140,
    precision: 'fp16',
    capability: capabilityForScore(36, s.suite.mid),
    score: 36,
    releasedWeek: 0,
  });
  s.liveModelId = 'm1';
  s.cash = 100e6;
  s.powerCapMW = 100;
  s.fleet.push({ id: 'f1', chipId: 'kite-k2', count: 4000, owned: true });
  return s;
}

const offer = (over: Partial<EnterpriseOffer> = {}): EnterpriseOffer => ({
  id: 'o-test',
  client: 'Harborview Bank',
  sector: 'Finance',
  seats: 3000,
  pricePerSeat: 10,
  termWeeks: 26,
  minTier: 2,
  minSafety: 1,
  minCompliance: 1,
  expiresWeek: 99,
  ...over,
});

describe('consumer app', () => {
  it('needs a product manager, a model and cash to launch', () => {
    const s = createGame(content, 1);
    expect(applyCommand(s, content, { type: 'launchConsumerApp' }).error).toMatch(/released model/);
    const lab = servingLab();
    const launched = applyCommand(lab, content, { type: 'launchConsumerApp' }).state;
    expect(launched.consumer.launched).toBe(true);
    expect(launched.cash).toBe(lab.cash - 5_000_000);
  });

  it('grows app users and earns subscription revenue', () => {
    let s = applyCommand(servingLab(), content, { type: 'launchConsumerApp' }).state;
    s = step(s, 20);
    expect(s.consumer.users).toBeGreaterThan(0);
    expect(s.lastWeek!.consumerRevenue).toBeGreaterThan(0);
    expect(totalUsers(s)).toBeGreaterThan(s.users);
  });

  it('cheaper subscriptions pull more users; product managers convert more of them', () => {
    const s = applyCommand(servingLab(), content, { type: 'launchConsumerApp' }).state;
    const cheap = { ...s, consumer: { ...s.consumer, subPrice: 10 } };
    expect(consumerTarget(cheap, content)).toBeGreaterThan(consumerTarget(s, content));
    expect(conversion({ ...s, staff: { ...s.staff, product: 5 } })).toBeGreaterThan(conversion(s));
  });
});

describe('enterprise', () => {
  it('checks tier, safety, compliance and account capacity', () => {
    const s = servingLab();
    expect(offerCheck(s, content, offer()).canAccept).toBe(true);
    expect(offerCheck(s, content, offer({ minTier: 3 })).canAccept).toBe(false);
    expect(offerCheck(s, content, offer({ minCompliance: 3 })).canAccept).toBe(false);
    const noPm = { ...s, staff: { ...s.staff, product: 0 } };
    expect(offerCheck(noPm, content, offer()).checks.find((c) => c.label.startsWith('Account'))!.ok).toBe(false);
  });

  it('signed contracts pay weekly and finish after their term', () => {
    let s = servingLab();
    s.offers.push(offer());
    s = applyCommand(s, content, { type: 'acceptOffer', offerId: 'o-test' }).state;
    expect(s.contracts).toHaveLength(1);
    s = step(s, 1);
    expect(s.lastWeek!.enterpriseRevenue).toBeCloseTo(3000 * 10);
    s = step(s, 26);
    expect(s.contracts.some((c) => c.id === 'o-test')).toBe(false);
    expect(s.log.some((l) => /Harborview Bank completed/.test(l.text))).toBe(true);
  });

  it('missing the SLA costs credits and can lose the customer', () => {
    let lost = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let s = servingLab(seed);
      s.fleet = []; // no serving capacity at all
      s.offers.push(offer());
      s = applyCommand(s, content, { type: 'acceptOffer', offerId: 'o-test' }).state;
      s = step(s, 1);
      expect(s.lastWeek!.slaPenalty).toBeGreaterThan(0);
      s = step(s, 10);
      if (!s.contracts.some((c) => c.id === 'o-test')) lost++;
    }
    expect(lost).toBeGreaterThan(0);
  });

  it('offers arrive over time once a model is live', () => {
    const s = step(servingLab(), 30);
    expect(s.log.some((l) => /New enterprise offer/.test(l.text))).toBe(true);
  });
});
