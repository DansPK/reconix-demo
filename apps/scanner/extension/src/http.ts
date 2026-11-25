// HTTP for the server backend (pure Node, no vscode import). With a CA certificate (for example a
// self-signed one of the Reconix server), it is trusted in addition to the normal ones.
import { readFileSync } from "node:fs";
import * as os from "node:os";
import * as tls from "node:tls";

export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  return /^~[/\\]/.test(p) ? os.homedir() + p.slice(1) : p;
}

/**
 * The global fetch, or (with a CA certificate file) undici's with that CA trusted too.
 * undici is loaded only here: it needs a newer Node than the oldest VS Code we support, so without
 * a CA certificate it must never load. That fetch skips VS Code's proxy settings (http.proxy).
 */
export function makeFetch(caCertificatePath?: string): FetchFn {
  if (!caCertificatePath) return fetch;
  let ca: string;
  try {
    ca = readFileSync(expandHome(caCertificatePath), "utf8");
  } catch {
    throw new Error(`Cannot read the CA certificate at ${caCertificatePath} (reconixCodeScanner.caCertificate).`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Agent, fetch: undiciFetch } = require("undici") as typeof import("undici");
  const dispatcher = new Agent({ connect: { ca: [...tls.rootCertificates, ca] } });
  return ((url: string | URL, init?: RequestInit) => undiciFetch(url, { ...(init as object), dispatcher } as never)) as unknown as FetchFn;
}

const TLS_CODES = new Set(["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_UNTRUSTED"]);

/** The TLS error code somewhere in an error's cause chain, if any. */
export function tlsErrorCode(err: unknown): string | undefined {
  let cur = err as { code?: unknown; message?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; cur && depth < 6; cur = cur.cause as typeof cur, depth++) {
    if (typeof cur.code === "string" && TLS_CODES.has(cur.code)) return cur.code;
    const match = String(cur.message ?? "").match(/self[- ]signed certificate|unable to verify|certificate has expired|Hostname\/IP does not match/i);
    if (match) return match[0];
  }
  return undefined;
}
