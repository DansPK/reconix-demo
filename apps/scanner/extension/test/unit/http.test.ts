import assert from "node:assert/strict";
import { test } from "node:test";
import { makeFetch, tlsErrorCode } from "../../src/http";

test("makeFetch is the plain fetch without a CA file, and says clearly when the file can't be read", () => {
  assert.equal(makeFetch(undefined), fetch);
  assert.throws(() => makeFetch("/no/such/ca.pem"), /Cannot read the CA certificate at \/no\/such\/ca\.pem \(reconix\.caCertificate\)/);
});

test("tlsErrorCode finds a certificate problem anywhere in the cause chain", () => {
  const err = new TypeError("fetch failed", { cause: Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) });
  assert.equal(tlsErrorCode(err), "DEPTH_ZERO_SELF_SIGNED_CERT");
  assert.equal(tlsErrorCode(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") })), undefined);
});
