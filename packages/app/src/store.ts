import { create } from 'zustand';
import { v2, type Command, type GameState } from '@stm/sim';
import type { FromWorker2, ToWorker2 } from './sim2.worker';
import { hqShim } from './v2/shim';
import { needsOf } from './v2/needs';
import {
  AUTOSAVE_ID,
  cleanupLegacySaves,
  deleteSave,
  listSaves,
  loadGameV2,
  loadSettings,
  saveGameV2,
  storeSettings,
  type SaveMeta,
  type Settings,
  type Speed,
} from './saves';

export type Screen = 'menu' | 'game';
/** Sections of the game. */
export type Tab2 = 'company' | 'studio' | 'products' | 'markets' | 'team' | 'research' | 'stats' | 'hq' | 'wealth' | 'compute' | 'world';

/** Build mode: the room template being placed and its rotation (90° steps). */
export interface BuildState {
  kind: 'room' | 'equipment';
  templateId: string;
  rot: number;
  /** Moving an existing room instead of building a new one. */
  moveId?: string;
}

/** A chip being planned in the design wizard (not a project until Start). */
export interface WizardDraft {
  step: number;
  name: string;
  refreshOf?: string;
  kind: v2.ProductKind;
  marketId: string;
  size: v2.ProjectSize;
  nodeId: string;
  tier: v2.Tier;
  memory: number;
  cooling: number;
  board: (string | null)[];
  /** People who will join (ids). */
  team: string[];
}

interface Store {
  screen: Screen;
  /** The running game. */
  v2: v2.GameV2 | null;
  /** The HQ view draws through a small adapter of the game (see v2/shim.ts). */
  game: GameState | null;
  error: string | null;
  notice: string | null;
  tab2: Tab2;
  /** Project open in the Studio. */
  project2: string | null;
  /** A chip whose first wafer is being revealed (it just came back from the fab). */
  reveal2: string | null;
  closeReveal2: () => void;
  /** A shipped product shown big in the main view (from the Products shelf). */
  showcase: string | null;
  setShowcase: (id: string | null) => void;
  /** The place picked on the world map. */
  place: string | null;
  selectPlace: (id: string | null) => void;
  /** The campus shown in the Compute view. */
  campus: string | null;
  /** The design wizard, when open. */
  wizard: WizardDraft | null;
  /** A product whose launch reviews are showing. */
  review2: string | null;
  /** A breakthrough being announced. */
  breakthrough2: string | null;
  /** A year-in-review card showing (the year index). */
  year2: number | null;
  /** Why the clock stopped by itself (shown in the top bar). */
  autoPaused: string | null;
  /** The state before the player's last action, and what it was (Undo works until anything else changes). */
  undo2: { state: v2.GameV2; label: string } | null;
  build: BuildState | null;
  selectedRoom: string | null;
  /** HQ floor shown and built on. */
  floor: number;
  pauseOpen: boolean;
  /** Clock speed (0 = paused). */
  speed: Speed;
  saves: SaveMeta[];
  settings: Settings;
  newGameV2: (companyName: string, seed?: number) => void;
  send2: (cmd: v2.CommandV2) => void;
  /** Room and HQ commands from the shared build mode. */
  send: (cmd: Command) => void;
  undoV2: () => void;
  /** Open the design wizard, fresh or building on a shipped product. */
  openWizard: (fromProductId?: string) => void;
  patchWizard: (patch: Partial<WizardDraft>) => void;
  selectCampus: (id: string | null) => void;
  closeWizard: () => void;
  setTab2: (tab: Tab2) => void;
  openProject2: (id: string | null) => void;
  closeReview2: () => void;
  closeBreakthrough2: () => void;
  closeYear2: () => void;
  loadSave: (id: string) => Promise<void>;
  saveTo: (label?: string) => Promise<void>;
  removeSave: (id: string) => Promise<void>;
  refreshSaves: () => Promise<void>;
  quitToMenu: () => Promise<void>;
  startBuild: (templateId: string, kind?: 'room' | 'equipment') => void;
  startMove: (roomId: string) => void;
  rotateBuild: () => void;
  cancelBuild: () => void;
  selectRoom: (id: string | null) => void;
  setFloor: (floor: number) => void;
  setPauseOpen: (open: boolean) => void;
  setSpeed: (speed: Speed) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  clearError: () => void;
  clearNotice: () => void;
}

const worker2 = new Worker(new URL('./sim2.worker.ts', import.meta.url), { type: 'module' });
const post2 = (msg: ToWorker2) => worker2.postMessage(msg);
const SHARED = new Set(['placeRoom', 'moveRoom', 'demolishRoom', 'moveHq']);

