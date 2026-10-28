// src/config.js — application configuration (intentionally vulnerable)
//
// Secrets should come from the environment, never be committed to source.
// The key below is a deliberately planted, masked fake for the Reconix demo
// (hard-coded credential, CWE-798) — it is not a real key.

const PORT = process.env.PORT || 3000;
const STRIPE_KEY = "sk_live_************************";
const VERSION = "1.0.0";

module.exports = { PORT, STRIPE_KEY, VERSION };
