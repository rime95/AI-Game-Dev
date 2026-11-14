import { create } from 'zustand';
import type { Command, GameState } from '@stm/sim';
import type { FromWorker, ToWorker } from './sim.worker';
import {
  AUTOSAVE_ID,
  cleanupLegacySaves,
  deleteSave,
  listSaves,
  loadGame,
  loadSettings,
  saveGame,
  storeSettings,
  type SaveMeta,
  type Settings,
} from './saves';

export type Tab = 'overview' | 'hq' | 'compute' | 'silicon' | 'license' | 'models' | 'products' | 'team' | 'deals' | 'rivals';
export type Screen = 'menu' | 'game';
export type WorldView = 'hq' | 'campus';

/** Build mode: the room template being placed and its rotation (90° steps). */
export interface BuildState {
  templateId: string;
  rot: number;
}

interface Store {
  screen: Screen;
  game: GameState | null;
  error: string | null;
  notice: string | null;
  tab: Tab;
  worldView: WorldView;
  build: BuildState | null;
  selectedRoom: string | null;
  pauseOpen: boolean;
  saves: SaveMeta[];
  settings: Settings;
  send: (cmd: Command) => void;
  newGame: (companyName: string, seed?: number) => void;
  loadSave: (id: string) => Promise<void>;
  saveTo: (label?: string) => Promise<void>;
  removeSave: (id: string) => Promise<void>;
  refreshSaves: () => Promise<void>;
  quitToMenu: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setWorldView: (v: WorldView) => void;
  startBuild: (templateId: string) => void;
  rotateBuild: () => void;
  cancelBuild: () => void;
  selectRoom: (id: string | null) => void;
  setPauseOpen: (open: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  clearError: () => void;
  clearNotice: () => void;
}

const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
const post = (msg: ToWorker) => worker.postMessage(msg);

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  game: null,
  error: null,
  notice: null,
  tab: 'overview',
  worldView: 'hq',
  build: null,
  selectedRoom: null,
  pauseOpen: false,
  saves: [],
  settings: loadSettings(),

  send: (cmd) => post({ type: 'command', cmd }),

  newGame: (companyName, seed = Math.floor(Math.random() * 2 ** 31)) => {
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq' });
    post({ type: 'newGame', seed, companyName });
  },

  loadSave: async (id) => {
    const res = await loadGame(id);
    if ('error' in res) {
      set({ error: res.error });
      return;
    }
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq' });
    post({ type: 'load', state: res.state });
    if (res.migratedFrom) set({ notice: `Save upgraded from version ${res.migratedFrom}.` });
  },

  saveTo: async (label) => {
    const game = get().game;
    if (!game) return;
    await saveGame(game, { label });
    set({ notice: 'Game saved.' });
    await get().refreshSaves();
  },

  removeSave: async (id) => {
    await deleteSave(id);
    await get().refreshSaves();
  },

  refreshSaves: async () => set({ saves: await listSaves() }),

  quitToMenu: async () => {
    const game = get().game;
    if (game && game.status === 'playing') await saveGame(game, { id: AUTOSAVE_ID, auto: true });
    set({ screen: 'menu', pauseOpen: false, game: null });
    await get().refreshSaves();
  },

  setTab: (tab) => set({ tab }),
  setWorldView: (worldView) => set({ worldView, build: worldView === 'hq' ? get().build : null }),
  startBuild: (templateId) => set({ build: { templateId, rot: 0 }, worldView: 'hq', selectedRoom: null }),
  rotateBuild: () => {
    const b = get().build;
    if (b) set({ build: { ...b, rot: (b.rot + 1) % 4 } });
  },
  cancelBuild: () => set({ build: null }),
  selectRoom: (selectedRoom) => set({ selectedRoom }),
  setPauseOpen: (open) => set({ pauseOpen: open }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storeSettings(settings);
    set({ settings });
  },
  clearError: () => set({ error: null }),
  clearNotice: () => set({ notice: null }),
}));

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const { state, error } = e.data;
  const prev = useStore.getState().game;
  useStore.setState({ game: state, error: error ?? null });
  // Autosave when a new week begins, every N weeks (per settings).
  const every = useStore.getState().settings.autosaveEveryWeeks;
  if (every > 0 && prev && state.week !== prev.week && state.week % every === 0) {
    void saveGame(state, { id: AUTOSAVE_ID, auto: true }).catch(() => undefined);
  }
};

export function boot(): void {
  cleanupLegacySaves();
  void useStore.getState().refreshSaves();
}
