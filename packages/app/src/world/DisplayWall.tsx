import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { v2 } from '@stm/sim';
import { useStore } from '../store';
import { drawDieShot } from '../v2/art/dieShot';
import { eraOf } from '../v2/art/BoxArt';

const ERA_BG = ['#0f4c5c', '#16161c', '#0b1220', '#1a1d24'];
const KIND_TINT: Record<string, string> = { cpu: '#5eead4', gpu: '#ff8f73', console: '#b49cff', mobile: '#6ee7a8', server: '#7aa2ff', accel: '#fcd34d', model: '#b49cff' };

/** A box face: era colour, the die shot, the name and the score (a small canvas version of the box art). */
function boxTexture(p: v2.Product, company: string): CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 208;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = ERA_BG[eraOf(p.nodeId)]!;
  ctx.fillRect(0, 0, 160, 208);
  ctx.fillStyle = KIND_TINT[p.kind] ?? '#5eead4';
  ctx.fillRect(0, 0, 160, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 9px monospace';
  ctx.fillText(company.toUpperCase().slice(0, 22), 10, 20);
  const die = document.createElement('canvas');
  die.width = die.height = 112;
  const dctx = die.getContext('2d');
  if (dctx) drawDieShot(dctx, 112, p.board, p.size, { seed: p.id });
  ctx.drawImage(die, 24, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${p.name.length > 11 ? 14 : 18}px sans-serif`;
  ctx.fillText(p.name, 10, 172);
  ctx.fillStyle = p.score >= 7.5 ? '#fcd34d' : '#e6ecf5';
  ctx.beginPath();
  ctx.arc(136, 32, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#071022';
  ctx.font = '800 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.score.toFixed(1), 136, 37);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px sans-serif';
  ctx.fillText(v2.node(p.nodeId).name, 10, 192);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * The display wall: your latest chips stand as boxes on a shelf along the left wall of the HQ.
 * Hits get a spotlight. Click a box to see it in 3D on the Products tab.
 */
export function DisplayWall({ w, h, wallHeight }: { w: number; h: number; wallHeight: number }) {
  const g = useStore((s) => s.v2);
  const setTab = useStore((s) => s.setTab2);
  const setShowcase = useStore((s) => s.setShowcase);
  const shown = useMemo(() => (g ? [...g.products].filter((p) => p.kind !== 'model').sort((a, b) => b.launchDay - a.launchDay).slice(0, Math.max(2, Math.floor((h - 1.2) / 0.42))) : []), [g?.products.length, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const company = g?.companyName ?? '';
  const textures = useMemo(() => (typeof document === 'undefined' ? [] : shown.map((p) => boxTexture(p, company))), [shown, company]);
  useEffect(() => () => textures.forEach((t) => t?.dispose()), [textures]);
  if (!shown.length) return null;
  const x = -w / 2 + 0.2;
  const shelfY = Math.min(0.55, wallHeight * 0.5);
  const len = shown.length * 0.42 + 0.2;
  const z0 = -h / 2 + 0.6;
  return (
    <group>
      {/* The shelf: a board on two brackets. */}
      <mesh position={[x, shelfY, z0 + len / 2 - 0.1]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.04, len]} />
        <meshStandardMaterial color="#2b3242" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[x - 0.1, shelfY + 0.35, z0 + len / 2 - 0.1]}>
        <boxGeometry args={[0.02, 0.7, len]} />
        <meshStandardMaterial color="#1b2130" emissive="#5eead4" emissiveIntensity={0.08} />
      </mesh>
      {shown.map((p, i) => (
        <group key={p.id} position={[x + 0.02, shelfY + 0.02 + 0.2, z0 + i * 0.42 + 0.1]}>
          <mesh
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              setShowcase(p.id);
              setTab('products');
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <boxGeometry args={[0.12, 0.4, 0.31]} />
            <meshStandardMaterial attach="material-0" map={textures[i] ?? undefined} roughness={0.45} />
            <meshStandardMaterial attach="material-1" color={ERA_BG[eraOf(p.nodeId)]} />
            <meshStandardMaterial attach="material-2" color={KIND_TINT[p.kind] ?? '#5eead4'} />
            <meshStandardMaterial attach="material-3" color={ERA_BG[eraOf(p.nodeId)]} />
            <meshStandardMaterial attach="material-4" color={ERA_BG[eraOf(p.nodeId)]} />
            <meshStandardMaterial attach="material-5" color={ERA_BG[eraOf(p.nodeId)]} />
          </mesh>
          {p.score >= 7.5 && <pointLight position={[0.35, 0.35, 0]} intensity={0.6} distance={0.9} color="#fcd34d" />}
        </group>
      ))}
    </group>
  );
}
