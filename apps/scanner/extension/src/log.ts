// The extension's OutputChannel ("Reconix Code Scanner").
// Rule: never log tokens, Authorization headers, signed URLs or file contents.
// Log ids, counts, sizes, durations and workspace-relative paths only.
import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Reconix Code Scanner", { log: true });
  context.subscriptions.push(channel);
}

export const log = {
  info(message: string): void {
    channel?.info(message);
  },
  warn(message: string): void {
    channel?.warn(message);
  },
  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : "";
    channel?.error(`${message}${detail}`);
  },
};
