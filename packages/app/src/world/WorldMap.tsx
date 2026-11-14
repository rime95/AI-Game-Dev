import { useMemo, useState } from 'react';
import { content, type SiteLocation } from '@stm/content';
import { serverLayout, siteError, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';

/**
 * World map (world-and-facilities §3): a schematic dot-matrix globe with our HQ, our campuses and
 * places we could build, with power-price, climate and water overlays. Click a place to open it.
 */

/** Land cells on a 6° grid: [row, fromCol, toCol]. Row r is centred on latitude 87 − 6r; col c on longitude −177 + 6c. */
const LAND: [number, number, number][] = [
  [1, 10, 18],
  [1, 20, 26],
  [2, 8, 18],
  [2, 19, 26],
  [2, 44, 50],
  [3, 2, 6],
  [3, 7, 19],
  [3, 20, 25],
  [3, 31, 34],
  [3, 35, 59],
  [4, 2, 6],
  [4, 7, 12],
  [4, 15, 21],
  [4, 26, 26],
  [4, 30, 59],
  [5, 6, 12],
  [5, 15, 20],
  [5, 29, 29],
  [5, 31, 33],
  [5, 34, 57],
  [6, 6, 21],
  [6, 28, 37],
  [6, 37, 53],
  [7, 7, 20],
  [7, 28, 36],
  [7, 37, 53],
  [7, 54, 54],
  [8, 8, 19],
  [8, 28, 29],
  [8, 31, 36],
  [8, 36, 52],
  [8, 53, 54],
  [9, 9, 17],
  [9, 28, 38],
  [9, 39, 50],
  [10, 10, 15],
  [10, 16, 16],
  [10, 27, 39],
  [10, 41, 44],
  [10, 45, 50],
  [11, 12, 14],
  [11, 16, 17],
  [11, 27, 36],
  [11, 37, 39],
  [11, 41, 43],
  [11, 46, 49],
  [12, 14, 16],
  [12, 27, 37],
  [12, 42, 43],
  [12, 46, 48],
  [12, 50, 50],
  [13, 16, 21],
  [13, 28, 37],
  [13, 47, 48],
  [14, 17, 22],
  [14, 31, 37],
  [14, 46, 52],
  [15, 16, 23],
  [15, 31, 37],
  [15, 46, 53],
  [16, 16, 24],
  [16, 32, 37],
  [16, 53, 54],
  [17, 17, 24],
  [17, 32, 37],
  [17, 38, 38],
  [17, 51, 53],
  [18, 18, 23],
  [18, 32, 36],
  [18, 38, 38],
  [18, 49, 55],
  [19, 18, 22],
  [19, 32, 35],
  [19, 49, 55],
  [20, 18, 21],
  [20, 33, 34],
  [20, 49, 55],
  [21, 18, 20],
  [21, 53, 54],
  [21, 58, 58],
  [22, 18, 19],
  [22, 58, 58],
  [23, 18, 19],
  [27, 0, 59],
  [28, 0, 59],
  [29, 0, 59],
];

const W = 720;
const H = 360;
const px = (lon: number) => ((lon + 180) / 360) * W;
const py = (lat: number) => ((90 - lat) / 180) * H;
const HQ = { lon: -122.4, lat: 37.8 };

type Overlay = 'power' | 'climate' | 'water';
/** Places whose label would collide with a neighbour's: draw it on the left. */
const LEFT_LABEL = new Set(['mesa', 'basalt', 'cascadia']);

export function WorldMap({ game }: { game: GameState }) {
  const [overlay, setOverlay] = useState<Overlay>('power');
  const [picked, setPicked] = useState<string | null>(null);
  const openSite = useStore((s) => s.openSite);
  const dots = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const [r, a, b] of LAND)
      for (let c = a; c <= b; c++) {
        // Two dots per 6° cell for a finer texture.
        const lat = 87 - 6 * r;
        const lon = -177 + 6 * c;
        out.push({ x: px(lon - 1.5), y: py(lat + 1.5) }, { x: px(lon + 1.5), y: py(lat - 1.5) });
      }
    return out;
  }, []);
  const layout = serverLayout(game, content);
  const loc = picked ? content.sites.locations.find((l) => l.id === picked) : null;

  return (
    <div className="map-view">
      <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="img" aria-label="World map of our HQ and data center sites">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={2.4} fill="#2f4058" />
        ))}
        {/* Fiber lines from HQ to each campus */}
        {game.sites.map((s) => {
          const l = content.sites.locations.find((x) => x.id === s.locationId)!;
          return (
            <path
              key={s.id}
              d={arc(HQ, l)}
              fill="none"
              stroke={LAYER.compute}
              strokeWidth={1.5}
              strokeDasharray={s.status === 'online' ? undefined : '4 4'}
              opacity={0.7}
            />
          );
        })}
        {content.sites.locations.map((l) => {
          const site = game.sites.find((s) => s.locationId === l.id);
          const color = overlayColor(l, overlay);
          return (
            <g
              key={l.id}
              transform={`translate(${px(l.lon)},${py(l.lat)})`}
              className="map-pin"
              onClick={() => (site ? openSite(site.id) : setPicked(l.id))}
              role="button"
              aria-label={`${l.name}, ${l.region}`}
            >
              <circle r={site ? 9 : 7} fill={site ? LAYER.compute : '#121821'} stroke={color} strokeWidth={site ? 3 : 2.5} />
              {site && <rect x={-3.5} y={-3.5} width={7} height={7} fill="#fff" />}
              <text x={LEFT_LABEL.has(l.id) ? -11 : 11} y={4} textAnchor={LEFT_LABEL.has(l.id) ? 'end' : 'start'} className="map-label">
                {l.name}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${px(HQ.lon)},${py(HQ.lat)})`}>
          <circle r={8} fill={LAYER.gold} stroke="#0b1119" strokeWidth={2} />
          <text x={-11} y={4} textAnchor="end" className="map-label">
            HQ
          </text>
        </g>
      </svg>

      <div className="map-legend">
        <div className="seg">
          {(['power', 'climate', 'water'] as const).map((o) => (
            <button key={o} aria-pressed={overlay === o} onClick={() => setOverlay(o)}>
              {o === 'power' ? 'Power price' : o === 'climate' ? 'Climate' : 'Water'}
            </button>
          ))}
        </div>
        <div className="small muted">{legendText(overlay)}</div>
        <div className="small">
          {game.sites.length} campus{game.sites.length === 1 ? '' : 'es'} · {layout.colo.toLocaleString('en-US')} chips in rented rack space
        </div>
      </div>

      {loc && <LocationCard game={game} loc={loc} onClose={() => setPicked(null)} />}
    </div>
  );
}

function LocationCard({ game, loc, onClose }: { game: GameState; loc: SiteLocation; onClose: () => void }) {
  const send = useStore((s) => s.send);
  const err = siteError(game, content, loc.id);
  const climate = content.sites.climates[loc.climate];
  return (
    <div className="room-card card map-card" style={{ ['--c' as string]: LAYER.compute }}>
      <div className="row between">
        <h3>
          {loc.name} <span className="muted small">· {loc.region}</span>
        </h3>
        <button className="btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="small">{loc.blurb}</div>
      <div className="grid2 small">
        <span>Power ${loc.powerPricePerMWh}/MWh</span>
        <span>
          {climate.label}: cooling ×{climate.coolingMult}, cooling overhead {climate.pueDelta >= 0 ? '+' : ''}
          {climate.pueDelta}
        </span>
        <span>Water: {content.sites.water[loc.water].label.toLowerCase()}</span>
        <span>
          {loc.buildWeeks} wk · {content.sites.startHalls} halls
        </span>
      </div>
      {err && (
        <div className="small" style={{ color: 'var(--bad)' }}>
          {err}
        </div>
      )}
      <button
        className="btn primary"
        disabled={!!err || game.cash < loc.buildCost}
        onClick={() => {
          send({ type: 'buildSite', locationId: loc.id });
          onClose();
        }}
      >
        Build campus ({money(loc.buildCost)})
      </button>
    </div>
  );
}

function overlayColor(l: SiteLocation, o: Overlay): string {
  if (o === 'power') return l.powerPricePerMWh <= 50 ? '#2f8a4c' : l.powerPricePerMWh <= 80 ? '#c97c12' : '#c2413b';
  if (o === 'climate') return l.climate === 'cold' ? '#2a63d4' : l.climate === 'temperate' ? '#6f7079' : '#d4553d';
  return l.water === 'plentiful' ? '#2a63d4' : l.water === 'limited' ? '#c97c12' : '#c2413b';
}

function legendText(o: Overlay): string {
  if (o === 'power') return 'Ring colour: green ≤ $50/MWh · amber ≤ $80 · red above. Our HQ racks pay $80.';
  if (o === 'climate') return 'Blue = cold (cooling ×1.25) · grey = temperate · red = hot (cooling ×0.85).';
  return 'Blue = plentiful · amber = limited (Environmental 2) · red = scarce (Environmental 3).';
}

/** A gentle arc between two points (great-circle look without the math). */
function arc(a: { lon: number; lat: number }, b: { lon: number; lat: number }): string {
  const x1 = px(a.lon);
  const y1 = py(a.lat);
  const x2 = px(b.lon);
  const y2 = py(b.lat);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.15 - 10;
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}
