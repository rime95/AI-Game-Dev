import { useState, type ReactNode } from 'react';
import type { GameState } from '@stm/sim';
import { useStore, type Tab } from '../store';
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
import { HqPanel } from './HqPanel';
import { FabPanel, SitesPanel } from './SitesPanel';
import { SelectionCard } from '../world/World';
import { ADVISORS, type AdvisorKey } from '../words';

/** Panels that hide numbers in simple mode and can show them on request. */
const DETAIL_TABS: Tab[] = ['models', 'silicon', 'compute', 'sites', 'fab', 'hq', 'products', 'license', 'team', 'deals', 'rivals'];

/** Whether the current panel shows every number. */
export function useDetails(): boolean {
  const tab = useStore((s) => s.tab);
  const global = useStore((s) => s.settings.detail === 'full');
  const local = useStore((s) => !!s.detailTabs[tab]);
  return global || local;
}

/** Shown only with details on. */
export function Details({ children }: { children: ReactNode }) {
  return useDetails() ? <>{children}</> : null;
}

/** Shown only in simple mode. */
export function Simple({ children }: { children: ReactNode }) {
  return useDetails() ? null : <>{children}</>;
}

function DetailToggle({ tab }: { tab: Tab }) {
  const global = useStore((s) => s.settings.detail === 'full');
  const on = useStore((s) => !!s.detailTabs[tab]) || global;
  const toggle = useStore((s) => s.toggleDetails);
  if (!DETAIL_TABS.includes(tab)) return null;
  return (
    <button
      className={`detail-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      disabled={global}
      title={global ? 'Every detail is on in Settings' : on ? 'Back to the simple view' : 'Show every number on this screen'}
      onClick={() => toggle(tab)}
    >
      {on ? 'Hide details' : 'Show details'}
    </button>
  );
}

/** Panels long enough to split into sub-tabs. The first one is the default. */
export const SUB_TABS: Partial<Record<Tab, { id: string; label: string }[]>> = {
  overview: [
    { id: 'summary', label: 'Summary' },
    { id: 'goals', label: 'Goals' },
  ],
  compute: [
    { id: 'market', label: 'Chip market' },
    { id: 'fleet', label: 'Our fleet' },
  ],
  models: [
    { id: 'train', label: 'Train' },
    { id: 'library', label: 'Released' },
  ],
  silicon: [
    { id: 'design', label: 'Design' },
    { id: 'chips', label: 'Our chips' },
  ],
  sites: [
    { id: 'campuses', label: 'Campuses' },
    { id: 'build', label: 'Build new' },
  ],
};

/** The sub-tab shown in a panel. */
export function useSubTab(tab: Tab): string {
  const picked = useStore((s) => s.subTabs[tab]);
  const tabs = SUB_TABS[tab];
  return tabs?.some((t) => t.id === picked) ? picked! : (tabs?.[0]?.id ?? '');
}

export function Panel({ game }: { game: GameState }) {
  const tab = useStore((s) => s.tab);
  const setSubTab = useStore((s) => s.setSubTab);
  const worldView = useStore((s) => s.worldView);
  const selected = useStore((s) => s.selectedRoom);
  const m = TAB_META[tab];
  const sub = useSubTab(tab);
  const subs = SUB_TABS[tab];
  const showSelection = !!selected && worldView === 'hq' && (game.hq.rooms.some((r) => r.id === selected) || game.hq.equipment.some((e) => e.id === selected));

  return (
    <aside className="panel" style={{ ['--c' as string]: m.color }} aria-label={m.label}>
      <ResizeHandle />
      <div className="panel-head">
        <div className="panel-title">
          <span className="dot" />
          <h2>{m.label}</h2>
          <DetailToggle tab={tab} />
        </div>
        {subs && (
          <div className="subtabs" role="tablist" aria-label={`${m.label} sections`}>
            {subs.map((s) => (
              <button key={s.id} role="tab" aria-selected={sub === s.id} onClick={() => setSubTab(tab, s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel-body" key={tab}>
        {showSelection && <SelectionCard game={game} />}
        {tab === 'overview' && <OverviewPanel game={game} />}
        {tab === 'hq' && <HqPanel game={game} />}
        {tab === 'sites' && <SitesPanel game={game} />}
        {tab === 'fab' && <FabPanel game={game} />}
        {tab === 'compute' && <ComputePanel game={game} />}
        {tab === 'silicon' && <SiliconPanel game={game} />}
        {tab === 'license' && <LicensePanel game={game} />}
        {tab === 'models' && <ModelsPanel game={game} />}
        {tab === 'products' && <ProductsPanel game={game} />}
        {tab === 'team' && <TeamPanel game={game} />}
        {tab === 'deals' && <DealsPanel game={game} />}
        {tab === 'rivals' && <RivalsPanel game={game} />}
      </div>
    </aside>
  );
}

/** Drag the panel's left edge to resize it (400–640 px); the width is kept in settings. */
function ResizeHandle() {
  const update = useStore((s) => s.updateSettings);
  return (
    <div
      className="panel-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => update({ panelWidth: 480 })}
      onPointerDown={(e) => {
        const startX = e.clientX;
        const { panelWidth, uiScale } = useStore.getState().settings;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const w = Math.round(panelWidth + (startX - ev.clientX) / (uiScale / 100));
          update({ panelWidth: Math.max(400, Math.min(640, w)) });
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    />
  );
}

/** Advisor note: one line until clicked. */
export function Advisor({ who, color, children }: { who: AdvisorKey; color: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const person = ADVISORS[who];
  return (
    <button className={`advisor${open ? ' open' : ''}`} style={{ ['--c' as string]: color }} onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="avatar" aria-hidden="true">
        {person.name.slice(0, 1)}
      </span>
      <span className="advisor-body">
        <span className="who">
          {person.name} <span className="muted">· {person.role}</span>
        </span>
        <span className="say">{children}</span>
      </span>
    </button>
  );
}

/** A collapsible card. Collapsed state lasts for the session. */
const collapsed = new Set<string>();
export function Section({
  title,
  id,
  color,
  action,
  children,
}: {
  title: ReactNode;
  id?: string;
  color?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [shut, setShut] = useState(() => !!id && collapsed.has(id));
  return (
    <section className={`card section${shut ? ' shut' : ''}`} style={color ? { ['--c' as string]: color } : undefined}>
      <div className="section-head">
        <button
          className="section-toggle"
          aria-expanded={!shut}
          onClick={() => {
            if (id) (shut ? collapsed.delete(id) : collapsed.add(id));
            setShut(!shut);
          }}
        >
          <span className="chev" aria-hidden="true">
            ▾
          </span>
          <h3>{title}</h3>
        </button>
        {action}
      </div>
      {!shut && children}
    </section>
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
