// In-editor add-ons for the shown findings: gutter icons, hover cards, Explorer badges, the
// Findings tree and the status bar. The controller hands findings over through show()/clear(),
// exactly like the Problems panel (FindingsDisplay), and the status bar reads the connection and
// scan progress from the same messages the chat gets (onHostMessage). This class only draws.
import * as path from "node:path";
import * as vscode from "vscode";
import { findingUri, type FindingsDisplay } from "./diagnostics";
import {
  badge,
  findingsInLines,
  gutterIcon,
  gutterLines,
  hoverMarkdown,
  lensGroups,
  startLine,
  statusBar,
  stepFinding,
  treeGroups,
  worstSeverity,
  relativeContractPath,
  type CardAction,
  type GutterIcon,
  type StatusInput,
  type SymbolRange,
} from "./editorLogic";
import { countBySeverity, type MergedFinding } from "./findingsLogic";
import { fixAllIds } from "./fixLogic";
import type { Severity } from "./shared/contract";
import type { HostToWebview } from "./shared/messages";
import { isSafeContractPath } from "./workspaceFiles";

const CONFIG_SECTION = "reconixCodeScanner";
const FIX_COMMAND = "reconixCodeScanner.fixFindings";
/** Opens a finding's lines (hidden command: the tree's click). */
export const OPEN_FINDING_COMMAND = "reconixCodeScanner.openFinding";
export const FINDINGS_VIEW_ID = "reconixCodeScanner.findings";
export const NEXT_FINDING_COMMAND = "reconixCodeScanner.nextFinding";
export const PREVIOUS_FINDING_COMMAND = "reconixCodeScanner.previousFinding";
/** Selects a finding in the tree (hidden command: the CodeLens's click). */
export const REVEAL_FINDING_COMMAND = "reconixCodeScanner.revealFinding";
export const EXPLAIN_FINDING_COMMAND = "reconixCodeScanner.explainFinding";
export const IGNORE_FINDING_COMMAND = "reconixCodeScanner.ignoreFinding";
export const FIX_FILE_COMMAND = "reconixCodeScanner.fixFile";
const ICONS: GutterIcon[] = ["critical", "high", "medium", "low", "info"];

/** Theme colours (they follow the user's theme) for the overview ruler and the tree. */
const THEME_COLOR: Record<GutterIcon, string> = {
  critical: "editorError.foreground",
  high: "editorError.foreground",
  medium: "editorWarning.foreground",
  low: "editorInfo.foreground",
  info: "editorHint.foreground",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low", UNKNOWN: "Unknown", NONE: "Info",
};

function setting(key: string): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(key, true);
}

/** The commands a hover card's links run (the only ones it may run), and their arguments. */
const CARD_COMMANDS: Record<CardAction, { command: string; tip: string; args: (id: string) => unknown[] }> = {
  fix: { command: FIX_COMMAND, tip: "Fix this finding", args: (id) => [[id]] },
  explain: { command: EXPLAIN_FINDING_COMMAND, tip: "Ask the chat about this finding", args: (id) => [id] },
  ignore: { command: IGNORE_FINDING_COMMAND, tip: "Hide this finding in this session", args: (id) => [id] },
};

/** Trusted command links for this finding's card. */
function cardLink(findingId: string): (action: CardAction, label: string) => string {
  return (action, label) => {
    const { command, tip, args } = CARD_COMMANDS[action];
    // encodeURIComponent leaves ( ) as they are, and a ")" would end the Markdown link.
    const query = encodeURIComponent(JSON.stringify(args(findingId))).replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `[${label}](command:${command}?${query} "${tip}")`;
  };
}

function hoverCard(findings: MergedFinding[]): vscode.MarkdownString {
  const md = new vscode.MarkdownString(findings.map((f) => hoverMarkdown(f, cardLink(f.id))).join("\n\n---\n\n"), true);
  md.isTrusted = { enabledCommands: Object.values(CARD_COMMANDS).map((c) => c.command) };
  return md;
}

