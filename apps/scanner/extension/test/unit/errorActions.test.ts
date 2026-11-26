import assert from "node:assert/strict";
import { test } from "node:test";
import { errorAction } from "../../src/errorActions";

test("errors that a command fixes offer its button", () => {
  const command = (message: string): string | undefined => errorAction(message)?.command;
  assert.equal(command("SESSION_READ_ONLY: This session can only be read here."), "reconix.newSession");
  assert.equal(command("NOT_YOUR_SESSION: Writing to this session takes its own token."), "reconix.newSession");
  assert.equal(command("UNAUTHORIZED: The token was refused."), "reconix.setToken");
  assert.equal(command("The scanner server cannot be reached at http://127.0.0.1:7357."), "reconix.reconnect");
  assert.equal(command("The scanner server did not answer in time."), "reconix.reconnect");
  assert.equal(command("The server's HTTPS certificate is not trusted (SELF_SIGNED_CERT_IN_CHAIN). Set reconix.caCertificate to its CA certificate."), "reconix.openSettings");
  assert.equal(command("PROVIDER_URL_MISSING: Set RECONIX_MODEL_URL to use the built-in RECONIX model."), "reconix.selectModel");
  assert.deepEqual(errorAction("PROVIDER_URL_MISSING: x"), { label: "Choose Model", command: "reconix.selectModel" });
  assert.deepEqual(errorAction("NO_ACTIVE_PROVIDER: No AI provider is active."), { label: "Choose Model", command: "reconix.selectModel" });
  assert.deepEqual(errorAction("PROVIDER_AUTH_FAILED: The RECONIX model reconix-model refused the API key."), { label: "Add API Key", command: "reconix.setApiKey" });
  assert.deepEqual(errorAction("PROVIDER_KEY_MISSING: The OPENAI provider needs an API key."), { label: "Add API Key", command: "reconix.setApiKey" });
});

test("other errors offer no button; every button runs one of our own commands", () => {
  assert.equal(errorAction("The fix agent is already running."), undefined);
  assert.equal(errorAction("A session name can't be empty."), undefined);
  // A code in the middle of a sentence is not the error's code.
  assert.equal(errorAction("The scan failed: PROVIDER_URL_MISSING"), undefined);
  for (const m of ["SESSION_CLOSED: x", "SESSION_NOT_FOUND: x", "HTTP_401: x", "MODEL_UNAVAILABLE: x", "PROVIDER_KEY_MISSING: x", "PROVIDER_AUTH_FAILED: x", "LLM_PROVIDER_NOT_FOUND: x"]) {
    assert.match(errorAction(m)?.command ?? "", /^reconix\./, m);
  }
});

test("the LLM's token budget is not the session token, and approval reasons get no model button", () => {
  assert.equal(errorAction("TOKEN_BUDGET: The agent used its budget of 50000 tokens and stopped."), undefined);
  assert.equal(errorAction("PROVIDER_CHANGED: The provider changed after the approval was asked."), undefined);
  assert.equal(errorAction("MODEL_LIST_NOT_SUPPORTED: Only Ollama lists its models."), undefined);
});
