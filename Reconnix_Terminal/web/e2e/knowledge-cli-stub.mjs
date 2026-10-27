#!/usr/bin/env node
/* A stand-in for `python -m reconix.knowledge` (the CLI the Security knowledge routes run,
   web/src/lib/knowledge/cli.ts), for the unit and e2e tests only: the dashboard runs it when
   RECONIX_KNOWLEDGE_CLI_TEST=1 and RECONIX_KNOWLEDGE_CLI names this file. It keeps the same contract
   (docs/WEB_KNOWLEDGE_PAGE_AND_MODELS_PLAN.md, "The CLI contract") over RECONIX_KNOWLEDGE_DIR,
   written as the TUI writes it (a 0700 folder, 0600 files replaced atomically), so the page and
   the AI Assistant read what it adds; only the text extraction and the encryption are left out
   (a PDF or DOCX gets one stand-in passage, and `<id>.orig` holds the bytes as they came).

     add --file <path> --name <name> --source web|terminal   → {"ok":true,"source":{…}}
     list                                                     → {"ok":true,"sources":[…]}
     original <id>                                            → the bytes (errors: JSON on stderr)
     remove <id>                                              → {"ok":true}

   Exit 0 is done, 2 a refusal ({"ok":false,"error"}), 1 an internal error. It also checks what
   the dashboard promises: an environment of PATH, HOME, the knowledge folder and key file only
   (exit 2 names any other key, so a leak of LLM_* or the launch token fails the test), and an
   upload copy that is a 0600 file in a 0700 folder. A name holding `[stub:refuse]` is refused,
   `[stub:fail]` fails (exit 1, with output that isn't JSON). */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync, constants } from "node:fs";
import path from "node:path";

const MAX_FILE = 10 * 1024 * 1024;
const MAX_SOURCES = 50;
const KINDS = { ".txt": "txt", ".md": "md", ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".docx": "docx", ".pdf": "pdf" };
const ALLOWED_ENV = new Set([
  "PATH", "HOME", "RECONIX_KNOWLEDGE_DIR", "RECONIX_KNOWLEDGE_KEY_FILE", "PYTHONUTF8",
  "SYSTEMROOT", "WINDIR", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "PATHEXT", "COMSPEC",
]);
const POSIX = process.platform !== "win32";

const say = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
function refuse(error, { toStderr = false } = {}) {
  (toStderr ? process.stderr : process.stdout).write(`${JSON.stringify({ ok: false, error })}\n`);
  process.exit(2);
}

// --- the environment the dashboard promised ------------------------------------------------------
// (Node and the shell may add a few of their own on some systems: those are not the dashboard's)
const extra = Object.keys(process.env).filter((k) => !ALLOWED_ENV.has(k.toUpperCase()) && !/^(_|PWD|SHLVL|OLDPWD|NODE_.*)$/.test(k));
if (extra.length) refuse(`stub: the environment holds ${extra.sort().join(", ")}`);
const dir = process.env.RECONIX_KNOWLEDGE_DIR;
if (!dir || !path.isAbsolute(dir)) refuse("stub: RECONIX_KNOWLEDGE_DIR is not an absolute path");

// --- the folder, as the TUI writes it ------------------------------------------------------------
const indexFile = path.join(dir, "index.json");