/** A command's finding: an id (hover, CodeLens), or the Findings tree's node (its context menu). */
export function findingIdOf(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  const node = arg as Partial<Node> | undefined;
  return node?.kind === "finding" ? (node as Extract<Node, { kind: "finding" }>).shown.finding.id : undefined;
}

interface Shown {
  finding: MergedFinding;
  uri: vscode.Uri;
}

// --- the Findings tree: severity -> file -> finding ---

// Built once per update, with parent links, so reveal() can walk up from a finding.
type Node =
  | { kind: "severity"; severity: Severity; count: number; children: Node[] }
  | { kind: "file"; severity: Severity; path: string; findings: Shown[]; parent: Node; children: Node[] }
  | { kind: "finding"; shown: Shown; parent: Node };

class FindingsTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private roots: Node[] = [];
  private byId = new Map<string, Node>();

  /** Builds the tree again from the shown findings. */
  update(shown: Shown[]): void {
    const shownById = new Map(shown.map((s) => [s.finding.id, s]));
    this.byId = new Map();
    this.roots = treeGroups(shown.map((s) => s.finding)).map((g) => {
      const severity: Node = { kind: "severity", severity: g.severity, count: 0, children: [] };
      for (const file of g.files) {
        const findings = file.findings.map((x) => shownById.get(x.id)!);
        const fileNode: Node = { kind: "file", severity: g.severity, path: file.path, findings, parent: severity, children: [] };
        for (const s of findings) {
          const node: Node = { kind: "finding", shown: s, parent: fileNode };
          this.byId.set(s.finding.id, node);
          fileNode.children.push(node);
        }
        severity.children.push(fileNode);
        severity.count += findings.length;
      }
      return severity;
    });
    this.emitter.fire();
  }

  /** A finding's node, for reveal(). */
  nodeOf(findingId: string): Node | undefined {
    return this.byId.get(findingId);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.roots;
    return node.kind === "finding" ? [] : node.children;
  }

  getParent(node: Node): Node | undefined {
    return node.kind === "severity" ? undefined : node.parent;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "severity") {
      const item = new vscode.TreeItem(SEVERITY_LABEL[node.severity], vscode.TreeItemCollapsibleState.Expanded);
      item.id = `severity:${node.severity}`;
      item.description = String(node.count);
      item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(THEME_COLOR[gutterIcon(node.severity)]));
      return item;
    }
    if (node.kind === "file") {
      const item = new vscode.TreeItem(path.posix.basename(node.path), vscode.TreeItemCollapsibleState.Expanded);
      item.id = `file:${node.severity}:${node.path}`;
      item.resourceUri = node.findings[0].uri; // the file-type icon
      const dir = path.posix.dirname(node.path);
      item.description = dir === "." ? `${node.findings.length}` : `${dir} · ${node.findings.length}`;
      item.tooltip = node.path;
      return item;
    }
    const f = node.shown.finding;
    const item = new vscode.TreeItem(f.title, vscode.TreeItemCollapsibleState.None);
    item.id = `finding:${f.id}`;
    item.description = `line ${startLine(f)}`;
    item.tooltip = hoverCard([f]);
    item.contextValue = "finding";
    const severe = f.severity === "CRITICAL" || f.severity === "HIGH";
    item.iconPath = new vscode.ThemeIcon(severe ? "error" : f.severity === "MEDIUM" ? "warning" : "info",
      new vscode.ThemeColor(THEME_COLOR[gutterIcon(f.severity)]));
    item.command = { command: OPEN_FINDING_COMMAND, title: "Open", arguments: [f.id] };
    return item;
  }
}

// --- the features ---

