// The in-editor add-ons: quick fixes, hover cards, status bar, gutter icons, Explorer badges,
// the Findings tree, CodeLens and finding navigation. All of them read the controller's snapshot
// and redraw when it fires onDidChange; the controller stays the one owner of state.

import * as path from "path";
import * as vscode from "vscode";
import type { Controller } from "./controller";
import { badge, countBySeverity, findingsInLines, hoverMarkdown, lensGroups, statusBar, stepFinding, treeGroups,
  worstSeverity } from "./editorLogic";
import type { Finding, Severity } from "./shared/contract";

const COMMANDS = ["reconix.fixFinding", "reconix.explainFinding", "reconix.ignoreFinding"];

/** Theme colours per severity (they follow the user's theme, unlike fixed hex values). */
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "errorForeground", high: "errorForeground", medium: "editorWarning.foreground",
  low: "editorInfo.foreground", info: "descriptionForeground",
};
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info",
};

function setting<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration("reconix").get<T>(key, fallback);
}

const commandLink = (id: string) => (command: string, label: string) =>
  `[${label}](command:${command}?${encodeURIComponent(JSON.stringify([id]))} "${label.replace(/\$\([^)]*\)\s*/, "")}")`;

// --- tree view: severity -> file -> finding ---

type Node =
  | { kind: "severity"; severity: Severity; count: number }
  | { kind: "file"; severity: Severity; path: string; count: number }
  | { kind: "finding"; finding: Finding };

class FindingsTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private parents = new Map<string, Node>();
  private nodes = new Map<string, Node>();

  constructor(private readonly controller: Controller) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  /** The node of a finding, for reveal(). */
  nodeOf(id: string) {
    this.build();
    return this.nodes.get(`f:${id}`);
  }

  private build() {
    this.parents.clear();
    this.nodes.clear();
    const roots: Node[] = [];
    for (const g of treeGroups(this.controller.snapshot().findings)) {
      const sev: Node = { kind: "severity", severity: g.severity, count: g.files.reduce((n, f) => n + f.findings.length, 0) };
      roots.push(sev);
      for (const file of g.files) {
        const fileNode: Node = { kind: "file", severity: g.severity, path: file.path, count: file.findings.length };
        this.parents.set(`p:${g.severity}:${file.path}`, sev);
        for (const f of file.findings) {
          const n: Node = { kind: "finding", finding: f };
          this.nodes.set(`f:${f.id}`, n);
          this.parents.set(`f:${f.id}`, fileNode);
        }
      }
    }
    return roots;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.build();
    const groups = treeGroups(this.controller.snapshot().findings);
    if (node.kind === "severity") {
      return (groups.find((g) => g.severity === node.severity)?.files ?? [])
        .map((f) => ({ kind: "file", severity: node.severity, path: f.path, count: f.findings.length }) as Node);
    }
    if (node.kind === "file") {
      const file = groups.find((g) => g.severity === node.severity)?.files.find((f) => f.path === node.path);
      return (file?.findings ?? []).map((f) => this.nodes.get(`f:${f.id}`) ?? { kind: "finding", finding: f });
    }
    return [];
  }

  getParent(node: Node): Node | undefined {
    if (node.kind === "finding") return this.parents.get(`f:${node.finding.id}`);
    if (node.kind === "file") return this.parents.get(`p:${node.severity}:${node.path}`);
    return undefined;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "severity") {
      const item = new vscode.TreeItem(SEVERITY_LABEL[node.severity], vscode.TreeItemCollapsibleState.Expanded);
      item.id = `sev:${node.severity}`;
      item.description = String(node.count);
      item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(SEVERITY_COLOR[node.severity]));
      return item;
    }
    if (node.kind === "file") {
      const folder = this.controller.snapshot().folder;
      const item = new vscode.TreeItem(path.posix.basename(node.path), vscode.TreeItemCollapsibleState.Expanded);
      item.id = `file:${node.severity}:${node.path}`;
      if (folder) item.resourceUri = vscode.Uri.file(path.join(folder, node.path)); // file-type icon
      const dir = path.posix.dirname(node.path);
      item.description = `${dir === "." ? "" : dir}${dir === "." ? "" : " · "}${node.count}`;
      item.tooltip = node.path;
      return item;
    }
    const f = node.finding;
    const item = new vscode.TreeItem(f.title, vscode.TreeItemCollapsibleState.None);
    item.id = `finding:${f.id}`;
    item.description = `line ${f.start_line}`;
    const tip = new vscode.MarkdownString(hoverMarkdown(f, commandLink(f.id)), true);
    tip.isTrusted = { enabledCommands: COMMANDS };
    item.tooltip = tip;
    item.contextValue = "finding";
    item.iconPath = new vscode.ThemeIcon(f.severity === "critical" || f.severity === "high" ? "error"
      : f.severity === "medium" ? "warning" : "info", new vscode.ThemeColor(SEVERITY_COLOR[f.severity]));
    item.command = { command: "reconix.openFindingById", title: "Open", arguments: [f.id] };
    return item;
  }
}

