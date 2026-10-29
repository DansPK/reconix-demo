import * as vscode from "vscode";
import { ChatViewProvider } from "./chatView";
import { Controller } from "./controller";
import { EditorFeatures } from "./editorFeatures";
import { initLog } from "./log";

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog());
  const controller = new Controller(ctx);
  const features = new EditorFeatures(ctx, controller);
  const provider = new ChatViewProvider(ctx.extensionUri, controller);
  const run = (fn: () => Promise<unknown>) => () => fn().catch((e) => controller.showError(e));
  const openChat = () => vscode.commands.executeCommand("reconix.chat.focus");

  ctx.subscriptions.push(
    controller,
    features, // quick fixes, hover, status bar, gutter, badges, tree, CodeLens
    vscode.window.registerWebviewViewProvider(ChatViewProvider.id, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("reconix.setToken", run(async () => {
      const token = await vscode.window.showInputBox({
        title: "Reconix token", prompt: "Paste the token you got from the scanner server's admin.",
        password: true, ignoreFocusOut: true,
      });
      if (token?.trim()) await controller.setToken(token.trim());
    })),
    vscode.commands.registerCommand("reconix.clearToken", run(() => controller.clearToken())),
    vscode.commands.registerCommand("reconix.openChat", openChat),
    vscode.commands.registerCommand("reconix.newSession", run(async () => {
      await openChat();
      await controller.newSession();
    })),
    vscode.commands.registerCommand("reconix.scanWorkspace", run(async () => {
      await openChat();
      await controller.scanWorkspace();
    })),
    vscode.commands.registerCommand("reconix.rescan", run(async () => {
      await openChat();
      await controller.rescan();
    })),
    vscode.commands.registerCommand("reconix.cancelScan", run(() => controller.cancelScan())),
    vscode.commands.registerCommand("reconix.selectModel", run(async () => {
      await openChat();
      await controller.pickModel();
    })),
    vscode.commands.registerCommand("reconix.reconnect", run(() => controller.connect())),
    vscode.commands.registerCommand("reconix.openSettings",
      () => vscode.commands.executeCommand("workbench.action.openSettings", "reconix.serverUrl")),
    // vscode://local.reconix-code-scanner/set-token?token=... lets a setup script hand over a token.
    // Always ask first, so a web page cannot swap the token silently.
    vscode.window.registerUriHandler({
      handleUri: (uri) => void run(async () => {
        if (uri.path !== "/set-token") return;
        const token = new URLSearchParams(uri.query).get("token")?.trim();
        if (!token) return;
        const ok = await vscode.window.showWarningMessage(
          "Save the Reconix token from this link? Only do this if you started the setup yourself.",
          { modal: true }, "Save Token");
        if (ok === "Save Token") {
          await controller.setToken(token);
          await openChat();
        }
      })(),
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => controller.onSaved(doc.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => void controller.onSettingsChanged(e).catch((err) => controller.showError(err))),
  );

  void controller.connect();
  return { controller, features, context: ctx }; // used by the integration tests
}

export function deactivate() {}