export class EditorFeatures implements FindingsDisplay, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly gutter: Record<GutterIcon, vscode.TextEditorDecorationType>;
  private readonly fileDecorations = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  private readonly status = vscode.window.createStatusBarItem("reconixCodeScanner.status", vscode.StatusBarAlignment.Left, 50);
  private readonly tree = new FindingsTree();
  private readonly treeView: vscode.TreeView<Node>;
  /** Shown findings by file URI (toString()). */
  private byFile = new Map<string, { uri: vscode.Uri; findings: MergedFinding[] }>();
  private shown: Shown[] = [];
  /** The folder the shown findings' paths are relative to. */
  private rootUri: vscode.Uri | undefined;
  private readonly lensChanged = new vscode.EventEmitter<void>();
  private connection: Pick<StatusInput, "connection" | "reason"> = { connection: "unknown" };
  private scanning: number | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.gutter = Object.fromEntries(
      ICONS.map((icon) => [
        icon,
        vscode.window.createTextEditorDecorationType({
          gutterIconPath: vscode.Uri.joinPath(extensionUri, "media", "gutter", `${icon}.svg`),
          gutterIconSize: "70%",
          overviewRulerColor: new vscode.ThemeColor(THEME_COLOR[icon]),
          overviewRulerLane: vscode.OverviewRulerLane.Right,
        }),
      ]),
    ) as Record<GutterIcon, vscode.TextEditorDecorationType>;

    this.status.name = "Reconix Code Scanner";
    this.status.command = `${FINDINGS_VIEW_ID}.focus`;
    this.treeView = vscode.window.createTreeView(FINDINGS_VIEW_ID, { treeDataProvider: this.tree, showCollapseAll: true });

    const selector: vscode.DocumentSelector = { scheme: "file" };
    this.disposables.push(
      ...Object.values(this.gutter),
      this.fileDecorations,
      this.status,
      this.tree,
      this.treeView,
      this.lensChanged,
      vscode.languages.registerHoverProvider(selector, { provideHover: (doc, pos) => this.hover(doc, pos) }),
      vscode.languages.registerCodeLensProvider(selector, {
        onDidChangeCodeLenses: this.lensChanged.event,
        provideCodeLenses: (doc) => this.codeLenses(doc),
      }),
      vscode.languages.registerCodeActionsProvider(selector, { provideCodeActions: (doc, range) => this.codeActions(doc, range) },
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
      vscode.commands.registerCommand(NEXT_FINDING_COMMAND, () => this.step(1)),
      vscode.commands.registerCommand(PREVIOUS_FINDING_COMMAND, () => this.step(-1)),
      vscode.commands.registerCommand(REVEAL_FINDING_COMMAND, (findingId: string) => this.reveal(findingId)),
      // The Explorer passes the clicked file and, with several selected, all of them.
      vscode.commands.registerCommand(FIX_FILE_COMMAND, (uri?: vscode.Uri, uris?: vscode.Uri[]) => this.fixFile(uris?.length ? uris : uri ? [uri] : undefined)),
      vscode.window.registerFileDecorationProvider({
        onDidChangeFileDecorations: this.fileDecorations.event,
        provideFileDecoration: (uri) => this.fileDecoration(uri),
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.drawGutter()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.gutterIcons`)) this.drawGutter();
        if (e.affectsConfiguration(`${CONFIG_SECTION}.explorerBadges`)) this.fileDecorations.fire(undefined);
        if (e.affectsConfiguration(`${CONFIG_SECTION}.codeLens`)) this.lensChanged.fire();
      }),
    );
    this.drawStatus();
  }

  /** Replaces what is drawn with these findings. Paths are relative to rootUri. */
  show(rootUri: vscode.Uri, findings: MergedFinding[]): void {
    const before = [...this.byFile.values()].map((e) => e.uri);
    const byFile = new Map<string, { uri: vscode.Uri; findings: MergedFinding[] }>();
    const shown: Shown[] = [];
    const seen = new Set<string>();
    for (const f of findings) {
      // Tree ids must be unique; merged findings already are, so this only guards.
      if (!isSafeContractPath(f.path) || seen.has(f.id)) continue;
      seen.add(f.id);
      const uri = findingUri(rootUri, f.path);
      const entry = byFile.get(uri.toString()) ?? { uri, findings: [] };
      entry.findings.push(f);
      byFile.set(uri.toString(), entry);
      shown.push({ finding: f, uri });
    }
    this.byFile = byFile;
    this.shown = shown;
    this.rootUri = rootUri;
    this.redraw(before);
  }

  clear(): void {
    const before = [...this.byFile.values()].map((e) => e.uri);
    this.byFile = new Map();
    this.shown = [];
    this.rootUri = undefined;
    this.redraw(before);
  }

  /** The messages the chat gets, read for the status bar: connection and scan progress. */
  onHostMessage(message: HostToWebview): void {
    if (message.type === "connection" || message.type === "state") {
      const c = message.connection;
      this.connection = { connection: c.state, reason: c.state === "disconnected" ? c.reason : undefined };
      // "state" comes with a session switch: that session's own progress follows, if it has a scan.
      if (message.type === "state") this.scanning = undefined;
    } else if (message.type === "progress") {
      const running = message.scan.status === "RUNNING" || message.scan.status === "WAITING_APPROVAL";
      this.scanning = running ? message.scan.progress : undefined;
    } else {
      return;
    }
    this.drawStatus();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private findingsIn(uri: vscode.Uri): MergedFinding[] {
    return this.byFile.get(uri.toString())?.findings ?? [];
  }

  /** A file's contract path (forward slashes), when it is inside the scanned folder. */
  private contractPath(uri: vscode.Uri): string | undefined {
    const root = this.rootUri;
    if (!root || uri.scheme !== "file" || root.scheme !== "file") return undefined;
    return relativeContractPath(root.fsPath, uri.fsPath);
  }

  /** Next / Previous Finding: from the cursor, across files, wrapping around. */
  private async step(dir: 1 | -1): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const rel = editor ? this.contractPath(editor.document.uri) : undefined;
    const at = editor && rel !== undefined ? { path: rel, line: editor.selection.start.line + 1 } : undefined;
    const next = stepFinding(this.shown.map((s) => s.finding), at, dir);
    if (!next) {
      void vscode.window.showInformationMessage("Reconix: there are no findings to go to. Scan the workspace first.");
      return;
    }
    await vscode.commands.executeCommand(OPEN_FINDING_COMMAND, next.id);
  }

  /** Fix File (editor and Explorer menus; the Command Palette: the open file): every fixable finding in it. */
  private async fixFile(uris = vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : []): Promise<void> {
    // Same rule as the chat's Fix all: no likely false alarms, no manual fixes.
    const ids = fixAllIds(uris.flatMap((uri) => this.findingsIn(uri))).ids;
    if (!ids.length) {
      void vscode.window.showInformationMessage("Reconix: no findings here can be fixed automatically.");
      return;
    }
    await vscode.commands.executeCommand(FIX_COMMAND, ids);
  }

  /** Selects a finding in the Findings tree (the CodeLens's click). */
  private async reveal(findingId: string): Promise<void> {
    const node = this.tree.nodeOf(findingId);
    if (!node) {
      void vscode.window.showInformationMessage("Reconix: that finding is no longer in the last scan. Rescan to update.");
      return;
    }
    await this.treeView.reveal(node, { select: true, focus: true, expand: true });
  }

  private async codeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!setting("codeLens")) return [];
    const here = this.findingsIn(doc.uri);
    if (!here.length) return [];
    const symbols = await vscode.commands
      .executeCommand<vscode.DocumentSymbol[] | undefined>("vscode.executeDocumentSymbolProvider", doc.uri)
      .then((s) => s ?? [], () => []);
    const flat: SymbolRange[] = [];
    const kinds = [vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Class, vscode.SymbolKind.Constructor];
    const walk = (list: vscode.DocumentSymbol[]): void => {
      for (const s of list) {
        if (!s.range) continue; // guard only: the merged outline always has ranges
        if (kinds.includes(s.kind)) flat.push({ name: s.name, startLine: s.range.start.line + 1, endLine: s.range.end.line + 1 });
        walk(s.children ?? []);
      }
    };
    walk(symbols);
    const byId = new Map(here.map((f) => [f.id, f]));
    return lensGroups(here, flat)
      .filter((g) => g.line <= doc.lineCount)
      .flatMap((g) => {
        const at = new vscode.Range(g.line - 1, 0, g.line - 1, 0);
        const n = g.ids.length;
        // Same rule as the chat's Fix all: no likely false alarms, no manual fixes.
        const fixable = fixAllIds(g.ids.map((id) => byId.get(id)!)).ids;
        const lenses = [new vscode.CodeLens(at, { title: `$(shield) ${n} Reconix finding${n === 1 ? "" : "s"}`, command: REVEAL_FINDING_COMMAND, arguments: [g.ids[0]] })];
        if (fixable.length) lenses.push(new vscode.CodeLens(at, { title: fixable.length === 1 ? "Fix" : `Fix ${fixable.length}`, command: FIX_COMMAND, arguments: [fixable] }));
        return lenses;
      });
  }

  /** Quick fixes (the lightbulb) on lines with findings: Fix each one, or every one in the file. */
  private codeActions(doc: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const inFile = this.findingsIn(doc.uri);
    const here = findingsInLines(inFile, range.start.line + 1, range.end.line + 1);
    if (!here.length) return [];
    const ours = vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source?.startsWith("Reconix"));
    const action = (title: string, ids: string[], diagnostics: vscode.Diagnostic[], preferred = false): vscode.CodeAction => {
      const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      a.command = { command: FIX_COMMAND, title, arguments: [ids] };
      a.diagnostics = diagnostics;
      a.isPreferred = preferred;
      return a;
    };
    const fixableHere = here.filter((f) => !f.manualFix);
    if (!fixableHere.length) return [];
    // Each Fix carries its own finding's diagnostic (same line and rule); only the first is preferred.
    const actions = fixableHere.map((f, i) => action(`Reconix: Fix "${f.title}"`, [f.id],
      ours.filter((d) => d.range.start.line === startLine(f) - 1 && d.code === f.ruleIds[0]), i === 0));
    // Same rule as the chat's Fix all: no likely false alarms, no manual fixes.
    const fileIds = fixAllIds(inFile).ids;
    if (fileIds.length > 1) actions.push(action(`Reconix: Fix all ${fileIds.length} findings in this file`, fileIds, ours));
    return actions;
  }

  /** `before`: the files decorated until now, so their badges clear. */
  private redraw(before: vscode.Uri[]): void {
    this.drawGutter();
    this.fileDecorations.fire([...before, ...[...this.byFile.values()].map((e) => e.uri)]);
    this.tree.update(this.shown);
    const n = this.shown.length;
    this.treeView.badge = n ? { value: n, tooltip: `${n} finding${n === 1 ? "" : "s"}` } : undefined;
    this.lensChanged.fire();
    this.drawStatus();
  }

  private drawStatus(): void {
    const s = statusBar({ ...this.connection, scanning: this.scanning, counts: countBySeverity(this.shown.map((x) => x.finding)) });
    this.status.text = s.text;
    this.status.tooltip = `${s.tooltip}\nClick to open the findings.`;
    this.status.backgroundColor = s.tone ? new vscode.ThemeColor(`statusBarItem.${s.tone}Background`) : undefined;
    this.status.show();
  }

  private drawGutter(): void {
    const on = setting("gutterIcons");
    for (const editor of vscode.window.visibleTextEditors) {
      const lines = gutterLines(on ? this.findingsIn(editor.document.uri) : []);
      for (const icon of ICONS) {
        const ranges = (lines.get(icon) ?? [])
          .filter((line) => line <= editor.document.lineCount)
          .map((line) => new vscode.Range(line - 1, 0, line - 1, 0));
        editor.setDecorations(this.gutter[icon], ranges);
      }
    }
  }

  private hover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const here = findingsInLines(this.findingsIn(doc.uri), pos.line + 1);
    return here.length ? new vscode.Hover(hoverCard(here)) : undefined;
  }

  private fileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!setting("explorerBadges")) return undefined;
    const here = this.findingsIn(uri);
    const worst = worstSeverity(here);
    if (!worst) return undefined;
    const loud: Severity[] = ["CRITICAL", "HIGH", "MEDIUM"];
    const decoration = new vscode.FileDecoration(
      badge(here.length),
      `${here.length} Reconix finding${here.length === 1 ? "" : "s"}`,
      loud.includes(worst) ? new vscode.ThemeColor(worst === "MEDIUM" ? "list.warningForeground" : "list.errorForeground") : undefined,
    );
    decoration.propagate = loud.includes(worst); // the folders above take the colour too
    return decoration;
  }
}
