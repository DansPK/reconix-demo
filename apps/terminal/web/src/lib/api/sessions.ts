/* The dashboard's Core API sessions, kept in this server's memory only (never a file, a cookie
   or the browser).

   - The main session reads (the conversation list, the models). It comes from the one-time
     code /web passes in RECONIX_WEB_SIGN_IN_CODE (POST /sessions/web-sign-in, exchanged when
     the server starts: src/instrumentation.ts), or, when the dashboard was started without one
     or the API restarted, from POST /sessions.
   - Each assistant conversation is its own web session: the API lets a session chat only in
     itself. Its token is kept by session id. A conversation whose token is gone (the API or
     this server restarted) is resumed: POST /sessions/{id}/resume gives it a new one.

   State lives on globalThis so every route bundle (and instrumentation) shares it. */
import "server-only";

import { hostname, userInfo } from "node:os";

import { coreJson, CoreError } from "./core";

type Opened = { session_id: string; token: string };
type State = {
  main: Opened | null;
  mainPending: Promise<string> | null;
  chats: Map<string, string>;
  chatPending: Map<string, Promise<string>>;
  code: string | null;
  epoch: number;
};

const KEY = Symbol.for("reconix.web.coreSessions");
const g = globalThis as unknown as Record<symbol, State | undefined>;

function state(): State {
  g[KEY] ??= {
    main: null,
    mainPending: null,
    chats: new Map(),
    chatPending: new Map(),
    code: process.env.RECONIX_WEB_SIGN_IN_CODE?.trim() || null,
    epoch: 0,
  };
  return g[KEY];
}

/** Increments whenever the main session is reset or replaced (cache invalidation key). */
export const sessionEpoch = (): number => state().epoch;

/** user@host of this computer: the name in the API's audit log. */
function operator(): string | undefined {
  try {
    return `${userInfo().username}@${hostname()}`.slice(0, 100);
  } catch {
    return undefined;
  }
}

const openSession = () => coreJson<Opened>("/sessions", { method: "POST", body: { interface: "web", operator: operator() } });

/** Trades the start-up code for the main session, once. A code that fails (expired, used)
    is dropped: the main session is then opened with POST /sessions. */
export async function signInWithCode(): Promise<void> {
  const s = state();
  const code = s.code;
  if (!code || s.main) return;
  s.code = null;
  try {
    s.main = await coreJson<Opened>("/sessions/web-sign-in", { method: "POST", body: { code } });
  } catch {
    // the main session is opened on first use instead
  }
}

/** The main session's token, opened on first use (deduplicated across concurrent callers). */
export async function mainToken(): Promise<string> {
  const s = state();
  if (s.main) return s.main.token;
  s.mainPending ??= (async () => {
    try {
      await signInWithCode();
      s.main ??= await openSession();
      return s.main.token;
    } finally {
      s.mainPending = null;
    }
  })();
  return s.mainPending;
}

/** Runs `call` as the main session; a token the API no longer knows (it restarted) is
    replaced once. */
export async function asMain<T>(call: (token: string) => Promise<T>): Promise<T> {
  const used = await mainToken();
  try {
    return await call(used);
  } catch (error) {
    if (!(error instanceof CoreError) || error.status !== 401) throw error;
    const s = state();
    if (s.main?.token === used) {
      s.main = null;
      s.epoch += 1;
    }
    return call(await mainToken());
  }
}

/** A new conversation: a new web session, its token kept. */
export async function openChat(): Promise<string> {
  const opened = await openSession();
  state().chats.set(opened.session_id, opened.token);
  return opened.session_id;
}

/** The token of a conversation, resumed when this server has none (it restarted, or the API
    did). `fresh`: the one held is known to be gone. */
export async function chatToken(id: string, fresh = false): Promise<string> {
  const s = state();
  const held = fresh ? null : s.chats.get(id);
  if (held) return held;
  const inflight = s.chatPending.get(id);
  if (inflight) return inflight;
  const pending = (async () => {
    try {
      const resumed = await asMain((token) => coreJson<Opened>(`/sessions/${id}/resume`, { method: "POST", token }));
      s.chats.set(id, resumed.token);
      return resumed.token;
    } finally {
      s.chatPending.delete(id);
    }
  })();
  s.chatPending.set(id, pending);
  return pending;
}

/** Forgets a conversation's token (closed, or the API no longer knows it). */
export const forgetChat = (id: string): void => {
  const s = state();
  s.chats.delete(id);
  s.chatPending.delete(id);
};

/** Only for tests: start again from nothing. */
export function resetSessions(code: string | null = null): void {
  const nextEpoch = (g[KEY]?.epoch ?? 0) + 1;
  g[KEY] = { main: null, mainPending: null, chats: new Map(), chatPending: new Map(), code, epoch: nextEpoch };
}
