import { content } from '@stm/content';
import { migrateSave, totalUsers, v2, type GameState, type MigrationResult } from '@stm/sim';

/** What the load screen shows without reading the whole save. */
export interface SaveMeta {
  id: string;
  label: string;
  companyName: string;
  week: number;
  cash: number;
  users: number;
  savedAt: string;
  version: number;
  auto: boolean;
}

interface SaveFile {
  meta: SaveMeta;
  state: GameState;
}

/** Bridge exposed by the Electron preload script (packages/desktop/preload.cjs). */
export interface DesktopBridge {
  listSaves(): Promise<string[]>;
  readSave(id: string): Promise<string | null>;
  writeSave(id: string, meta: string, data: string): Promise<void>;
  deleteSave(id: string): Promise<void>;
  savesFolder(): Promise<string>;
  quit(): void;
}

declare global {
  interface Window {
    stmDesktop?: DesktopBridge;
  }
}

export const isDesktop = typeof window !== 'undefined' && !!window.stmDesktop;
export const AUTOSAVE_ID = 'autosave';

interface Backend {
  list(): Promise<SaveMeta[]>;
  read(id: string): Promise<SaveFile | null>;
  write(file: SaveFile): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Desktop: one JSON file per save in the app's user-data folder (Steam Cloud can sync it later). */
const desktopBackend = (bridge: DesktopBridge): Backend => ({
  async list() {
    const metas = await bridge.listSaves();
    return metas.flatMap((m) => {
      try {
        return [JSON.parse(m) as SaveMeta];
      } catch {
        return [];
      }
    });
  },
  async read(id) {
    const raw = await bridge.readSave(id);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  },
  async write(file) {
    await bridge.writeSave(file.meta.id, JSON.stringify(file.meta), JSON.stringify(file));
  },
  async remove(id) {
    await bridge.deleteSave(id);
  },
});

/** Browser (dev builds): localStorage. */
const PREFIX = 'stm.saves/';
const browserBackend: Backend = {
  async list() {
    const out: SaveMeta[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          out.push((JSON.parse(localStorage.getItem(key)!) as SaveFile).meta);
        } catch {
          /* skip unreadable save */
        }
      }
    } catch {
      /* storage unavailable */
    }
    return out;
  },
  async read(id) {
    try {
      const raw = localStorage.getItem(PREFIX + id);
      return raw ? (JSON.parse(raw) as SaveFile) : null;
    } catch {
      return null;
    }
  },
  async write(file) {
    localStorage.setItem(PREFIX + file.meta.id, JSON.stringify(file));
  },
  async remove(id) {
    try {
      localStorage.removeItem(PREFIX + id);
    } catch {
      /* ignore */
    }
  },
};

const backend: Backend = typeof window !== 'undefined' && window.stmDesktop ? desktopBackend(window.stmDesktop) : browserBackend;

export async function listSaves(): Promise<SaveMeta[]> {
  const metas = await backend.list();
  return metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function saveGame(state: GameState, opts: { id?: string; label?: string; auto?: boolean } = {}): Promise<SaveMeta> {
  const id = opts.id ?? `slot-${Date.now().toString(36)}`;
  const meta: SaveMeta = {
    id,
    label: opts.label?.trim() || (opts.auto ? 'Autosave' : `${state.companyName} · week ${state.week}`),
    companyName: state.companyName,
    week: state.week,
    cash: state.cash,
    users: totalUsers(state),
    savedAt: new Date().toISOString(),
    version: state.version,
    auto: !!opts.auto,
  };
  await backend.write({ meta, state });
  return meta;
}

export async function loadGame(id: string): Promise<MigrationResult> {
  const file = await backend.read(id);
  if (!file) return { error: 'That save could not be found.' };
  return migrateSave(file.state, content);
}

/** A v2 save (the rebooted game), or null if the slot holds an older game. */
export async function loadGameV2(id: string): Promise<v2.GameV2 | null> {
  const file = await backend.read(id);
  const st = file?.state as unknown as { version?: number } | undefined;
  return st?.version === 2 ? (st as unknown as v2.GameV2) : null;
}

export async function saveGameV2(state: v2.GameV2, opts: { id?: string; label?: string; auto?: boolean } = {}): Promise<SaveMeta> {
  const id = opts.id ?? `slot-${Date.now().toString(36)}`;
  const meta: SaveMeta = {
    id,
    label: opts.label?.trim() || (opts.auto ? 'Autosave' : `${state.companyName} · ${v2.monthLabelV2(state.day)}`),
    companyName: state.companyName,
    week: Math.floor(state.day / 7),
    cash: state.cash,
    users: 0,
    savedAt: new Date().toISOString(),
    version: 2,
    auto: !!opts.auto,
  };
  await backend.write({ meta, state: state as unknown as GameState });
  return meta;
}

export async function deleteSave(id: string): Promise<void> {
  await backend.remove(id);
}

/** Remove single-slot saves left over from early prototype builds. */
export function cleanupLegacySaves(): void {
  try {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^stm\.save\.v\d+$/.test(key)) old.push(key);
    }
    old.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Player settings, per machine. */
export interface Settings {
  /** 0 = off. */
  autosaveEveryWeeks: number;
  /** Whole-UI zoom in percent (90, 100, 115, 130). */
  uiScale: number;
  /** Width of the right panel in pixels. */
  panelWidth: number;
  /** Pause automatically when a big milestone is announced. */
  pauseOnMilestones: boolean;
  /** Speed the clock starts at when a game opens (0 = paused). */
  defaultSpeed: Speed;
  /** Simple shows outcomes; full shows every number on every screen. */
  detail: 'simple' | 'full';
  /** Show the "Next step" guide in the world view. */
  showGuide: boolean;
}

export type Speed = 0 | 1 | 2 | 4;

export const DEFAULT_SETTINGS: Settings = { autosaveEveryWeeks: 1, uiScale: 100, panelWidth: 480, pauseOnMilestones: true, defaultSpeed: 0, detail: 'simple', showGuide: true };

const SETTINGS_KEY = 'stm.settings';
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
