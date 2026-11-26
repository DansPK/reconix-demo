// Chat webview UI. Talks to the host only through postMessage (see src/shared/messages.ts).
import type { AgentEvent, ChatAction, ChatReply, ConnectionAction, ConnectionStatus, LlmProvider, Message, ProviderType, ScanSummary, Session, Severity, SummaryCard, Verdict } from "../src/shared/contract";
import type { FindingView, HostToWebview, MessageView, WebviewToHost } from "../src/shared/messages";
import { ADDABLE_TYPES, MODEL_PLACEHOLDER, PRESET_MODELS, PROVIDER_LABEL, providerFields } from "../src/providerLogic";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const send = (message: WebviewToHost): void => vscode.postMessage(message);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className: string, onClick: () => void, title?: string): HTMLButtonElement {
  const node = el("button", className, text);
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  if (title) node.title = title;
  return node;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function enhanceCodeBlocks(container: HTMLElement): void {
  const pres = Array.from(container.querySelectorAll("pre"));
  for (const pre of pres) {
    if (pre.parentElement?.classList.contains("ai-code")) continue;
    const code = pre.querySelector("code");
    if (!code) continue;
    const codeText = code.textContent ?? "";
    const langMatch = code.className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : "code";

    const wrap = el("div", "ai-code");
    const head = el("div", "ai-code-head");
    const langEl = el("span", undefined, lang);

    const actions = el("div", "ai-code-actions");
    const insertBtn = button("Insert", "secondary small", () => {
      send({ type: "insertCode", text: codeText });
    }, "Insert at editor cursor");
    insertBtn.type = "button";

    const copyBtn = button("Copy", "secondary small", async () => {
      const ok = await copyToClipboard(codeText);
      if (ok) {
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
      }
    }, "Copy code to clipboard");
    copyBtn.type = "button";

    actions.append(insertBtn, copyBtn);
    head.append(langEl, actions);

    pre.replaceWith(wrap);
    wrap.append(head, pre);
  }
}

/**
 * The only place HTML is inserted: review and assistant text the host rendered with markdown-it
 * (html: false), so raw HTML from the analyzer is already escaped. Never pass anything else here.
 */
function setRenderedMarkdown(node: HTMLElement, html: string): void {
  node.innerHTML = html;
  enhanceCodeBlocks(node);
}

// ---- icons -------------------------------------------------------------------------------

// Feather-style 24x24 stroke icons, built as DOM nodes (no innerHTML).
type Shape = ["path", string] | ["circle", number, number, number];
const ICONS: Record<string, Shape[]> = {
  alert: [["path", "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"], ["path", "M12 9v4M12 17h.01"]],
  arrowUp: [["path", "M12 19V5M5 12l7-7 7 7"]],
  check: [["path", "M20 6 9 17l-5-5"]],
  chat: [["path", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"]],
  chevron: [["path", "m6 9 6 6 6-6"]],
  close: [["path", "M18 6 6 18M6 6l12 12"]],
  copy: [
    ["path", "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"],
    ["path", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  ],
  cube: [["path", "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"], ["path", "M3.27 6.96 12 12l8.73-5.04M12 22V12"]],
  edit: [["path", "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"], ["path", "M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"]],
  file: [["path", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"], ["path", "M14 2v6h6"]],
  github: [["path", "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"]],
  folder: [["path", "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"]],
  history: [["path", "M3 12a9 9 0 1 0 3-6.7L3 8"], ["path", "M3 3v5h5M12 7v5l3 2"]],
  info: [["circle", 12, 12, 9], ["path", "M12 16v-4M12 8h.01"]],
  list: [["path", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]],
  plus: [["path", "M12 5v14M5 12h14"]],
  refresh: [["path", "M23 4v6h-6M1 20v-6h6"], ["path", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"]],
  search: [["circle", 11, 11, 7], ["path", "m21 21-4.3-4.3"]],
  sparkles: [["path", "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"], ["path", "M19 15l.6 1.6L21 17l-1.4.4L19 19l-.6-1.6L17 17l1.4-.4z"]],
  square: [["path", "M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"]],
  trash: [["path", "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"]],
  wrench: [["path", "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"]],
};
const SVG_NS = "http://www.w3.org/2000/svg";

function icon(name: keyof typeof ICONS, className = "ico"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", class: className, "aria-hidden": "true" })) {
    svg.setAttribute(k, v);
  }
  for (const shape of ICONS[name]) {
    const node = document.createElementNS(SVG_NS, shape[0]);
    if (shape[0] === "path") node.setAttribute("d", shape[1]);
    else {
      node.setAttribute("cx", String(shape[1]));
      node.setAttribute("cy", String(shape[2]));
      node.setAttribute("r", String(shape[3]));
    }
    svg.append(node);
  }
  return svg;
}

function iconButton(name: keyof typeof ICONS, title: string, onClick: () => void, className = "icon-btn"): HTMLButtonElement {
  const node = button("", className, onClick, title);
  node.setAttribute("aria-label", title);
  node.append(icon(name));
  return node;
}

// ---- persisted UI state (per webview) ----------------------------------------------------

interface UiState {
  tab: "chat" | "findings";
  /** Severities switched off with the filter chips. */
  hiddenSeverities: Severity[];
  query: string;
  collapsed: Severity[];
}

const ui: UiState = { tab: "chat", hiddenSeverities: [], query: "", collapsed: [], ...((vscode.getState() as Partial<UiState>) ?? {}) };
const saveUi = (): void => vscode.setState(ui);

// ---- layout ------------------------------------------------------------------------------

const app = document.getElementById("app") ?? document.body;

// header row 1: orb + name, then History and New chat. Row 2: Chat / Findings, Rescan.
const historyButton = el("button", "ai-btn");
historyButton.title = "Sessions";
historyButton.setAttribute("aria-haspopup", "true");
historyButton.setAttribute("aria-expanded", "false");
historyButton.setAttribute("aria-controls", "history-menu");
historyButton.append(icon("history"), el("span", "history-label", "History"), icon("chevron", "ico caret"));
const newButton = iconButton("edit", "New chat", () => send({ type: "newSession" }));
const chatTab = el("button", "tab");
chatTab.append(icon("chat"), el("span", undefined, "Chat"));
const findingsTab = el("button", "tab");
const tabs = el("div", "tabs");
tabs.setAttribute("role", "tablist");
for (const tab of [chatTab, findingsTab]) tab.setAttribute("role", "tab");
tabs.append(chatTab, findingsTab);
const rescanButton = button("", "ai-btn ai-btn-outline small", () => {
  if (confirms.size > 0 || thinkingActive || scanning) return;
  setTab("chat");
  send({ type: "runAction", action: { kind: "rescan", label: "Rescan" } });
}, "Scan the files that changed since the last scan");
const rescanLabel = el("span", undefined, "Rescan");
rescanButton.append(icon("refresh"), rescanLabel);
/** Saved files with findings since the last scan (the host counts them). */
let changedFiles = 0;

const brand = el("div", "ai-brand");
const brandOrb = el("span", "orb");
brandOrb.setAttribute("aria-hidden", "true");
brand.append(brandOrb, el("span", "ai-title", "Reconix Code Scanner"));
const tools = el("div", "ai-tools");
tools.append(historyButton, newButton);
const context = el("div", "ai-context");
context.append(tabs, el("div", "spacer"), rescanButton);
const header = el("div", "ai-header");
header.append(brand, tools, context);

// History: sessions grouped by day of last activity, newest first; the open one is tinted.
const historyList = el("div", "ai-menu-list");
const historyMenu = el("div", "ai-menu hidden");
historyMenu.id = "history-menu";
historyMenu.setAttribute("role", "dialog");
historyMenu.setAttribute("aria-label", "Sessions");
const historyHead = el("div", "ai-menu-head");
historyHead.append(el("span", "ai-menu-heading", "Sessions"), iconButton("close", "Close", () => {
  closeHistory();
  historyButton.focus();
}));
const historyFoot = el("div", "ai-menu-foot");
historyMenu.append(historyHead, historyList, historyFoot);
// Transient History state, kept across re-renders (which happen on every session update).
let renaming: string | undefined;
let renameDraft = "";
let deleting: string | undefined; // the row asking "Delete …?"
let confirmAll = false; // the foot asking "Delete all …?"

header.append(historyMenu);

// scan progress, under the header
const progressText = el("div", "progress-text");
const stopButton = button("Stop", "secondary small", () => {
  stopButton.disabled = true;
  send({ type: "cancelScan" });
}, "Stop the scan");
const progressRow = el("div", "progress-row");
progressRow.append(progressText, stopButton);
const progressBar = el("div", "bar");
const progressTrack = el("div", "track");
progressTrack.setAttribute("role", "progressbar");
progressTrack.setAttribute("aria-valuemin", "0");
progressTrack.setAttribute("aria-valuemax", "100");
progressTrack.append(progressBar);
const progress = el("div", "progress hidden");
progress.append(progressRow, progressTrack);

// chat panel: a scrolling column (welcome, messages, typing dots) above the composer
const messageList = el("div", "messages");
messageList.setAttribute("role", "log");
messageList.setAttribute("aria-live", "polite");
const thinking = el("div", "ai-row-assistant thinking hidden");
const thinkingOrb = el("span", "orb");
thinkingOrb.dataset.live = "";
const typing = el("div", "ai-typing");
typing.setAttribute("role", "status");
typing.setAttribute("aria-label", "Thinking");
typing.append(el("span"), el("span"), el("span"));
thinking.append(thinkingOrb, typing);

interface Example {
  icon: keyof typeof ICONS;
  title: string;
  detail: string;
  run: () => void;
}

const runAction = (action: ChatAction): void => {
  if (confirms.size > 0 || thinkingActive || scanning) return;
  send({ type: "runAction", action });
};
// Like the reference, most cards send a chat message, so the conversation shows what was asked.
// "Scan the current file" runs the command instead: the chat can't know which file is open.
const EXAMPLES: Example[] = [
  { icon: "folder", title: "Scan this project", detail: "Scan the workspace for vulnerabilities", run: () => sendText("Scan this project") },
  { icon: "file", title: "Scan the current file", detail: "Only the file open in the editor", run: () => {
    if (confirms.size > 0 || thinkingActive || scanning) return;
    send({ type: "runCommand", command: "reconix.scanPath" });
  } },
  { icon: "github", title: "Scan a GitHub repo", detail: "Paste the repository's address", run: () => prefill("Scan https://github.com/") },
  { icon: "alert", title: "Most serious problems", detail: "Show the top critical issues", run: () => sendText("What are the most serious problems?") },
  { icon: "list", title: "Summarize all findings", detail: "Get a clear summary", run: () => sendText("Summarize all findings") },
  { icon: "wrench", title: "Fix all high findings", detail: "Suggest and apply fixes", run: () => sendText("Fix all high findings") },
  { icon: "refresh", title: "Scan again from scratch", detail: "Run a full rescan", run: () => sendText("Scan everything again from scratch") },
  { icon: "sparkles", title: "Ask a question", detail: "About a finding or your code", run: () => input.focus() },
];

/** Puts text in the message box for the user to finish, cursor at its end. */
function prefill(text: string): void {
  input.value = text;
  autoGrow();
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

const exampleList = el("div", "ai-prompts");
for (const example of EXAMPLES) {
  const card = button("", "ai-prompt", example.run, example.title);
  const iconBox = el("span", "ai-prompt-icon");
  iconBox.append(icon(example.icon));
  const body = el("span", "ai-prompt-body");
  body.append(el("div", "ai-prompt-title", example.title), el("div", "ai-prompt-detail", example.detail));
  card.append(iconBox, body);
  exampleList.append(card);
}
const globe = el("div", "ai-globe");
globe.setAttribute("aria-hidden", "true");
const welcome = el("div", "ai-welcome");
welcome.append(globe, el("h2", "ai-welcome-title", "How can I help with your code?"),
  el("p", "ai-welcome-sub", "I can scan this workspace, a file or a GitHub repository, explain the findings and fix them. You review every change before it is applied."),
  exampleList);

const chatColumn = el("div", "ai-column is-fill");
chatColumn.append(welcome, messageList, thinking);
const chatScroll = el("div", "ai-scroll");
chatScroll.append(chatColumn);

const input = el("textarea");
input.rows = 1;
input.placeholder = "Ask about your code…";
input.setAttribute("aria-label", "Message");
const sendButton = button("", "ai-send", () => onSendButtonClick(), "Send");
sendButton.setAttribute("aria-label", "Send");
sendButton.append(icon("arrowUp"));
// model picker: the chip in the composer opens this menu upward, one click per model
const modelChip = el("button", "ai-chip model-chip");
modelChip.setAttribute("aria-haspopup", "true");
modelChip.setAttribute("aria-expanded", "false");
modelChip.setAttribute("aria-controls", "model-menu");
const modelList = el("div", "ai-menu-list model-list");
modelList.setAttribute("role", "listbox");
modelList.setAttribute("aria-label", "Models");
const modelMenu = el("div", "ai-menu model-menu hidden");
modelMenu.id = "model-menu";
modelMenu.setAttribute("role", "group");
modelMenu.setAttribute("aria-label", "Choose a model");
const modelHead = el("div", "ai-menu-head");
modelHead.append(el("span", "ai-menu-heading", "Choose a model"), iconButton("close", "Close", () => closeMenus()));
// The form under the list: add a model, or edit one (its key is never shown, only its last 4).
const modelForm = el("div", "model-form hidden");
modelForm.id = "model-form";
const modelFormHeading = el("div", "model-form-heading");
const typeSelect = el("select");
typeSelect.setAttribute("aria-label", "Provider");
const nameInput = el("input");
const modelSelect = el("select");
modelSelect.setAttribute("aria-label", "Model");
const modelNameInput = el("input");
const baseUrlInput = el("input");
const keyInput = el("input");
keyInput.type = "password";
keyInput.autocomplete = "off";
keyInput.spellcheck = false;
for (const field of [nameInput, modelNameInput, baseUrlInput]) field.type = "text";
const providerStatusLine = el("div", "model-form-status");
providerStatusLine.setAttribute("role", "status");
providerStatusLine.setAttribute("aria-live", "polite");
function formField(label: string, control: HTMLElement, hint?: HTMLElement): HTMLLabelElement {
  const row = el("label", "model-field");
  row.append(el("span", "model-field-label", label), control);
  if (hint) row.append(hint);
  return row;
}
const baseUrlHint = el("span", "model-field-hint");
const keyHint = el("span", "model-field-hint");
const typeRow = formField("Provider", typeSelect);
const nameRow = formField("Name", nameInput);
const modelControlWrap = el("div", "model-field-controls");
modelControlWrap.append(modelSelect, modelNameInput);
const modelNameRow = formField("Model", modelControlWrap);

modelSelect.addEventListener("change", () => {
  if (modelSelect.value === "__custom__") {
    modelNameInput.value = "";
    modelNameInput.classList.remove("hidden");
    modelNameInput.focus();
  } else if (modelSelect.value !== "") {
    modelNameInput.value = modelSelect.value;
    modelNameInput.classList.add("hidden");
  } else {
    modelNameInput.value = "";
    modelNameInput.classList.add("hidden");
  }
});
const baseUrlRow = formField("Base URL", baseUrlInput, baseUrlHint);
const keyRow = formField("API key", keyInput, keyHint);
const saveProviderButton = button("Save and test", "small", () => saveProviderForm());
const testProviderButton = button("Test", "secondary small", () => {
  if (!editingProvider) return;
  setProviderStatus({ tone: "busy", text: "Testing…" });
  send({ type: "testProvider", formId, providerId: editingProvider });
});
const useProviderButton = button("Use this model", "secondary small", () => {
  if (!editingProvider) return;
  const providerId = editingProvider;
  closeMenus();
  send({ type: "activateProvider", providerId });
});
const cancelProviderButton = button("Close", "secondary small", () => closeModelForm());
const modelFormActions = el("div", "model-form-actions");
modelFormActions.append(saveProviderButton, testProviderButton, useProviderButton, cancelProviderButton);
for (const field of [nameInput, modelNameInput, baseUrlInput, keyInput]) {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !saveProviderButton.disabled) {
      event.preventDefault();
      saveProviderForm();
    }
  });
}
modelForm.append(modelFormHeading, typeRow, nameRow, modelNameRow, baseUrlRow, keyRow, providerStatusLine, modelFormActions);
const addModelButton = button("", "model-add", () => openModelForm(undefined), "Add an LLM provider and model");
addModelButton.append(icon("plus"), el("span", undefined, "Add a model"));
modelMenu.append(modelHead, modelList, addModelButton, modelForm);
const composerBar = el("div", "ai-composer-bar");
composerBar.append(modelChip, el("span", "ai-composer-hint", "Enter to send · Shift+Enter for new line"), sendButton);
const composerBox = el("div", "ai-composer");
composerBox.append(input, composerBar);
const mentionMenu = el("div", "ai-mention-menu hidden");
const composerWrap = el("div", "ai-composer-wrap");
composerWrap.append(composerBox, modelMenu, mentionMenu);
// connection problems sit just above the composer
const status = el("div", "ai-reason hidden");
status.setAttribute("role", "status");
const composer = el("div", "ai-column ai-composer-area");
const footnote = el("div", "ai-footnote");
const connectionDot = el("span", "ai-dot");
const connectionLabel = el("span", undefined, "Connecting…");
footnote.append(connectionDot, connectionLabel);
composer.append(status, composerWrap, footnote);

const chatPanel = el("div", "panel chat-panel");
chatPanel.append(chatScroll, composer);

// findings panel
const chips = el("div", "chips");
const summarizeButton = button("Summarize", "secondary small", () => {
  setTab("chat");
  runAction({ kind: "summarize", label: "Summarize" });
}, "Ask the assistant for a summary of all findings");
const fixAllButton = button("Fix all", "small", () => {
  setTab("chat");
  // No ids: the host picks every shown finding that is not a likely false alarm.
  runAction({ kind: "fixFindings", label: "Fix all" });
}, "Fix every finding that is not a likely false alarm. You review the changes before they are applied.");
const search = el("input", "search");
search.type = "search";
search.placeholder = "Search";
search.setAttribute("aria-label", "Filter findings");
const filterRow = el("div", "filter-row");
filterRow.append(chips, summarizeButton, fixAllButton);
const filters = el("div", "filters");
filters.append(filterRow, search);
const findingsNote = el("div", "note");
const findingsList = el("div", "findings");
const findingsEmpty = el("div", "empty");
const findingsColumn = el("div", "ai-column");
findingsColumn.append(filters, findingsNote, findingsList, findingsEmpty);
const findingsScroll = el("div", "ai-scroll");
findingsScroll.append(findingsColumn);
const findingsPanel = el("div", "panel findings-panel");
findingsPanel.append(findingsScroll);

// Replace children rather than appending: the host page provides an empty #app.
app.replaceChildren(header, progress, chatPanel, findingsPanel);

// grow the composer with its content, up to a cap
function autoGrow(): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}
input.addEventListener("input", () => {
  autoGrow();
  checkMention();
});

// ---- state -------------------------------------------------------------------------------

let sessions: Session[] = [];
let currentSessionId: string | undefined;
let connected = false;
let scanning = false;
let thinkingActive = false;
let sendButtonMode: "send" | "busy" | "confirm" = "send";
const confirms = new Map<string, HTMLDivElement>();
let providers: LlmProvider[] = [];
let findings: FindingView[] = [];
let hiddenFalsePositives = 0;
const expanded = new Set<string>();

let activeStreamRow: HTMLDivElement | undefined;
let activeStreamBody: HTMLDivElement | undefined;

function appendChatPiece(piece: string): void {
  setThinking(false);
  if (!activeStreamRow || !activeStreamBody) {
    activeStreamBody = el("div", "ai-prose plain");
    activeStreamRow = assistantRow(activeStreamBody);
    appendToChat(activeStreamRow);
  }
  activeStreamBody.textContent = (activeStreamBody.textContent ?? "") + piece;
  scrollToEnd();
  updateSendButton();
}

interface MentionSuggestion {
  label: string;
  title: string;
  detail: string;
  insertText: string;
}

let mentionIndex = 0;
let mentionMatches: MentionSuggestion[] = [];
let mentionQueryStart = -1;

function getMentionSuggestions(): MentionSuggestion[] {
  const suggestions: MentionSuggestion[] = [
    { label: "@workspace", title: "All files and context in current workspace", detail: "workspace", insertText: "@workspace " },
    { label: "@file", title: "Current active file in editor", detail: "file", insertText: "@file " },
  ];

  const seenPaths = new Set<string>();
  for (const f of findings) {
    if (!seenPaths.has(f.path)) {
      seenPaths.add(f.path);
      const name = splitPath(f.path).name;
      suggestions.push({
        label: `@${name}`,
        title: f.path,
        detail: "file",
        insertText: `@${name} `,
      });
    }
  }

  for (const f of findings.slice(0, 30)) {
    suggestions.push({
      label: `@${f.id}`,
      title: f.title,
      detail: f.severity.toLowerCase(),
      insertText: `@${f.id} `,
    });
  }

  return suggestions;
}

function closeMentionMenu(): void {
  mentionMenu.classList.add("hidden");
  mentionMatches = [];
  mentionIndex = 0;
  mentionQueryStart = -1;
}

function renderMentionMenu(): void {
  mentionMenu.replaceChildren();
  if (mentionMatches.length === 0) {
    closeMentionMenu();
    return;
  }

  mentionMatches.forEach((item, idx) => {
    const btn = el("button", `ai-mention-item${idx === mentionIndex ? " selected" : ""}`);
    btn.type = "button";
    btn.append(
      el("span", "ai-mention-label", item.label),
      el("span", "ai-mention-title", item.title),
      el("span", "ai-mention-detail", item.detail),
    );
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyMention(item);
    });
    btn.addEventListener("mouseenter", () => {
      mentionIndex = idx;
      updateMentionSelection();
    });
    mentionMenu.append(btn);
  });

  mentionMenu.classList.remove("hidden");
}

function updateMentionSelection(): void {
  const children = Array.from(mentionMenu.children) as HTMLElement[];
  children.forEach((child, idx) => {
    const isSelected = idx === mentionIndex;
    child.classList.toggle("selected", isSelected);
    if (isSelected) {
      child.scrollIntoView({ block: "nearest" });
    }
  });
}

function applyMention(item: MentionSuggestion): void {
  if (mentionQueryStart < 0) return;
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, mentionQueryStart);
  const after = input.value.slice(pos);
  input.value = before + item.insertText + after;
  const newPos = before.length + item.insertText.length;
  input.setSelectionRange(newPos, newPos);
  closeMentionMenu();
  autoGrow();
  input.focus();
}

function checkMention(): void {
  const pos = input.selectionStart ?? 0;
  const textBefore = input.value.slice(0, pos);
  const match = textBefore.match(/(^|\s)@([a-zA-Z0-9_\-\./]*)$/);
  if (!match) {
    closeMentionMenu();
    return;
  }

  const prefix = match[1];
  mentionQueryStart = textBefore.length - match[0].length + prefix.length;
  const query = match[2].toLowerCase();

  const all = getMentionSuggestions();
  mentionMatches = all.filter((s) =>
    s.label.toLowerCase().includes(query) || s.title.toLowerCase().includes(query)
  ).slice(0, 10);

  if (mentionMatches.length === 0) {
    closeMentionMenu();
    return;
  }

  mentionIndex = 0;
  renderMentionMenu();
}

function setTab(tab: UiState["tab"]): void {
  ui.tab = tab;
  saveUi();
  chatTab.classList.toggle("active", tab === "chat");
  findingsTab.classList.toggle("active", tab === "findings");
  chatTab.setAttribute("aria-selected", String(tab === "chat"));
  findingsTab.setAttribute("aria-selected", String(tab === "findings"));
  chatPanel.classList.toggle("hidden", tab !== "chat");
  findingsPanel.classList.toggle("hidden", tab !== "findings");
  if (tab === "chat") scrollToEnd();
}

function setConnection(connection: ConnectionStatus): void {
  connected = connection.state === "connected";
  connectionLabel.textContent = connection.state === "connected" ? connection.label
    : connection.state === "connecting" ? "Connecting…" : connection.reason;
  connectionDot.dataset.tone = connected ? "success" : connection.state === "connecting" ? "warning" : "danger";
  status.replaceChildren();
  status.classList.toggle("hidden", connection.state !== "disconnected");
  if (connection.state === "disconnected") {
    status.dataset.tone = "warning";
    const { action } = connection;
    status.append(icon("alert"), el("span", "reason-text", connection.reason));
    if (action) status.append(button(action.label, "secondary small", () => send({ type: "runCommand", command: action.command })));
    status.append(iconButton("close", "Dismiss", () => status.classList.add("hidden")));
  }
}

/** Shown findings the fix agent can work on (not a likely false alarm, no manual fix). */
function fixableCount(): number {
  return findings.filter((f) => !f.manualFix && f.verdict !== "LIKELY_FALSE_POSITIVE").length;
}

function updateSendButton(): void {
  const hasConfirm = confirms.size > 0;
  const isBusy = thinkingActive || scanning || activeStreamRow !== undefined;
  const nextMode: "send" | "busy" | "confirm" = hasConfirm ? "confirm" : isBusy ? "busy" : "send";

  if (nextMode === "confirm") {
    if (sendButtonMode !== "confirm") {
      sendButton.replaceChildren(icon("square"));
      sendButtonMode = "confirm";
    }
    const label = "Please choose an option above to continue";
    sendButton.setAttribute("aria-label", label);
    sendButton.title = label;
    sendButton.disabled = true;
    sendButton.classList.remove("is-stop");
    sendButton.classList.add("is-confirm-waiting");
  } else if (nextMode === "busy") {
    if (sendButtonMode !== "busy") {
      sendButton.replaceChildren(icon("square"));
      sendButtonMode = "busy";
    }
    const label = scanning ? "Stop the scan" : "Stop response";
    sendButton.setAttribute("aria-label", label);
    sendButton.title = label;
    sendButton.disabled = false;
    sendButton.classList.add("is-stop");
    sendButton.classList.remove("is-confirm-waiting");
  } else {
    if (sendButtonMode !== "send") {
      sendButton.replaceChildren(icon("arrowUp"));
      sendButtonMode = "send";
    }
    sendButton.setAttribute("aria-label", "Send");
    sendButton.title = "Send";
    sendButton.disabled = !connected;
    sendButton.classList.remove("is-stop", "is-confirm-waiting");
  }
}

function stopActiveRequest(): void {
  if (scanning) {
    send({ type: "cancelScan" });
  }
  if (thinkingActive || activeStreamRow) {
    send({ type: "cancelChat" });
    setThinking(false);
    activeStreamRow = undefined;
    activeStreamBody = undefined;
  }
  updateSendButton();
  input.focus();
}

function onSendButtonClick(): void {
  if (confirms.size > 0) return;
  if (thinkingActive || scanning || activeStreamRow !== undefined) {
    stopActiveRequest();
    return;
  }
  sendChat();
}

function updateControls(): void {
  updateSendButton();
  rescanButton.disabled = !connected || scanning;
  rescanButton.classList.toggle("attention", changedFiles > 0);
  rescanLabel.textContent = changedFiles ? `Rescan · ${changedFiles}` : "Rescan";
  rescanButton.title = changedFiles
    ? `${changedFiles} saved file${changedFiles === 1 ? " has" : "s have"} findings. Rescan to see if they are fixed.`
    : "Scan the files that changed since the last scan";
  stopButton.classList.toggle("hidden", !scanning);
  fixAllButton.disabled = !connected || scanning || fixableCount() === 0;
  fixAllButton.title = fixableCount() === 0 && findings.length > 0
    ? "None of these findings can be fixed automatically; each says why."
    : "Fix every finding that is not a likely false alarm. You review the changes before they are applied.";
  summarizeButton.disabled = !connected || findings.length === 0;
  modelChip.disabled = !connected || providers.length === 0;
}

// ---- menus (History, model) --------------------------------------------------------------

const MENUS: [HTMLElement, HTMLElement][] = [[historyMenu, historyButton], [modelMenu, modelChip]];

function closeMenu(menu: HTMLElement, opener: HTMLElement): void {
  menu.classList.add("hidden");
  opener.setAttribute("aria-expanded", "false");
  if (menu === historyMenu) {
    renaming = deleting = undefined;
    confirmAll = false;
  }
  if (menu === modelMenu) closeModelForm(); // and the key field is emptied
}

function closeMenus(): void {
  for (const [menu, opener] of MENUS) closeMenu(menu, opener);
}

function closeHistory(): void {
  closeMenu(historyMenu, historyButton);
}

function toggleMenu(menu: HTMLElement, opener: HTMLElement, render: () => void): void {
  const open = menu.classList.contains("hidden");
  closeMenus();
  if (!open) return;
  render();
  menu.classList.remove("hidden");
  opener.setAttribute("aria-expanded", "true");
}

/** Whole calendar days between `d` and today (0 = today). */
function dayBucket(d: Date): number {
  const day = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((day(new Date()) - day(d)) / 86400000);
}

function dateGroup(iso: string): string {
  const days = dayBucket(new Date(iso));
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "Previous 7 days" : "Older";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "just now", "5 min ago", "3 h ago", "yesterday", "5 Oct" (with the year when not this one). */
function ago(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  const days = dayBucket(d);
  if (days === 0) return `${Math.floor(secs / 3600)} h ago`;
  if (days === 1) return "yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

const lastActivity = (s: Session): string => s.updatedAt || s.createdAt;

function renderSessions(): void {
  historyList.replaceChildren();
  const shown = [...sessions].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
  if (shown.length === 0) {
    historyList.append(el("p", "ai-menu-state", "No saved conversations yet. Chats you start are kept here until you delete them."));
  }
  let group = "";
  let list: HTMLUListElement | undefined;
  for (const session of shown) {
    const g = dateGroup(lastActivity(session));
    if (g !== group || !list) {
      group = g;
      list = el("ul", "ai-menu-ul");
      const section = el("section");
      section.setAttribute("aria-label", g);
      section.append(el("p", "ai-menu-group", g), list);
      historyList.append(section);
    }
    list.append(renderSessionRow(session));
  }
  renderHistoryFoot();
}

/** One History row: open it, or rename / delete it in place. */
function renderSessionRow(session: Session): HTMLLIElement {
  if (renaming === session.id) {
    const field = el("input", "ai-input");
    field.type = "text";
    field.value = renameDraft;
    field.maxLength = 120;
    field.setAttribute("aria-label", "Conversation name");
    field.addEventListener("input", () => (renameDraft = field.value));
    const save = (): void => {
      const title = renameDraft.trim();
      if (title && title !== session.title) send({ type: "renameSession", sessionId: session.id, title });
      renaming = undefined;
      renderSessions();
    };
    const cancel = (): void => {
      renaming = undefined;
      renderSessions();
    };
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.stopPropagation(); // ends the rename only; the menu stays open
        cancel();
      }
    });
    requestAnimationFrame(() => {
      if (document.activeElement !== field) {
        field.focus();
        field.select();
      }
    });
    const row = el("div", "ai-edit-row");
    row.append(field, iconButton("check", "Save the name", save), iconButton("close", "Cancel renaming", cancel));
    const item = el("li", "ai-menu-edit");
    item.append(row);
    return item;
  }
  if (deleting === session.id) {
    const cancel = button("Cancel", "secondary small", () => {
      deleting = undefined;
      renderSessions();
    });
    const remove = button("Delete", "small danger-solid", () => {
      deleting = undefined;
      send({ type: "deleteSession", sessionId: session.id, confirmed: true });
    });
    requestAnimationFrame(() => cancel.focus());
    const question = el("p");
    question.append("Delete ", el("strong", undefined, `“${session.title}”`), "? Its history and findings are removed.");
    const actions = el("div", "ai-confirm-actions");
    actions.append(cancel, remove);
    const item = el("li", "ai-menu-confirm");
    item.setAttribute("role", "group");
    item.setAttribute("aria-label", `Delete ${session.title}?`);
    item.append(question, actions);
    return item;
  }
  const active = session.id === currentSessionId;
  const item = el("li", "ai-menu-item");
  if (active) item.dataset.active = "";
  const open = button("", "ai-menu-open", () => {
    closeHistory();
    if (!active) send({ type: "selectSession", sessionId: session.id });
  }, session.title);
  if (active) open.setAttribute("aria-current", "true");
  open.disabled = scanning && !active;
  open.append(el("span", "ai-menu-title", session.title), el("span", "ai-menu-meta", ago(lastActivity(session))));
  const actions = el("span", "ai-menu-actions");
  actions.append(
    iconButton("edit", `Rename “${session.title}”`, () => {
      renaming = session.id;
      renameDraft = session.title;
      deleting = undefined;
      renderSessions();
    }),
    iconButton("trash", `Delete “${session.title}”`, () => {
      deleting = session.id;
      renaming = undefined;
      renderSessions();
    }, "icon-btn danger"),
  );
  item.append(open, actions);
  return item;
}

