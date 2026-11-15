import { create } from 'zustand';
import type { ChipDesign, Command, GameState, TrainingSpec, v2 } from '@stm/sim';
import type { FromWorker2, ToWorker2 } from './sim2.worker';
import { hqShim } from './v2/shim';
import { needsOf } from './v2/needs';
import { v2 as V2 } from '@stm/sim';
const V2_TECHS = V2.TECHS;
import type { FromWorker, ToWorker } from './sim.worker';
import { detectMilestone, type Milestone } from './milestones';

export type { Milestone };
import {
  AUTOSAVE_ID,
  cleanupLegacySaves,
  deleteSave,
  listSaves,
  loadGame,
  loadGameV2,
  saveGameV2,
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
/** Sections of the rebooted (v2) game. */
export type Tab2 = 'company' | 'studio' | 'products' | 'markets' | 'team' | 'research' | 'stats' | 'hq';

/** Build mode: the room template being placed and its rotation (90° steps). */
export interface BuildState {
  /** A room template, or equipment for a server room. */
  kind: 'room' | 'equipment';
  templateId: string;
  rot: number;
  /** Moving an existing room instead of building a new one. */
  moveId?: string;
}

interface Store {
  screen: Screen;
  game: GameState | null;
  /** The rebooted game, when one is running (game then holds an HQ adapter for the 3D view). */
  v2: v2.GameV2 | null;
  tab2: Tab2;
  /** Project open in the Studio. */
  project2: string | null;
  /** A product whose launch reviews are showing. */
  review2: string | null;
  /** A breakthrough being announced. */
  breakthrough2: string | null;
  /** Why the clock stopped by itself (shown in the top bar). */
  autoPaused: string | null;
  newGameV2: (companyName: string, seed?: number) => void;
  send2: (cmd: v2.CommandV2) => void;
  setTab2: (tab: Tab2) => void;
  openProject2: (id: string | null) => void;
  closeReview2: () => void;
  closeBreakthrough2: () => void;
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
  /** A founding-era chip whose reviews are showing. */
  review: string | null;
  closeReview: () => void;
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
  /** Pick up a placed room to put it somewhere else. */
  startMove: (roomId: string) => void;
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
const worker2 = new Worker(new URL('./sim2.worker.ts', import.meta.url), { type: 'module' });
const post2 = (msg: ToWorker2) => worker2.postMessage(msg);
/** Room and HQ commands from the shared build mode, which the v2 game understands too. */
const V2_SHARED = new Set(['placeRoom', 'moveRoom', 'demolishRoom', 'moveHq']);

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  game: null,
  v2: null,
  tab2: 'studio',
  project2: null,
  review2: null,
  breakthrough2: null,
  autoPaused: null,
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
  review: null,
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

  send: (cmd) => {
    if (get().v2) {
      if (V2_SHARED.has(cmd.type)) post2({ type: 'command', cmd: cmd as unknown as v2.CommandV2 });
      return;
    }
    post({ type: 'command', cmd });
  },
  send2: (cmd) => {
    if (cmd.type !== 'tick' && get().autoPaused) set({ autoPaused: null });
    post2({ type: 'command', cmd });
  },
  newGameV2: (companyName, seed = Math.floor(Math.random() * 2 ** 31)) => {
    set({ screen: 'game', v2: null, game: null, tab2: 'studio', project2: null, review2: null, breakthrough2: null, autoPaused: null, pauseOpen: false, build: null, selectedRoom: null, worldView: 'hq', floor: 0, speed: 0, inFlight: false });
    post2({ type: 'newGame', seed, companyName });
  },
  setTab2: (tab2) => set({ tab2, build: null, selectedRoom: null }),
  openProject2: (project2) => set({ project2, tab2: 'studio' }),
  closeReview2: () => set({ review2: null }),
  closeBreakthrough2: () => set({ breakthrough2: null }),

  newGame: (companyName, seed = Math.floor(Math.random() * 2 ** 31)) => {
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq', floor: 0, chipDraft: null, modelDraft: null, reveal: null, review: null, siteId: null, hallId: null, milestone: null, dismissedNudges: [], memorialOpen: false, speed: get().settings.defaultSpeed, inFlight: false, activityOpen: false, alertsOpen: false, seenWeek: 0 });
    post({ type: 'newGame', seed, companyName });
  },

  loadSave: async (id) => {
    const g2 = await loadGameV2(id);
    if (g2) {
      set({ screen: 'game', v2: null, game: null, tab2: 'company', project2: null, review2: null, breakthrough2: null, autoPaused: null, pauseOpen: false, build: null, selectedRoom: null, worldView: 'hq', floor: 0, speed: 0, inFlight: false });
      post2({ type: 'load', state: g2 });
      return;
    }
    set({ v2: null });
    const res = await loadGame(id);
    if ('error' in res) {
      set({ error: res.error });
      return;
    }
    set({ screen: 'game', tab: 'overview', pauseOpen: false, game: null, build: null, selectedRoom: null, worldView: 'hq', floor: 0, chipDraft: null, modelDraft: null, reveal: null, review: null, siteId: null, hallId: null, milestone: null, dismissedNudges: [], memorialOpen: false, speed: get().settings.defaultSpeed, inFlight: false, activityOpen: false, alertsOpen: false, seenWeek: 0 });
    post({ type: 'load', state: res.state });
    if (res.migratedFrom) set({ notice: `Save upgraded from version ${res.migratedFrom}.` });
  },

  saveTo: async (label) => {
    const g2 = get().v2;
    if (g2) {
      await saveGameV2(g2, { label });
      set({ notice: 'Game saved.' });
      await get().refreshSaves();
      return;
    }
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
    const g2 = get().v2;
    if (g2) {
      if (g2.status === 'playing') await saveGameV2(g2, { id: AUTOSAVE_ID, auto: true });
      set({ screen: 'menu', pauseOpen: false, game: null, v2: null, speed: 0 });
      await get().refreshSaves();
      return;
    }
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
  startMove: (roomId) => {
    const room = get().game?.hq.rooms.find((r) => r.id === roomId);
    if (room) set({ build: { kind: 'room', templateId: room.templateId, rot: room.rot, moveId: room.id }, worldView: 'hq', selectedRoom: null, floor: room.floor ?? 0 });
  },
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
  closeReview: () => set({ review: null }),
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
  if (prev && prev.era !== state.era) useStore.setState({ tab: 'overview', worldView: 'hq', seenWeek: state.week, speed: 0 });
  // Big moves get a news card.
  // (prev is null right after a new game or a load, so switching games never triggers one.)
  const milestone = prev ? detectMilestone(prev, state) : null;
  if (milestone) useStore.setState({ milestone });
  // A chip-company product just came out: show its reviews.
  if (prev?.founding && state.founding && state.era === 'founding' && state.founding.products.length > prev.founding.products.length)
    useStore.setState({ review: state.founding.products[state.founding.products.length - 1]!.id });
  // A tape-out just delivered a new chip: play the wafer reveal.
  if (prev && state.customChips.length > prev.customChips.length && state.week !== prev.week)
    useStore.setState({ reveal: state.customChips[state.customChips.length - 1].id });
  // Autosave when a new week begins, every N weeks (per settings).
  const every = useStore.getState().settings.autosaveEveryWeeks;
  if (every > 0 && prev && state.week !== prev.week && state.week % every === 0) {
    void saveGame(state, { id: AUTOSAVE_ID, auto: true }).catch(() => undefined);
  }
};

worker2.onmessage = (e: MessageEvent<FromWorker2>) => {
  const { state, error } = e.data;
  const st = useStore.getState();
  const prev = st.v2;
  const patch: Partial<Store> = { v2: state, game: hqShim(state), error: error ?? null, inFlight: false };
  if (prev) {
    // A launch: show the reviews.
    if (state.products.length > prev.products.length) patch.review2 = state.products[state.products.length - 1]!.id;
    // A breakthrough: announce it.
    const bt = state.research.done.find((d) => !prev.research.done.includes(d) && v2Breakthrough(d));
    if (bt) patch.breakthrough2 = bt;
    // Anything new that needs the player stops the clock (prompts never time out).
    if (st.speed > 0) {
      const before = new Set(needsOf(prev).map((n) => n.key));
      const fresh = needsOf(state).find((n) => !before.has(n.key));
      if (fresh || patch.review2 || patch.breakthrough2) {
        patch.speed = 0;
        patch.autoPaused = fresh?.text ?? (patch.review2 ? 'Launch day' : 'Breakthrough');
      }
    }
    // Autosave at the start of each month.
    if (Math.floor(state.day / 30) !== Math.floor(prev.day / 30) && st.settings.autosaveEveryWeeks > 0 && state.status === 'playing')
      void saveGameV2(state, { id: AUTOSAVE_ID, auto: true }).catch(() => undefined);
  }
  useStore.setState(patch);
};

const v2Breakthrough = (id: string) => !!V2_TECHS.find((t) => t.id === id)?.breakthrough;

export function boot(): void {
  cleanupLegacySaves();
  void useStore.getState().refreshSaves();
}

// Dev builds only: expose the store for debugging and automated UI checks.
if (import.meta.env.DEV) (window as unknown as { __stm: typeof useStore }).__stm = useStore;
