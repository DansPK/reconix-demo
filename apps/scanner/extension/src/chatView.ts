// WebviewViewProvider for the "Chat" view. Owns the HTML shell only; all behaviour lives in the
// Controller (host side) and webview/main.ts (UI side).
import * as crypto from "node:crypto";
import * as vscode from "vscode";
import type { HostToWebview, WebviewToHost } from "./shared/messages";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "reconixCodeScanner.chat";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: WebviewToHost) => void,
    /** The view was closed (its webview is gone until it is opened again). */
    private readonly onDispose: () => void = () => undefined,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "media"),
      ],
    };
    webview.html = this.renderHtml(webview);
    webview.onDidReceiveMessage((message: WebviewToHost) => this.onMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.onDispose();
    });
  }

  post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "chat.css"));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Reconix Code Scanner Chat</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
