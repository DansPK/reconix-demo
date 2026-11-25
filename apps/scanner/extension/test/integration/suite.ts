// Runs inside the VS Code extension host. Kept dependency-free (no mocha) for now.
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DEMO_FINDINGS, FakeHarness, findingId, LUMINA_REPO } from "../../server/server";

const EXTENSION_ID = "reconix.reconix-code-scanner";

const EXPECTED_COMMANDS = [
  "reconixCodeScanner.setToken",
  "reconixCodeScanner.clearToken",
  "reconixCodeScanner.reconnect",
  "reconixCodeScanner.openSettings",
  "reconixCodeScanner.openChat",
  "reconixCodeScanner.newSession",
  "reconixCodeScanner.switchSession",
  "reconixCodeScanner.scanWorkspace",
  "reconixCodeScanner.rescan",
  "reconixCodeScanner.cancelScan",
  "reconixCodeScanner.scanPath",
  "reconixCodeScanner.scanGithub",
  "reconixCodeScanner.fixFindings",
  "reconixCodeScanner.openFinding",
  "reconixCodeScanner.nextFinding",
  "reconixCodeScanner.previousFinding",
  "reconixCodeScanner.revealFinding",
  "reconixCodeScanner.explainFinding",
  "reconixCodeScanner.ignoreFinding",
  "reconixCodeScanner.clearIgnored",
  "reconixCodeScanner.explainSelection",
  "reconixCodeScanner.fixFile",
  "reconixCodeScanner.selectModel",
  "reconixCodeScanner.addModel",
  "reconixCodeScanner.setApiKey",
  "reconixCodeScanner.openWalkthrough",
];

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `extension ${EXTENSION_ID} not found`);
  await extension.activate();

  const registered = await vscode.commands.getCommands(true);
  for (const command of EXPECTED_COMMANDS) {
    assert.ok(registered.includes(command), `command ${command} is not registered`);
  }

  await vscode.commands.executeCommand("reconixCodeScanner.openChat");

  // A token pasted into the settings moves to secure storage, and the setting is cleared.
  // (The test VS Code has its own user-data folder, so this never touches real settings.)
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration("reconixCodeScanner");
  // A cloned repo's .vscode/settings.json must not be able to set the token, or send it elsewhere.
  for (const key of ["token", "serverUrl", "caCertificate"]) {
    assert.equal(extension.packageJSON.contributes.configuration.properties[`reconixCodeScanner.${key}`].scope, "application", key);
  }
  await config().update("token", "integration-test-value", vscode.ConfigurationTarget.Global);
  assert.ok(await waitFor(() => !config().inspect<string>("token")?.globalValue), "a pasted token is cleared from the settings");
  await vscode.commands.executeCommand("reconixCodeScanner.clearToken");
  await vscode.commands.executeCommand("reconixCodeScanner.reconnect");

  // The bundled scanner server, on a free port.
  const server = new FakeHarness({ stepMs: 20, findings: DEMO_FINDINGS });
  await server.start();
  try {
    await config().update("serverUrl", server.url, vscode.ConfigurationTarget.Global);
    await config().update("token", server.token, vscode.ConfigurationTarget.Global);
    assert.ok(await waitFor(() => !config().inspect<string>("token")?.globalValue), "the token moves to secure storage");
    await vscode.commands.executeCommand("reconixCodeScanner.reconnect");

    // The full scan: Lumina's ten findings.
    await vscode.commands.executeCommand("reconixCodeScanner.scanWorkspace");
    const diagnostics = reconixDiagnostics();
    assert.equal(diagnostics.length, 10, "the demo scan must show 10 findings in the Problems panel");
    assert.ok(diagnostics.every((d) => /^[^:]+: /.test(d.message)), "messages are 'title: first sentence of the fix'");
    // Nothing changed: the rescan stops early and keeps the findings.
    await vscode.commands.executeCommand("reconixCodeScanner.rescan");
    assert.equal(reconixDiagnostics().length, 10);
    // Scan one file: its findings are replaced, and every other file keeps its own.
    const oneFile = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "server", "index.js");
    await vscode.commands.executeCommand("reconixCodeScanner.scanPath", oneFile);
    assert.equal(reconixDiagnostics().length, 10, "a one-file scan keeps the other files' findings");

    const line = DEMO_FINDINGS[0].start_line! - 1;
    const sqli = findingId(DEMO_FINDINGS[0], 0);
    // Hovering a finding's line shows its card, with a Fix link.
    await vscode.window.showTextDocument(oneFile);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", oneFile, new vscode.Position(line, 0));
    const hoverText = hovers.flatMap((h) => h.contents).map((c) => (typeof c === "string" ? c : c.value)).join("\n");
    assert.ok(hoverText.includes("**CRITICAL** · SQL injection in catalog search"), "the hover card shows the finding");
    assert.ok(hoverText.includes("command:reconixCodeScanner.fixFindings"), "the hover card has a Fix link");

    // The Findings tree's click opens the finding's lines.
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.commands.executeCommand("reconixCodeScanner.openFinding", sqli);
    const opened = vscode.window.activeTextEditor;
    assert.equal(opened?.document.uri.toString(), oneFile.toString(), "openFinding opens the finding's file");
    assert.equal(opened?.selection.start.line, line, "and selects its first line");

    // The lightbulb offers Fix for the finding on that line.
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>("vscode.executeCodeActionProvider", oneFile, new vscode.Range(line, 0, line, 0));
    assert.ok(actions.some((a) => a.title === 'Reconix: Fix "SQL injection in catalog search"'), "a quick fix offers Fix");
    // A CodeLens counts the file's findings, with a Fix button.
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", oneFile);
    assert.ok(lenses.some((l) => /Reconix finding/.test(l.command?.title ?? "")), "a CodeLens counts the findings");
    // Next and Previous Finding move from the cursor and come back.
    await vscode.commands.executeCommand("reconixCodeScanner.nextFinding");
    const nextAt = `${vscode.window.activeTextEditor?.document.uri.toString()}:${vscode.window.activeTextEditor?.selection.start.line}`;
    assert.notEqual(nextAt, `${oneFile.toString()}:${line}`, "Next Finding moves to another finding");
    await vscode.commands.executeCommand("reconixCodeScanner.previousFinding");
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), oneFile.toString(), "Previous Finding comes back");
    assert.equal(vscode.window.activeTextEditor?.selection.start.line, line);

    // Ignore hides a finding everywhere (here: the Problems panel); Show Ignored Findings Again undoes it.
    await vscode.commands.executeCommand("reconixCodeScanner.ignoreFinding", sqli);
    assert.equal(reconixDiagnostics().length, 9, "an ignored finding leaves the Problems panel");
    await vscode.commands.executeCommand("reconixCodeScanner.clearIgnored");
    assert.equal(reconixDiagnostics().length, 10, "it comes back after Show Ignored Findings Again");

    // Fix the SQL injection: the agent proposes a diff, and nothing changes until Apply.
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const indexJs = vscode.Uri.joinPath(folder, "server", "index.js");
    const before = Buffer.from(await vscode.workspace.fs.readFile(indexJs)).toString("utf8");
    await vscode.commands.executeCommand("reconixCodeScanner.fixFindings", [sqli]);
    const fixTab = (): vscode.TabInputTextDiff | undefined =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs.map((tab) => tab.input))
        .find((input): input is vscode.TabInputTextDiff => input instanceof vscode.TabInputTextDiff && input.modified.scheme === "reconix-fix");
    assert.ok(await waitFor(() => fixTab() !== undefined), "the proposed fix must open in a diff editor");
    const proposed = await vscode.workspace.openTextDocument(fixTab()!.modified);
    assert.ok(proposed.getText() !== before && proposed.getText().includes("LIKE ?"), "the diff shows the bound-parameter fix");
    const after = Buffer.from(await vscode.workspace.fs.readFile(indexJs)).toString("utf8");
    assert.equal(after, before, "the file must not change before the user clicks Apply");

    // A GitHub repo is scanned in its own session, with no Problems entries (its files aren't here).
    await vscode.commands.executeCommand("reconixCodeScanner.scanGithub", `${LUMINA_REPO}.git`);
    assert.equal(reconixDiagnostics().length, 0, "a GitHub scan adds no Problems entries");
  } finally {
    await server.stop();
  }

  console.log("integration suite: all checks passed");
}

function reconixDiagnostics(): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics()
    .flatMap(([, diagnostics]) => diagnostics)
    .filter((d) => d.source?.startsWith("Reconix"));
}

async function waitFor(check: () => boolean, timeoutMs = 10_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}