const fresh = (): Partial<Store> => ({
  screen: 'game',
  v2: null,
  game: null,
  tab2: 'studio',
  project2: null,
  wizard: null,
  review2: null,
  breakthrough2: null,
  year2: null,
  autoPaused: null,
  undo2: null,
  pauseOpen: false,
  build: null,
  selectedRoom: null,
  floor: 0,
  speed: 0,
});

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  v2: null,
  game: null,
  error: null,
  notice: null,
  tab2: 'studio',
  project2: null,
  wizard: null,
  campus: null,
  place: null,
  reveal2: null,
  showcase: null,
  review2: null,
  breakthrough2: null,
  year2: null,
  autoPaused: null,
  undo2: null,
  build: null,
  selectedRoom: null,
  floor: 0,
  pauseOpen: false,
  speed: 0,
  saves: [],
  settings: loadSettings(),

  newGameV2: (companyName, seed = Math.floor(Math.random() * 2 ** 31)) => {
    set(fresh());
    post2({ type: 'newGame', seed, companyName });
  },
  send2: (cmd) => {
    if (cmd.type !== 'tick') {
      const cur = get().v2;
      set({ autoPaused: null, undo2: cur && UNDO_LABEL[cmd.type] ? { state: cur, label: UNDO_LABEL[cmd.type]! } : null });
    }
    post2({ type: 'command', cmd });
  },
  send: (cmd) => {
    if (SHARED.has(cmd.type)) get().send2(cmd as unknown as v2.CommandV2);
  },
  undoV2: () => {
    const u = get().undo2;
    if (!u) return;
    set({ undo2: null, notice: `Undid: ${u.label}` });
    post2({ type: 'load', state: u.state });
  },
  openWizard: (from) => {
    const g = get().v2;
    if (!g) return;
    const base = from ? g.products.find((p) => p.id === from) : undefined;
    const kinds = v2.KINDS.filter((k) => v2.kindUnlocked(g, k.id));
    const kind = base?.kind ?? kinds[0]!.id;
    const marketId = base?.marketId ?? g.markets.map((m) => v2.market(m.id)).find((m) => m.kind === kind)?.id ?? '';
    const size = base?.size ?? 'S';
    const count = g.products.length + g.projects.length + 1;
    set({
      tab2: 'studio',
      project2: null,
      wizard: {
        step: 0,
        name: base ? nextName(base.name) : `${g.companyName.split(' ')[0]} ${kind === 'gpu' ? 'G' : kind === 'cpu' ? 'X' : kind[0]!.toUpperCase()}${count}`,
        refreshOf: base?.id,
        kind,
        marketId,
        size,
        nodeId: v2.bestNode(g).id,
        tier: base?.tier ?? 'std',
        memory: base?.memory ?? 0,
        cooling: base?.cooling ?? 0,
        board: base ? [...base.board] : Array(v2.SIZES[size].w * v2.SIZES[size].h).fill(null),
        team: g.staff.filter((p) => p.task === null).map((p) => p.id),
      },
    });
  },
  patchWizard: (patch) => {
    const w = get().wizard;
    if (w) set({ wizard: { ...w, ...patch } });
  },
  closeWizard: () => set({ wizard: null }),
  selectCampus: (campus) => set({ campus }),
  selectPlace: (place) => set({ place }),
  closeReveal2: () => set({ reveal2: null }),
  setShowcase: (showcase) => set({ showcase }),
  setTab2: (tab2) => set({ tab2, build: null, selectedRoom: null }),
  openProject2: (project2) => set({ project2, tab2: 'studio' }),
  closeReview2: () => set({ review2: null }),
  closeBreakthrough2: () => set({ breakthrough2: null }),
  closeYear2: () => set({ year2: null }),

  loadSave: async (id) => {
    const g2 = await loadGameV2(id);
    if (!g2) {
      set({ error: 'That save is from an older version of the game and can’t be loaded. Start a new game.' });
      return;
    }
    set({ ...fresh(), tab2: 'company' });
    post2({ type: 'load', state: g2 });
  },
  saveTo: async (label) => {
    const g2 = get().v2;
    if (!g2) return;
    await saveGameV2(g2, { label });
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
    if (g2 && g2.status === 'playing') await saveGameV2(g2, { id: AUTOSAVE_ID, auto: true });
    set({ screen: 'menu', pauseOpen: false, game: null, v2: null, speed: 0 });
    await get().refreshSaves();
  },

  startBuild: (templateId, kind = 'room') => set({ build: { kind, templateId, rot: 0 }, selectedRoom: null }),
  startMove: (roomId) => {
    const room = get().v2?.hq.rooms.find((r) => r.id === roomId);
    if (room) set({ build: { kind: 'room', templateId: room.templateId, rot: room.rot, moveId: room.id }, selectedRoom: null, floor: room.floor ?? 0 });
  },
  rotateBuild: () => {
    const b = get().build;
    if (b) set({ build: { ...b, rot: (b.rot + 1) % 4 } });
  },
  cancelBuild: () => set({ build: null }),
  selectRoom: (selectedRoom) => set({ selectedRoom }),
  setFloor: (floor) => set({ floor, selectedRoom: null }),
  setPauseOpen: (pauseOpen) => set({ pauseOpen }),
  setSpeed: (speed) => set({ speed }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storeSettings(settings);
    set({ settings });
  },
  clearError: () => set({ error: null }),
  clearNotice: () => set({ notice: null }),
}));

