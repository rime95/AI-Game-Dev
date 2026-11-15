import type { ProductKind, ProjectSize, Skill, Stat, Stats } from './types';

/**
 * Sand to Mind v2 content. Every balancing number is TEMPORARY and lives here or in T (tuning).
 * Companies, magazines and people are real names used for flavour only: the player plays this
 * privately, and all results and events are fictional.
 */

export const T = {
  startYear: 1991,
  daysPerMonth: 30,
  monthsPerYear: 12,
  startCash: 80_000,
  founderSalary: 0,
  /** Brand (customer trust) at the start, 0–100. */
  startBrand: 20,
  /** A product's pull doubles every this many review points. */
  scorePerDoubling: 1.0,
  /** Small no-name makers in every market (their total pull). */
  othersPull: 2.2,
  /** Products age: review points lost per year on the shelf, relative to the market bar. */
  agingPerYear: 0.9,
  /** Rivals stay at least this far below our best in a market. */
  rivalMinGap: 0.15,
  /** Before we ship anything in a market, rival products sit at this score. */
  rivalLegacyScore: 5.4,
  /** Days of pay a hire's agency fee costs. */
  hireFeeMonths: 0.5,
  jobAdCost: 2_500,
  trainingCost: 3_000,
  /** Points a person makes per day at skill 5 (skills run 1–10). */
  pointsPerDay: 1,
  crunchSpeed: 1.4,
  crunchBurnoutPerDay: 0.9,
  restBurnoutPerDay: 0.35,
  /** Research points per day for a researcher at skill 5. */
  researchPerDay: 0.35,
  /** Research points for a launch: base + per review point. */
  launchResearch: { base: 2, perScore: 0.8 },
  /** Cards: first one after this many days, then one every min–max days. */
  cardFirstDay: 45,
  cardGap: [28, 55] as [number, number],
  cardNoRepeatDays: 168,
  bankruptAfterDays: 90,
  /** Marketing push levels: cost as a share of the design spend, and hype gained. */
  marketing: [
    { label: 'No push', costShare: 0, hype: 0 },
    { label: 'Magazine ads', costShare: 0.15, hype: 0.35 },
    { label: 'Trade show', costShare: 0.35, hype: 0.7 },
    { label: 'Big campaign', costShare: 0.7, hype: 1.1 },
  ],
} as const;

// ---------------------------------------------------------------- Die board

export interface BlockDef {
  id: string;
  name: string;
  short: string;
  /** What one block adds before neighbours. */
  stats: Partial<Stats>;
  heat: number;
  /** Must sit on the die edge to work (I/O pads, memory buses). */
  edge?: 'required' | 'bonus';
  /** Only this many count; extra copies add heat but nothing else. */
  maxUseful?: number;
  /** Unlocked by this research node (none = from the start). */
  tech?: string;
  color: string;
  blurb: string;
}

