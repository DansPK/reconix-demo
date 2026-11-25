// The only place that builds the Backend from the settings.
import * as vscode from "vscode";
import type { Backend } from "./Backend";
import { McpBackend } from "./McpBackend";

export const TOKEN_SECRET_KEY = "reconixCodeScanner.token";

/** The settings createBackend reads: when one changes, the backend must be built again. */
const BACKEND_SETTINGS = ["serverUrl", "caCertificate"];

export function affectsBackend(event: vscode.ConfigurationChangeEvent): boolean {
  return BACKEND_SETTINGS.some((key) => event.affectsConfiguration(`reconixCodeScanner.${key}`));
}

export function createBackend(context: vscode.ExtensionContext): Backend {
  const config = vscode.workspace.getConfiguration("reconixCodeScanner");
  return new McpBackend({
    serverUrl: config.get<string>("serverUrl", ""),
    getToken: async () => context.secrets.get(TOKEN_SECRET_KEY),
    caCertificatePath: config.get<string>("caCertificate") || undefined,
  });
}
