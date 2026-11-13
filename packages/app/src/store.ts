import { create } from 'zustand';
import type { Command, GameState } from '@stm/sim';
import type { FromWorker, ToWorker } from './sim.worker';

export type Tab = 'overview' | 'compute' | 'silicon' | 'license' | 'models' | 'products' | 'team' | 'rivals';

interface Store {
  game: GameState | null;
  error: string | null;
  tab: Tab;
  send: (cmd: Command) => void;
  newGame: (seed?: number) => void;
  setTab: (tab: Tab) => void;
  clearError: () => void;
}

const SAVE_KEY = 'stm.save.v3';
const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
const post = (msg: ToWorker) => worker.postMessage(msg);

export const useStore = create<Store>((set) => ({
  game: null,
  error: null,
  tab: 'overview',
  send: (cmd) => post({ type: 'command', cmd }),
  newGame: (seed = Math.floor(Math.random() * 2 ** 31)) => post({ type: 'newGame', seed }),
  setTab: (tab) => set({ tab }),
  clearError: () => set({ error: null }),
}));

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const { state, error } = e.data;
  useStore.setState({ game: state, error: error ?? null });
  // Temporary autosave until the Electron file-save path exists.
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: ignore */
  }
};

export function boot(): void {
  let saved: GameState | null = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) saved = JSON.parse(raw) as GameState;
  } catch {
    saved = null;
  }
  if (saved && saved.version === 3) post({ type: 'load', state: saved });
  else useStore.getState().newGame();
}