function renderHistoryFoot(): void {
  historyFoot.replaceChildren();
  if (confirmAll && sessions.length) {
    const cancel = button("Cancel", "secondary small", () => {
      confirmAll = false;
      renderHistoryFoot();
    });
    requestAnimationFrame(() => cancel.focus());
    const actions = el("div", "ai-confirm-actions");
    actions.append(cancel, button("Delete all conversations", "small danger-solid", () => {
      confirmAll = false;
      closeMenus();
      send({ type: "deleteAllSessions" });
    }));
    const box = el("div", "ai-foot-confirm");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Delete all conversations?");
    box.append(el("p", undefined, `Delete all ${sessions.length} conversations? Their history and findings are removed.`), actions);
    historyFoot.append(box);
    return;
  }
  const all = button("Delete all", "small link-danger", () => {
    confirmAll = true;
    renderHistoryFoot();
  });
  all.disabled = sessions.length === 0 || scanning;
  historyFoot.append(el("span", undefined, "Kept until you delete them"), all);
}

// ---- model picker ------------------------------------------------------------------------

function renderModelChip(): void {
  const active = providers.find((p) => p.isActive);
  const dot = el("span", "ai-dot");
  dot.dataset.tone = active ? "success" : "warning";
  modelChip.replaceChildren(dot, el("span", "chip-label", active?.displayName ?? "Choose a model"), icon("chevron"));
  const label = active ? `${PROVIDER_LABEL[active.providerType]} · ${active.displayName}` : "";
  modelChip.title = active ? label : "Pick an LLM model";
  modelChip.setAttribute("aria-label", active ? `Active model: ${label}` : "No model selected");
  if (!modelMenu.classList.contains("hidden")) renderModelList();
  updateControls();
}

