// Runs inside the VS Code extension host. Kept dependency-free (no mocha) for now.
import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { TestApi } from "../../src/extension";
import { DEMO_FINDINGS, FakeHarness, findingId, LUMINA_REPO } from "../../server/server";

const EXTENSION_ID = "local.reconix-code-scanner";

const EXPECTED_COMMANDS = [
  "reconix.setToken",
  "reconix.clearToken",
  "reconix.reconnect",
  "reconix.openSettings",
  "reconix.openChat",
  "reconix.newSession",
  "reconix.switchSession",
  "reconix.scanWorkspace",
  "reconix.rescan",
  "reconix.cancelScan",
  "reconix.scanPath",
  "reconix.scanGithub",
  "reconix.fixFindings",
  "reconix.openFinding",
  "reconix.nextFinding",
  "reconix.previousFinding",
  "reconix.revealFinding",
  "reconix.explainFinding",
  "reconix.ignoreFinding",
  "reconix.clearIgnored",
  "reconix.explainSelection",
  "reconix.fixFile",
  "reconix.selectModel",
  "reconix.addModel",
  "reconix.setApiKey",
  "reconix.openWalkthrough",
];

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `extension ${EXTENSION_ID} not found`);
  const api = (await extension.activate()) as TestApi;
  // The chat's open questions, by their Yes label; answered as its buttons do.
  const asked = new Map<string, string>();
  api.onPost((message) => {
    if (message.type === "confirm") asked.set(message.yes, message.id);
  });
  const answer = async (yes: string): Promise<void> => {
    assert.ok(await waitFor(() => asked.has(yes)), `the chat asks "${yes}" (asked: ${[...asked.keys()].join(", ")})`);
    const id = asked.get(yes)!;
    asked.delete(yes);
    await api.send({ type: "answerConfirm", id, accept: true });
  };

  const registered = await vscode.commands.getCommands(true);
  for (const command of EXPECTED_COMMANDS) {
    assert.ok(registered.includes(command), `command ${command} is not registered`);
  }

  await vscode.commands.executeCommand("reconix.openChat");

  // A token pasted into the settings moves to secure storage, and the setting is cleared.
  // (The test VS Code has its own user-data folder, so this never touches real settings.)
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration("reconix");
  // A cloned repo's .vscode/settings.json must not be able to set the token, or send it elsewhere.
  for (const key of ["token", "serverUrl", "caCertificate"]) {
    assert.equal(extension.packageJSON.contributes.configuration.properties[`reconix.${key}`].scope, "application", key);
  }
  await config().update("token", "integration-test-value", vscode.ConfigurationTarget.Global);
  assert.ok(await waitFor(() => !config().inspect<string>("token")?.globalValue), "a pasted token is cleared from the settings");
  await vscode.commands.executeCommand("reconix.clearToken");
  await vscode.commands.executeCommand("reconix.reconnect");

  // The bundled scanner server, on a free port.
  const server = new FakeHarness({ stepMs: 20, findings: DEMO_FINDINGS });
  await server.start();
  try {
    await config().update("serverUrl", server.url, vscode.ConfigurationTarget.Global);
    await config().update("token", server.token, vscode.ConfigurationTarget.Global);
    assert.ok(await waitFor(() => !config().inspect<string>("token")?.globalValue), "the token moves to secure storage");
    await vscode.commands.executeCommand("reconix.reconnect");

    // The full scan: Lumina's ten findings.
    await vscode.commands.executeCommand("reconix.scanWorkspace");
    const diagnostics = reconixDiagnostics();
    assert.equal(diagnostics.length, 10, "the demo scan must show 10 findings in the Problems panel");
    assert.ok(diagnostics.every((d) => /^[^:]+: /.test(d.message)), "messages are 'title: first sentence of the fix'");
    // Nothing changed: the rescan stops early and keeps the findings.
    await vscode.commands.executeCommand("reconix.rescan");
    assert.equal(reconixDiagnostics().length, 10);
    // Scan one file: its findings are replaced, and every other file keeps its own.
    const oneFile = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "server", "index.js");
    await vscode.commands.executeCommand("reconix.scanPath", oneFile);
    assert.equal(reconixDiagnostics().length, 10, "a one-file scan keeps the other files' findings");

    const line = DEMO_FINDINGS[0].start_line! - 1;
    const sqli = findingId(DEMO_FINDINGS[0], 0);
    // Hovering a finding's line shows its card, with a Fix link.
    await vscode.window.showTextDocument(oneFile);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", oneFile, new vscode.Position(line, 0));
    const hoverText = hovers.flatMap((h) => h.contents).map((c) => (typeof c === "string" ? c : c.value)).join("\n");
    assert.ok(hoverText.includes("**CRITICAL** · SQL injection in catalog search"), "the hover card shows the finding");
    assert.ok(hoverText.includes("command:reconix.fixFindings"), "the hover card has a Fix link");

    // The Findings tree's click opens the finding's lines.
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.commands.executeCommand("reconix.openFinding", sqli);
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
    await vscode.commands.executeCommand("reconix.nextFinding");
    const nextAt = `${vscode.window.activeTextEditor?.document.uri.toString()}:${vscode.window.activeTextEditor?.selection.start.line}`;
    assert.notEqual(nextAt, `${oneFile.toString()}:${line}`, "Next Finding moves to another finding");
    await vscode.commands.executeCommand("reconix.previousFinding");
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), oneFile.toString(), "Previous Finding comes back");
    assert.equal(vscode.window.activeTextEditor?.selection.start.line, line);

    // Ignore hides a finding everywhere (here: the Problems panel); Show Ignored Findings Again undoes it.
    await vscode.commands.executeCommand("reconix.ignoreFinding", sqli);
    assert.equal(reconixDiagnostics().length, 9, "an ignored finding leaves the Problems panel");
    await vscode.commands.executeCommand("reconix.clearIgnored");
    assert.equal(reconixDiagnostics().length, 10, "it comes back after Show Ignored Findings Again");

    // Fix the SQL injection: the agent proposes a diff, and nothing changes until Apply.
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const indexJs = vscode.Uri.joinPath(folder, "server", "index.js");
    const before = Buffer.from(await vscode.workspace.fs.readFile(indexJs)).toString("utf8");
    await vscode.commands.executeCommand("reconix.fixFindings", [sqli]);
    const fixTab = (): vscode.TabInputTextDiff | undefined =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs.map((tab) => tab.input))
        .find((input): input is vscode.TabInputTextDiff => input instanceof vscode.TabInputTextDiff && input.modified.scheme === "reconix-local-fix");
    assert.ok(await waitFor(() => fixTab() !== undefined), "the proposed fix must open in a diff editor");
    const proposed = await vscode.workspace.openTextDocument(fixTab()!.modified);
    assert.ok(proposed.getText() !== before && proposed.getText().includes("LIKE ?"), "the diff shows the bound-parameter fix");
    const after = Buffer.from(await vscode.workspace.fs.readFile(indexJs)).toString("utf8");
    assert.equal(after, before, "the file must not change before the user clicks Apply");

    // Apply writes exactly the proposed text, and the rescan drops that finding only.
    await answer("Apply fix");
    const onDisk = async (uri: vscode.Uri): Promise<string> => Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    assert.equal(await onDisk(indexJs), proposed.getText(), "Apply saves the proposed text");
    await vscode.commands.executeCommand("reconix.rescan");
    assert.equal(reconixDiagnostics().length, 9, "the rescan drops the fixed finding");
    const left = new Map(vscode.languages.getDiagnostics().map(([uri, d]) => [uri.toString(), d.filter((x) => x.source?.startsWith("Reconix")).length]));
    assert.equal(left.get(indexJs.toString()) ?? 0, 0, "and it was the one in server/index.js");

    // Fix all, then Apply all: the other nine files change on disk, and the rescan is clean.
    const others = DEMO_FINDINGS.slice(1).map((f) => vscode.Uri.joinPath(folder, f.path!));
    const originals = await Promise.all(others.map(onDisk));
    await vscode.commands.executeCommand("reconix.fixFindings");
    if (asked.has("Yes, fix them")) await answer("Yes, fix them");
    assert.deepEqual(await Promise.all(others.map(onDisk)), originals, "nothing changes before Apply all");
    await answer("Apply all (9 files)");
    for (const [i, uri] of others.entries()) assert.notEqual(await onDisk(uri), originals[i], `${uri.path} is fixed`);
    await vscode.commands.executeCommand("reconix.rescan");
    assert.equal(reconixDiagnostics().length, 0, "the rescan after Apply all is clean");

    // A GitHub repo is scanned in its own session, with no Problems entries (its files aren't here).
    await vscode.commands.executeCommand("reconix.scanGithub", `${LUMINA_REPO}.git`);
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