export const BLOCKS: BlockDef[] = [
  { id: 'core', name: 'Compute core', short: 'Core', stats: { perf: 3 }, heat: 2, color: 'compute', blurb: 'The engine. More cores, more speed, more heat.' },
  { id: 'cache', name: 'Cache', short: 'Cache', stats: { perf: 0.6, eff: 0.6 }, heat: 0.4, color: 'cache', blurb: '+1 speed for each core it touches (up to 2). Cool and efficient.' },
  { id: 'mem', name: 'Memory controller', short: 'Mem', stats: { perf: 1 }, heat: 1, edge: 'bonus', maxUseful: 3, color: 'memory', blurb: 'Feeds the cores. +1 speed on the die edge. Up to 3 help.' },
  { id: 'io', name: 'I/O pads', short: 'I/O', stats: { feat: 1.2 }, heat: 0.4, edge: 'required', maxUseful: 4, color: 'link', blurb: 'Talks to the rest of the PC. Only works on the edge; up to 4 help.' },
  { id: 'pixel', name: 'Pixel pipeline', short: 'Pixel', stats: { gfx: 2.6 }, heat: 1.8, color: 'gfx', blurb: 'Draws the screen. +1 graphics next to a memory controller.' },
  { id: 'fpu', name: 'Floating-point unit', short: 'FPU', stats: { perf: 1.6, gfx: 0.6 }, heat: 1.6, tech: 'fpu', color: 'compute', blurb: '+1 speed next to a core. Loved by engineers and gamers.' },
  { id: 'texture', name: 'Texture unit', short: 'Tex', stats: { gfx: 2, feat: 0.6 }, heat: 1.4, tech: '3d', color: 'gfx', blurb: '3D graphics. +1 graphics next to a pixel pipeline.' },
  { id: 'gate', name: 'Power gating', short: 'Gate', stats: { eff: 2 }, heat: -1.2, tech: 'powergate', maxUseful: 4, color: 'cache', blurb: 'Switches idle parts off and cools the die. Up to 4 help.' },
  { id: 'media', name: 'Media engine', short: 'Media', stats: { feat: 2, eff: 0.5 }, heat: 0.8, tech: 'media', maxUseful: 2, color: 'link', blurb: 'Video and sound in hardware. Up to 2 help.' },
  { id: 'vector', name: 'Vector unit', short: 'Vec', stats: { perf: 2.2, gfx: 1 }, heat: 2, tech: 'simd', color: 'compute', blurb: '+1 speed next to cache. Multimedia muscle.' },
  { id: 'tensor', name: 'Tensor core', short: 'Tensor', stats: { perf: 4 }, heat: 2.6, tech: 'tensor', color: 'compute', blurb: 'Matrix maths for AI. +1 next to memory.' },
];
export const block = (id: string) => BLOCKS.find((b) => b.id === id)!;

/** Neighbour bonuses (4-neighbourhood): a block of `a` next to a block of `b` gains `stat`. */
export const ADJACENCY: { a: string; b: string; stat: Stat; bonus: number; max: number }[] = [
  { a: 'cache', b: 'core', stat: 'perf', bonus: 1, max: 2 },
  { a: 'fpu', b: 'core', stat: 'perf', bonus: 1, max: 1 },
  { a: 'pixel', b: 'mem', stat: 'gfx', bonus: 1, max: 1 },
  { a: 'texture', b: 'pixel', stat: 'gfx', bonus: 1, max: 2 },
  { a: 'vector', b: 'cache', stat: 'perf', bonus: 1, max: 1 },
  { a: 'tensor', b: 'mem', stat: 'perf', bonus: 1, max: 1 },
];

export const SIZES: Record<ProjectSize, { name: string; w: number; h: number; work: number; mask: number; minTeam: number }> = {
  S: { name: 'Small', w: 4, h: 4, work: 1, mask: 1, minTeam: 1 },
  M: { name: 'Medium', w: 5, h: 5, work: 1.7, mask: 1.6, minTeam: 2 },
  L: { name: 'Large', w: 6, h: 6, work: 2.6, mask: 2.5, minTeam: 4 },
};

// ---------------------------------------------------------------- Products and markets

export interface KindDef {
  id: ProductKind;
  name: string;
  /** Blocks the chip must have to work at all. */
  needs: string[];
  tech?: string;
  blurb: string;
}

export const KINDS: KindDef[] = [
  { id: 'cpu', name: 'Processor', needs: ['core', 'mem', 'io'], blurb: 'The brain of a PC.' },
  { id: 'gpu', name: 'Graphics chip', needs: ['pixel', 'mem', 'io'], blurb: 'Puts the picture on screen.' },
  { id: 'console', name: 'Console chip', needs: ['core', 'pixel', 'mem', 'io'], tech: 'consoles', blurb: 'A whole games machine on one die.' },
  { id: 'mobile', name: 'Phone chip', needs: ['core', 'mem', 'io', 'gate'], tech: 'mobile', blurb: 'Speed on a battery budget.' },
  { id: 'accel', name: 'AI accelerator', needs: ['tensor', 'mem', 'io'], tech: 'tensor', blurb: 'Trains and runs neural networks.' },
];
export const kind = (id: string) => KINDS.find((k) => k.id === id)!;

