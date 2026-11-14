import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import type { Group } from 'three';

/**
 * Blueprint look (art-direction §2): white linework on deep blue, faint tinted fills.
 * The same geometry could later be swapped for real models with a blueprint shader.
 */
export const BP = {
  bg: '#123a63',
  ink: '#eaf3ff',
  fill: '#1d4f80',
} as const;

/** 0 = assembled, 1 = exploded. Animated toward its target every frame. */
export const ExplodeContext = createContext<{ current: number }>({ current: 1 });

export function useExplode(target: number) {
  const ref = useRef(target);
  useFrame((_, dt) => {
    ref.current += (target - ref.current) * Math.min(1, dt * 4);
  });
  return ref;
}

/** A box drawn as blueprint: faint fill plus crisp edges. */
export function BpBox({
  size,
  position = [0, 0, 0],
  tint = BP.fill,
  opacity = 0.35,
  edge = BP.ink,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  tint?: string;
  opacity?: number;
  edge?: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={tint} transparent opacity={opacity} depthWrite={false} />
      <Edges color={edge} threshold={15} />
    </mesh>
  );
}

/** A group that slides from its assembled height to its exploded height (plus an optional sideways offset). */
export function Layer({ y, lift, slide = [0, 0], children }: { y: number; lift: number; slide?: [number, number]; children: ReactNode }) {
  const explode = useContext(ExplodeContext);
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const e = explode.current;
    ref.current.position.set(slide[0] * e, y + lift * e, slide[1] * e);
  });
  return <group ref={ref}>{children}</group>;
}

/** A dimension-style callout that only shows once the view is exploded. */
export function Callout({
  position,
  title,
  lines,
  side = 'right',
}: {
  position: [number, number, number];
  title: string;
  lines: string[];
  side?: 'left' | 'right';
}) {
  const explode = useContext(ExplodeContext);
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (ref.current) ref.current.style.opacity = String(Math.max(0, (explode.current - 0.5) * 2));
  });
  return (
    <Html position={position} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className={`bp-callout ${side}`}>
        <div className="t">{title}</div>
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </Html>
  );
}
