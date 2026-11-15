import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group, Texture } from 'three';

/**
 * Building blocks for the product hero: solid, softly lit parts that slide apart when the view is
 * exploded (ported from the old blueprint parts, now shaded instead of wireframe).
 */

/** 0 = assembled, 1 = exploded. Eased toward its target every frame. */
export const ExplodeContext = createContext<{ current: number }>({ current: 1 });

export function useExplode(target: number) {
  const ref = useRef(target);
  useFrame((_, dt) => {
    ref.current += (target - ref.current) * Math.min(1, dt * 4);
  });
  return ref;
}

/** A group that rises from its assembled height to its exploded height. */
export function Layer({ y, lift, children }: { y: number; lift: number; children: ReactNode }) {
  const explode = useContext(ExplodeContext);
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = y + lift * explode.current;
  });
  return <group ref={ref}>{children}</group>;
}

export const MAT = {
  pcbGreen: { color: '#1f6b4a', roughness: 0.6, metalness: 0.1 },
  pcbBlack: { color: '#16191f', roughness: 0.55, metalness: 0.15 },
  ceramic: { color: '#c9b58f', roughness: 0.7, metalness: 0.05 },
  substrate: { color: '#2d6b52', roughness: 0.5, metalness: 0.2 },
  silver: { color: '#c8d0dc', roughness: 0.3, metalness: 0.85 },
  alu: { color: '#9aa6b6', roughness: 0.35, metalness: 0.8 },
  copper: { color: '#c47a45', roughness: 0.35, metalness: 0.85 },
  gold: { color: '#e2b84f', roughness: 0.3, metalness: 0.9 },
  shroud: { color: '#2a3140', roughness: 0.45, metalness: 0.4 },
  fan: { color: '#1b1f27', roughness: 0.6, metalness: 0.2 },
  chip: { color: '#22262e', roughness: 0.4, metalness: 0.3 },
  hbm: { color: '#3a3f4a', roughness: 0.35, metalness: 0.5 },
} as const;

type Mat = { color: string; roughness: number; metalness: number };

/** A rounded solid box. */
export function Part({ size, position = [0, 0, 0], mat, radius = 0.03 }: { size: [number, number, number]; position?: [number, number, number]; mat: Mat; radius?: number }) {
  return (
    <RoundedBox args={size} radius={Math.min(radius, Math.min(...size) / 2.1)} smoothness={2} position={position} castShadow receiveShadow>
      <meshStandardMaterial {...mat} />
    </RoundedBox>
  );
}

/** The silicon die: a thin slab whose top face shows the die shot. */
export function Die({ size, position = [0, 0, 0], texture }: { size: number; position?: [number, number, number]; texture: Texture | null }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[size, 0.06, size]} />
        <meshStandardMaterial color="#1a2236" roughness={0.25} metalness={0.6} />
      </mesh>
      {texture && (
        <mesh position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size * 0.98, size * 0.98]} />
          <meshStandardMaterial map={texture} roughness={0.2} metalness={0.5} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.35} />
        </mesh>
      )}
    </group>
  );
}

/** Heatsink fins along x. */
export function Fins({ w, d, h, count, position = [0, 0, 0], mat = MAT.alu }: { w: number; d: number; h: number; count: number; position?: [number, number, number]; mat?: Mat }) {
  const gap = w / count;
  return (
    <group position={position}>
      <Part size={[w, 0.06, d]} position={[0, 0.03, 0]} mat={mat} radius={0.01} />
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[-w / 2 + gap * (i + 0.5), 0.06 + h / 2, 0]} castShadow>
          <boxGeometry args={[gap * 0.32, h, d]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
    </group>
  );
}

/** A fan that spins while the clock runs (or always in the hero). */
export function Fan({ r, position = [0, 0, 0] }: { r: number; position?: [number, number, number] }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 2.5;
  });
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[r, r, 0.05, 40, 1, true]} />
        <meshStandardMaterial {...MAT.shroud} side={2} />
      </mesh>
      <group ref={ref}>
        <mesh>
          <cylinderGeometry args={[r * 0.28, r * 0.28, 0.08, 24]} />
          <meshStandardMaterial {...MAT.fan} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} rotation={[0, (i / 9) * Math.PI * 2, 0.35]} position={[Math.cos((i / 9) * Math.PI * 2) * r * 0.58, 0, -Math.sin((i / 9) * Math.PI * 2) * r * 0.58]}>
            <boxGeometry args={[r * 0.6, 0.012, r * 0.22]} />
            <meshStandardMaterial color="#2b3242" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A label that fades in only when the view is exploded. */
export function Callout({ position, title, line }: { position: [number, number, number]; title: string; line?: string }) {
  const explode = useContext(ExplodeContext);
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (ref.current) ref.current.style.opacity = String(Math.max(0, (explode.current - 0.5) * 2));
  });
  return (
    <Html position={position} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className="hero-callout">
        <b>{title}</b>
        {line && <span>{line}</span>}
      </div>
    </Html>
  );
}
