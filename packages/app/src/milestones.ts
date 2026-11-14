import { content } from '@stm/content';
import type { GameState } from '@stm/sim';

export interface Milestone {
  kind: 'hq' | 'site' | 'fab' | 'ipo';
  title: string;
  body: string;
  week: number;
}

/**
 * Transition moments (world-and-facilities §2.3): when the company makes a big physical move, a news
 * card announces it over a short construction timelapse.
 */
export function detectMilestone(prev: GameState, next: GameState): Milestone | null {
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
      body: 'The cleanroom is ready. From here on, sand goes in and our chips come out.',
      week: next.week,
    };
  if (next.roundsRaised === content.funding.length && prev.roundsRaised < content.funding.length)
    return {
      kind: 'ipo',
      title: "We're public",
      body: `${next.companyName} rings the bell. The garage crew can hardly believe it.`,
      week: next.week,
    };
  return null;
}