export interface MarketDef {
  id: string;
  name: string;
  kind: ProductKind;
  /** What buyers care about (sums to 1). Hidden at first; launches reveal it. */
  taste: Stats;
  /** How hard buyers punish a price above fair (exponent). */
  priceSensitivity: number;
  /** Fair price for a 6/10 product at the start. */
  basePrice: number;
  /** Units a day across all makers when the market opens, and yearly growth. */
  startSize: number;
  growth: number;
  /** Opened by this research node (none = open from 1991). */
  tech?: string;
  /** How much a bug-ridden chip hurts here (business buyers hate bugs). */
  bugPenalty: number;
  blurb: string;
}

export const MARKETS: MarketDef[] = [
  { id: 'business', name: 'Business PCs', kind: 'cpu', taste: { perf: 0.3, gfx: 0, eff: 0.3, feat: 0.4 }, priceSensitivity: 1.3, basePrice: 90, startSize: 225, growth: 0.12, bugPenalty: 1.4, blurb: 'Offices buying by the thousand. Reliable and well-connected wins.' },
  { id: 'homepc', name: 'Home PCs', kind: 'cpu', taste: { perf: 0.55, gfx: 0.15, eff: 0.05, feat: 0.25 }, priceSensitivity: 1.6, basePrice: 70, startSize: 175, growth: 0.2, bugPenalty: 1, blurb: 'Families and students. Speed for the money.' },
  { id: 'budget', name: 'Budget PCs', kind: 'cpu', taste: { perf: 0.6, gfx: 0, eff: 0.25, feat: 0.15 }, priceSensitivity: 2.4, basePrice: 40, startSize: 275, growth: 0.1, bugPenalty: 0.8, blurb: 'Cheap boxes. Price is everything.' },
  { id: 'gamers', name: 'PC gamers', kind: 'gpu', taste: { perf: 0.15, gfx: 0.7, eff: 0, feat: 0.15 }, priceSensitivity: 1.2, basePrice: 110, startSize: 65, growth: 0.3, bugPenalty: 1, blurb: 'They want frames. Every frame.' },
  { id: 'office2d', name: 'Office graphics', kind: 'gpu', taste: { perf: 0.1, gfx: 0.45, eff: 0.2, feat: 0.25 }, priceSensitivity: 1.8, basePrice: 45, startSize: 200, growth: 0.08, bugPenalty: 1.2, blurb: 'Crisp windows and spreadsheets.' },
  { id: 'gamers3d', name: '3D gamers', kind: 'gpu', taste: { perf: 0.2, gfx: 0.65, eff: 0, feat: 0.15 }, priceSensitivity: 1.1, basePrice: 180, startSize: 30, growth: 0.6, tech: '3d', bugPenalty: 1, blurb: 'A new kind of game needs a new kind of chip.' },
  { id: 'workstation', name: 'Workstations', kind: 'cpu', taste: { perf: 0.6, gfx: 0.2, eff: 0, feat: 0.2 }, priceSensitivity: 0.8, basePrice: 400, startSize: 15, growth: 0.15, tech: 'fpu', bugPenalty: 1.5, blurb: 'Engineers and studios. Money is no object; speed is.' },
  { id: 'consoles', name: 'Game consoles', kind: 'console', taste: { perf: 0.3, gfx: 0.5, eff: 0.1, feat: 0.1 }, priceSensitivity: 1.4, basePrice: 60, startSize: 125, growth: 0.25, tech: 'consoles', bugPenalty: 1.3, blurb: 'Console makers order millions, at a hard price.' },
  { id: 'phones', name: 'Phones', kind: 'mobile', taste: { perf: 0.3, gfx: 0.1, eff: 0.45, feat: 0.15 }, priceSensitivity: 1.5, basePrice: 35, startSize: 150, growth: 0.7, tech: 'mobile', bugPenalty: 1.2, blurb: 'A computer in every pocket. Battery life sells.' },
  { id: 'datacenter', name: 'Data centers', kind: 'accel', taste: { perf: 0.7, gfx: 0, eff: 0.25, feat: 0.05 }, priceSensitivity: 0.7, basePrice: 2500, startSize: 10, growth: 0.9, tech: 'tensor', bugPenalty: 1.4, blurb: 'Neural networks eat compute. Clouds pay for it.' },
];
export const market = (id: string) => MARKETS.find((m) => m.id === id)!;

