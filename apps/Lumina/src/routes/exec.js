// src/routes/exec.js — ops helper route (intentionally vulnerable)
const { exec } = require("child_process");

// POST /ping  { "host": "example.com" }
// Runs a single ICMP ping against the requested host.
//
// NOTE: deliberately unsafe example. The request body
// flows directly into a shell command, so a value like
//   "example.com; rm -rf /"
// would run arbitrary commands on the server (OS command injection, CWE-78).
function execPing(req, res) {
  const host = req.body.host;
  if (!host) {
    res.status(400).json({ error: "host is required" });
    return;
  }
  exec(`ping -c 1 ${req.body.host}`);
  res.json({ ok: true });
}

module.exports = { execPing };