// --- the features ---

export class EditorFeatures implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly status = vscode.window.createStatusBarItem("reconix.status", vscode.StatusBarAlignment.Left, 50);
  private readonly gutter: Record<Severity, vscode.TextEditorDecorationType>;
  private readonly fileDecorations = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  private readonly lensChanged = new vscode.EventEmitter<void>();
  private readonly tree: FindingsTree;
  private readonly treeView: vscode.TreeView<Node>;
  private decoratedFiles: vscode.Uri[] = [];

  constructor(ctx: vscode.ExtensionContext, private readonly controller: Controller) {
    const icon = (sev: Severity) => vscode.Uri.joinPath(ctx.extensionUri, "media", "gutter", `${sev}.svg`);
    const ruler = (sev: Severity) => new vscode.ThemeColor(SEVERITY_COLOR[sev]);
    this.gutter = Object.fromEntries((["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => [sev,
      vscode.window.createTextEditorDecorationType({
        gutterIconPath: icon(sev), gutterIconSize: "70%",
        overviewRulerColor: ruler(sev), overviewRulerLane: vscode.OverviewRulerLane.Right,
      })])) as Record<Severity, vscode.TextEditorDecorationType>;

    this.status.name = "Reconix";
    this.status.command = "reconix.openChat";

    this.tree = new FindingsTree(controller);
    this.treeView = vscode.window.createTreeView("reconix.findings", { treeDataProvider: this.tree, showCollapseAll: true });

    const selector: vscode.DocumentSelector = { scheme: "file" };
    this.disposables.push(
      this.status, this.fileDecorations, this.lensChanged, this.treeView, ...Object.values(this.gutter),
      vscode.languages.registerCodeActionsProvider(selector, { provideCodeActions: (doc, range, context) =>
        this.codeActions(doc, range, context) }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
      vscode.languages.registerHoverProvider(selector, { provideHover: (doc, pos) => this.hover(doc, pos) }),
      vscode.languages.registerCodeLensProvider(selector, {
        onDidChangeCodeLenses: this.lensChanged.event, provideCodeLenses: (doc) => this.codeLenses(doc) }),
      vscode.window.registerFileDecorationProvider({
        onDidChangeFileDecorations: this.fileDecorations.event, provideFileDecoration: (uri) => this.fileDecoration(uri) }),
      controller.onDidChange(() => this.redraw()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.drawGutter()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (["gutterIcons", "explorerBadges", "codeLens"].some((k) => e.affectsConfiguration(`reconix.${k}`))) this.redraw();
      }),
      ...this.commands(),
    );
    this.redraw();
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }

  private findingsIn(doc: vscode.TextDocument) {
    const rel = this.controller.relPath(doc.uri);
    return rel ? this.controller.snapshot().findings.filter((f) => f.path === rel) : [];
  }

  private redraw() {
    const snap = this.controller.snapshot();
    // status bar
    const s = statusBar({ connected: snap.connected, scanning: snap.scanning, percent: snap.percent,
                          counts: countBySeverity(snap.findings) });
    this.status.text = s.text;
    this.status.tooltip = `${s.tooltip}\nClick to open the Reconix chat.`;
    this.status.backgroundColor = s.tone ? new vscode.ThemeColor(`statusBarItem.${s.tone}Background`) : undefined;
    this.status.show();
    // tree
    this.tree.refresh();
    this.treeView.badge = snap.findings.length ? { value: snap.findings.length, tooltip: `${snap.findings.length} findings` } : undefined;
    this.treeView.message = snap.findings.length ? undefined
      : snap.connected ? "No findings. Ask Reconix to scan this project." : undefined;
    // editors, Explorer, CodeLens
    this.drawGutter();
    const files = snap.folder ? [...new Set(snap.findings.map((f) => f.path))]
      .map((p) => vscode.Uri.file(path.join(snap.folder!, p))) : [];
    this.fileDecorations.fire([...this.decoratedFiles, ...files]); // old ones clear, new ones draw
    this.decoratedFiles = files;
    this.lensChanged.fire();
  }

  private drawGutter() {
    const on = setting("gutterIcons", true);
    for (const editor of vscode.window.visibleTextEditors) {
      const here = on ? this.findingsIn(editor.document) : [];
      for (const [sev, type] of Object.entries(this.gutter) as [Severity, vscode.TextEditorDecorationType][]) {
        // one icon per line: the most severe finding on that line wins
        const lines = new Set(here.filter((f) => f.severity === sev
          && worstSeverity(findingsInLines(here, f.start_line)) === sev).map((f) => f.start_line - 1));
        editor.setDecorations(type, [...lines].filter((l) => l < editor.document.lineCount)
          .map((l) => new vscode.Range(l, 0, l, 0)));
      }
    }
  }

  private fileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!setting("explorerBadges", true)) return undefined;
    const rel = this.controller.relPath(uri);
    if (!rel) return undefined;
    const here = this.controller.snapshot().findings.filter((f) => f.path === rel);
    const worst = worstSeverity(here);
    if (!worst) return undefined;
    const loud = worst === "critical" || worst === "high" || worst === "medium";
    const d = new vscode.FileDecoration(badge(here.length), `${here.length} Reconix finding${here.length === 1 ? "" : "s"}`,
      loud ? new vscode.ThemeColor(worst === "medium" ? "list.warningForeground" : "list.errorForeground") : undefined);
    d.propagate = loud; // folders above take the colour too
    return d;
  }

  private codeActions(doc: vscode.TextDocument, range: vscode.Range | vscode.Selection,
                      context: vscode.CodeActionContext): vscode.CodeAction[] {
    const ours = context.diagnostics.filter((d) => d.source === "Reconix");
    if (!ours.length) return [];
    const inFile = this.findingsIn(doc);
    const here = findingsInLines(inFile, range.start.line + 1, range.end.line + 1);
    const actions: vscode.CodeAction[] = [];
    const add = (title: string, command: string, args: unknown[], diagnostics: vscode.Diagnostic[], preferred = false) => {
      const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      a.command = { command, title, arguments: args };
      a.diagnostics = diagnostics;
      a.isPreferred = preferred;
      actions.push(a);
    };
    for (const f of here) {
      const diag = ours.filter((d) => d.range.start.line === f.start_line - 1);
      add(`Reconix: Fix "${f.title}"`, "reconix.fixFinding", [f.id], diag, true);
      add(`Reconix: Explain "${f.title}" in chat`, "reconix.explainFinding", [f.id], diag);
      add(`Reconix: Ignore "${f.title}"`, "reconix.ignoreFinding", [f.id], diag);
    }
    if (inFile.length > 1) {
      add(`Reconix: Fix all ${inFile.length} findings in this file`, "reconix.fixFindings", [inFile.map((f) => f.id)], ours);
    }
    return actions;
  }

  private hover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const here = findingsInLines(this.findingsIn(doc), pos.line + 1);
    if (!here.length) return undefined;
    const md = new vscode.MarkdownString(here.map((f) => hoverMarkdown(f, commandLink(f.id))).join("\n\n---\n\n"), true);
    md.isTrusted = { enabledCommands: COMMANDS };
    return new vscode.Hover(md);
  }

  private async codeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!setting("codeLens", false)) return [];
    const here = this.findingsIn(doc);
    if (!here.length) return [];
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider", doc.uri).then((s) => s ?? [], () => []);
    const flat: { name: string; startLine: number; endLine: number }[] = [];
    const walk = (list: vscode.DocumentSymbol[]) => list.forEach((s) => {
      if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Class,
           vscode.SymbolKind.Constructor].includes(s.kind)) {
        flat.push({ name: s.name, startLine: s.range.start.line + 1, endLine: s.range.end.line + 1 });
      }
      walk(s.children ?? []);
    });
    walk(symbols);
    return lensGroups(here, flat).flatMap((g) => {
      const at = new vscode.Range(g.line - 1, 0, g.line - 1, 0);
      const n = g.ids.length;
      return [
        new vscode.CodeLens(at, { title: `$(shield) ${n} Reconix finding${n === 1 ? "" : "s"}`,
                                  command: "reconix.revealFinding", arguments: [g.ids[0]] }),
        new vscode.CodeLens(at, { title: n === 1 ? "Fix" : "Fix all", command: "reconix.fixFindings", arguments: [g.ids] }),
      ];
    });
  }

  /** Jump to the next or previous finding from the cursor, across files. */
  private async step(dir: 1 | -1) {
    const editor = vscode.window.activeTextEditor;
    const rel = editor ? this.controller.relPath(editor.document.uri) : undefined;
    const at = editor && rel ? { path: rel, line: editor.selection.active.line + 1 } : null;
    const next = stepFinding(this.controller.snapshot().findings, at, dir);
    if (!next) {
      void vscode.window.showInformationMessage("Reconix: no findings to go to.");
      return;
    }
    await this.controller.openFinding(next.id);
  }

  private commands(): vscode.Disposable[] {
    const c = this.controller;
    const run = (fn: (...a: any[]) => Promise<unknown>) => (...a: any[]) => fn(...a).catch((e) => c.showError(e));
    const openChat = () => vscode.commands.executeCommand("reconix.chat.focus");
    // tree context menus pass the tree node; other callers pass the finding id
    const idOf = (x: unknown) => (typeof x === "string" ? x : (x as Node)?.kind === "finding" ? (x as { finding: Finding }).finding.id : undefined);
    return [
      vscode.commands.registerCommand("reconix.fixFinding", run(async (x) => {
        const id = idOf(x);
        if (id) { await openChat(); await c.fixFindings([id]); }
      })),
      vscode.commands.registerCommand("reconix.fixFindings", run(async (ids: string[]) => {
        if (ids?.length) { await openChat(); await c.fixFindings(ids); }
      })),
      vscode.commands.registerCommand("reconix.fixFile", run(async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        const rel = target && c.relPath(target);
        const ids = c.snapshot().findings.filter((f) => f.path === rel).map((f) => f.id);
        if (!ids.length) { void vscode.window.showInformationMessage("Reconix: no findings in this file."); return; }
        await openChat();
        await c.fixFindings(ids);
      })),
      vscode.commands.registerCommand("reconix.explainFinding", run(async (x) => {
        const id = idOf(x);
        if (id) { await openChat(); await c.explainFinding(id); }
      })),
      vscode.commands.registerCommand("reconix.ignoreFinding", run(async (x) => {
        const id = idOf(x);
        if (id) await c.ignoreFinding(id);
      })),
      vscode.commands.registerCommand("reconix.clearIgnored", run(() => c.clearIgnored())),
      vscode.commands.registerCommand("reconix.openFindingById", run((id: string) => c.openFinding(id))),
      vscode.commands.registerCommand("reconix.revealFinding", run(async (id: string) => {
        const node = this.tree.nodeOf(id);
        if (node) await this.treeView.reveal(node, { select: true, focus: true, expand: true });
      })),
      vscode.commands.registerCommand("reconix.nextFinding", run(() => this.step(1))),
      vscode.commands.registerCommand("reconix.previousFinding", run(() => this.step(-1))),
      vscode.commands.registerCommand("reconix.scanPath", run(async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target || target.scheme !== "file") return;
        await openChat();
        await c.scanPath(target);
      })),
      vscode.commands.registerCommand("reconix.explainSelection", run(async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        await openChat();
        await c.explainSelection(editor);
      })),
    ];
  }
}