/** How good a chip buyers expect in a market as years pass (score 6 = matching this bar). */
export function marketBar(m: MarketDef, day: number): number {
  const years = day / 360;
  return 6 * Math.pow(1.22, years);
}

// ---------------------------------------------------------------- Process nodes

export interface NodeDef {
  id: string;
  name: string;
  /** Heat budget per die cell. */
  heatPerCell: number;
  /** Multiplies every stat (smaller transistors, faster). */
  speed: number;
  /** Mask set (tape-out) cost for a small die, and unit cost per cell. */
  maskCost: number;
  unitCostPerCell: number;
  /** Days at the foundry. */
  fabDays: number;
  tech?: string;
}

export const NODES: NodeDef[] = [
  { id: 'n1000', name: '1 µm', heatPerCell: 0.85, speed: 1, maskCost: 18_000, unitCostPerCell: 1.6, fabDays: 45 },
  { id: 'n800', name: '800 nm', heatPerCell: 0.95, speed: 1.25, maskCost: 30_000, unitCostPerCell: 1.5, fabDays: 45, tech: 'n800' },
  { id: 'n600', name: '600 nm', heatPerCell: 1.05, speed: 1.55, maskCost: 55_000, unitCostPerCell: 1.45, fabDays: 50, tech: 'n600' },
  { id: 'n350', name: '350 nm', heatPerCell: 1.2, speed: 2, maskCost: 120_000, unitCostPerCell: 1.4, fabDays: 55, tech: 'n350' },
  { id: 'n250', name: '250 nm', heatPerCell: 1.35, speed: 2.6, maskCost: 260_000, unitCostPerCell: 1.35, fabDays: 55, tech: 'n250' },
  { id: 'n180', name: '180 nm', heatPerCell: 1.5, speed: 3.4, maskCost: 600_000, unitCostPerCell: 1.3, fabDays: 60, tech: 'n180' },
  { id: 'n130', name: '130 nm', heatPerCell: 1.65, speed: 4.4, maskCost: 1_400_000, unitCostPerCell: 1.3, fabDays: 60, tech: 'n130' },
  { id: 'n90', name: '90 nm', heatPerCell: 1.8, speed: 5.7, maskCost: 3_000_000, unitCostPerCell: 1.3, fabDays: 65, tech: 'n90' },
];
export const node = (id: string) => NODES.find((n) => n.id === id)!;

// ---------------------------------------------------------------- Research

export interface TechDef {
  id: string;
  name: string;
  cost: number;
  requires: string[];
  /** A breakthrough opens a new chapter of the story (and names it). */
  breakthrough?: string;
  /** Plain effects, shown in the tree. */
  effects: string[];
  perk?: 'tools' | 'testlab' | 'marketing' | 'recruiting';
}