function renderModelList(): void {
  modelList.replaceChildren();
  let group = "";
  for (const provider of providers) {
    if (PROVIDER_LABEL[provider.providerType] !== group) {
      group = PROVIDER_LABEL[provider.providerType];
      modelList.append(el("div", "model-group", group));
    }
    const row = button("", "model-option", () => {
      closeMenus();
      if (!provider.isActive) send({ type: "activateProvider", providerId: provider.id });
    }, provider.modelName);
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(provider.isActive));
    row.append(icon("cube", "ico model-option-icon"), el("span", "model-option-name", provider.displayName),
      provider.isActive ? icon("check", "ico model-option-check") : el("span"));
    const item = el("div", "ai-menu-item model-item");
    item.append(row);
    // The server locks its built-in Reconix model and the active one: switch first to change it (Reconix allows editing key anytime).
    if (provider.providerType === "RECONIX") {
      const actions = el("div", "ai-menu-actions");
      actions.append(
        iconButton("edit", `Edit ${provider.displayName} API key`, () => openModelForm(provider)),
      );
      item.append(actions);
    } else if (!provider.isActive) {
      const actions = el("div", "ai-menu-actions");
      actions.append(
        iconButton("edit", `Edit ${provider.displayName}`, () => openModelForm(provider)),
        iconButton("trash", `Delete ${provider.displayName}`, () => send({ type: "deleteProvider", providerId: provider.id })),
      );
      item.append(actions);
    }
    modelList.append(item);
  }
}

