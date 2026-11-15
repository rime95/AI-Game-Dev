import type { RoomTemplate } from '@stm/content';
import { LAYER } from '../ui/layers';

/**
 * Furniture layouts per room template, in the template's own (unrotated) tile frame:
 * u runs along width, v along depth, origin at the room's top-left corner.
 * A prop with a `model` draws that model fitted into its box (see Model.tsx); the box is the
 * fallback while it loads and the shape the layout is planned around.
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
  /** Model name (see MODEL_INFO in Model.tsx). */
  model?: string;
  /** Turn around the vertical axis; 0 = the model's front toward +v. */
  face?: number;
  /** Fill the box exactly instead of keeping the model's proportions. */
  stretch?: boolean;
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

/** Front toward +v (0) or -v (π): which way a chair or desk turns to look from `from` toward `to`. */
const toward = (from: number, to: number) => (to > from ? 0 : Math.PI);

/** `retro`: the chip-company years, with beige PCs instead of flat screens. */
export function roomArt(t: RoomTemplate, tier: number, retro = false): RoomArt {
  const plant = (u: number, v: number): Prop[] => [{ u, v, size: [0.34, 0.62, 0.34], color: LAYER.env, model: 'pottedPlant' }];
  const pc = retro ? 'beigePc' : 'flatPc';
  switch (t.kind) {
    case 'desks': {
      const props: Prop[] = [];
      const seats: Seat[] = [];
      for (const u of [0.55, 1.45]) {
        for (const [v, face, dv] of [
          [0.3, 0, 0.75],
          [1.7, Math.PI, 1.25],
        ] as const) {
          const look = toward(v, dv);
          const away = dv > v ? 1 : -1;
          props.push({ u, v: dv, size: [0.86, 0.36, 0.48], color: DESK, model: 'desk', face: look + Math.PI, stretch: true });
          props.push({ u, v: dv + 0.08 * away, size: [0.4, 0.3, 0.32], y: 0.36, color: SCREEN, glow: 0.2, model: pc, face: look + Math.PI });
          props.push({ u, v, size: [0.4, 0.42, 0.4], color: DARK, model: 'chair', face: look });
          seats.push({ u, v, face, sit: true });
        }
      }
      return { color: LAYER.trust, floor: '#ece6da', props, seats };
    }
    case 'lab': {
      const props: Prop[] = [];
      const seats: Seat[] = [];
      const d = t.seats?.discipline ?? 'research';
      // Shallow rooms (the garage workbench) get one bench along the back; deeper ones two facing rows.
      const rows: [number, number, number][] =
        t.h <= 2
          ? [[0.4, 1.1, 0]]
          : [
              [0.45, 1.05, 0],
              [t.h - 0.45, t.h - 1.05, Math.PI],
            ];
      const perBench = Math.ceil((t.seats?.count ?? 2) / rows.length);
      const spacing = (t.w - 0.6) / perBench;
      const us = Array.from({ length: perBench }, (_, i) => 0.3 + spacing * (i + 0.5));
      const hw = d === 'hardwareEng';
      for (const [bv, sv, face] of rows) {
        const look = toward(sv, bv);
        const away = bv > sv ? 1 : -1;
        for (const u of us) {
          // Hardware: an electronics workbench (scope, vise, pegboard built in). Others: a desk and a PC.
          if (hw) props.push({ u, v: bv, size: [spacing - 0.06, 0.8, 0.55], color: DESK, model: 'workbench', face: look + Math.PI });
          else props.push({ u, v: bv, size: [spacing - 0.06, 0.38, 0.55], color: DESK, model: 'desk', face: look + Math.PI, stretch: true });
          if (!hw) props.push({
            u,
            v: bv + 0.08 * away,
            size: [0.42, 0.32, 0.34],
            y: 0.38,
            color: SCREEN,
            glow: 0.25,
            trainingGlow: true,
            model: pc,
            face: look + Math.PI,
          });
          props.push({ u, v: sv, size: [0.4, 0.42, 0.4], color: DARK, model: 'chair', face: look });
          seats.push({ u, v: sv, face, sit: true });
        }
      }
      if (d === 'hardwareEng') props.push({ u: t.w - 0.2, v: t.h - 0.25, size: [0.3, 0.26, 0.24], color: '#b38b5d', model: 'cardboardBoxOpen', face: -Math.PI / 2 });
      const color = DISCIPLINE_COLOR[d];
      // Whiteboard and, from tier 2, a piece of gear in the corner (GPU bench, scope, status wall...).
      if (t.h > 2) props.push({ u: 0.12, v: t.h / 2, size: [0.06, 0.7, Math.min(1.2, t.h - 1.6)], y: 0.25, color: '#ffffff' });
      if (d === 'research' && t.h > 2)
        props.push(
          { u: t.w - 0.2, v: t.h / 2, size: [0.3, 0.85, 0.6], color: WOOD, model: 'shelving', face: -Math.PI / 2 },
        );
      if (tier >= 2 && d !== 'research') props.push({ u: t.w - 0.3, v: t.h / 2, size: [0.4, 0.75, 0.55], color, model: 'labCart', face: -Math.PI / 2 });
      if (tier >= 2 && d === 'research') props.push({ u: 0.3, v: 0.2, size: [0.35, 0.7, 0.3], color, glow: 0.4, trainingGlow: true });
      if (tier >= 3) props.push(...plant(0.3, t.h / 2));
      const floor = { research: '#e9e2f2', hardwareEng: '#dcefec', ops: '#e3e6eb', product: '#f6e3de', modelEng: '#e1e9f7' }[d];
      for (const p of props) if (p.trainingGlow && d !== 'research') p.trainingGlow = false;
      return { color, floor, props, seats };
    }
    case 'break': {
      const props: Prop[] = [
        // Along the back wall, facing into the room (and the camera): couch, then the kitchenette
        // (counter, coffee maker and small fridge in one piece); coffee table in front of the couch.
        { u: 0.95, v: 0.3, size: [1.55, 0.48, 0.5], color: LAYER.gold, model: 'couch', stretch: true },
        { u: 0.95, v: 1.0, size: [0.9, 0.22, 0.45], color: WOOD, model: 'tableCoffee', stretch: true },
        { u: t.w - 0.55, v: 0.28, size: [1.0, 0.75, 0.5], color: DESK, model: 'kitchenette' },
        ...plant(0.2, t.h - 0.22),
      ];
      if (tier >= 2) props.push({ u: 0.95, v: 0.07, size: [1.0, 0.5, 0.04], y: 0.6, color: SCREEN, glow: 0.3 });
      if (tier >= 3) props.push(...plant(t.w - 0.25, t.h - 0.25));
      // Seats face -v at 0, so π looks out from the couch into the room.
      const seats: Seat[] = [
        { u: 0.6, v: 0.42, face: Math.PI, sit: true },
        { u: 1.3, v: 0.42, face: Math.PI, sit: true },
        { u: t.w - 0.55, v: 0.85, face: 0, sit: false },
        { u: 1.95, v: 1.45, face: 2.4, sit: false },
      ];
      return { color: LAYER.gold, floor: '#f3ead2', props, seats };
    }
    case 'special': {
      // Boardroom: long table; legal office: desk and files; vault: a safe door.
      if (t.id === 'boardroom') {
        const props: Prop[] = [{ u: t.w / 2, v: t.h / 2, size: [t.w - 1, 0.36, 1], color: WOOD, model: 'confTable', stretch: true }];
        for (const u of [0.9, 1.5, 2.1])
          for (const v of [0.75, 2.25]) props.push({ u, v, size: [0.36, 0.4, 0.36], color: DARK, model: 'chair', face: toward(v, t.h / 2) });
        return { color: LAYER.gold, floor: '#efe6d3', props, seats: [] };
      }
      if (t.id === 'secureVault')
        return {
          color: LAYER.trust,
          floor: '#d9dde4',
          props: [
            { u: 1, v: 0.25, size: [1.2, 0.9, 0.2], color: '#7b8494' },
            { u: 1, v: 0.37, size: [0.4, 0.4, 0.05], y: 0.25, color: LAYER.gold, glow: 0.4 },
          ],
          seats: [],
        };
      return {
        color: LAYER.trust,
        floor: '#e6e2da',
        props: [
          { u: 1, v: 0.7, size: [1.2, 0.36, 0.6], color: DESK },
          { u: 0.25, v: 1.6, size: [0.35, 0.8, 0.5], color: '#a39a8a' },
          { u: 1, v: 0.7, size: [0.3, 0.06, 0.4], y: 0.36, color: '#ffffff' },
        ],
        seats: [],
      };
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