export const TECHS: TechDef[] = [
  { id: 'tools', name: 'Design software', cost: 75, requires: [], effects: ['25% fewer bugs'], perk: 'tools' },
  { id: 'fpu', name: 'Floating-point unit', cost: 105, requires: [], effects: ['New block: FPU', 'Opens the workstation market'] },
  { id: 'n800', name: '800 nm process', cost: 120, requires: [], effects: ['Faster, cooler chips'] },
  { id: 'recruiting', name: 'Campus recruiting', cost: 75, requires: [], effects: ['Better job candidates'], perk: 'recruiting' },
  { id: 'testlab', name: 'Test lab', cost: 135, requires: ['tools'], effects: ['Bugs found 50% faster'], perk: 'testlab' },
  { id: 'marketing', name: 'Marketing department', cost: 120, requires: [], effects: ['Launch pushes cost 30% less'], perk: 'marketing' },
  { id: '3d', name: '3D graphics', cost: 225, requires: ['fpu'], breakthrough: 'The 3D boom', effects: ['New block: texture unit', 'Opens the 3D gamers market'] },
  { id: 'n600', name: '600 nm process', cost: 210, requires: ['n800'], effects: ['Faster, cooler chips'] },
  { id: 'powergate', name: 'Power gating', cost: 180, requires: ['n800'], effects: ['New block: power gating (cools the die)'] },
  { id: 'simd', name: 'Vector instructions', cost: 240, requires: ['fpu', 'n600'], effects: ['New block: vector unit'] },
  { id: 'media', name: 'Media engines', cost: 195, requires: ['simd'], effects: ['New block: media engine'] },
  { id: 'consoles', name: 'Console partnerships', cost: 300, requires: ['3d'], breakthrough: 'The console wars', effects: ['New product: console chip', 'Opens the console market'] },
  { id: 'n350', name: '350 nm process', cost: 338, requires: ['n600'], effects: ['Faster, cooler chips'] },
  { id: 'n250', name: '250 nm process', cost: 525, requires: ['n350'], effects: ['Faster, cooler chips'] },
  { id: 'mobile', name: 'Mobile chips', cost: 600, requires: ['powergate', 'n350'], breakthrough: 'The pocket computer', effects: ['New product: phone chip', 'Opens the phone market'] },
  { id: 'n180', name: '180 nm process', cost: 750, requires: ['n250'], effects: ['Faster, cooler chips'] },
  { id: 'n130', name: '130 nm process', cost: 1050, requires: ['n180'], effects: ['Faster, cooler chips'] },
  { id: 'tensor', name: 'Neural networks on silicon', cost: 1350, requires: ['simd', 'n130'], breakthrough: 'The AI age', effects: ['New product: AI accelerator', 'Opens the data center market'] },
  { id: 'n90', name: '90 nm process', cost: 1500, requires: ['n130'], effects: ['Faster, cooler chips'] },
];
export const tech = (id: string) => TECHS.find((t) => t.id === id)!;

// ---------------------------------------------------------------- People

export const TRAITS: { id: string; name: string; blurb: string }[] = [
  { id: 'fast', name: 'Fast', blurb: '+25% speed, but makes more bugs.' },
  { id: 'perfectionist', name: 'Perfectionist', blurb: 'Finds bugs twice as fast, works 10% slower.' },
  { id: 'nightowl', name: 'Night owl', blurb: 'Crunch barely tires them.' },
  { id: 'mentor', name: 'Mentor', blurb: 'Teammates on the same project learn 30% faster.' },
  { id: 'diva', name: 'Diva', blurb: '+1 design, but teammates lose a little morale.' },
  { id: 'loyal', name: 'Loyal', blurb: 'Never accepts a poaching offer.' },
  { id: 'cheerful', name: 'Cheerful', blurb: 'Lifts the morale of the whole team.' },
];

export const FIRST_NAMES = [
  'Alex', 'Sam', 'Priya', 'Wei', 'Maria', 'Tom', 'Aisha', 'Kenji', 'Lena', 'Omar', 'Grace', 'Ravi', 'Sofia', 'Daniel', 'Mei', 'Jonas',
  'Fatima', 'Lucas', 'Hana', 'Diego', 'Nora', 'Ibrahim', 'Yuki', 'Ethan', 'Chloe', 'Arjun', 'Zara', 'Felix', 'Amara', 'Leo', 'Ines', 'Kofi',
];
export const LAST_NAMES = [
  'Chen', 'Patel', 'Garcia', 'Kim', 'Novak', 'Okafor', 'Rossi', 'Tanaka', 'Silva', 'Haddad', 'Becker', 'Nguyen', 'Larsen', 'Rahman', 'Moreau',
  'Ivanova', 'Mensah', 'Costa', 'Ahmed', 'Fischer', 'Sato', 'Lopez', 'Kowalski', 'Ali', 'Murphy', 'Yamada', 'Singh', 'Torres',
];