// ---- model form --------------------------------------------------------------------------

/** The provider the form edits; undefined while adding a new one. */
let editingProvider: string | undefined;
/** Counts the form's openings: a status for an earlier one is dropped (it must not take this form over). */
let formId = 0;
/** This opening sent a key that a failed save threw away: say so. */
let keySent = false;

for (const type of ADDABLE_TYPES) {
  const option = el("option", undefined, PROVIDER_LABEL[type]);
  option.value = type;
  typeSelect.append(option);
}
typeSelect.addEventListener("change", () => showFieldsFor(typeSelect.value as ProviderType, undefined));

/** Only the fields a provider type uses: a base URL for Ollama and compatible APIs, a key for the rest. */
function showFieldsFor(type: ProviderType, provider: LlmProvider | undefined): void {
  const isReconix = type === "RECONIX";
  typeRow.classList.toggle("hidden", isReconix);
  nameRow.classList.toggle("hidden", isReconix);
  modelNameRow.classList.toggle("hidden", isReconix);

  const presets = PRESET_MODELS[type] ?? [];
  modelSelect.replaceChildren();

  if (presets.length > 0) {
    const promptOpt = el("option", undefined, "Select a model…");
    promptOpt.value = "";
    modelSelect.append(promptOpt);
    for (const m of presets) {
      const opt = el("option", undefined, m);
      opt.value = m;
      modelSelect.append(opt);
    }
    const customOpt = el("option", undefined, "Other (custom model name)…");
    customOpt.value = "__custom__";
    modelSelect.append(customOpt);

    modelSelect.classList.remove("hidden");
    if (provider) {
      if (presets.includes(provider.modelName)) {
        modelSelect.value = provider.modelName;
        modelNameInput.value = provider.modelName;
        modelNameInput.classList.add("hidden");
      } else {
        modelSelect.value = "__custom__";
        modelNameInput.value = provider.modelName;
        modelNameInput.classList.remove("hidden");
      }
    } else {
      // Clear the model text box on any provider change and show fresh options
      modelSelect.value = "";
      modelNameInput.value = "";
      modelNameInput.classList.add("hidden");
    }
  } else {
    modelSelect.classList.add("hidden");
    modelNameInput.classList.remove("hidden");
    modelNameInput.value = provider?.modelName ?? "";
  }

  modelNameInput.placeholder = MODEL_PLACEHOLDER[type] ?? "Model name";
  nameInput.placeholder = "Shown in the model menu (optional)";
  const fields = providerFields(type);
  const usesBaseUrl = fields.baseUrl !== "none" && !isReconix;
  baseUrlRow.classList.toggle("hidden", !usesBaseUrl);
  baseUrlInput.placeholder = type === "OLLAMA" ? "http://localhost:11434" : "https://…/v1";
  // Editing can't clear a saved base URL yet (PLAN_QUESTIONS Q19): only a new model starts without one.
  baseUrlHint.textContent = type !== "OLLAMA" ? "Required."
    : provider?.baseUrl ? "To use the server's own Ollama, add a new model without a base URL."
    : "Leave empty to use the server's own Ollama.";
  const usesKey = fields.apiKey !== "none";
  keyRow.classList.toggle("hidden", !usesKey);
  keyInput.placeholder = provider?.apiKeyLast4 ? `Saved (…${provider.apiKeyLast4})` : isReconix ? "API key (leave empty if not needed)" : fields.apiKey === "required" ? "Required" : "Optional";
  keyHint.textContent = isReconix
    ? (provider?.apiKeyLast4 ? `Saved (…${provider.apiKeyLast4}). Enter a new key or leave empty to keep.` : "Enter your API key here.")
    : provider?.apiKeyLast4 ? "Leave empty to keep the saved key." : "Only its last 4 characters are kept, until this window closes.";
}

