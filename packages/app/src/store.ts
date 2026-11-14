import { create } from 'zustand';
import type { ChipDesign, Command, GameState, TrainingSpec } from '@stm/sim';
import type { FromWorker, ToWorker } from './sim.worker';
import { detectMilestone, type Milestone } from './milestones';

export type { Milestone };
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
  type Speed,
} from './saves';

import { viewForTab, type Tab, type WorldView } from './time';
export type { Tab, WorldView };
export type Screen = 'menu' | 'game';

/** Build mode: the room template being placed and its rotation (90° steps). */
export interface BuildState {
  /** A room template, or equipment for a server room. */
  kind: 'room' | 'equipment';
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
  /** HQ floor shown and built on. */
  floor: number;
  /** Designs being edited in Silicon and Models, drawn in Blueprint mode. */
  chipDraft: ChipDesign | null;
  modelDraft: TrainingSpec | null;
  /** A freshly taped-out chip whose wafer reveal is playing. */
  reveal: string | null;
  /** Data center campus and hall shown in the site view (hall null = campus exterior). */
  siteId: string | null;
  hallId: string | null;
  /** A big move being announced (news card). */
  milestone: Milestone | null;
  /** Nudges the player closed this session. */
  dismissedNudges: string[];
  memorialOpen: boolean;
  pauseOpen: boolean;
  /** Clock speed (0 = paused). */
  speed: Speed;
  /** An advanceWeek is with the worker; the clock waits for it. */
  inFlight: boolean;
  /** Sub-tab picked in each panel. */
  subTabs: Partial<Record<Tab, string>>;
  /** Panels where the player opened "Show details" (on top of the global setting). */
  detailTabs: Partial<Record<Tab, boolean>>;
  activityOpen: boolean;
  /** Week when the activity drawer was last opened (for the unread count). */
  seenWeek: number;
  alertsOpen: boolean;
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
  startBuild: (templateId: string, kind?: 'room' | 'equipment') => void;
  rotateBuild: () => void;
  cancelBuild: () => void;
  selectRoom: (id: string | null) => void;
  setFloor: (floor: number) => void;
  setChipDraft: (d: ChipDesign) => void;
  setModelDraft: (d: TrainingSpec) => void;
  closeReveal: () => void;
  openSite: (siteId: string, hallId?: string | null) => void;
  openHall: (hallId: string | null) => void;
  closeMilestone: () => void;
  dismissNudge: (key: string) => void;
  setMemorialOpen: (open: boolean) => void;
  setPauseOpen: (open: boolean) => void;
  setSpeed: (speed: Speed) => void;
  step: () => void;
  setSubTab: (tab: Tab, id: string) => void;
  toggleDetails: (tab: Tab) => void;
  setActivityOpen: (open: boolean) => void;
  setAlertsOpen: (open: boolean) => void;
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
  floor: 0,
  chipDraft: null,
  modelDraft: null,
  reveal: null,
  siteId: null,
  hallId: null,
  milestone: null,
  dismissedNudges: [],
  memorialOpen: false,
  pauseOpen: false,
  speed: 0,
  inFlight: false,
  subTabs: {},
  detailTabs: {},
  activityOpen: false,
  seenWeek: 0,
  alertsOpen: false,
  saves: [],
  settings: loadSettings(),

  send: (cmd) => post({ type: 'command', cmd }),

  newGame: (companyName, seed = Math.floor(Math.random() * 2 ** 31)) => {
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq', floor: 0, chipDraft: null, modelDraft: null, reveal: null, siteId: null, hallId: null, milestone: null, dismissedNudges: [], memorialOpen: false, speed: get().settings.defaultSpeed, inFlight: false, activityOpen: false, alertsOpen: false, seenWeek: 0 });
    post({ type: 'newGame', seed, companyName });
  },

  loadSave: async (id) => {
    const res = await loadGame(id);
    if ('error' in res) {
      set({ error: res.error });
      return;
    }
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq', floor: 0, chipDraft: null, modelDraft: null, reveal: null, siteId: null, hallId: null, milestone: null, dismissedNudges: [], memorialOpen: false, speed: get().settings.defaultSpeed, inFlight: false, activityOpen: false, alertsOpen: false, seenWeek: 0 });
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

  setTab: (tab) => {
    const st = get();
    const worldView = viewForTab(tab, st.game, st.worldView, st.siteId);
    set(worldView === st.worldView ? { tab } : { tab, worldView, build: null, selectedRoom: null });
  },
  setWorldView: (worldView) => set({ worldView, build: null, selectedRoom: null }),
  startBuild: (templateId, kind = 'room') => set({ build: { kind, templateId, rot: 0 }, worldView: 'hq', selectedRoom: null }),
  rotateBuild: () => {
    const b = get().build;
    if (b) set({ build: { ...b, rot: (b.rot + 1) % 4 } });
  },
  cancelBuild: () => set({ build: null }),
  selectRoom: (selectedRoom) => set({ selectedRoom }),
  setFloor: (floor) => set({ floor, selectedRoom: null }),
  setChipDraft: (chipDraft) => set({ chipDraft }),
  setModelDraft: (modelDraft) => set({ modelDraft }),
  closeReveal: () => set({ reveal: null }),
  openSite: (siteId, hallId = null) => set({ worldView: 'site', siteId, hallId, build: null, selectedRoom: null }),
  openHall: (hallId) => set({ hallId, build: null, selectedRoom: null }),
  closeMilestone: () => set({ milestone: null }),
  dismissNudge: (key) => set({ dismissedNudges: [...get().dismissedNudges, key] }),
  setMemorialOpen: (memorialOpen) => set({ memorialOpen }),
  setPauseOpen: (open) => set({ pauseOpen: open }),
  setSpeed: (speed) => set({ speed }),
  step: () => {
    if (get().inFlight) return;
    set({ inFlight: true });
    post({ type: 'command', cmd: { type: 'advanceMonth' } });
  },
  setSubTab: (tab, id) => set({ subTabs: { ...get().subTabs, [tab]: id } }),
  toggleDetails: (tab) => set({ detailTabs: { ...get().detailTabs, [tab]: !get().detailTabs[tab] } }),
  setActivityOpen: (activityOpen) => set({ activityOpen, alertsOpen: false, seenWeek: get().game?.week ?? 0 }),
  setAlertsOpen: (alertsOpen) => set({ alertsOpen, activityOpen: false }),
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
  useStore.setState({ game: state, error: error ?? null, inFlight: false, ...(prev ? {} : { seenWeek: state.week }) });
  // Big moves get a news card.
  // (prev is null right after a new game or a load, so switching games never triggers one.)
  const milestone = prev ? detectMilestone(prev, state) : null;
  if (milestone) useStore.setState({ milestone });
  // A tape-out just delivered a new chip: play the wafer reveal.
  if (prev && state.customChips.length > prev.customChips.length && state.week !== prev.week)
    useStore.setState({ reveal: state.customChips[state.customChips.length - 1].id });
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

// Dev builds only: expose the store for debugging and automated UI checks.
if (import.meta.env.DEV) (window as unknown as { __stm: typeof useStore }).__stm = useStore;
