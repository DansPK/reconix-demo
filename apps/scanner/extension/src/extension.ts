import * as vscode from "vscode";
import { createBackend } from "./backend/createBackend";
import { ChatViewProvider } from "./chatView";
import { Controller } from "./controller";
import { allDisplays, FindingDiagnostics } from "./diagnostics";
import { EditorFeatures, EXPLAIN_FINDING_COMMAND, findingIdOf, IGNORE_FINDING_COMMAND, OPEN_FINDING_COMMAND } from "./editorFeatures";
import { initLog, log } from "./log";
import type { HostToWebview, WebviewToHost } from "./shared/messages";

/** What the integration suite gets (test mode only): the chat's messages, and answers to them. */
export interface TestApi {
  onPost: (listener: (message: HostToWebview) => void) => void;
  send: (message: WebviewToHost) => Promise<void>;
}

export function activate(context: vscode.ExtensionContext): TestApi | undefined {
  initLog(context);

  const diagnostics = new FindingDiagnostics();
  const editorFeatures = new EditorFeatures(context.extensionUri);
  context.subscriptions.push(diagnostics, editorFeatures);
  const controller = new Controller(() => createBackend(context), allDisplays([diagnostics, editorFeatures]), context.globalState, context.workspaceState, context.secrets);
  const chatView = new ChatViewProvider(context.extensionUri, (message) => void controller.onWebviewMessage(message), () => controller.onViewDisposed());
  const listeners: ((message: HostToWebview) => void)[] = [];
  controller.attachView((message) => {
    for (const listener of listeners) listener(message);
    chatView.post(message);
    editorFeatures.onHostMessage(message); // the status bar follows the connection and scan progress
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chatView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const commands: Record<string, (...args: never[]) => Promise<void>> = {
    "reconix.setToken": () => controller.setToken(),
    "reconix.clearToken": () => controller.clearToken(),
    "reconix.reconnect": () => controller.reconnect(),
    "reconix.openSettings": () => controller.openSettings(),
    "reconix.openChat": () => controller.openChat(),
    "reconix.newSession": () => controller.newSession(),
    "reconix.switchSession": () => controller.switchSession(),
    "reconix.scanWorkspace": () => controller.scanWorkspace(),
    "reconix.rescan": () => controller.rescan(),
    "reconix.cancelScan": () => controller.cancelScan(),
    // The Explorer and editor menus pass the file or folder; the Command Palette, none (the open file).
    "reconix.scanPath": (uri?: vscode.Uri) => controller.scanPath(uri),
    "reconix.scanGithub": (url?: string) => controller.askGithubScan(url),
    // Hidden: ids of shown findings, or none for "fix all" (used by buttons and quick fixes).
    "reconix.fixFindings": (findingIds?: string[]) => controller.requestFix(findingIds),
    // Hidden: a finding's id (the Findings tree's click).
    [OPEN_FINDING_COMMAND]: (findingId: string) => controller.openFindingFromEditor(findingId),
    // A finding's id (hover, CodeLens) or its Findings tree node (the tree's context menu).
    [EXPLAIN_FINDING_COMMAND]: (finding?: unknown) => controller.explainFinding(findingIdOf(finding)),
    [IGNORE_FINDING_COMMAND]: (finding?: unknown) => controller.ignoreFinding(findingIdOf(finding)),
    "reconix.clearIgnored": () => controller.clearIgnored(),
    "reconix.explainSelection": () => controller.explainSelection(),
    "reconix.selectModel": () => controller.selectModel(),
    "reconix.setApiKey": () => controller.setApiKey(),
    "reconix.addModel": () => controller.addModel(),
    "reconix.openWalkthrough": () => openWalkthrough(context),
  };
  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
  context.subscriptions.push(
    controller.registerFixDocuments(),
    vscode.workspace.onDidChangeConfiguration((event) => void controller.onConfigurationChanged(event)),
    vscode.workspace.onDidSaveTextDocument((document) => void controller.onDocumentSaved(document)),
    // vscode://local.reconix-code-scanner/set-token?token=... lets a setup script hand over a token.
    // Always ask first, so a web page cannot swap the token silently.
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        if (uri.path !== "/set-token") return;
        const token = new URLSearchParams(uri.query).get("token")?.trim();
        if (!token) return;
        const answer = await vscode.window.showWarningMessage(
          "Save the Reconix token from this link? Only do this if you started the setup yourself.",
          { modal: true },
          "Save Token",
        );
        if (answer !== "Save Token") return;
        await controller.setToken(token);
        await controller.openChat();
      },
    }),
  );
  // A token pasted into the settings while VS Code was closed moves now.
  void controller.moveTokenFromSettings().then((moved) => (moved ? controller.reconnect() : undefined));
  void maybeShowWalkthrough(context);

  log.info("Reconix Code Scanner activated");
  if (context.extensionMode !== vscode.ExtensionMode.Test) return undefined;
  return { onPost: (listener) => void listeners.push(listener), send: (message) => controller.onWebviewMessage(message) };
}

const HAS_SEEN_WALKTHROUGH = "reconix.hasSeenWalkthrough";

async function openWalkthrough(context: vscode.ExtensionContext): Promise<void> {
  const extensionId = context.extension?.id ?? "local.reconix-code-scanner";
  try {
    await vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      `${extensionId}#reconix.gettingStarted`,
      false,
    );
  } catch {
    // Silently ignore if workbench.action.openWalkthrough is not available (e.g. headless/test)
  }
}

async function maybeShowWalkthrough(context: vscode.ExtensionContext): Promise<void> {
  const seen = context.globalState.get<boolean>(HAS_SEEN_WALKTHROUGH);
  if (!seen) {
    await context.globalState.update(HAS_SEEN_WALKTHROUGH, true);
    await openWalkthrough(context);
  }
}

export function deactivate(): void {}