function openModelForm(provider: LlmProvider | undefined): void {
  formId += 1;
  keySent = false;
  editingProvider = provider?.id;
  const type = provider?.providerType ?? ADDABLE_TYPES[0];
  modelFormHeading.textContent = provider?.providerType === "RECONIX"
    ? "Edit Reconix API Key"
    : provider ? `Edit ${provider.displayName}` : "Add a model";
  typeSelect.value = type;
  typeSelect.disabled = provider !== undefined; // the server can't change a provider's type
  nameInput.value = provider?.displayName ?? "";
  modelNameInput.value = provider?.modelName ?? "";
  baseUrlInput.value = provider?.baseUrl ?? "";
  keyInput.value = "";
  showFieldsFor(type, provider);
  setProviderStatus(undefined);
  testProviderButton.classList.toggle("hidden", provider === undefined);
  useProviderButton.classList.toggle("hidden", provider === undefined);
  modelForm.classList.remove("hidden");
  addModelButton.classList.add("hidden");
  if (type === "RECONIX") {
    keyInput.focus();
  } else if (!provider && !modelSelect.classList.contains("hidden")) {
    modelSelect.focus();
  } else {
    modelNameInput.focus();
  }
}

function closeModelForm(): void {
  formId += 1; // statuses still on their way belong to the closed form
  editingProvider = undefined;
  keyInput.value = "";
  modelForm.classList.add("hidden");
  addModelButton.classList.remove("hidden");
}

function saveProviderForm(): void {
  const apiKey = keyInput.value;
  // The key goes once, in this message; the field is emptied at once and never saved in the UI state.
  keyInput.value = "";
  keySent = apiKey !== "" && !keyRow.classList.contains("hidden");
  setProviderStatus({ tone: "busy", text: "Saving…" }); // and the buttons are off: no second save
  const modelName = modelNameInput.value.trim() || (modelSelect.value !== "__custom__" ? modelSelect.value : "");
  send({
    type: "saveProvider",
    formId,
    providerId: editingProvider,
    provider: {
      providerType: typeSelect.value as ProviderType,
      displayName: nameInput.value,
      modelName,
      baseUrl: baseUrlRow.classList.contains("hidden") ? undefined : baseUrlInput.value,
      apiKey: keyRow.classList.contains("hidden") || apiKey === "" ? undefined : apiKey,
    },
  });
}

function setProviderStatus(status: { tone: "busy" | "ok" | "error"; text: string } | undefined): void {
  providerStatusLine.textContent = status?.text ?? "";
  if (status) providerStatusLine.dataset.tone = status.tone;
  else delete providerStatusLine.dataset.tone;
  saveProviderButton.disabled = status?.tone === "busy";
  testProviderButton.disabled = status?.tone === "busy";
  useProviderButton.disabled = status?.tone === "busy";
}

// A click anywhere but an open menu or its button closes that menu. Clicks elsewhere in VS Code
// never reach this page; the page losing focus is the signal for those.
document.addEventListener("click", (event) => {
  const path = event.composedPath();
  for (const [menu, opener] of MENUS) {
    if (!menu.classList.contains("hidden") && !path.includes(menu) && !path.includes(opener)) closeMenu(menu, opener);
  }
  if (!mentionMenu.classList.contains("hidden") && !path.includes(mentionMenu) && !path.includes(input)) {
    closeMentionMenu();
  }
});
// Leaving the page closes the menus, but not a model form being filled in (the user may be
// copying the API key from elsewhere).
window.addEventListener("blur", () => {
  for (const [menu, opener] of MENUS) {
    if (menu === modelMenu && !modelForm.classList.contains("hidden")) continue;
    closeMenu(menu, opener);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenus();
});

// ---- chat --------------------------------------------------------------------------------

function scrollToEnd(): void {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function nearBottom(): boolean {
  return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 80;
}

function updateWelcome(): void {
  const empty = messageList.childElementCount === 0;
  welcome.classList.toggle("hidden", !empty);
  chatColumn.classList.toggle("is-fill", empty);
}

function setThinking(on: boolean): void {
  thinkingActive = on;
  thinking.classList.toggle("hidden", !on);
  if (on) scrollToEnd();
  updateSendButton();
}

/** Add a node to the conversation and keep the view at the end. */
function appendToChat(node: HTMLElement): void {
  messageList.append(node);
  updateWelcome();
  scrollToEnd();
}

/** An assistant turn: the orb, then the content. */
function assistantRow(...children: Node[]): HTMLDivElement {
  const orb = el("span", "orb");
  orb.setAttribute("aria-hidden", "true");
  const reply = el("div", "ai-reply");
  reply.append(...children);
  const row = el("div", "ai-row-assistant");
  row.append(orb, reply);
  return row;
}

function makeCopyButton(text: string): HTMLButtonElement {
  const btn = el("button", "ai-msg-action-btn");
  btn.type = "button";
  btn.title = "Copy message";
  btn.setAttribute("aria-label", "Copy message");
  btn.append(icon("copy"));
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  btn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const ok = await copyToClipboard(text);
    if (!ok) return;
    btn.classList.add("copied");
    btn.replaceChildren(icon("check"));
    btn.title = "Copied!";
    btn.setAttribute("aria-label", "Copied!");
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.classList.remove("copied");
      btn.replaceChildren(icon("copy"));
      btn.title = "Copy message";
      btn.setAttribute("aria-label", "Copy message");
    }, 1500);
  });

  return btn;
}