worker2.onmessage = (e: MessageEvent<FromWorker2>) => {
  const { state, error } = e.data;
  const st = useStore.getState();
  const prev = st.v2;
  const patch: Partial<Store> = { v2: state, game: hqShim(state), error: error ?? null };
  // Time moving on (or a failed action) ends the undo window.
  if (e.data.cmd === 'tick' || error) patch.undo2 = null;
  else if (e.data.cmd && st.undo2) patch.notice = `${st.undo2.label}.`;
  if (prev) {
    if (state.years.length > prev.years.length) patch.year2 = state.years.length - 1;
    if (state.products.length > prev.products.length) patch.review2 = state.products[state.products.length - 1]!.id;
    // First silicon: a chip just came back from the fab.
    const back = state.projects.find((p) => p.phase === 'ready' && p.kind !== 'model' && prev.projects.find((q) => q.id === p.id)?.phase === 'tapeout');
    if (back) patch.reveal2 = back.id;
    const bt = state.research.done.find((d) => !prev.research.done.includes(d) && !!v2.TECHS.find((t) => t.id === d)?.breakthrough);
    if (bt) patch.breakthrough2 = bt;
    // Anything new that needs the player stops the clock (prompts never time out).
    if (st.speed > 0) {
      const before = new Set(needsOf(prev).map((n) => n.key));
      const freshNeed = needsOf(state).find((n) => !before.has(n.key));
      if (freshNeed || patch.review2 || patch.breakthrough2 || patch.year2 !== undefined) {
        patch.speed = 0;
        patch.autoPaused = freshNeed?.text ?? (patch.review2 ? 'Launch day' : patch.breakthrough2 ? 'Breakthrough' : 'Year in review');
      }
    }
    // Autosave at the start of each month.
    if (Math.floor(state.day / 30) !== Math.floor(prev.day / 30) && st.settings.autosaveEveryWeeks > 0 && state.status === 'playing')
      void saveGameV2(state, { id: AUTOSAVE_ID, auto: true }).catch(() => undefined);
  }
  useStore.setState(patch);
};

/** Player actions that can be undone, and how the pop-up names them. */
const UNDO_LABEL: Partial<Record<v2.CommandV2['type'], string>> = {
  startProject: 'Started a new chip',
  setBoard: 'Changed the die layout',
  assign: 'Changed who works on what',
  setCrunch: 'Changed crunch',
  fixBug: 'Fixing the bug',
  ignoreBug: 'Shipping with the bug',
  finishVerification: 'Taped out',
  launch: 'Launched',
  cancelProject: 'Cancelled the project',
  setPrice: 'Changed the price',
  retireProduct: 'Retired the chip',
  postJobAd: 'Posted a job ad',
  hire: 'Hired',
  fire: 'Let someone go',
  train: 'Trained',
  research: 'Changed research',
  resolveCard: 'Decided',
  placeRoom: 'Built a room',
  moveRoom: 'Moved a room',
  demolishRoom: 'Removed a room',
  moveHq: 'Moved HQ',
  hireExec: 'Hired an executive',
  fireExec: 'Let an executive go',
  setExecAuto: 'Changed autopilot',
  acquireRival: 'Bought a rival',
  buildDatacenter: 'Started a data center',
  buildCampus: 'Broke ground on a campus',
  upgradeCampus: 'Upgraded the campus',
  setTrainShare: 'Changed the training share',
  setRdBudget: 'Changed the R&D budget',
  buildFab: 'Started a fab',
  startAgi: 'Started the AGI program',
  setSalary: 'Changed your salary',
  buyStock: 'Bought shares',
  sellStock: 'Sold shares',
  placeOrder: 'Placed an order',
  cancelOrder: 'Cancelled an order',
  takeLoan: 'Took a loan',
  repayLoan: 'Repaid a loan',
  upgradeHr: 'Upgraded HR',
  openOffice: 'Opened an office',
  ipo: 'Went public',
  setPayout: 'Changed the dividend',
  injectCash: 'Invested your own money',
};

/** The next name in a line: "Omni 2" → "Omni 3", "Omni" → "Omni 2". */
function nextName(name: string): string {
  const m = name.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${name} 2`;
}

export function boot(): void {
  cleanupLegacySaves();
  void useStore.getState().refreshSaves();
}

// Dev builds only: expose the store for debugging and automated UI checks.
if (import.meta.env.DEV) (window as unknown as { __stm: typeof useStore }).__stm = useStore;
