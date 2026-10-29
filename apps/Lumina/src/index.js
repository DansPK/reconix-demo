// src/index.js — Lumina app entrypoint (intentionally vulnerable sample)
const express = require("express");
const sqlite3 = require("sqlite3");
const { execPing } = require("./routes/exec");
const { hashPassword } = require("./utils/hash");
const config = require("./config");

const app = express();
app.use(express.json());

const db = new sqlite3.Database(":memory:");
db.serialize(() => {
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, password TEXT)");
  db.run("INSERT INTO users (name, password) VALUES ('alice', 'x'), ('bob', 'y')");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, version: config.VERSION });
});

// Register a new user (password hashed before storage)
app.post("/users", (req, res) => {
  const { name, password } = req.body;
  const hashed = hashPassword(password);
  db.run(
    "INSERT INTO users (name, password) VALUES (?, ?)",
    [name, hashed],
    (err) => {
      if (err) return res.status(500).json({ error: "insert failed" });
      res.status(201).json({ name });
    }
  );
});

// Ping a host (ops helper)
app.post("/ping", execPing);

// Look up a user by id
app.get("/users/:id", (req, res) => {
  // BUG: user input concatenated straight into SQL — SQL injection (CWE-89)
  const q = "SELECT * FROM users WHERE id = ?";
  db.get(q, [req.query.id], (err, row) => {
    if (err) return res.status(500).json({ error: "query failed" });
    res.json(row || {});
  });
});

app.listen(config.PORT, () => {
  console.log(`demo app listening on :${config.PORT}`);
});