function makeEditButton(text: string): HTMLButtonElement {
  const btn = el("button", "ai-msg-action-btn");
  btn.type = "button";
  btn.title = "Edit message";
  btn.setAttribute("aria-label", "Edit message");
  btn.append(icon("edit"));
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    prefill(text);
  });
  return btn;
}

/** `html`: assistant markdown the host rendered; without it the text is shown as is. */
function appendMessage(role: Message["role"], text: string, html?: string): void {
  if (role === "user") {
    const row = el("div", "ai-row-user");
    const actions = el("div", "ai-user-actions");
    actions.append(makeEditButton(text), makeCopyButton(text));
    row.append(actions, el("div", "ai-bubble", text));
    appendToChat(row);
  } else if (role === "system") {
    appendToChat(el("div", "note-line", text));
  } else if (html !== undefined) {
    const body = el("div", "ai-prose");
    setRenderedMarkdown(body, html);
    appendToChat(assistantRow(body));
  } else {
    appendToChat(assistantRow(el("div", "ai-prose plain", text)));
  }
}

function appendReply(reply: ChatReply, view: MessageView): void {
  if (activeStreamRow && activeStreamBody) {
    if (view.html !== undefined) {
      activeStreamBody.classList.remove("plain");
      setRenderedMarkdown(activeStreamBody, view.html);
    } else {
      activeStreamBody.textContent = view.text;
    }
    activeStreamRow = undefined;
    activeStreamBody = undefined;
  } else {
    appendMessage(view.role, view.text, view.html);
  }
  updateSendButton();
  if (reply.actions.length === 0) return;
  const row = el("div", "reply-actions");
  for (const action of reply.actions) row.append(button(action.label, "secondary small", () => runAction(action)));
  appendToChat(row);
}

/** An error in the chat; `action`: a button running the command that fixes it (our commands only). */
function showError(text: string, action?: ConnectionAction): void {
  const notice = el("div", "ai-reason");
  notice.dataset.tone = "danger";
  notice.setAttribute("role", "alert");
  notice.append(icon("alert"), el("span", "reason-text", text));
  if (action) notice.append(button(action.label, "secondary small", () => send({ type: "runCommand", command: action.command })));
  appendToChat(notice);
  setTab("chat");
}

// ---- scan progress -----------------------------------------------------------------------

const STAGE_TEXT: Record<ScanSummary["stage"], string> = {
  COLLECTING: "Collecting files",
  ARCHIVING: "Packing files",
  UPLOADING: "Uploading files",
  SCANNING: "Scanning",
  ANALYZING: "Analyzing results",
  DONE: "Finishing",
};

const FINAL: ScanSummary["status"][] = ["COMPLETED", "CANCELLED", "FAILED"];

function renderProgress(scan: ScanSummary): void {
  const finished = FINAL.includes(scan.status);
  scanning = !finished;
  progress.classList.toggle("hidden", finished);
  const percent = Math.max(0, Math.min(100, scan.progress));
  progressBar.style.width = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", String(percent));
  const detailText = scan.detail || (scan.activeTool ? `${STAGE_TEXT[scan.stage] || scan.stage} (${scan.activeTool})…` : `${STAGE_TEXT[scan.stage] || scan.stage}…`);
  const countsTotal = Object.values(scan.counts || {}).reduce((a, b) => a + b, 0);
  const countBadge = countsTotal > 0 ? ` · ${countsTotal} findings` : "";

  progressText.textContent = scan.status === "WAITING_APPROVAL"
    ? "Waiting for approval…"
    : `${percent}% · ${detailText}${countBadge}`;
  if (!finished) stopButton.disabled = false;
  updateControls();
}

// ---- scan summary card (as in the reference) ---------------------------------------------

const SEVERITY_WORD: Record<Severity, string> = {
  CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low", UNKNOWN: "unrated", NONE: "info",
};

/** Open the Findings tab on one finding, expanded. */
function showFinding(id: string): void {
  setTab("findings");
  ui.query = "";
  search.value = "";
  expanded.add(id);
  saveUi();
  renderFindings();
  findingsList.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" });
}

/** Open the Findings tab filtered to one file. */
function showFile(path: string): void {
  setTab("findings");
  ui.query = path;
  search.value = path;
  saveUi();
  renderFindings();
}

/** "(hidden)" only when every false alarm is hidden; core's rule keeps serious ones and secrets in sight. */
function hiddenNote(hidden: number, falseAlarms: number): string {
  return hidden >= falseAlarms ? " (hidden)" : ` (${hidden} hidden)`;
}

