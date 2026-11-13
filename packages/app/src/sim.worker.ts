import { content } from '@stm/content';
import { applyCommand, createGame, type Command, type GameState } from '@stm/sim';

export type ToWorker = { type: 'newGame'; seed: number } | { type: 'load'; state: GameState } | { type: 'command'; cmd: Command };
export type FromWorker = { type: 'state'; state: GameState; error?: string };

// Typed minimally so the DOM lib (used by the rest of the app) doesn't clash with the WebWorker lib.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage: (msg: FromWorker) => void;
};
let state: GameState | null = null;

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  let error: string | undefined;
  if (msg.type === 'newGame') state = createGame(content, msg.seed);
  else if (msg.type === 'load') state = msg.state;
  else if (state) {
    const res = applyCommand(state, content, msg.cmd);
    state = res.state;
    error = res.error;
  }
  if (state) ctx.postMessage({ type: 'state', state, error } satisfies FromWorker);
};
