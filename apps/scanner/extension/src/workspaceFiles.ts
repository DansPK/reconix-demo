// Collects the workspace files to scan (pure Node, no vscode import).
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import ignore, { type Ignore } from "ignore";
import type { FileEntry } from "./shared/contract";

export interface CollectOptions {
  rootDir: string;
  maxFileSizeKB: number;
  /** gitignore-style patterns on top of .gitignore and the built-in excludes. */
  extraExcludes: string[];
  signal?: AbortSignal;
}

/** Folders never worth scanning, at any depth, whatever .gitignore says. */
export const SKIP_FOLDERS = new Set([
  ".git", "node_modules", "build", "dist", "out", "target", "bin", "obj",
  ".venv", "venv", "__pycache__", ".idea", ".vscode",
]);

/** A zero byte in the first 8 KB means binary. */
const BINARY_SNIFF_BYTES = 8192;

/** gitignore rules from one folder; they apply to that folder and below. */
interface Rules {
  /** Folder of the .gitignore, as a contract path ("" for the root). */
  dir: string;
  filter: Ignore;
}

/** Workspace-relative path with forward slashes, as the contract requires. */
export function toContractPath(rootDir: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(rootDir), path.resolve(absolutePath));
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path is outside the workspace folder: ${relative || "."}`);
  }
  return relative.split(path.sep).join("/");
}

/**
 * True if a path from the backend is a plain workspace-relative contract path: forward slashes,
 * no "." or ".." segments, not absolute, no drive letter. Anything else could point outside
 * the workspace and must not be opened or annotated.
 */
export function isSafeContractPath(contractPath: string): boolean {
  if (contractPath === "" || contractPath.startsWith("/") || contractPath.includes("\\") || /^[A-Za-z]:/.test(contractPath)) {
    return false;
  }
  return contractPath.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Walks rootDir and returns every scannable file, sorted by path.
 * Skips: SKIP_FOLDERS, .gitignore rules (one file per folder, applying to that folder and below),
 * extraExcludes, symlinks, binaries and files over maxFileSizeKB.
 */
export async function collectFiles(options: CollectOptions): Promise<FileEntry[]> {
  const rootDir = path.resolve(options.rootDir);
  const maxBytes = options.maxFileSizeKB * 1024;
  const files: FileEntry[] = [];

  async function walk(dir: string, inherited: Rules[]): Promise<void> {
    options.signal?.throwIfAborted();
    const dirPath = dir === rootDir ? "" : toContractPath(rootDir, dir);
    const gitignore = await readGitignore(dir);
    const rules = gitignore ? [...inherited, { dir: dirPath, filter: ignore().add(gitignore) }] : inherited;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      const absolute = path.join(dir, entry.name);
      const contractPath = toContractPath(rootDir, absolute);
      if (entry.isDirectory()) {
        if (!SKIP_FOLDERS.has(entry.name) && !isIgnored(rules, contractPath, true)) {
          await walk(absolute, rules);
        }
      } else if (entry.isFile() && !isIgnored(rules, contractPath, false)) {
        const file = await readEntry(absolute, contractPath, maxBytes);
        if (file) {
          files.push(file);
        }
      }
      // Symlinks and special files are skipped: a link could point outside the workspace.
    }
  }

  await walk(rootDir, [{ dir: "", filter: ignore().add(options.extraExcludes) }]);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** SHA-256 of a file's bytes, as lowercase hex. */
export async function hashFile(absolutePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(absolutePath)).digest("hex");
}

/** Each rule set sees the path relative to its own folder, as git does. */
function isIgnored(rules: Rules[], contractPath: string, isDir: boolean): boolean {
  return rules.some(({ dir, filter }) => {
    const relative = dir ? contractPath.slice(dir.length + 1) : contractPath;
    return relative !== "" && filter.ignores(isDir ? `${relative}/` : relative);
  });
}

async function readGitignore(dir: string): Promise<string> {
  try {
    return await readFile(path.join(dir, ".gitignore"), "utf8");
  } catch {
    return "";
  }
}

async function readEntry(absolute: string, contractPath: string, maxBytes: number): Promise<FileEntry | undefined> {
  const { size } = await stat(absolute);
  if (size > maxBytes) {
    return undefined;
  }
  const content = await readFile(absolute);
  if (isBinary(content)) {
    return undefined;
  }
  return {
    path: contractPath,
    sizeBytes: size,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function isBinary(content: Buffer): boolean {
  return content.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}
