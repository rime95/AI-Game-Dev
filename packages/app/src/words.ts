/**
 * Plain-language vocabulary. One place for the words the player sees and what they mean,
 * so every screen calls things by the same friendly name. The technical term lives in `tech`
 * and only shows up with details turned on.
 */
export const GLOSSARY = {
  size: { plain: 'Model size', tech: 'parameters', explain: 'How big the model\'s "brain" is. Bigger models get smarter but need more chips, data and time.' },
  data: { plain: 'Training data', tech: 'tokens', explain: 'The text a model reads while it learns. A billion tokens is roughly ten thousand books.' },
  work: { plain: 'Training work', tech: 'FLOPs', explain: 'How much number-crunching a training run needs. Faster chips and more of them finish it sooner.' },
  precision: { plain: 'Precision', tech: 'FP16 / FP8 / FP4', explain: 'Careful math is steady. Fast and Turbo math go quicker on chips built for it, with a bit more risk.' },
  smarts: { plain: 'Smarts', tech: 'eval score', explain: 'Our score on the industry test every lab is measured by. When someone nearly aces it, a harder test replaces it and every score drops.' },
  style: { plain: 'Model style', tech: 'architecture', explain: 'All-rounders use their whole brain for every word. A team of experts only wakes the parts it needs, so it is cheaper to train for its size but needs chips with lots of memory and fast links.' },
  speed: { plain: 'Speed', tech: 'TFLOPS', explain: 'How fast a chip crunches numbers, compared with the Kite K1 everyone starts on.' },
  memory: { plain: 'Memory', tech: 'HBM', explain: 'Fast memory stacked next to the chip. Big models and teams of experts need plenty of it.' },
  links: { plain: 'Chip links', tech: 'interconnect', explain: 'How quickly chips talk to each other. Large training runs spread over many chips need fast links.' },
  cache: { plain: 'On-chip cache', tech: 'SRAM', explain: 'A little memory right on the chip. It makes the main memory feel faster.' },
  generation: { plain: 'Chip generation', tech: 'process node', explain: 'How fine the factory can draw a chip. Newer generations are faster and more efficient but cost more and are harder to get right.' },
  factory: { plain: 'Send to the factory', tech: 'tape-out', explain: 'Hand the finished design to a chip factory. A few months later the first chips come back, and sometimes they have bugs.' },
  fixResend: { plain: 'Fix and resend', tech: 'respin', explain: 'The first chips had a bug. We fix the design and wait for a new batch.' },
  goodChips: { plain: 'Good chips per batch', tech: 'yield', explain: 'Not every chip on a wafer works. The share that does goes up as the factory gets practice.' },
  wafer: { plain: 'Wafer', tech: 'wafer', explain: 'A thin disc of silicon. Each one is cut into dozens of chips.' },
  rackSpace: { plain: 'Rented rack space', tech: 'colocation', explain: 'Bought chips need somewhere to live. Until we build our own data center we pay someone else to host them.' },
  coolingOverhead: { plain: 'Cooling overhead', tech: 'PUE', explain: 'Extra power spent on cooling for every bit of power the chips use. Lower is better: 1.2 means 20% extra.' },
  power: { plain: 'Power', tech: 'MW', explain: 'Electricity our chips and buildings draw. 1 MW keeps about 800 homes running.' },
  uptime: { plain: 'Uptime promise', tech: 'SLA', explain: 'Business customers expect us to always answer. Fall short and we owe them refunds.' },
  saved: { plain: 'Saved progress', tech: 'checkpoint', explain: 'Training saves its progress as it goes, so we can ship what we have early.' },
  license: { plain: 'License to Scale', tech: 'license tiers', explain: 'Bigger, smarter models need government licenses. Each tier asks for enough power, safety, compliance and environmental work.' },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The people behind the advisor notes. Same name everywhere, so the team feels like a team. */
export const ADVISORS = {
  chief: { name: 'Maya', role: 'Chief of staff' },
  models: { name: 'Priya', role: 'Head of research' },
  hardware: { name: 'Theo', role: 'Hardware lead' },
  infra: { name: 'Sam', role: 'Infrastructure' },
  product: { name: 'Jonas', role: 'Product' },
  people: { name: 'Ana', role: 'People' },
  deals: { name: 'Rafael', role: 'Deals' },
  policy: { name: 'Grace', role: 'Policy' },
  fab: { name: 'Kenji', role: 'Factory manager' },
  office: { name: 'Lou', role: 'Office manager' },
  mentor: { name: 'Ruth', role: 'Retired engineer next door' },
} as const;

export type AdvisorKey = keyof typeof ADVISORS;

/** Model sizes by billions of parameters, in plain words. */
export function sizeName(paramsB: number): string {
  if (paramsB < 5) return 'Tiny';
  if (paramsB < 20) return 'Small';
  if (paramsB < 100) return 'Medium';
  if (paramsB < 500) return 'Large';
  if (paramsB < 1500) return 'Huge';
  return 'Giant';
}

export const PRECISION_NAME = { fp16: 'Careful', fp8: 'Fast', fp4: 'Turbo' } as const;
export const ARCH_NAME: Record<string, string> = { dense: 'All-rounder', moe: 'Team of experts' };