function ensureDir() {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function writeAtomic(full, data) {
  const tmp = `${full}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data) : data);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, full);
}

function readIndex() {
  if (!existsSync(indexFile)) return [];
  try {
    const index = JSON.parse(readFileSync(indexFile, "utf8"));
    return Array.isArray(index.sources) ? index.sources : [];
  } catch {
    refuse("The knowledge index is corrupt. Remove it with /add-on, then add files again.");
  }
}

const writeIndex = (sources) => writeAtomic(indexFile, JSON.stringify({ format: "reconix.knowledge/v1", sources }));
const validId = (id) => /^[0-9a-f]{32}$/.test(id ?? "");

// --- the arguments ------------------------------------------------------------------------------
const [command, ...rest] = process.argv.slice(2);
function option(name) {
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === `--${name}`) return rest[i + 1];
    if (rest[i].startsWith(`--${name}=`)) return rest[i].slice(name.length + 3);
  }
  return undefined;
}

function add() {
  const file = option("file");
  const name = option("name");
  const source = option("source");
  if (!file || !name || !["web", "terminal"].includes(source)) refuse("stub: add needs --file, --name and --source web|terminal");
  if (name.includes("[stub:fail]")) {
    process.stdout.write("Traceback (most recent call last): stand-in failure\n");
    process.exit(1);
  }
  if (name.includes("[stub:refuse]")) refuse("The stand-in refused this file.");
  let info;
  try {
    info = lstatSync(file);
  } catch {
    refuse("No file at that path.");
  }
  if (info.isSymbolicLink()) refuse("That path is a symlink; add the real file instead.");
  if (!info.isFile()) refuse("That isn't a regular file.");
  if (POSIX && ((info.mode & 0o777) !== 0o600 || (statSync(path.dirname(file)).mode & 0o777) !== 0o700)) {
    refuse("stub: the upload's copy is not a 0600 file in a 0700 folder");
  }
  const kind = KINDS[path.extname(file).toLowerCase()];
  if (!kind) refuse("Unsupported file type. Use one of: .txt .md .json .yaml .yml .docx .pdf.");
  if (info.size > MAX_FILE) refuse("That file is too large (over 10 MB).");
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    if (!fstatSync(fd).isFile()) refuse("That isn't a regular file.");
    bytes = readFileSync(fd);
  } finally {
    closeSync(fd);
  }
  const text = kind === "pdf" || kind === "docx" ? `Stand-in text of ${name}.` : bytes.toString("utf8").trim();
  if (!text) refuse("That file has no readable text to add.");
  const sources = readIndex();
  if (sources.length >= MAX_SOURCES) refuse(`The knowledge limit is ${MAX_SOURCES} files. Remove one first.`);

  ensureDir();
  let id;
  do id = randomBytes(16).toString("hex");
  while (sources.some((s) => s.id === id));
  const chunks = text.slice(0, 2 * 1024 * 1024).match(/[\s\S]{1,1200}/g).slice(0, 2000); // /add-on's caps
  const entry = {
    id,
    name: name.replace(/\s+/g, " ").trim().slice(0, 120) || "untitled",
    kind,
    bytes: bytes.length,
    chunks: chunks.length,
    added_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    source,
    original: true,
  };
  writeAtomic(path.join(dir, `${id}.orig`), bytes);
  writeAtomic(path.join(dir, `${id}.json`), JSON.stringify({ format: "reconix.knowledge.source/v1", id, name: entry.name, chunks }));
  writeIndex([...sources, entry]);
  // `cut` beside the entry's fields, as the CLI may say a cap cut the file short
  say({ ok: true, source: { ...entry, cut: "" }, sha256: createHash("sha256").update(bytes).digest("hex") });
}

function original(id) {
  if (!validId(id)) refuse("Unknown add-on.", { toStderr: true });
  const entry = readIndex().find((s) => s.id === id);
  if (!entry) refuse("Unknown add-on.", { toStderr: true });
  if (!entry.original) refuse("No original was kept for this file.", { toStderr: true });
  let bytes;
  try {
    bytes = readFileSync(path.join(dir, `${id}.orig`));
  } catch {
    refuse("The original of this file is missing.", { toStderr: true });
  }
  process.stdout.write(bytes);
}

function remove(id) {
  if (!validId(id)) refuse("Unknown add-on.");
  const sources = readIndex();
  if (!sources.some((s) => s.id === id)) refuse("Unknown add-on.");
  writeIndex(sources.filter((s) => s.id !== id));
  rmSync(path.join(dir, `${id}.json`), { force: true });
  rmSync(path.join(dir, `${id}.orig`), { force: true });
  say({ ok: true });
}

switch (command) {
  case "add":
    add();
    break;
  case "list":
    say({ ok: true, sources: readIndex() });
    break;
  case "original":
    original(rest[0]);
    break;
  case "remove":
    remove(rest[0]);
    break;
  default:
    refuse(`stub: unknown command ${command ?? "(none)"}`);
}