export const SKILLS: Skill[] = ['design', 'eng', 'research'];

// ---------------------------------------------------------------- Rivals

export interface RivalDef {
  id: string;
  name: string;
  ceo: string;
  style: 'premium' | 'priceCutter' | 'copycat' | 'giant';
  brand: number;
  potential: number;
  cash: number;
  markets: string[];
  /** Days between launches in each market. */
  cadence: [number, number];
  /** Shows up when this tech exists (none = from 1991). */
  tech?: string;
  quotes: string[];
}

export const RIVALS: RivalDef[] = [
  { id: 'intel', name: 'Intel', ceo: 'Andrew Grove', style: 'giant', brand: 3.2, potential: 6.4, cash: 3e9, markets: ['business', 'homepc', 'workstation'], cadence: [300, 420], quotes: ['Only the paranoid survive.', 'Every PC should have our chip inside.', 'We will out-build anyone.'] },
  { id: 'amd', name: 'AMD', ceo: 'Jerry Sanders', style: 'priceCutter', brand: 1.6, potential: 6.1, cash: 6e8, markets: ['homepc', 'budget', 'business'], cadence: [220, 330], quotes: ['Real men have fabs.', 'Same speed, better price. Every time.', 'We are not done fighting.'] },
  { id: 'cyrix', name: 'Cyrix', ceo: 'Jerry Rogers', style: 'copycat', brand: 0.9, potential: 5.8, cash: 9e7, markets: ['budget', 'homepc'], cadence: [200, 300], quotes: ['Compatible, cheaper, quicker.', 'We read every spec sheet twice.'] },
  { id: 's3', name: 'S3', ceo: 'Terry Holdt', style: 'priceCutter', brand: 1.5, potential: 5.9, cash: 2e8, markets: ['office2d', 'gamers'], cadence: [180, 280], quotes: ['A graphics chip in every box.', 'Volume is a strategy.'] },
  { id: 'matrox', name: 'Matrox', ceo: 'Lorne Trottier', style: 'premium', brand: 1.3, potential: 6.2, cash: 1.5e8, markets: ['office2d', 'gamers', 'workstation'], cadence: [260, 380], quotes: ['Quality you can see.', 'Our customers notice the difference.'] },
  { id: 'nvidia', name: 'Nvidia', ceo: 'Jensen Huang', style: 'premium', brand: 0.8, potential: 6.3, cash: 4e7, markets: ['gamers3d', 'gamers', 'consoles', 'datacenter'], cadence: [200, 300], tech: '3d', quotes: ['We ship every six months. Keep up.', 'The GPU will eat the world.'] },
  { id: '3dfx', name: '3dfx', ceo: 'Greg Ballard', style: 'premium', brand: 1.1, potential: 6.1, cash: 5e7, markets: ['gamers3d', 'gamers'], cadence: [240, 340], tech: '3d', quotes: ['So powerful it is kind of ridiculous.', 'Gamers know the name.'] },
  { id: 'qualcomm', name: 'Qualcomm', ceo: 'Irwin Jacobs', style: 'giant', brand: 2.2, potential: 6.3, cash: 2e9, markets: ['phones'], cadence: [260, 360], tech: 'mobile', quotes: ['Every phone, everywhere.', 'Wireless is the future.'] },
];

