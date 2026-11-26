// The released extension is reconix.reconix-code-scanner, with reconixCodeScanner.* IDs. Installing
// this one must not replace it or share anything with it.
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import * as path from "path";
import { test } from "node:test";

const ext = path.resolve(__dirname, "../../..");
const read = (p: string): string => readFileSync(path.join(ext, p), "utf8");

test("every contributed ID is this extension's own", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(`${pkg.publisher}.${pkg.name}`, "local.reconix-code-scanner");
  assert.deepEqual([pkg.displayName, pkg.version], ["Reconix Code Scanner", "0.2.0"]);
  const c = pkg.contributes;
  const ids: string[] = [
    ...c.commands.map((x: { command: string }) => x.command),
    ...Object.values<{ id: string }[]>(c.viewsContainers).flat().map((x) => `${x.id}.`),
    ...Object.values<{ id: string }[]>(c.views).flat().map((x) => x.id),
    ...Object.keys(c.configuration.properties),
  ];
  assert.deepEqual(ids.filter((id) => !id.startsWith("reconix.")), []);
  assert.doesNotMatch(read("package.json"), /reconixCodeScanner/);
});

test("the launchers leave the released extension and its settings alone", () => {
  for (const launcher of ["../setup.sh", "../../../setup.sh", "../../../setup.ps1"]) {
    assert.doesNotMatch(read(launcher), /uninstall-extension|reconixCodeScanner|reconix\.reconix-code-scanner/, launcher);
  }
});
