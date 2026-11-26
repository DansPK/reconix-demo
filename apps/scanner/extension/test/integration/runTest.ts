// Downloads VS Code (cached in .vscode-test/) and runs the integration suite inside it.
import { rmSync } from "node:fs";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { extractLumina } from "../unit/helpers";

async function main(): Promise<void> {
  // If set (e.g. when launched from inside VS Code), Electron starts as plain Node and the test run hangs.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const root = path.resolve(__dirname, "../../..");
  // A fresh copy of the storefront, so apps/lumina-site is never changed.
  const workspace = await extractLumina();
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.resolve(__dirname, "suite"),
      // basic: SecretStorage (the token) must not wait on the OS keyring, which nobody can unlock in a test run.
      launchArgs: [workspace, "--disable-extensions", "--password-store=basic"],
    });
  } catch (err) {
    console.error("Integration tests failed", err);
    process.exitCode = 1;
  } finally {
    rmSync(path.dirname(workspace), { recursive: true, force: true });
  }
}

void main();
