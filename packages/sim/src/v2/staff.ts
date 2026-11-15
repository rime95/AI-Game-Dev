import type { Content } from '@stm/content';
import { templateDef } from '../hq';
import { rand } from '../rng';
import { FIRST_NAMES, LAST_NAMES, SKILLS, T, TRAITS } from './data';
import type { Candidate, GameV2, Person, Skill } from './types';
import { between, clamp, log, newId, pick } from './util';

/** Desks plus lab seats: how many people the HQ holds. */
export function capacity(s: GameV2, content: Content): number {
  let n = 0;
  for (const r of s.hq.rooms) {
    const t = templateDef(content, r.templateId);
    if (!t) continue;
    n += t.desks + (t.seats?.count ?? 0);
  }
  return n;
}

export function breakServes(s: GameV2, content: Content): number {
  return s.hq.rooms.reduce((n, r) => n + (templateDef(content, r.templateId)?.serves ?? 0), 0);
}

export function hasPerk(s: GameV2, perk: string): boolean {
  return s.research.done.includes(perk);
}

const salaryFor = (skills: Record<Skill, number>, level: number) => Math.round((1200 + 180 * (skills.design + skills.eng + skills.research) + 450 * (level - 1)) / 50) * 50;

export function makeCandidate(s: GameV2): Candidate {
  const good = hasPerk(s, 'recruiting') ? 1.5 : 0;
  const level = 1 + Math.floor(rand(s) * rand(s) * 4);
  const skills = {} as Record<Skill, number>;
  const focus = pick(s, SKILLS);
  for (const k of SKILLS) skills[k] = clamp(Math.round(between(s, 2, 6) + good + (k === focus ? 2 : 0) + (level - 1) * 0.7), 1, 10);
  const traits: string[] = [];
  if (rand(s) < 0.75) traits.push(pick(s, TRAITS).id);
  if (rand(s) < 0.25) {
    const t = pick(s, TRAITS).id;
    if (!traits.includes(t)) traits.push(t);
  }
  const salary = salaryFor(skills, level);
  return {
    id: newId(s, 'cand'),
    name: `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`,
    skills,
    traits,
    level,
    salary,
    fee: Math.round(salary * T.hireFeeMonths),
    look: Math.floor(rand(s) * 1e6),
  };
}

export function founder(s: GameV2): Person {
  return {
    id: 'p-founder',
    name: 'You',
    founder: true,
    skills: { design: 6, eng: 6, research: 5 },
    traits: ['loyal'],
    level: 2,
    xp: 0,
    salary: T.founderSalary,
    morale: 80,
    burnout: 0,
    task: null,
    hiredDay: 0,
    look: 1,
  };
}

/** Work a person turns out in a day on a skill, before project modifiers. */
export function workRate(s: GameV2, p: Person, skill: Skill, crunch: boolean, teamMorale: number): number {
  let r = T.pointsPerDay * (p.skills[skill] / 5);
  if (p.traits.includes('diva') && skill === 'design') r *= 1.2;
  if (p.traits.includes('fast')) r *= 1.25;
  if (p.traits.includes('perfectionist')) r *= 0.9;
  if (crunch) r *= T.crunchSpeed;
  r *= 0.6 + 0.4 * (clamp(teamMorale, 0, 100) / 100) * 1.25;
  if (p.burnout > 75) r *= 0.65;
  r *= s.hq.productivity;
  for (const m of s.modifiers) if (m.speed && m.until > s.day) r *= m.speed;
  return r;
}

/** XP for work done; level ups raise the skill they used most. */
export function gainXp(s: GameV2, p: Person, amount: number, skill: Skill): void {
  p.xp += amount;
  const need = 60 * p.level;
  if (p.xp >= need) {
    p.xp -= need;
    p.level += 1;
    if (p.skills[skill] < 10) p.skills[skill] += 1;
    if (!p.founder) p.salary = Math.round((p.salary * 1.08) / 50) * 50;
    log(s, `${p.name} reached level ${p.level} (${skill === 'eng' ? 'engineering' : skill} ${p.skills[skill]}).`, 'good');
  }
}

/** Daily people update: pay, morale toward its target, burnout from crunch, quitting. */
export function tickStaff(s: GameV2, content: Content): number {
  const cap = capacity(s, content);
  const crowded = s.staff.length > cap;
  const breakCover = Math.min(1, breakServes(s, content) / Math.max(1, s.staff.length));
  const cheerful = s.staff.some((p) => p.traits.includes('cheerful')) ? 6 : 0;
  let pay = 0;
  for (const p of [...s.staff]) {
    pay += p.salary / 30;
    const crunching = s.projects.some((pr) => pr.id === p.task && pr.crunch);
    const divaNearby = s.staff.some((o) => o !== p && o.traits.includes('diva') && o.task && o.task === p.task) ? 5 : 0;
    const target = 62 + 18 * breakCover + cheerful - divaNearby - (crowded ? 20 : 0) - p.burnout * 0.25 + (p.founder ? 10 : 0);
    p.morale += (clamp(target, 0, 100) - p.morale) * 0.03;
    if (crunching) p.burnout += p.traits.includes('nightowl') ? T.crunchBurnoutPerDay * 0.3 : T.crunchBurnoutPerDay;
    else p.burnout -= p.task ? T.restBurnoutPerDay * 0.6 : T.restBurnoutPerDay * 1.6;
    p.burnout = clamp(p.burnout, 0, 100);
    p.morale = clamp(p.morale, 0, 100);
    if (!p.founder && (p.burnout > 95 || p.morale < 12) && rand(s) < 0.01) {
      s.staff.splice(s.staff.indexOf(p), 1);
      log(s, `${p.name} quit (${p.burnout > 95 ? 'burnt out' : 'unhappy'}).`, 'bad');
    }
  }
  s.hq.morale = s.staff.length ? s.staff.reduce((n, p) => n + p.morale, 0) / s.staff.length : 70;
  s.hq.productivity = crowded ? Math.max(0.4, cap / s.staff.length) : 1;
  return pay;
}
