import type { v2 } from '@stm/sim';
import type { Tab2 } from '../store';

/** Something waiting for the player. New ones pause the clock (prompts never time out). */
export interface Need {
  key: string;
  text: string;
  tab: Tab2;
  project?: string;
  tone: 'go' | 'warn';
}

export function needsOf(g: v2.GameV2): Need[] {
  const out: Need[] = [];
  for (const c of g.cards) out.push({ key: `card:${c.id}`, text: c.title, tab: 'company', tone: 'warn' });
  for (const pr of g.projects) {
    if (pr.phase === 'architecture' && pr.board.every((c) => c === null))
      out.push({ key: `layout:${pr.id}`, text: `Lay out the ${pr.name} die`, tab: 'studio', project: pr.id, tone: 'go' });
    if (pr.phase === 'architecture' && pr.progress >= pr.need) out.push({ key: `stuck:${pr.id}`, text: `${pr.name}: finish the die layout`, tab: 'studio', project: pr.id, tone: 'warn' });
    for (const b of pr.bugs)
      if (b.found && !b.ignored && (b.fixLeft ?? 0) > 0)
        out.push({ key: `bug:${b.id}`, text: `${pr.name}: a bug was found`, tab: 'studio', project: pr.id, tone: 'warn' });
    if (pr.phase === 'verification' && pr.progress >= pr.need) out.push({ key: `verified:${pr.id}`, text: `${pr.name} can tape out`, tab: 'studio', project: pr.id, tone: 'go' });
    if (pr.phase === 'ready') out.push({ key: `ready:${pr.id}`, text: `Launch the ${pr.name}`, tab: 'studio', project: pr.id, tone: 'go' });
    if ((pr.phase === 'architecture' || pr.phase === 'verification') && !g.staff.some((p) => p.task === pr.id))
      out.push({ key: `nobody:${pr.id}`, text: `Nobody is working on the ${pr.name}`, tab: 'team', tone: 'warn' });
  }
  const idle = g.staff.filter((p) => p.task === null);
  if (idle.length) out.push({ key: `idle:${idle.map((p) => p.id).join(',')}`, text: idle.length === 1 ? `${idle[0]!.name === 'You' ? 'You are' : `${idle[0]!.name} is`} free` : `${idle.length} people are free`, tab: 'studio', tone: 'go' });
  if (!g.research.current && g.staff.some((p) => p.task === 'research')) out.push({ key: 'research', text: 'Pick something to research', tab: 'research', tone: 'go' });
  if (g.cash < 0) out.push({ key: 'cash', text: 'Out of cash', tab: 'company', tone: 'warn' });
  return out;
}
