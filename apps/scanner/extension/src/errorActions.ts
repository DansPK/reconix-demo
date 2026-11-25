// The button an error in the chat offers (pure Node, no vscode import): the command that fixes
// it, or none. Errors read "CODE: message" (core's codes) or are the backend's own sentences.
import type { ConnectionAction } from "./shared/contract";

const RULES: [RegExp, ConnectionAction][] = [
  // This session can't be written to here: a new one can.
  [/^(SESSION_READ_ONLY|NOT_YOUR_SESSION|SESSION_CLOSED|SESSION_NOT_FOUND|NOT_VSCODE_SESSION)\b/, { label: "New Session", command: "reconixCodeScanner.newSession" }],
  // Core's only 401 code. (Not TOKEN_BUDGET: that is the LLM's token budget, not the session token.)
  [/^(UNAUTHORIZED|HTTP_401)\b/, { label: "Set Token", command: "reconixCodeScanner.setToken" }],
  [/certificate is not trusted|reconixCodeScanner\.caCertificate|No server URL/i, { label: "Open Settings", command: "reconixCodeScanner.openSettings" }],
  [/^The scanner server cannot be reached|did not answer in time/i, { label: "Retry", command: "reconixCodeScanner.reconnect" }],
  // The model can't answer (no address, no key, refused key, not running, gone): pick or add another.
    // The model's key is missing or refused: enter/update the key.
  [/^(PROVIDER_AUTH_FAILED|PROVIDER_KEY_MISSING)\b/, { label: "Add API Key", command: "reconixCodeScanner.setApiKey" }],
  // The model can't answer (no address, not running, gone, or no active model): pick or add another.
  [/^(NO_ACTIVE_PROVIDER|PROVIDER_URL_MISSING|PROVIDER_URL_NOT_ALLOWED|MODEL_UNAVAILABLE|LLM_PROVIDER_NOT_FOUND)\b/,
    { label: "Choose Model", command: "reconixCodeScanner.selectModel" }],
];

export function errorAction(message: string): ConnectionAction | undefined {
  return RULES.find(([pattern]) => pattern.test(message))?.[1];
}
