import { useStore, type Tab } from '../store';
import { Icon, TAB_META } from './layers';

const TABS: Tab[] = ['overview', 'hq', 'compute', 'silicon', 'license', 'models', 'products', 'team', 'deals', 'rivals'];

export function NavRail() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <nav className="rail" aria-label="Sections">
      {TABS.map((t) => {
        const m = TAB_META[t];
        return (
          <button
            key={t}
            style={{ ['--c' as string]: m.color }}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => setTab(t)}
          >
            <Icon d={m.icon} />
            {m.label}
          </button>
        );
      })}
    </nav>
  );
}
