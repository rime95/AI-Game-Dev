import type { Discipline } from '@stm/content';
import type { Palette } from './Model';
import { DISCIPLINE_COLOR } from './roomArt';

/**
 * Paint for the generated props' key areas, per HQ stage. The same models are reused from the
 * garage to the HQ building; only this changes. Models without an entry keep their key color.
 */
const STAGE_PAINT: Record<string, Record<string, string>> = {
  garage: {
    desk: '#7f8a94',
    chair: '#6d7f5e',
    workbench: '#56708f',
    labCart: '#56708f',
    couch: '#8a6d50',
    kitchenette: '#b8a27f',
    confTable: '#4a4d55',
    shelving: '#6f7680',
  },
  office: {
    desk: '#e6dcc8',
    chair: '#3f6db0',
    workbench: '#4a78bd',
    labCart: '#4a78bd',
    couch: '#3f8a86',
    kitchenette: '#d9ccb2',
    confTable: '#6b4f3a',
    shelving: '#a2abb5',
  },
  hqBuilding: {
    desk: '#f1f0ec',
    chair: '#2f3440',
    workbench: '#343a45',
    labCart: '#343a45',
    couch: '#d0663f',
    kitchenette: '#ecebe7',
    confTable: '#2f3440',
    shelving: '#c6cbd2',
  },
};

export function propPalette(stage: string, model: string): Palette | undefined {
  const paint = (STAGE_PAINT[stage] ?? STAGE_PAINT.office)[model];
  return paint ? { paint } : undefined;
}

const SKIN = ['#f3d6bd', '#e8bf9c', '#d29f78', '#b07a52', '#8a5a3c', '#6a4430'];
const HAIR = ['#2b2118', '#3d2a1d', '#6b4425', '#a87a45', '#d8b878', '#1c1c22', '#7b3420', '#8e8e8e'];
const TROUSERS = ['#2e3a52', '#3a3e47', '#5a4938', '#2d4a3f', '#4b505b', '#6a6458'];

/** A small stable hash, so the same person always gets the same look. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** One character model for everyone: the shirt says the discipline, the rest varies per person. */
export function personPalette(key: string, discipline: Discipline): Palette {
  const h = hash(key);
  return {
    shirt: DISCIPLINE_COLOR[discipline],
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 4) % HAIR.length],
    trousers: TROUSERS[(h >>> 9) % TROUSERS.length],
  };
}

/** The founder (you) always looks the same: white shirt, jeans, dark hair. */
export const FOUNDER_PALETTE: Palette = { shirt: '#f4f1ea', trousers: '#34507a', hair: '#2b2118', skin: '#e8bf9c' };
