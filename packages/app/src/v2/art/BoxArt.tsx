import { useMemo } from 'react';
import { v2 } from '@stm/sim';
import { dieShotUrl } from './dieShot';

/**
 * Box art for a chip you shipped: a retail box that changes style with the era (early-90s teal
 * box, late-90s black box with a swoosh, sleek 2000s, the AI-era module), with your die shot as the
 * hero image, the name, a review sticker and the process node.
 */
export function BoxArt({ product, company, width = 180 }: { product: v2.Product; company: string; width?: number }) {
  const era = eraOf(product.nodeId);
  const style = ERA_STYLE[era]!;
  const tint = KIND_TINT[product.kind] ?? '#5eead4';
  const shot = useMemo(() => dieShotUrl(product.board, product.size, product.name, 192), [product.board, product.size, product.name]);
  const top = [...product.reviews].sort((a, b) => b.score - a.score)[0];
  const id = `bx-${product.id}`;
  const hit = product.score >= 7.5;
  return (
    <svg viewBox="0 0 200 260" width={width} height={(width * 260) / 200} role="img" aria-label={`${product.name} box`} className="box-art">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={style.bg[0]} />
          <stop offset="1" stopColor={style.bg[1]} />
        </linearGradient>
        <linearGradient id={`${id}-title`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={style.title[0]} />
          <stop offset="1" stopColor={style.title[1]} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="0" y="0" width="200" height="260" rx="10" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="200" height="260" fill={`url(#${id}-bg)`} />
        {era === 0 && Array.from({ length: 7 }, (_, i) => <rect key={i} x={-60 + i * 40} y="-20" width="14" height="320" fill={tint} opacity="0.12" transform="rotate(28 100 130)" />)}
        {era === 1 && (
          <>
            <path d="M-10 170 C 60 120, 120 210, 210 140 L 210 200 C 130 250, 60 170, -10 220 Z" fill={tint} opacity="0.55" />
            <path d="M-10 190 C 70 150, 130 230, 210 170" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" fill="none" />
          </>
        )}
        {era === 2 && (
          <>
            <rect x="0" y="0" width="200" height="4" fill={tint} />
            <rect x="0" y="256" width="200" height="4" fill={tint} />
            <circle cx="100" cy="118" r="78" fill={tint} opacity="0.12" />
          </>
        )}
        {era === 3 && <rect x="14" y="40" width="172" height="160" rx="12" fill="#ffffff" opacity="0.06" />}
        {/* Die shot as the hero image, in a frame. */}
        <g transform="translate(40 52)">
          <rect x="-6" y="-6" width="132" height="132" rx="8" fill="#0b1020" stroke={style.frame} strokeWidth="2" />
          {shot && <image href={shot} x="0" y="0" width="120" height="120" />}
        </g>
        <text x="14" y="26" fill={style.small} fontFamily="var(--font-num)" fontSize="9" letterSpacing="2">
          {company.toUpperCase().slice(0, 26)}
        </text>
        <text x="14" y="214" fill={`url(#${id}-title)`} fontFamily="var(--font-display)" fontWeight="700" fontSize={product.name.length > 12 ? 18 : 23}>
          {product.name}
        </text>
        <text x="14" y="232" fill={style.small} fontFamily="var(--font-ui)" fontSize="10">
          {v2.kind(product.kind).name} · {v2.market(product.marketId).name}
        </text>
        <g transform="translate(14 240)">
          <rect width="58" height="14" rx="3" fill={tint} opacity="0.85" />
          <text x="29" y="10.5" textAnchor="middle" fontFamily="var(--font-num)" fontSize="8.5" fill="#071022" fontWeight="700">
            {v2.node(product.nodeId).name}
          </text>
        </g>
        {/* Review sticker. */}
        {top && (
          <g transform="translate(160 44)">
            <circle r="26" fill={hit ? '#fcd34d' : '#e6ecf5'} stroke="#071022" strokeOpacity="0.25" strokeWidth="2" />
            <text y="-6" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="15" fill="#071022">
              {product.score.toFixed(1)}
            </text>
            <text y="7" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="6.5" fill="#071022">
              {top.outlet.slice(0, 16)}
            </text>
            <text y="15" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="6" fill="#071022" fontWeight="700">
              {hit ? 'EDITORS’ CHOICE' : 'REVIEWED'}
            </text>
          </g>
        )}
        {product.tier === 'flagship' && (
          <text x="186" y="246" textAnchor="end" fill={tint} fontFamily="var(--font-num)" fontSize="8" letterSpacing="1.5">
            FLAGSHIP
          </text>
        )}
      </g>
    </svg>
  );
}

const KIND_TINT: Record<string, string> = { cpu: '#5eead4', gpu: '#ff8f73', console: '#b49cff', mobile: '#6ee7a8', server: '#7aa2ff', accel: '#fcd34d', model: '#b49cff' };

/** 0 early 90s, 1 late 90s, 2 the 2000s, 3 the AI era. */
export function eraOf(nodeId: string): number {
  const i = v2.NODES.findIndex((n) => n.id === nodeId);
  return i <= 2 ? 0 : i <= 6 ? 1 : i <= 10 ? 2 : 3;
}

const ERA_STYLE = [
  { bg: ['#0f4c5c', '#122a4a'], title: ['#ffffff', '#bdf4ea'], small: '#bfe9e0', frame: '#e8c878' },
  { bg: ['#14161c', '#2a1020'], title: ['#ffffff', '#c7ccd6'], small: '#c7ccd6', frame: '#c8d0dc' },
  { bg: ['#0b1220', '#1b2540'], title: ['#eaf3ff', '#8fd3ff'], small: '#9fb4d8', frame: '#5eead4' },
  { bg: ['#1a1d24', '#0d0f14'], title: ['#ffffff', '#e6e6e6'], small: '#a3a9b6', frame: '#ffffff' },
];
