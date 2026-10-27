// Module hooks that let plain `node` import the site's TypeScript (for the check scripts):
// the `@/` alias maps to src/, extensionless relative imports get `.ts`, and `.ts` files are
// transpiled with the project's own `typescript` package (types dropped, nothing checked),
// so it works on Node builds without native type stripping too.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = pathToFileURL(`${process.cwd()}/`).href;
const ts = createRequire(new URL("package.json", root))("typescript");

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) return next(new URL(`src/${spec.slice(2)}.ts`, root).href, ctx);
  if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) && ctx.parentURL?.endsWith(".ts")) return next(`${spec}.ts`, ctx);
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (!url.endsWith(".ts")) return next(url, ctx);
  const source = await readFile(new URL(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: url,
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
