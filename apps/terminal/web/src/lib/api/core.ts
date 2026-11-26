/* The local Core API (services/api), called from the dashboard's server only: the session
   tokens never reach the browser. The address is RECONIX_CORE_API (default
   http://127.0.0.1:8000) and must be this computer. Errors come back in the API's one shape,
   {code, message, details}, as a CoreError. Server only. */
import "server-only";

export const DEFAULT_CORE_API = "http://127.0.0.1:8000";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TIMEOUT_MS = 30_000; // a plain call; a chat stream has no timeout (Stop aborts it)

export class CoreError extends Error {
  constructor(
    readonly status: number, // 0: the API could not be reached
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The API's base URL with /api/v1, or a CoreError when it isn't this computer. */
export function coreBase(): string {
  const raw = process.env.RECONIX_CORE_API?.trim() || DEFAULT_CORE_API;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoreError(0, "NOT_LOCAL", "RECONIX_CORE_API is not a valid address.");
  }
  if (url.protocol !== "http:" || !LOOPBACK.has(url.hostname) || url.username || url.password) {
    throw new CoreError(0, "NOT_LOCAL", "RECONIX_CORE_API must be this computer, e.g. http://127.0.0.1:8000.");
  }
  return `${url.origin}/api/v1`;
}

const UNREACHABLE = "The Reconix Core API is not running. Start it, then try again.";

/** One raw call. `stream`: no timeout, and the caller reads the body. */
export async function coreFetch(
  path: string,
  { method = "GET", body, form, token, signal, stream = false }: { method?: string; body?: unknown; form?: FormData; token?: string; signal?: AbortSignal; stream?: boolean } = {},
): Promise<Response> {
  if (!process.env.RECONIX_CORE_API?.trim()) throw new CoreError(0, "OFFLINE", "Using saved demo assessments.");
  const headers: Record<string, string> = { Accept: stream ? "text/event-stream" : "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const signals = [signal, stream ? undefined : AbortSignal.timeout(TIMEOUT_MS)].filter((s): s is AbortSignal => Boolean(s));
  let response: Response;
  try {
    response = await fetch(`${coreBase()}${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)), // a form sets its own type
      signal: signals.length ? AbortSignal.any(signals) : undefined,
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CoreError(0, "CORE_API_UNREACHABLE", UNREACHABLE);
  }
  if (!response.ok) throw await errorOf(response);
  return response;
}

/** A call whose answer is JSON (null for 204). */
export async function coreJson<T>(path: string, options: Parameters<typeof coreFetch>[1] = {}): Promise<T> {
  const response = await coreFetch(path, options);
  if (response.status === 204) return null as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new CoreError(response.status, "BAD_RESPONSE", "The Core API sent an unreadable answer.");
  }
}

/** The API's error shape as a CoreError (never the raw body). */
export async function errorOf(response: Response): Promise<CoreError> {
  const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown; detail?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : `HTTP_${response.status}`;
  const message = typeof body?.message === "string" && body.message.length <= 400 ? body.message : `The Core API refused the request (HTTP ${response.status}).`;
  return new CoreError(response.status, code, message);
}
