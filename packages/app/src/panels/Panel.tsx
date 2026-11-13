import type { ReactNode } from 'react';
import type { GameState } from '@stm/sim';
import { useStore } from '../store';
import { TAB_META } from '../ui/layers';
import { OverviewPanel } from './OverviewPanel';
import { ComputePanel } from './ComputePanel';
import { ModelsPanel } from './ModelsPanel';
import { SiliconPanel } from './SiliconPanel';
import { LicensePanel } from './LicensePanel';
import { ProductsPanel } from './ProductsPanel';
import { TeamPanel } from './TeamPanel';
import { RivalsPanel } from './RivalsPanel';
import { DealsPanel } from './DealsPanel';

export function Panel({ game }: { game: GameState }) {
  const tab = useStore((s) => s.tab);
  const m = TAB_META[tab];
  return (
    <aside className="panel" style={{ ['--c' as string]: m.color }} aria-label={m.label}>
      <div className="panel-head">
        <span className="dot" />
        <h2>{m.label}</h2>
      </div>
      {tab === 'overview' && <OverviewPanel game={game} />}
      {tab === 'compute' && <ComputePanel game={game} />}
      {tab === 'silicon' && <SiliconPanel game={game} />}
      {tab === 'license' && <LicensePanel game={game} />}
      {tab === 'models' && <ModelsPanel game={game} />}
      {tab === 'products' && <ProductsPanel game={game} />}
      {tab === 'team' && <TeamPanel game={game} />}
      {tab === 'deals' && <DealsPanel game={game} />}
      {tab === 'rivals' && <RivalsPanel game={game} />}
    </aside>
  );
}

export function Advisor({ who, color, children }: { who: string; color: string; children: ReactNode }) {
  return (
    <div className="advisor" style={{ ['--c' as string]: color }}>
      <div className="avatar" aria-hidden="true">
        {who.slice(0, 1)}
      </div>
      <div>
        <div className="who">{who}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Stat({ k, v, c }: { k: string; v: ReactNode; c?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v" style={c ? { color: c } : undefined}>
        {v}
      </div>
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar" role="presentation">
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, ...(color ? { ['--c' as string]: color } : {}) }} />
    </div>
  );
}
