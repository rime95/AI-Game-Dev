import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { Arch } from '@stm/content';
import { LAYER } from '../../ui/layers';
import { BP, BpBox, Callout, Layer } from './parts';
import { useDetails } from '../../panels/Panel';

/** Rough transformer depth for a parameter count (for the drawing only). */
export function layerCount(paramsB: number): number {
  return Math.max(8, Math.min(160, Math.round(16 * Math.pow(paramsB, 0.3))));
}

const EXPERTS = 8;
const MAX_GROUPS = 18;

/**
 * Exploded layer stack (world-and-facilities §8). Height and width scale with parameter count.
 * Dense models show attention + MLP slabs; MoE shows expert blocks that light up per token.
 * During training the stack fills in from the bottom.
 */
export function ModelStack({ arch, paramsB, progress }: { arch: Arch; paramsB: number; progress: number | null }) {
  const layers = layerCount(paramsB);
  const details = useDetails();
  const groups = Math.min(MAX_GROUPS, layers);
  const width = 1.2 + Math.log10(Math.max(1, paramsB)) * 0.7;
  const moe = arch.activeParamFraction < 1;
  const active = Math.max(1, Math.round(EXPERTS * arch.activeParamFraction));
  const pitch = 0.24;
  const spread = 0.1;
  const filled = progress === null ? groups : Math.floor(progress * groups);
  const top = groups * pitch;

  return (
    <group position={[0, -(top + groups * spread) / 2, 0]}>
      {/* Embedding at the bottom */}
      <Layer y={-0.3} lift={-0.3}>
        <BpBox size={[width * 1.1, 0.1, width * 1.1]} position={[0, 0.05, 0]} tint={LAYER.models} opacity={0.3} />
        <Callout position={[width * 0.6, 0.1, 0]} title={details ? 'Embedding' : 'Words in'} lines={[details ? 'Tokens in' : 'Text becomes numbers']} />
      </Layer>

      {Array.from({ length: groups }, (_, g) => {
        const done = g < filled;
        const opacity = progress === null ? 0.35 : done ? 0.6 : 0.06;
        return (
          <Layer key={g} y={g * pitch} lift={g * spread}>
            {/* Attention */}
            <BpBox size={[width, 0.06, width]} position={[0, 0.03, 0]} tint={LAYER.compute} opacity={opacity * 0.8} />
            {/* MLP or experts */}
            {moe ? (
              <Experts y={0.15} width={width} active={active} opacity={opacity} live={progress === null || done} />
            ) : (
              <BpBox size={[width * 0.9, 0.12, width * 0.9]} position={[0, 0.15, 0]} tint={LAYER.models} opacity={opacity} />
            )}
          </Layer>
        );
      })}

      {/* Output head */}
      <Layer y={top + 0.05} lift={groups * spread + 0.3}>
        <BpBox size={[width * 1.1, 0.1, width * 1.1]} position={[0, 0.05, 0]} tint={LAYER.products} opacity={0.3} />
        <Callout position={[width * 0.6, 0.1, 0]} title={details ? 'Output head' : 'Answer out'} lines={[details ? 'Next-token logits' : 'Picks the next word']} />
      </Layer>

      <Layer y={top * 0.55} lift={(groups * spread) / 2}>
        <Callout
          position={[-width * 0.6, 0, 0]}
          side="left"
          title={`${layers} layers`}
          lines={
            details
              ? moe
                ? [`Attention + ${EXPERTS} experts per layer`, `${active} of ${EXPERTS} experts run per token`]
                : ['Attention + MLP per layer', 'Every weight runs per token']
              : moe
                ? [`${EXPERTS} experts in every layer`, `Only ${active} wake up for each word`]
                : ['Each layer thinks a bit harder', 'The whole brain works on every word']
          }
        />
      </Layer>

      <TokenPulse height={top + groups * spread + 0.6} />
    </group>
  );
}

/** MoE experts in a 4×2 grid; a few light up per token, re-picked a few times a second. */
function Experts({ y, width, active, opacity, live }: { y: number; width: number; active: number; opacity: number; live: boolean }) {
  const [lit, setLit] = useState<number[]>(() => pick(active));
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (!live) return;
    if (clock.elapsedTime - last.current > 0.4 + Math.random() * 0.3) {
      last.current = clock.elapsedTime;
      setLit(pick(active));
    }
  });
  const cw = (width * 0.9) / 4;
  const cd = (width * 0.9) / 2;
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: EXPERTS }, (_, i) => (
        <BpBox
          key={i}
          size={[cw * 0.85, 0.12, cd * 0.85]}
          position={[-width * 0.45 + cw * ((i % 4) + 0.5), 0, -width * 0.45 + cd * (Math.floor(i / 4) + 0.5)]}
          tint={live && lit.includes(i) ? '#f2c94c' : LAYER.models}
          opacity={live && lit.includes(i) ? 0.85 : opacity}
        />
      ))}
    </group>
  );
}

function pick(k: number): number[] {
  const all = Array.from({ length: EXPERTS }, (_, i) => i).sort(() => Math.random() - 0.5);
  return all.slice(0, k);
}

/** A token rising through the stack. */
function TokenPulse({ height }: { height: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = -0.3 + ((clock.elapsedTime * 1.2) % 1) * (height + 0.3);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.09, 12, 12]} />
      <meshBasicMaterial color="#f2c94c" />
    </mesh>
  );
}

/** Smooth, deterministic-looking loss curve for the training overlay (cosmetic). */
export function lossCurve(progress: number, capability: number, points = 60): { t: number; loss: number }[] {
  const final = Math.max(1.4, 6.2 - 0.18 * capability);
  const out: { t: number; loss: number }[] = [];
  const n = Math.max(2, Math.round(points * progress));
  for (let i = 0; i <= n; i++) {
    const t = (i / points) * 1;
    const noise = Math.sin(i * 12.9898) * 0.04 + Math.sin(i * 3.1) * 0.02;
    out.push({ t, loss: final + (10.5 - final) / Math.pow(1 + 40 * t, 0.6) + noise });
  }
  return out;
}

export { BP };