/** Product names each rival uses, in order of release. */
export const RIVAL_LINES: Record<string, string[]> = {
  intel: ['i486', 'Pentium', 'Pentium Pro', 'Pentium II', 'Pentium III', 'Pentium 4', 'Core', 'Core 2', 'Core i7'],
  amd: ['Am486', 'K5', 'K6', 'K6-2', 'Athlon', 'Athlon XP', 'Athlon 64', 'Phenom', 'Ryzen'],
  cyrix: ['Cx486', '5x86', '6x86', 'MII', 'MediaGX'],
  s3: ['86C911', 'Trio64', 'ViRGE', 'Savage3D', 'Savage4'],
  matrox: ['Millennium', 'Mystique', 'G200', 'G400', 'Parhelia'],
  nvidia: ['NV1', 'Riva 128', 'Riva TNT', 'GeForce 256', 'GeForce 2', 'GeForce 3', 'GeForce FX', 'GeForce 6'],
  '3dfx': ['Voodoo', 'Voodoo2', 'Banshee', 'Voodoo3', 'Voodoo5'],
  qualcomm: ['MSM6000', 'Snapdragon S1', 'Snapdragon S2', 'Snapdragon S4', 'Snapdragon 800'],
};

// ---------------------------------------------------------------- Press

export const OUTLETS: Record<ProductKind, string[]> = {
  cpu: ['BYTE', 'PC Magazine', 'InfoWorld', 'Computer Shopper'],
  gpu: ['PC Gamer', 'Computer Gaming World', 'Maximum PC', 'PC Magazine'],
  console: ['Electronic Gaming Monthly', 'GamePro', 'Edge', 'Next Generation'],
  mobile: ['Wired', 'Engadget', 'The Verge', 'AnandTech'],
  accel: ['AnandTech', 'Wired', 'MIT Technology Review', 'The Information'],
};

export const QUOTES: { min: number; lines: string[] }[] = [
  { min: 9, lines: ['A landmark chip. Buy it.', 'The best we have ever tested.', 'Nothing else comes close.'] },
  { min: 7.5, lines: ['Fast, well made, easy to recommend.', 'A serious contender.', 'This young company knows what it is doing.'] },
  { min: 6, lines: ['Solid, if not exciting.', 'Does the job at a fair price.', 'Good enough for most buyers.'] },
  { min: 4.5, lines: ['Falls short of the leaders.', 'Hard to recommend over the competition.', 'Promising, but rough.'] },
  { min: 0, lines: ['Avoid.', 'Buggy and slow.', 'A misstep.'] },
];

// ---------------------------------------------------------------- Chapters (achievements, never gates)

export interface ChapterDef {
  id: string;
  name: string;
  blurb: string;
  goals: { id: string; label: string }[];
  reward: { cash?: number; research?: number; brand?: number };
}

export const CHAPTERS: ChapterDef[] = [
  { id: 'garage', name: 'Garage startup', blurb: 'One founder, one bench, one idea.', goals: [{ id: 'ship1', label: 'Ship your first chip' }, { id: 'score6', label: 'Get a review of 6 or better' }, { id: 'rev100k', label: 'Earn $100K in sales' }], reward: { research: 6, brand: 5 } },
  { id: 'team', name: 'A real team', blurb: 'Nobody builds a chip company alone.', goals: [{ id: 'staff4', label: 'Have 4 people' }, { id: 'ship3', label: 'Ship 3 chips' }, { id: 'research3', label: 'Research 3 technologies' }], reward: { cash: 50_000 } },
  { id: 'office', name: 'First office', blurb: 'Out of the garage, into the race.', goals: [{ id: 'office', label: 'Move into an office' }, { id: 'score8', label: 'Get a review of 8 or better' }, { id: 'lead', label: 'Lead a market (biggest share)' }], reward: { research: 15, brand: 8 } },
  { id: 'breakthrough', name: 'Change the game', blurb: 'The future belongs to whoever builds it.', goals: [{ id: 'bt1', label: 'Research a breakthrough' }, { id: 'markets3', label: 'Sell in 3 markets' }, { id: 'rev10m', label: 'Earn $10M in sales' }], reward: { cash: 500_000, brand: 10 } },
];

export const STAT_NAMES: Record<Stat, string> = { perf: 'Speed', gfx: 'Graphics', eff: 'Efficiency', feat: 'Features' };
