// Packs the selected files into a .tar.gz for upload (pure Node, no vscode import).
import { stat } from "node:fs/promises";
import { create } from "tar";

export interface ArchiveResult {
  filePath: string;
  sizeBytes: number;
}

/**
 * A gzip tar of `paths` (workspace-relative, forward slashes) under `rootDir`: entries carry only
 * those relative paths (portable: no owner, no times), links are stored as links, never followed.
 */
export async function createArchive(rootDir: string, paths: string[], outFile: string): Promise<ArchiveResult> {
  // "./" first: tar reads a leading "@" as "add this other archive's entries". Core strips the "./".
  await create({ gzip: true, file: outFile, cwd: rootDir, portable: true, noDirRecurse: true, follow: false }, paths.map((p) => `./${p}`));
  return { filePath: outFile, sizeBytes: (await stat(outFile)).size };
}
