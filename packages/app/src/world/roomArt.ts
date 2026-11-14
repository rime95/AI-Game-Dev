import type { RoomTemplate } from '@stm/content';
import { LAYER } from '../ui/layers';

/**
 * Furniture layouts per room template, in the template's own (unrotated) tile frame:
 * u runs along width, v along depth, origin at the room's top-left corner.
 * Placeholder art (art-direction §10): flat-colored boxes, swapped for real models later.
 */

export interface Prop {
  /** Center of the box. */
  u: number;
  v: number;
  /** Size along u, height, size along v. */
  size: [number, number, number];
  /** Height of the box's base above the floor. */
  y?: number;
  color: string;
  glow?: number;
  /** Lights up while a training run is in progress (lab monitors). */
  trainingGlow?: boolean;
}

export interface Seat {
  u: number;
  v: number;
  /** Facing, radians around the vertical axis. */
  face: number;
  /** Sitting (desk, couch) or standing (break room counter). */
  sit: boolean;
}

export interface RoomArt {
  /** Trim and floor tint color: the layer the room belongs to. */
  color: string;
  floor: string;
  props: Prop[];
  seats: Seat[];
}

const WOOD = '#c9a77c';
const DESK = '#f3efe6';
const DARK = '#3a3d46';
const SCREEN = '#1d2433';

export function roomArt(t: RoomTemplate, tier: number): RoomArt {
  const plant = (u: number, v: number): Prop[] => [
    { u, v, size: [0.28, 0.25, 0.28], color: '#b8794f' },
    { u, v, size: [0.36, 0.4, 0.36], y: 0.25, color: LAYER.env },
  ];
  switch (t.kind) {
    case 'desks': {
      const props: Prop[] = [{ u: 1, v: 1, size: [1.7, 0.36, 0.95], color: DESK }];
      const seats: Seat[] = [];
      for (const u of [0.55, 1.45]) {
        for (const [v, face, mv] of [
          [0.3, 0, 0.75],
          [1.7, Math.PI, 1.25],
        ] as const) {
          props.push({ u, v: mv, size: [0.42, 0.26, 0.05], y: 0.36, color: SCREEN, glow: 0.2 });
          props.push({ u, v, size: [0.34, 0.22, 0.34], color: DARK });
          seats.push({ u, v, face, sit: true });
        }
      }
      return { color: LAYER.trust, floor: '#ece6da', props, seats };
    }
    case 'lab': {
      const props: Prop[] = [];
      const seats: Seat[] = [];
      for (const [bv, sv, face] of [
        [0.45, 1.05, 0],
        [2.55, 1.95, Math.PI],
      ] as const) {
        props.push({ u: t.w / 2, v: bv, size: [t.w - 0.5, 0.38, 0.55], color: DESK });
        for (const u of [0.95, 2.0, 3.05]) {
          props.push({ u, v: bv + (face === 0 ? 0.12 : -0.12), size: [0.5, 0.3, 0.05], y: 0.38, color: SCREEN, glow: 0.25, trainingGlow: true });
          props.push({ u, v: sv, size: [0.34, 0.22, 0.34], color: DARK });
          seats.push({ u, v: sv, face, sit: true });
        }
      }
      // Whiteboard and, from tier 2, a GPU test bench in the corner.
      props.push({ u: 0.12, v: t.h / 2, size: [0.06, 0.7, 1.2], y: 0.25, color: '#ffffff' });
      if (tier >= 2) props.push({ u: t.w - 0.3, v: t.h / 2, size: [0.35, 0.7, 0.5], color: LAYER.models, glow: 0.4, trainingGlow: true });
      if (tier >= 3) props.push(...plant(0.3, 0.3));
      return { color: LAYER.models, floor: '#e9e2f2', props, seats };
    }
    case 'break': {
      const props: Prop[] = [
        // Couch
        { u: 1.3, v: t.h - 0.3, size: [1.8, 0.22, 0.5], color: LAYER.gold },
        { u: 1.3, v: t.h - 0.1, size: [1.8, 0.45, 0.14], color: '#9c7a17' },
        // Coffee table
        { u: 1.3, v: 1.05, size: [0.9, 0.2, 0.45], color: WOOD },
        // Counter with coffee machine
        { u: t.w - 0.3, v: 0.75, size: [0.5, 0.42, 1.3], color: DESK },
        { u: t.w - 0.3, v: 0.4, size: [0.26, 0.28, 0.26], y: 0.42, color: DARK },
        ...plant(0.25, 0.25),
      ];
      if (tier >= 2) props.push({ u: 0.9, v: 0.12, size: [1.2, 0.6, 0.05], y: 0.35, color: SCREEN, glow: 0.3 });
      if (tier >= 3) props.push(...plant(t.w - 0.3, t.h - 0.3));
      const seats: Seat[] = [
        { u: 0.8, v: t.h - 0.42, face: Math.PI, sit: true },
        { u: 1.8, v: t.h - 0.42, face: Math.PI, sit: true },
        { u: t.w - 0.75, v: 0.6, face: Math.PI / 2, sit: false },
        { u: 1.3, v: 0.55, face: 0, sit: false },
      ];
      return { color: LAYER.gold, floor: '#f3ead2', props, seats };
    }
    case 'server':
      // Raised floor; racks, cooling and power units are placed by the player.
      return { color: LAYER.compute, floor: '#dfe3ea', props: [], seats: [] };
  }
}

/** Shirt colors per discipline, so you can read who sits where. */
export const DISCIPLINE_COLOR = {
  research: LAYER.models,
  modelEng: LAYER.compute,
  hardwareEng: LAYER.silicon,
  product: LAYER.products,
  ops: LAYER.trust,
} as const;
