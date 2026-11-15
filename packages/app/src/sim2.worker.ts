import { content } from '@stm/content';
import { v2 } from '@stm/sim';

export type ToWorker2 =
  | { type: 'newGame'; seed: number; companyName: string }
  | { type: 'load'; state: v2.GameV2 }
  | { type: 'command'; cmd: v2.CommandV2 };
export type FromWorker2 = { type: 'state'; state: v2.GameV2; error?: string; cmd?: v2.CommandV2['type'] };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker2>) => void) | null;
  postMessage: (msg: FromWorker2) => void;
};
let state: v2.GameV2 | null = null;

ctx.onmessage = (e: MessageEvent<ToWorker2>) => {
  const msg = e.data;
  let error: string | undefined;
  if (msg.type === 'newGame') state = v2.createGameV2(content, msg.seed, msg.companyName);
  else if (msg.type === 'load') state = msg.state;
  else if (state) {
    const res = v2.applyV2(state, content, msg.cmd);
    state = res.state;
    error = res.error;
  }
  if (state) ctx.postMessage({ type: 'state', state, error, cmd: msg.type === 'command' ? msg.cmd.type : undefined } satisfies FromWorker2);
};