function renderSummaryCard(card: SummaryCard, hidden: number, error?: string): void {
  const root = el("div", "summary-card");
  const sub = card.total === 0 ? "No problems found."
    : card.likelyReal === undefined || card.falseAlarms === undefined ? ""
    : card.falseAlarms === card.total ? `All look like false alarms${hidden ? hiddenNote(hidden, card.falseAlarms) : ""}.`
    : `${card.likelyReal} likely real${card.falseAlarms ? ` · ${card.falseAlarms} false alarm${card.falseAlarms === 1 ? "" : "s"}${hidden ? hiddenNote(hidden, card.falseAlarms) : ""}` : ""}`;
  const titleBox = el("div");
  titleBox.append(el("div", `sc-title${card.total ? "" : " clean"}`, card.total ? "Scan complete" : "✓ No findings"), el("div", "sc-sub", sub));
  const totalBox = el("div", "sc-total");
  totalBox.append(el("strong", undefined, String(card.total)), el("span", undefined, card.total === 1 ? "finding" : "findings"));
  const head = el("div", "sc-head");
  head.append(titleBox, totalBox);
  root.append(head);

  if (card.total) {
    const bar = el("div", "sc-bar");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", SEVERITIES.filter((s) => card.counts[s]).map((s) => `${card.counts[s]} ${SEVERITY_WORD[s]}`).join(", "));
    const legend = el("div", "sc-legend");
    for (const s of SEVERITIES) {
      const n = card.counts[s];
      if (!n) continue;
      const seg = el("span", `sev-${s.toLowerCase()}`);
      seg.style.flexGrow = String(n);
      bar.append(seg);
      const chip = el("span", `sc-chip sev-${s.toLowerCase()}`);
      chip.append(el("span", "sev-dot"), `${n} ${SEVERITY_WORD[s]}`);
      legend.append(chip);
    }
    root.append(bar, legend);
  }

  const section = (label: string, ...children: Node[]): void => {
    const box = el("div", "sc-section");
    box.append(el("div", "sc-label", label), ...children);
    root.append(box);
  };
  if (card.overall) section("Overall", el("div", "sc-overall", card.overall.replace(/`/g, "")));
  if (card.fixFirst.length) {
    const list = el("ol", "sc-fix");
    card.fixFirst.forEach((item, i) => {
      const id = item.findingIds[0];
      const label = item.text ?? findings.find((f) => f.id === id)?.title ?? "A finding to fix";
      const text = id ? button(label, "sc-fix-text", () => showFinding(id), "Show this finding") : el("span", "sc-fix-text", label);
      const li = el("li");
      li.append(el("span", "sc-num", String(i + 1)), text);
      const manual = id ? findings.find((f) => f.id === id)?.manualFix : undefined;
      if (manual) {
        const tag = el("span", "manual", "manual fix");
        tag.title = manual;
        li.append(tag);
      } else if (id) {
        li.append(button("Fix", "secondary small", () => {
          setTab("chat");
          runAction({ kind: "fixFindings", label: "Fix", findingIds: item.findingIds });
        }, "Let the fix agent fix this"));
      }
      list.append(li);
    });
    section("Fix first", list);
  }
  if (card.files.length) {
    const files = el("div", "sc-files");
    for (const f of card.files) {
      const { dir, name } = splitPath(f.path);
      const row = button("", "sc-file", () => showFile(f.path), `Show the findings in ${f.path}`);
      row.append(el("span", "sc-file-name", name), dirLabel("sc-file-dir", dir), el("span", "count", String(f.count)));
      files.append(row);
    }
    section("Most affected", files);
  }
  if (error) root.append(el("div", "sc-warn", `Some steps had problems: ${error}`));

  const actions = el("div", "sc-actions");
  if (fixableCount() > 0) {
    actions.append(button("Fix all", "small", () => sendText("Fix all findings"),
      "Let the fix agent fix every finding that is not a likely false alarm"));
  }
  if (card.total) actions.append(button("View findings", "secondary small", () => setTab("findings")));
  if (actions.childElementCount) root.append(actions);

  appendToChat(assistantRow(root));
}

// ---- fix agent transcript ----------------------------------------------------------------

interface AgentBlock {
  root: HTMLDetailsElement;
  title: HTMLSpanElement;
  body: HTMLDivElement;
  files: Map<string, HTMLDivElement>;
}

const agentBlocks = new Map<string, AgentBlock>();

function agentStart(id: string, title: string): void {
  const root = el("details", "agent running");
  root.open = true;
  const summary = el("summary", "agent-head");
  const titleEl = el("span", "agent-title", title);
  const spinner = el("span", "spinner");
  spinner.setAttribute("aria-hidden", "true");
  summary.append(spinner, titleEl);
  const body = el("div", "agent-body");
  root.append(summary, body);
  agentBlocks.set(id, { root, title: titleEl, body, files: new Map() });
  appendToChat(assistantRow(root));
}

/** Streamed text grows the last line of its kind; everything else is a new line. */
function agentEvent(id: string, event: AgentEvent): void {
  const block = agentBlocks.get(id);
  if (!block) return;
  const follow = nearBottom();
  let section: HTMLDivElement = block.body;
  if (event.file) {
    let fileSection = block.files.get(event.file);
    if (!fileSection) {
      fileSection = el("div", "agent-file");
      fileSection.append(el("div", "agent-file-name", event.file));
      block.files.set(event.file, fileSection);
      block.body.append(fileSection);
    }
    section = fileSection;
  }
  if (event.kind === "start") {
    if (event.text) section.querySelector(".agent-file-name")?.append(el("span", "agent-dim", ` · ${event.text}`));
  } else if (event.kind === "text" || event.kind === "thinking") {
    const last = section.lastElementChild;
    const line = last instanceof HTMLDivElement && last.classList.contains(`agent-${event.kind}`)
      ? last
      : section.appendChild(el("div", `agent-${event.kind}`));
    line.textContent += event.text;
    line.scrollTop = line.scrollHeight; // thinking scrolls inside its own box
  } else if (event.kind === "tool") {
    const line = el("div", "agent-tool");
    line.append(el("span", "agent-bullet", "●"), event.text);
    section.append(line);
  } else if (event.kind === "result") {
    section.append(el("div", `agent-result${event.text.startsWith("Error") ? " error" : ""}`, `⎿ ${event.text}`));
  } else if (event.kind === "done") {
    section.classList.add("done");
    block.title.dataset.progress = event.text;
  } else if (event.kind === "status") {
    section.append(el("div", "agent-status", event.text));
  }
  if (follow) scrollToEnd();
}

function agentEnd(id: string, title: string): void {
  const block = agentBlocks.get(id);
  if (!block) return;
  block.root.classList.remove("running");
  block.root.querySelector(".spinner")?.remove();
  block.title.textContent = title;
  agentBlocks.delete(id);
}

// ---- yes/no questions --------------------------------------------------------------------

function showConfirm(id: string, yes: string, no: string): void {
  const row = el("div", "confirm");
  const answer = (accept: boolean): void => {
    row.querySelectorAll("button").forEach((b) => (b.disabled = true));
    send({ type: "answerConfirm", id, accept });
    confirms.delete(id);
    updateSendButton();
  };
  row.append(button(yes, "small", () => answer(true)), button(no, "secondary small", () => answer(false)));
  confirms.set(id, row);
  appendToChat(row);
  updateSendButton();
}

function confirmDone(id: string): void {
  const row = confirms.get(id);
  if (row) {
    row.querySelectorAll("button").forEach((b) => (b.disabled = true));
    confirms.delete(id);
  }
  updateSendButton();
}

// ---- findings tab ------------------------------------------------------------------------

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN", "NONE"];
const BADGE: Record<Severity, string> = { CRITICAL: "CRIT", HIGH: "HIGH", MEDIUM: "MED", LOW: "LOW", UNKNOWN: "UNK", NONE: "NONE" };
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  CONFIRMED: { label: "Confirmed", cls: "real" },
  LIKELY_TRUE_POSITIVE: { label: "Likely real", cls: "real" },
  LIKELY_FALSE_POSITIVE: { label: "Likely false alarm", cls: "fp" },
  UNVERIFIED: { label: "Unsure", cls: "unsure" },
};

function cap(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", name: p } : { dir: p.slice(0, i), name: p.slice(i + 1) };
}

/** The folder part of a path, clipped from the left (rtl) while the slashes stay in order (ltr). */
function dirLabel(className: string, dir: string): HTMLSpanElement {
  const outer = el("span", className);
  const inner = el("span", undefined, dir);
  inner.dir = "ltr";
  outer.append(inner);
  return outer;
}

function matches(f: FindingView, query: string): boolean {
  if (!query) return true;
  const hay = `${f.title} ${f.path} ${f.ruleIds.join(" ")} ${(f.cwe ?? []).join(" ")} ${f.message} ${f.tools.join(" ")}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

function showThemLink(): HTMLButtonElement {
  return button("Show them", "link", () => send({ type: "showFalsePositives", on: true }));
}

function renderFindings(): void {
  const total = findings.length;
  findingsTab.replaceChildren(icon("search"), el("span", undefined, "Findings"), el("span", "count", String(total)));
  updateControls();

  chips.replaceChildren();
  for (const severity of SEVERITIES) {
    const n = findings.filter((f) => f.severity === severity).length;
    if (!n) continue;
    const off = ui.hiddenSeverities.includes(severity);
    const chip = button("", `chip sev-${severity.toLowerCase()}${off ? " off" : ""}`, () => {
      ui.hiddenSeverities = off ? ui.hiddenSeverities.filter((s) => s !== severity) : [...ui.hiddenSeverities, severity];
      saveUi();
      renderFindings();
    }, `${off ? "Show" : "Hide"} ${severity.toLowerCase()} findings`);
    chip.setAttribute("aria-pressed", String(!off));
    chip.append(el("span", "chip-dot"), `${cap(severity)} `, el("strong", undefined, String(n)));
    chips.append(chip);
  }

  const shown = findings.filter((f) => !ui.hiddenSeverities.includes(f.severity) && matches(f, ui.query));
  const notes: string[] = [];
  if (shown.length !== total) notes.push(`Showing ${shown.length} of ${total}.`);
  if (hiddenFalsePositives && total) {
    notes.push(`${hiddenFalsePositives} likely false alarm${hiddenFalsePositives === 1 ? "" : "s"} hidden.`);
  }
  findingsNote.replaceChildren(notes.join(" "));
  if (hiddenFalsePositives && total) findingsNote.append(" ", showThemLink());
  findingsNote.classList.toggle("hidden", notes.length === 0);

  findingsEmpty.replaceChildren(
    total
      ? "No findings match the filter."
      : hiddenFalsePositives
        ? `No real problems found. ${hiddenFalsePositives} likely false alarm${hiddenFalsePositives === 1 ? " is" : "s are"} hidden. `
        : "No findings yet. Ask me to scan this project in the Chat tab.",
  );
  if (!total && hiddenFalsePositives) findingsEmpty.append(showThemLink());
  findingsEmpty.classList.toggle("hidden", shown.length > 0);

  findingsList.replaceChildren();
  for (const severity of SEVERITIES) {
    const group = shown.filter((f) => f.severity === severity);
    if (!group.length) continue;
    const collapsed = ui.collapsed.includes(severity);
    const groupHeader = button("", `group-header sev-${severity.toLowerCase()}`, () => {
      ui.collapsed = collapsed ? ui.collapsed.filter((s) => s !== severity) : [...ui.collapsed, severity];
      saveUi();
      renderFindings();
    });
    groupHeader.setAttribute("aria-expanded", String(!collapsed));
    groupHeader.append(el("span", "chevron", collapsed ? "▸" : "▾"), el("span", "sev-dot"),
      el("span", "group-title", cap(severity)), el("span", "count", String(group.length)));
    const section = el("section", "group");
    section.append(groupHeader);
    if (!collapsed) {
      let lastPath = "";
      for (const f of group) {
        if (f.path !== lastPath) {
          const { dir, name } = splitPath(f.path);
          const fileHeader = el("div", "file-header");
          fileHeader.title = f.path;
          fileHeader.append(el("span", "file-name", name), dirLabel("file-dir", dir),
            el("span", "count", String(group.filter((x) => x.path === f.path).length)));
          section.append(fileHeader);
          lastPath = f.path;
        }
        section.append(renderFinding(f));
      }
    }
    findingsList.append(section);
  }
}

// The finding the user just opened: only its details fade in, not every open one on a re-render.
let justOpened: string | undefined;

function renderFinding(f: FindingView): HTMLDivElement {
  const verdict = VERDICT[f.verdict];
  const isOpen = expanded.has(f.id);
  const row = el("div", `finding sev-${f.severity.toLowerCase()}${isOpen ? " open" : ""}`);
  row.dataset.id = f.id;
  const head = button("", "finding-head", () => {
    if (expanded.has(f.id)) expanded.delete(f.id);
    else {
      expanded.add(f.id);
      justOpened = f.id;
    }
    renderFindings();
    justOpened = undefined;
  }, f.title);
  head.setAttribute("aria-expanded", String(isOpen));
  const meta = el("span", "finding-meta");
  meta.append(
    el("span", "loc", `${splitPath(f.path).name}${f.line !== undefined ? `:${f.line}` : ""}`),
    el("span", `verdict ${verdict.cls}`, verdict.label),
    el("span", "tools", f.tools.join(" + ")),
  );
  if (f.outdated) {
    const tag = el("span", "outdated", "file changed");
    tag.title = "This file changed since the scan";
    meta.append(tag);
  }
  if (f.manualFix) {
    const tag = el("span", "manual", "manual fix");
    tag.title = f.manualFix;
    meta.append(tag);
  }
  const main = el("span", "finding-main");
  main.append(el("span", "finding-title", f.title), meta);
  head.append(el("span", `badge sev-${f.severity.toLowerCase()}`, BADGE[f.severity]), main);
  row.append(head);
  if (isOpen) row.append(renderDetails(f, f.id === justOpened));
  return row;
}

function renderDetails(f: FindingView, animate: boolean): HTMLDivElement {
  const card = el("div", animate ? "details enter" : "details");
  if (f.outdated) {
    card.append(el("div", "callout warn", "This file changed since the scan. The line may have moved. Click Rescan to update."));
  }
  const section = (label: string, html: string | undefined, fallback?: string): void => {
    if (!html && !fallback) return;
    const body = el("div", "body");
    if (html) setRenderedMarkdown(body, html);
    else body.textContent = fallback ?? "";
    card.append(el("div", "label", label), body);
  };
  section("What's wrong", f.explanationHtml, f.message);
  section("How to fix", f.fixRecommendationHtml);
  if (f.manualFix) {
    const note = el("div", "callout manual");
    note.append(el("strong", undefined, "Needs a manual fix. "), f.manualFix);
    card.append(note);
  }

  const actions = el("div", "detail-actions");
  actions.append(button("Open", "small", () => send({ type: "openFinding", findingId: f.id }), "Open in the editor"));
  // Only a finding the agent can fix gets Fix; the others say why above.
  if (!f.manualFix) {
    actions.append(button("Fix", "secondary small", () => {
      setTab("chat");
      runAction({ kind: "fixFindings", label: "Fix", findingIds: [f.id] });
    }, "Let the assistant fix this in your code. You see the change before it is applied."));
  }
  actions.append(
    button("Ask in chat", "secondary small", () => {
      setTab("chat");
      sendText(`Explain finding ${f.id} (${f.title} in ${f.path}:${f.line ?? 1}) and how to fix it.`);
    }),
  );
  card.append(actions);

  const facts = el("div", "facts");
  const lines = f.line === undefined ? "" : `Lines ${f.line}${f.endLine && f.endLine !== f.line ? `–${f.endLine}` : ""}`;
  facts.append(el("span", undefined, f.path));
  if (lines) facts.append(el("span", undefined, lines));
  for (const rule of f.ruleIds) facts.append(el("span", undefined, rule));
  for (const cwe of f.cwe ?? []) facts.append(el("span", undefined, cwe));
  card.append(facts);
  return card;
}

// ---- events ------------------------------------------------------------------------------

function sendText(text: string): void {
  if (confirms.size > 0 || thinkingActive || scanning || activeStreamRow !== undefined) return;
  appendMessage("user", text);
  setThinking(true);
  send({ type: "send", text });
}

function sendChat(): void {
  if (confirms.size > 0 || thinkingActive || scanning || activeStreamRow !== undefined) return;
  const text = input.value.trim();
  if (text === "" || sendButton.disabled) return;
  closeMentionMenu();
  input.value = "";
  autoGrow();
  sendText(text);
  input.focus();
}

input.addEventListener("keydown", (event) => {
  if (!mentionMenu.classList.contains("hidden") && mentionMatches.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionIndex = (mentionIndex + 1) % mentionMatches.length;
      updateMentionSelection();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionIndex = (mentionIndex - 1 + mentionMatches.length) % mentionMatches.length;
      updateMentionSelection();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      applyMention(mentionMatches[mentionIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionMenu();
      return;
    }
  }

  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (confirms.size > 0) {
      const lastConfirm = [...confirms.values()][confirms.size - 1];
      lastConfirm?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      lastConfirm?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    if (thinkingActive || scanning || activeStreamRow !== undefined) return;
    sendChat();
  }
});
historyButton.addEventListener("click", () => toggleMenu(historyMenu, historyButton, renderSessions));
modelChip.addEventListener("click", () => toggleMenu(modelMenu, modelChip, renderModelList));
chatTab.addEventListener("click", () => setTab("chat"));
findingsTab.addEventListener("click", () => setTab("findings"));
search.value = ui.query;
search.addEventListener("input", () => {
  ui.query = search.value.trim();
  saveUi();
  renderFindings();
});

window.addEventListener("message", (event: MessageEvent<HostToWebview>) => {
  const message = event.data;
  // Anything the host sends back answers the message the dots are waiting on.
  if (message.type !== "findings" && message.type !== "models" && message.type !== "sessions") setThinking(false);
  switch (message.type) {
    case "state":
      setConnection(message.connection);
      sessions = message.sessions;
      currentSessionId = message.currentSessionId;
      if (!historyMenu.classList.contains("hidden")) renderSessions();
      messageList.replaceChildren();
      scanning = false;
      thinkingActive = false;
      activeStreamRow = undefined;
      activeStreamBody = undefined;
      closeMentionMenu();
      confirms.clear();
      progress.classList.add("hidden");
      findings = [];
      hiddenFalsePositives = 0;
      renderFindings();
      for (const m of message.messages) appendMessage(m.role, m.text, m.html);
      updateWelcome();
      updateSendButton();
      return;
    case "chatPiece":
      appendChatPiece(message.text);
      return;
    case "connection":
      setConnection(message.connection);
      updateControls();
      return;
    case "chat":
      appendReply(message.reply, message.message);
      return;
    case "showTab":
      setTab(message.tab);
      return;
    case "ask":
      setTab("chat");
      sendText(message.text);
      return;
    case "sessions":
      sessions = message.sessions;
      currentSessionId = message.currentSessionId;
      if (!historyMenu.classList.contains("hidden")) renderSessions();
      return;
    case "models":
      providers = message.providers;
      renderModelChip();
      return;
    case "providerStatus": {
      // Only for this opening of the form, and for the provider it adds or edits.
      if (message.formId !== formId || modelForm.classList.contains("hidden")) return;
      if (editingProvider !== undefined && message.providerId !== undefined && message.providerId !== editingProvider) return;
      // A new provider is saved: the form now edits it (Test works, a second Save updates it).
      if (editingProvider === undefined && message.providerId) {
        editingProvider = message.providerId;
        testProviderButton.classList.remove("hidden");
        useProviderButton.classList.remove("hidden");
      }
      // The saved provider as the server has it now: heading, locked type, key hint.
      const saved = providers.find((p) => p.id === editingProvider);
      if (saved) {
        modelFormHeading.textContent = `Edit ${saved.displayName}`;
        typeSelect.disabled = true;
        showFieldsFor(saved.providerType, saved);
      }
      const retype = message.tone === "error" && !message.providerId && keySent ? " Enter the API key again." : "";
      setProviderStatus({ tone: message.tone, text: message.text + retype });
      return;
    }
    case "progress":
      renderProgress(message.scan);
      return;
    case "changedFiles":
      changedFiles = message.count;
      updateControls();
      return;
    case "findings":
      findings = message.findings;
      hiddenFalsePositives = message.hiddenFalsePositives;
      for (const id of [...expanded]) if (!findings.some((f) => f.id === id)) expanded.delete(id);
      renderFindings();
      return;
    case "agentStart":
      agentStart(message.id, message.title);
      return;
    case "agentEvent":
      agentEvent(message.id, message.event);
      return;
    case "agentEnd":
      agentEnd(message.id, message.title);
      return;
    case "confirm":
      showConfirm(message.id, message.yes, message.no);
      return;
    case "confirmDone":
      confirmDone(message.id);
      return;
    case "error":
      showError(message.message, message.action);
      return;
    case "summary":
      renderSummaryCard(message.summary.card, message.hidden, message.error);
      return;
  }
});

setTab(ui.tab);
updateWelcome();
renderFindings();
renderModelChip();
send({ type: "ready" });
input.focus();
