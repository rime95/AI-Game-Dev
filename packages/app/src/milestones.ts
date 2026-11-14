import { content } from '@stm/content';
import type { GameState } from '@stm/sim';

export interface Milestone {
  kind: 'hq' | 'site' | 'fab' | 'ipo' | 'model' | 'funding' | 'chapter' | 'ai';
  title: string;
  body: string;
  week: number;
}

/**
 * Transition moments (world-and-facilities §2.3): when the company makes a big physical move, a news
 * card announces it over a short construction timelapse.
 */
export function detectMilestone(prev: GameState, next: GameState): Milestone | null {
  if (prev.era === 'founding' && next.era === 'ai')
    return {
      kind: 'ai',
      title: 'The AI chapter begins',
      body: `Neural networks run beautifully on graphics chips, and ${next.companyName} makes the best ones. Time to build minds on our own silicon.`,
      week: next.week,
    };
  if (prev.founding && next.founding && next.era === 'founding' && next.founding.chapter.index > prev.founding.chapter.index) {
    const done = content.founding.chapters[prev.founding.chapter.index];
    const upcoming = content.founding.chapters[next.founding.chapter.index];
    if (done)
      return {
        kind: 'chapter',
        title: `Chapter complete: ${done.name}`,
        body: `${done.reward.text}${upcoming ? ` Next: ${upcoming.name}.` : ''}`,
        week: next.week,
      };
  }
  if (prev.hq.stage !== next.hq.stage) {
    const stage = content.hq.stages.find((s) => s.id === next.hq.stage);
    const title =
      next.hq.stage === 'office'
        ? "We're out of the garage"
        : next.hq.stage === 'hqBuilding'
          ? 'A building with our name on it'
          : next.hq.stage === 'hqCampus'
            ? 'Welcome to campus'
            : `Moving into the ${stage?.name ?? 'new HQ'}`;
    return { kind: 'hq', title, body: stage?.blurb ?? '', week: next.week };
  }
  const wasOnline = new Set(prev.sites.filter((s) => s.status === 'online').map((s) => s.id));
  const nowOnline = next.sites.filter((s) => s.status === 'online' && !wasOnline.has(s.id));
  if (nowOnline.length) {
    const first = wasOnline.size === 0;
    const loc = content.sites.locations.find((l) => l.id === nowOnline[0]!.locationId);
    return {
      kind: 'site',
      title: first ? 'Our first data center is online' : `${nowOnline[0]!.name} is online`,
      body: `${nowOnline[0]!.name}${loc ? `, ${loc.region}` : ''}: our own halls, our own racks, no more renting space.`,
      week: next.week,
    };
  }
  if (prev.fab?.status === 'building' && next.fab?.status === 'online')
    return {
      kind: 'fab',
      title: 'First light in our own fab',
      body: 'The clean room is ready. From here on, sand goes in and our own chips come out.',
      week: next.week,
    };
  if (next.models.length > prev.models.length) {
    const m = next.models[next.models.length - 1]!;
    const best = Math.max(0, ...next.rivals.map((r) => r.score));
    const first = prev.models.length === 0;
    const top = m.score > best;
    return {
      kind: 'model',
      title: top ? `${m.name} is the smartest model in the world` : first ? `${m.name}, our first model, is live` : `${m.name} is live`,
      body: top
        ? `It scores ${m.score.toFixed(1)} on the smarts test, ahead of every rival (best ${best.toFixed(1)}). Expect users to flock in.`
        : `It scores ${m.score.toFixed(1)} on the smarts test; the best rival has ${best.toFixed(1)}. ${first ? 'Next: set a price in Products and start selling.' : 'Every release brings new users.'}`,
      week: next.week,
    };
  }
  if (next.roundsRaised > prev.roundsRaised && next.roundsRaised < content.funding.length) {
    const round = content.funding[next.roundsRaised - 1];
    return {
      kind: 'funding',
      title: `${next.companyName} raises its ${round?.name ?? 'next round'}`,
      body: round ? `Investors put in $${(round.cash / 1e6).toLocaleString('en-US')}M for ${Math.round(round.equity * 100)}% of the company. Time to think bigger.` : 'Fresh money in the bank. Time to think bigger.',
      week: next.week,
    };
  }
  if (next.roundsRaised === content.funding.length && prev.roundsRaised < content.funding.length)
    return {
      kind: 'ipo',
      title: "We're public",
      body: `${next.companyName} rings the bell. The garage crew can hardly believe it.`,
      week: next.week,
    };
  return null;
}
