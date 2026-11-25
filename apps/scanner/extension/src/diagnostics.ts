// Shows findings in the Problems panel and as squiggles in the editor (Q10).
import * as vscode from "vscode";
import { diagnosticMessage, type MergedFinding } from "./findingsLogic";
import type { Severity } from "./shared/contract";
import { isSafeContractPath } from "./workspaceFiles";

const DIAGNOSTIC_SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  CRITICAL: vscode.DiagnosticSeverity.Error,
  HIGH: vscode.DiagnosticSeverity.Error,
  MEDIUM: vscode.DiagnosticSeverity.Warning,
  LOW: vscode.DiagnosticSeverity.Information,
  UNKNOWN: vscode.DiagnosticSeverity.Information,
  NONE: vscode.DiagnosticSeverity.Information,
};

/** Somewhere the controller shows the current findings: the Problems panel, the editor add-ons. */
export interface FindingsDisplay {
  /** Replaces what is shown with these findings. Paths are relative to rootUri. */
  show(rootUri: vscode.Uri, findings: MergedFinding[]): void;
  clear(): void;
}

/** Shows the same findings on every display. */
export function allDisplays(displays: FindingsDisplay[]): FindingsDisplay {
  return {
    show: (rootUri, findings) => displays.forEach((d) => d.show(rootUri, findings)),
    clear: () => displays.forEach((d) => d.clear()),
  };
}

export class FindingDiagnostics implements FindingsDisplay, vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("reconix");

  /** Replaces every diagnostic with these findings. Paths are relative to rootUri. */
  show(rootUri: vscode.Uri, findings: MergedFinding[]): void {
    const byFile = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();
    for (const finding of findings) {
      if (!isSafeContractPath(finding.path)) continue; // the controller drops these already
      const uri = findingUri(rootUri, finding.path);
      const entry = byFile.get(uri.toString()) ?? { uri, diagnostics: [] };
      entry.diagnostics.push(toDiagnostic(finding));
      byFile.set(uri.toString(), entry);
    }
    this.collection.clear();
    for (const { uri, diagnostics } of byFile.values()) {
      this.collection.set(uri, diagnostics);
    }
  }

  clear(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}

/**
 * Contract paths use forward slashes; join segment by segment so it works on Windows too.
 * Throws for a path that could leave the workspace (callers filter with isSafeContractPath).
 */
export function findingUri(rootUri: vscode.Uri, contractPath: string): vscode.Uri {
  if (!isSafeContractPath(contractPath)) {
    throw new Error(`unsafe finding path: ${contractPath}`);
  }
  return vscode.Uri.joinPath(rootUri, ...contractPath.split("/"));
}

/** The finding's lines, 0-based, covering each line to its end. */
export function findingRange(finding: MergedFinding): vscode.Range {
  const start = Math.max((finding.line ?? 1) - 1, 0);
  const end = Math.max((finding.endLine ?? finding.line ?? 1) - 1, start);
  return new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
}

function toDiagnostic(finding: MergedFinding): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    findingRange(finding),
    diagnosticMessage(finding),
    DIAGNOSTIC_SEVERITY[finding.severity],
  );
  diagnostic.source = `Reconix (${finding.tools.join(", ")})`;
  diagnostic.code = finding.ruleIds[0];
  return diagnostic;
}
