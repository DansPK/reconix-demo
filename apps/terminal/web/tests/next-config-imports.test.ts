/* Next.js loads next.config.ts with its own transpiler, which knows nothing of tsconfig "paths":
   an "@/…" import anywhere in the files the config pulls in stops the dashboard at start-up
   ("Cannot find module './src/…'"), while vitest, which does resolve "@/", stays green. So walk
   every file the config imports, directly or not, and refuse the alias there. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WEB = path.join(__dirname, "..");
const CONFIG = path.join(WEB, "next.config.ts");
/** `import … from "x"` and `export … from "x"`, not `import type` (erased before it runs). */
const IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;

function resolveLocal(from: string, spec: string): string {
  const base = path.resolve(path.dirname(from), spec);
  const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    (file) => existsSync(file) && file.match(/\.tsx?$/),
  );
  if (!found) throw new Error(`${path.relative(WEB, from)} imports ${spec}, which does not exist`);
  return found;
}

/** Every alias import in the files the config loads, as "file → spec". */
function aliasImports(): string[] {
  const seen = new Set<string>();
  const bad: string[] = [];
  const queue = [CONFIG];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      if (spec.startsWith("@/")) bad.push(`${path.relative(WEB, file)} → ${spec}`);
      else if (spec.startsWith(".")) queue.push(resolveLocal(file, spec));
    }
  }
  return bad;
}

describe("next.config.ts", () => {
  it("pulls in no file that imports through the @/ alias", () => {
    expect(aliasImports()).toEqual([]);
  });

  it("is checked by a walk that does see an alias import", () => {
    const sample = 'import { a } from "@/lib/x";\nimport type { B } from "@/lib/y";\n';
    expect([...sample.matchAll(IMPORT)].map((m) => m[1])).toEqual(["@/lib/x"]);
  });
});
