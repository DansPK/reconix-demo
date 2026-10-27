// The chat panel UI. It talks only to the extension, through postMessage.

import MarkdownIt from "markdown-it";
import type { ActiveModel, AgentEvent, ChatMessage, ProviderInfo, SessionInfo, SummaryCard } from "../src/shared/contract";
import type { ConnectionStatus, FindingView, ToExtension, ToWebview } from "../src/shared/messages";

interface UiState {
  tab: "chat" | "findings";
  severities: string[]; // severities hidden by the filter chips
  query: string;
  collapsed: string[]; // collapsed severity groups
}

declare function acquireVsCodeApi(): {
  postMessage(msg: ToExtension): void;
  getState(): UiState | undefined;
  setState(s: UiState): void;
};
const vscode = acquireVsCodeApi();
const send = (msg: ToExtension) => vscode.postMessage(msg);
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const BADGE: Record<string, string> = { critical: "CRIT", high: "HIGH", medium: "MED", low: "LOW", info: "INFO" };
const VERDICT: Record<string, { label: string; cls: string }> = {
  likely_real: { label: "Likely real", cls: "real" },
  likely_false_positive: { label: "Likely false alarm", cls: "fp" },
  unsure: { label: "Unsure", cls: "unsure" },
};

const ui: UiState = { tab: "chat", severities: [], query: "", collapsed: [], ...(vscode.getState() ?? {}) };
const saveUi = () => vscode.setState(ui);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {},
                                                   ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function button(label: string, cls: string, onClick: () => void, title = label) {
  const b = el("button", { class: cls, title, text: label });
  b.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return b;
}

// Inline feather-style icons (24x24, currentColor). Values are trusted static markup.
const ICONS: Record<string, string> = {
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4l2 2-2 2 2 2-3 3-2-2-1.15 1.15"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.6 1.6L21 17l-1.4.4L19 19l-.6-1.6L17 17l1.4-.4z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  play: '<path fill="currentColor" stroke="none" d="M6 4l14 8-14 8z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12l8.73-5.04M12 22V12"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const SVG_NS = "http://www.w3.org/2000/svg";
function icon(name: keyof typeof ICONS | string, cls = "ico"): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}
function iconBtn(name: string, title: string, onClick: () => void, cls = "icon-btn"): HTMLButtonElement {
  const b = el("button", { class: cls, title, "aria-label": title });
  b.append(icon(name));
  b.onclick = (e) => { e.stopPropagation(); onClick(); };
  return b;
}

// --- layout ---


// header row 1: orb + name, then History and new chat (the model chip lives in the composer;
// the server token is set from VS Code Settings → "Reconix: Token", or the "Reconix: Set Token" command)
const modelPill = el("button", { class: "ai-chip model-chip", "aria-expanded": "false", "aria-controls": "model-panel",
                                 "aria-haspopup": "true" });
const historyBtn = el("button", { class: "ai-btn", title: "Sessions", "aria-expanded": "false", "aria-haspopup": "true",
                                  "aria-controls": "history-menu" },
  icon("history"), el("span", { class: "history-label", text: "History" }), icon("chevron", "ico caret"));
const newBtn = iconBtn("edit", "New chat", () => send({ type: "newSession" }));
// header row 2: Chat / Findings, the session name, Rescan
const chatTab = el("button", { class: "tab", role: "tab" }, icon("chat"), el("span", { text: "Chat" }));
const findingsTab = el("button", { class: "tab", role: "tab" });
const tabs = el("div", { class: "tabs", role: "tablist" }, chatTab, findingsTab);
const rescanLabel = el("span", { text: "Rescan" });
const rescanBtn = el("button", { class: "ai-btn ai-btn-outline small rescan", title: "Rescan" }, icon("refresh"), rescanLabel);
const header = el("div", { class: "ai-header" },
  el("div", { class: "ai-brand" }, el("span", { class: "orb", "aria-hidden": "true" }),
    el("span", { class: "ai-title", text: "Reconix Code Scanner" })),
  el("div", { class: "ai-tools" }, historyBtn, newBtn),
  el("div", { class: "ai-context" }, tabs, el("div", { class: "spacer" }), rescanBtn));

// History: the conversations menu, as in the Reconix web assistant (components/assistant/
// conversation-menu.tsx): grouped by day, rename and delete inside the row, "Delete all" in the foot.
const historyList = el("div", { class: "ai-menu-list" });
const historyFoot = el("div", { class: "ai-menu-foot" });
const historyMenu = el("div", { class: "ai-menu hidden", id: "history-menu", role: "dialog", "aria-label": "Conversation history" },
  el("div", { class: "ai-menu-head" }, el("span", { class: "ai-menu-heading", text: "Conversations" }),
    iconBtn("close", "Close the history", () => { closeMenus(); historyBtn.focus(); })),
  historyList, historyFoot);
let renaming: string | null = null;
let renameDraft = ""; // kept across re-renders, which happen on every state update
let deleting: string | null = null; // the row asking "Delete …?"
let confirmAll = false; // the foot asking "Delete all …?"

// model picker: the chip in the composer opens this menu upward, like Claude / ChatGPT.
// Top: one-click list of models on reachable providers. Below: the provider setup form, folded.
const modelList = el("div", { class: "ai-menu-list model-list", role: "listbox", "aria-label": "Models" });
const setupToggle = el("button", { class: "model-setup-toggle", "aria-expanded": "false", "aria-controls": "model-setup" },
  icon("gear"), el("span", { text: "Add or configure a provider" }), icon("chevron", "ico caret"));
// Provider is a single dropdown; the selected provider reveals only the fields it needs (key, base URL, model).
const providerSelect = el("select", { class: "provider-select", "aria-label": "LLM provider" }) as HTMLSelectElement;
// Reconix's model comes from the server's .env: explained here instead of a form that can't change it
const reconixNote = el("div", { class: "model-note" });
const modelSelect = el("select", { "aria-label": "LLM model" });
const modelInput = el("input", { type: "text", class: "model-input hidden", placeholder: "model name",
                                 "aria-label": "Model name" });
const baseInput = el("input", { type: "text", class: "model-input base-input", placeholder: "Base URL",
                                "aria-label": "Base URL" });
// The API key is typed inline (masked password field) and saved when you Test the connection.
const keyInput = el("input", { type: "password", class: "key-input", placeholder: "API key",
  "aria-label": "API key", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
const keyRow = el("div", { class: "model-field" }, el("span", { text: "API key" }),
  el("div", { class: "key-row" }, icon("key"), keyInput));
const testBtn = el("button", { class: "secondary small", text: "Test" });
const activateBtn = el("button", { class: "small", text: "Activate" });
const pickerStatus = el("div", { class: "picker-status", role: "status", "aria-live": "polite" });
const field = (label: string, ...children: Node[]) => el("label", { class: "model-field" }, el("span", { text: label }), ...children);
const baseRow = field("Base URL", baseInput);
const modelFieldRow = field("Model", modelSelect, modelInput);
const modelSetup = el("div", { class: "model-body hidden", id: "model-setup" },
  el("div", { class: "model-field" }, el("span", { text: "Provider" }), providerSelect), reconixNote,
  baseRow, modelFieldRow, keyRow,
  pickerStatus, el("div", { class: "model-row" }, testBtn, activateBtn));
const modelPanel = el("div", { class: "ai-menu model-menu hidden", id: "model-panel", role: "group",
                               "aria-label": "LLM model settings" },
  el("div", { class: "ai-menu-head" }, el("span", { class: "ai-menu-heading", text: "Choose a model" }),
    iconBtn("close", "Close", () => closeMenus())),
  modelList, setupToggle, modelSetup);
header.append(historyMenu);

let setupChosen = false; // once the user folds/unfolds the setup form, stop opening it automatically
function setSetupOpen(open: boolean) {
  setupToggle.setAttribute("aria-expanded", String(open));
  modelSetup.classList.toggle("hidden", !open);
}

const MENUS = [[historyMenu, historyBtn], [modelPanel, modelPill]] as const;

function closeMenu(menu: HTMLElement, btn: HTMLElement) {
  menu.classList.add("hidden");
  btn.setAttribute("aria-expanded", "false");
  if (menu === historyMenu) {
    renaming = deleting = null;
    confirmAll = false;
  }
}
function closeMenus() {
  for (const [menu, btn] of MENUS) closeMenu(menu, btn);
}
function toggleMenu(menu: HTMLElement, btn: HTMLElement) {
  const open = menu.classList.contains("hidden");
  closeMenus();
  if (!open) return;
  menu.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
}
// A click anywhere but an open menu or its own button closes that menu (the rest of the header,
// e.g. the tabs or Rescan, counts as outside too).
document.addEventListener("click", (e) => {
  // composedPath, not target.contains: a control that re-renders on click (the provider toggles)
  // is already detached here, and would otherwise count as a click outside.
  const path = e.composedPath();
  for (const [menu, btn] of MENUS) {
    if (!menu.classList.contains("hidden") && !path.includes(menu) && !path.includes(btn)) closeMenu(menu, btn);
  }
});
// Clicks in the editor or elsewhere in VS Code never reach this page; the page losing focus is
// the signal. Only History closes then: the model menu stays open while VS Code's own key box is up.
window.addEventListener("blur", () => closeMenu(historyMenu, historyBtn));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !renaming) closeMenus();
});

const stopBtn = el("button", { class: "secondary small", title: "Stop the scan", text: "Stop" });
const progress = el("div", { class: "progress hidden" });
const progressBar = el("div", { class: "bar" });
const progressText = el("div", { class: "progress-text" });
progress.append(el("div", { class: "progress-row" }, progressText, stopBtn), el("div", { class: "track" }, progressBar));

// chat panel: a scrolling column (welcome, messages, typing dots) above the composer
const messages = el("div", { class: "messages", role: "log", "aria-live": "polite" });
const thinking = el("div", { class: "ai-row-assistant thinking hidden" },
  el("span", { class: "orb", "data-live": "", "aria-hidden": "true" }),
  el("div", { class: "ai-typing", role: "status", "aria-label": "Thinking" }, el("span"), el("span"), el("span")));
const input = el("textarea", { rows: "1", placeholder: "Ask anything, or tell me what to scan…",
                               "aria-label": "Message" });
const sendBtn = el("button", { class: "ai-send", title: "Send", "aria-label": "Send" }, icon("arrowUp"));
// connection problems sit just above the composer
const status = el("div", { class: "ai-reason hidden", role: "status" });
// the model menu sits in a wrapper around the message box, so it lines up with the box and opens just above it
const composer = el("div", { class: "ai-column ai-composer-area" }, status,
  el("div", { class: "ai-composer-wrap" },
    el("div", { class: "ai-composer" }, input,
      el("div", { class: "ai-composer-bar" }, modelPill,
        el("span", { class: "ai-composer-hint", text: "Enter to send · Shift+Enter for new line" }), sendBtn)),
    modelPanel),
  el("div", { class: "ai-footnote", text: "Scans run on your harness. Fixes are shown as a diff before anything changes." }));

// Shown while the chat is empty: action cards. Each either sends a message or seeds the input box.
interface Example { icon: string; title: string; desc: string; text?: string; prefill?: string }
const EXAMPLES: Example[] = [
  { icon: "folder", title: "Scan this project", desc: "Scan the current workspace for vulnerabilities", text: "Scan this project" },
  { icon: "file", title: "Scan the current file", desc: "Focus on the active file", text: "Scan the current file" },
  { icon: "github", title: "Scan a GitHub repo", desc: "Scan from a GitHub URL", prefill: "Scan https://github.com/" },
  { icon: "alert", title: "Most serious problems", desc: "Show the top critical issues", text: "What are the most serious problems?" },
  { icon: "list", title: "Summarize all findings", desc: "Get a clear summary", text: "Summarize all findings" },
  { icon: "wrench", title: "Fix all high findings", desc: "Suggest and apply fixes", text: "Fix all high findings" },
  { icon: "refresh", title: "Scan again from scratch", desc: "Run a full rescan", text: "Scan everything again from scratch" },
  { icon: "gear", title: "Custom scan", desc: "Tell me what to scan and how", prefill: "" },
];
const exampleList = el("div", { class: "ai-prompts" });
const welcome = el("div", { class: "ai-welcome" },
  el("div", { class: "ai-globe", "aria-hidden": "true" }),
  el("h2", { class: "ai-welcome-title", text: "How can I help with your code?" }),
  el("p", { class: "ai-welcome-sub",
            text: "I can scan your workspace, a folder or a GitHub repo, explain the findings and fix them. You review every change before it is applied." }),
  exampleList);
for (const ex of EXAMPLES) {
  const card = el("button", { class: "ai-prompt", title: ex.title },
    el("span", { class: "ai-prompt-icon" }, icon(ex.icon)),
    el("span", { class: "ai-prompt-body" },
      el("div", { class: "ai-prompt-title", text: ex.title }),
      el("div", { class: "ai-prompt-detail", text: ex.desc })));
  card.onclick = () => {
    if (ex.text !== undefined) send({ type: "send", text: ex.text });
    else {
      input.value = ex.prefill ?? "";
      autoGrow();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };
  exampleList.append(card);
}
const chatColumn = el("div", { class: "ai-column is-fill" }, welcome, messages, thinking);
const chatScroll = el("div", { class: "ai-scroll" }, chatColumn);
const chatPanel = el("div", { class: "panel chat-panel" }, chatScroll, composer);
const toBottom = () => { chatScroll.scrollTop = chatScroll.scrollHeight; };

// findings panel
const chips = el("div", { class: "chips" });
const search = el("input", { type: "search", class: "search", placeholder: "Search",
                             "aria-label": "Filter findings" });
const findingsNote = el("div", { class: "note" });
const findingsList = el("div", { class: "findings" });
const findingsEmpty = el("div", { class: "empty" });
const summarizeBtn = el("button", { class: "secondary small", title: "Ask the assistant for a summary of all findings",
                                    text: "Summarize" });
const fixAllBtn = el("button", { class: "small",
                                title: "Fix every finding that is not a likely false alarm. You review the changes before they are applied.",
                                text: "Fix all" });
const findingsPanel = el("div", { class: "panel findings-panel" },
  el("div", { class: "ai-scroll" }, el("div", { class: "ai-column" },
    el("div", { class: "filters" }, el("div", { class: "filter-row" }, chips, summarizeBtn, fixAllBtn), search),
    findingsNote, findingsList, findingsEmpty)));

document.getElementById("app")!.append(header, progress, chatPanel, findingsPanel);

// grow the composer textarea with its content, up to a cap
function autoGrow() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}
input.addEventListener("input", autoGrow);

// --- state ---

let sessions: SessionInfo[] = [];
let current: string | null = null;
let scanning = false;
let changedFiles = 0;
let connected = false;
let findings: FindingView[] = [];
let hiddenFalsePositives = 0;
const expanded = new Set<string>();
let providers: ProviderInfo[] = [];
let activeModel: ActiveModel | null = null;
let viewedProvider: string | null = null; // which provider the panel is configuring (transient UI)

function setTab(tab: UiState["tab"]) {
  ui.tab = tab;
  saveUi();
  chatTab.classList.toggle("active", tab === "chat");
  findingsTab.classList.toggle("active", tab === "findings");
  chatTab.setAttribute("aria-selected", String(tab === "chat"));
  findingsTab.setAttribute("aria-selected", String(tab === "findings"));
  chatPanel.classList.toggle("hidden", tab !== "chat");
  findingsPanel.classList.toggle("hidden", tab !== "findings");
  if (tab === "chat") toBottom();
}

function setStatus(c: ConnectionStatus) {
  connected = c.state === "connected";
  status.replaceChildren();
  status.classList.toggle("hidden", connected);
  if (c.state === "connecting") {
    status.dataset.tone = "info";
    status.append(icon("info"), el("span", { class: "reason-text", text: "Connecting to the scan server…" }));
  } else if (c.state === "disconnected") {
    // error / disconnected: a dismissible notice above the composer
    status.dataset.tone = "warning";
    const text = el("span", { class: "reason-text", text: `${c.reason} ` });
    if (c.action) text.append(actionButton(c.action));
    status.append(icon("alert"), text, iconBtn("close", "Dismiss", () => status.classList.add("hidden")));
  }
}

function actionButton(action: { label: string; command: string }) {
  return button(action.label, "link", () => send({ type: "runCommand", command: action.command }));
}

function updateControls() {
  stopBtn.classList.toggle("hidden", !scanning);
  sendBtn.disabled = !connected;
  newBtn.disabled = !connected;
  historyBtn.disabled = !connected;
  summarizeBtn.disabled = !connected || !findings.length;
  rescanBtn.disabled = !connected || scanning || !current;
  rescanBtn.classList.toggle("attention", changedFiles > 0);
  rescanLabel.textContent = changedFiles ? `Rescan · ${changedFiles}` : "Rescan";
  rescanBtn.title = changedFiles
    ? `${changedFiles} saved file${changedFiles === 1 ? " has" : "s have"} findings. Rescan to see if they are fixed.`
    : "Scan the files that changed since the last scan";
  fixAllBtn.disabled = !connected || scanning || !findings.length;
  fixAllBtn.classList.toggle("hidden", !isWorkspace());
  providerSelect.disabled = !connected;
  updateModelButtons();
  renderModelList();
  renderSessions();
}

/** Whole calendar days between `d` and today (0 = today). */
function dayBucket(d: Date) {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((day(new Date()) - day(d)) / 86400000);
}
/** Today, Yesterday, Previous 7 days or Older (the web assistant's groups). */
function dateGroup(iso: string) {
  const days = dayBucket(new Date(iso));
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "Previous 7 days" : "Older";
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "just now", "5 min ago", "3 h ago", "yesterday", "5 Oct" (with the year when not this one). */
function ago(iso: string) {
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
const lastActivity = (s: SessionInfo) => s.last_scan_at ?? s.created_at;

/** The History menu: conversations by day of last activity, newest first; the open one is tinted. */
function renderSessions() {
  historyList.replaceChildren();
  const shown = [...sessions].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
  if (!shown.length) {
    historyList.append(el("p", { class: "ai-menu-state",
      text: "No saved conversations yet. Chats you start are kept here until you delete them." }));
  }
  let group = "";
  let list: HTMLElement | null = null;
  for (const s of shown) {
    const g = dateGroup(lastActivity(s));
    if (g !== group) {
      group = g;
      list = el("ul", { class: "ai-menu-ul" });
      historyList.append(el("section", { "aria-label": g }, el("p", { class: "ai-menu-group", text: g }), list));
    }
    list!.append(renderSessionRow(s));
  }
  renderHistoryFoot();
}

function renderSessionRow(s: SessionInfo): HTMLElement {
  if (renaming === s.session_id) {
    const field = el("input", { type: "text", class: "ai-input", value: renameDraft, maxlength: "120",
                                "aria-label": "Conversation name" });
    field.addEventListener("input", () => { renameDraft = field.value; });
    const save = () => {
      const name = renameDraft.trim();
      if (name && name !== s.name) send({ type: "renameSession", id: s.session_id, name });
      renaming = null;
      renderSessions();
    };
    const cancel = () => { renaming = null; renderSessions(); };
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") { e.stopPropagation(); cancel(); } // ends the rename only; the menu stays open
    });
    requestAnimationFrame(() => { if (document.activeElement !== field) { field.focus(); field.select(); } });
    return el("li", { class: "ai-menu-edit" }, el("div", { class: "ai-edit-row" }, field,
      iconBtn("check", "Save the name", save), iconBtn("close", "Cancel renaming", cancel)));
  }
  if (deleting === s.session_id) {
    const cancel = button("Cancel", "secondary small", () => { deleting = null; renderSessions(); });
    const remove = button("Delete", "small danger-solid", () => {
      deleting = null;
      send({ type: "deleteSession", id: s.session_id, confirmed: true });
    });
    requestAnimationFrame(() => cancel.focus());
    return el("li", { class: "ai-menu-confirm", role: "group", "aria-label": `Delete ${s.name}?` },
      el("p", {}, "Delete ", el("strong", { text: `“${s.name}”` }), "? Its history and findings are removed from the server."),
      el("div", { class: "ai-confirm-actions" }, cancel, remove));
  }
  const active = s.session_id === current;
  const item = el("li", { class: "ai-menu-item" });
  if (active) item.dataset.active = "";
  const open = el("button", { class: "ai-menu-open", title: `${s.name}\n${s.session_id}` },
    el("span", { class: "ai-menu-title", text: s.name }),
    el("span", { class: "ai-menu-meta", text: `${s.session_id} · ${ago(lastActivity(s))}` }));
  if (active) open.setAttribute("aria-current", "true");
  open.disabled = scanning && !active;
  open.onclick = () => {
    closeMenus();
    if (!active) send({ type: "switchSession", id: s.session_id });
  };
  item.append(open, el("span", { class: "ai-menu-actions" },
    iconBtn("edit", `Rename “${s.name}”`, () => { renaming = s.session_id; renameDraft = s.name; deleting = null; renderSessions(); }),
    iconBtn("trash", `Delete “${s.name}”`, () => { deleting = s.session_id; renaming = null; renderSessions(); }, "icon-btn danger")));
  return item;
}

function renderHistoryFoot() {
  historyFoot.replaceChildren();
  if (confirmAll && sessions.length) {
    const cancel = button("Cancel", "secondary small", () => { confirmAll = false; renderHistoryFoot(); });
    requestAnimationFrame(() => cancel.focus());
    historyFoot.append(el("div", { class: "ai-foot-confirm", role: "group", "aria-label": "Delete all conversations?" },
      el("p", { text: `Delete all ${sessions.length} conversations? Their history and findings are removed from the server.` }),
      el("div", { class: "ai-confirm-actions" }, cancel,
        button("Delete all conversations", "small danger-solid", () => {
          confirmAll = false;
          closeMenus();
          send({ type: "deleteAllSessions" });
        }))));
    return;
  }
  const all = button("Delete all", "small link-danger", () => { confirmAll = true; renderHistoryFoot(); });
  all.disabled = !sessions.length || scanning;
  historyFoot.append(el("span", { text: "Kept on the scanner server until deleted" }), all);
}

// --- model picker ---

function reachClass(id: string | undefined) {
  const s = providers.find((p) => p.id === id)?.status;
  return s === "REACHABLE" ? "reachable" : s === "UNREACHABLE" ? "unreachable" : "untested";
}

function currentModel() {
  return modelInput.classList.contains("hidden") ? modelSelect.value : modelInput.value.trim();
}

function renderModel() {
  const dot = activeModel ? reachClass(activeModel.provider_id) : "untested";
  const label = activeModel ? activeModel.model : "Choose a model";
  const tone = dot === "reachable" ? "success" : dot === "unreachable" ? "danger" : "warning";
  modelPill.replaceChildren(el("span", { class: "ai-dot", "data-tone": tone }),
    el("span", { class: "chip-label", text: label }), icon("chevron"));
  modelPill.title = activeModel ? `${activeModel.label} · ${activeModel.model}` : "Pick an LLM model";
  modelPill.setAttribute("aria-label", activeModel
    ? `Active model: ${activeModel.label} ${activeModel.model}, ${dot}` : "No LLM model selected");

  if (!providers.some((p) => p.id === viewedProvider)) viewedProvider = activeModel?.provider_id ?? providers[0]?.id ?? null;
  renderModelOptions();
  renderModelList();
}

// Models you can switch to in one click: every model of a reachable provider (or the one it last used).
function renderModelList() {
  modelList.replaceChildren();
  for (const p of providers.filter((x) => x.status === "REACHABLE")) {
    const models = p.models.length ? p.models : p.active_model ? [p.active_model] : [];
    if (!models.length) continue;
    modelList.append(el("div", { class: "model-group", text: p.label }));
    for (const m of models) {
      const isActive = activeModel?.provider_id === p.id && activeModel.model === m;
      const row = el("button", { class: "model-option", role: "option", "aria-selected": String(isActive) },
        icon("cube", "ico model-option-icon"), el("span", { class: "model-option-name", text: m }),
        isActive ? icon("check", "ico model-option-check") : el("span"));
      row.disabled = !connected;
      row.onclick = () => {
        if (!isActive) send({ type: "activateModel", id: p.id, model: m });
        closeMenus();
      };
      modelList.append(row);
    }
  }
  const empty = !modelList.childElementCount;
  modelList.classList.toggle("hidden", empty);
  if (!setupChosen) setSetupOpen(empty); // nothing to pick yet: show the setup form straight away
}

function renderModelOptions() {
  const p = providers.find((x) => x.id === viewedProvider);
  const models = p?.models ?? [];
  providerSelect.replaceChildren(...providers.map((x) => {
    const o = el("option", { value: x.id, text: x.label }) as HTMLOptionElement;
    o.selected = x.id === viewedProvider;
    return o;
  }));
  providerSelect.disabled = !connected;

  // Reconix: its model is whatever the server's .env sets; nothing to type here.
  const readonly = p?.base_mode === "readonly";
  const reconixUnset = readonly && !models.length;
  reconixNote.classList.toggle("hidden", !readonly);
  reconixNote.replaceChildren(...(reconixUnset
    ? [icon("info"), el("span", {}, "Reconix uses the model set on the server (",
        el("code", { text: "LLM_MODEL" }), " in the harness ", el("code", { text: ".env" }),
        "). None is set, so ask your admin, or pick another provider above.")]
    : [icon("cube"), el("span", {}, "Server model: ", el("code", { text: models[0] ?? "" }))]));
  reconixNote.dataset.tone = reconixUnset ? "warning" : "";
  // A custom API holds the one model you type; Test saves it.
  const useInput = p?.kind === "custom" || models.length === 0;
  if (useInput) modelInput.value = models[0] ?? "";
  modelInput.placeholder = p?.id === "anthropic" ? "e.g. claude-3-5-sonnet-latest"
    : p?.id === "deepseek" ? "e.g. deepseek-chat"
    : p?.id === "openai" ? "e.g. gpt-4o"
    : p?.id === "ollama" ? "e.g. qwen2.5-coder" : "e.g. gpt-4.1 or qwen2.5-coder";
  modelSelect.classList.toggle("hidden", useInput);
  modelInput.classList.toggle("hidden", !useInput);
  modelSelect.replaceChildren();
  for (const m of models) {
    const o = el("option", { value: m, text: m });
    if (p && p.active_model === m) o.selected = true;
    modelSelect.append(o);
  }
  // Base URL: editable for the custom formats (Reconix's comes from the server).
  const baseEditable = p?.base_mode === "default" || p?.base_mode === "required";
  baseRow.classList.toggle("hidden", !baseEditable);
  if (baseEditable) {
    baseInput.value = p?.base_url ?? "";
    baseInput.placeholder = p?.base_mode === "required" ? "Base URL (required)" : "Base URL";
  }
  // Model: reconix takes its fixed model from the server config, so hide the field for it.
  modelFieldRow.classList.toggle("hidden", p?.base_mode === "readonly");
  // API key: entered here for every provider that takes one (Reconix too — only its base+model come from the server).
  keyRow.classList.toggle("hidden", !p || !(p.needs_key || p.key_optional));
  keyInput.disabled = !connected;
  // Never prefill the real key (we only ever have a hint); don't clobber what the user is typing.
  if (document.activeElement !== keyInput) keyInput.value = "";
  keyInput.placeholder = p?.api_key_hint ? `Saved (${p.api_key_hint}) — leave blank to keep`
    : p?.needs_key ? "Paste your API key" : "API key (optional)";
  // Nothing to test or activate for a Reconix the server hasn't configured.
  testBtn.parentElement!.classList.toggle("hidden", reconixUnset);
  if (reconixUnset) setPickerStatus("", "muted");
  else showProviderStatus(p);
  updateModelButtons();
}

// the status pill under the setup form: text plus a tone for its dot
function setPickerStatus(text: string, tone: "success" | "danger" | "warning" | "muted") {
  pickerStatus.textContent = text;
  pickerStatus.dataset.tone = tone;
  pickerStatus.classList.toggle("hidden", !text);
}
function showProviderStatus(p: ProviderInfo | undefined) {
  if (!p) setPickerStatus("", "muted");
  else if (p.status === "REACHABLE") setPickerStatus("Reachable", "success");
  else if (p.status === "UNREACHABLE") setPickerStatus(`Not reachable: ${p.status_detail}`, "danger");
  else setPickerStatus(p.configured ? "Set up, not tested yet" : "Not set up yet", "warning");
}

function updateModelButtons() {
  const p = providers.find((x) => x.id === viewedProvider);
  testBtn.disabled = !connected || !p;
  activateBtn.disabled = !connected || !p || p.status !== "REACHABLE" || !currentModel();
}

// --- chat messages ---

function addCopyButtons(root: HTMLElement) {
  root.querySelectorAll("pre").forEach((pre) => {
    const lang = /language-([\w+#-]+)/.exec(pre.querySelector("code")?.className ?? "")?.[1] ?? "code";
    const wrap = el("div", { class: "ai-code" });
    pre.replaceWith(wrap);
    wrap.append(el("div", { class: "ai-code-head" }, el("span", { text: lang }),
      copyButton(() => pre.textContent ?? "", "ai-btn")), pre);
  });
}

/** An assistant turn: the orb, then the content. */
function assistantRow(...children: Node[]) {
  return el("div", { class: "ai-row-assistant" }, el("span", { class: "orb", "aria-hidden": "true" }),
    el("div", { class: "ai-reply" }, ...children));
}

function copyButton(text: () => string, cls = "secondary small", label = "Copy") {
  const b = button(label, cls, () => {
    void navigator.clipboard.writeText(text());
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = label), 1500);
  });
  return b;
}

function renderMessage(m: ChatMessage) {
  if (m.role === "system") {  // a muted client-side note (e.g. a model switch), not a chat bubble
    messages.append(el("div", { class: "note-line", text: m.text }));
    updateWelcome();
    toBottom();
    return;
  }
  if (m.role === "assistant") {
    const body = el("div", { class: "ai-prose" });
    body.innerHTML = md.render(m.text); // html is off, so the text cannot inject markup
    addCopyButtons(body);
    messages.append(assistantRow(body));
  } else {
    messages.append(el("div", { class: "ai-row-user" }, el("div", { class: "ai-bubble", text: m.text })));
  }
  updateWelcome();
  toBottom();
}

function updateWelcome() {
  const empty = messages.childElementCount === 0;
  welcome.classList.toggle("hidden", !empty);
  chatColumn.classList.toggle("is-fill", empty);
}

const confirmRows = new Map<string, HTMLElement>();

function renderConfirm(id: string, yes: string, no: string) {
  const answer = (accept: boolean) => {
    row.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
    send({ type: "confirm", id, accept });
  };
  const row = el("div", { class: "confirm" }, button(yes, "", () => answer(true)), button(no, "secondary", () => answer(false)));
  confirmRows.set(id, row);
  messages.append(row);
  toBottom();
}

// --- scan summary card ---

/** Open the Findings tab on one finding, expanded. */
function showFinding(id: string) {
  setTab("findings");
  ui.query = "";
  search.value = "";
  expanded.add(id);
  saveUi();
  renderFindings();
  findingsList.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "center" });
}

function showFile(path: string) {
  setTab("findings");
  ui.query = path;
  search.value = path;
  saveUi();
  renderFindings();
}

function renderSummaryCard(card: SummaryCard, hidden: number, error: string | null) {
  const root = el("div", { class: "summary-card" });
  const sub = card.total === 0 ? "No problems found."
    : card.false_alarms === card.total ? `All look like false alarms${hidden ? " (hidden)" : ""}.`
    : `${card.likely_real} likely real${card.false_alarms ? ` · ${card.false_alarms} false alarm${card.false_alarms === 1 ? "" : "s"}${hidden ? " (hidden)" : ""}` : ""}`;
  root.append(el("div", { class: "sc-head" },
    el("div", {},
      el("div", { class: `sc-title${card.total ? "" : " clean"}`, text: card.total ? "Scan complete" : "✓ No findings" }),
      el("div", { class: "sc-sub", text: sub })),
    el("div", { class: "sc-total" }, el("strong", { text: String(card.total) }),
       el("span", { text: card.total === 1 ? "finding" : "findings" }))));

  if (card.total) {
    const bar = el("div", { class: "sc-bar", role: "img",
      "aria-label": SEVERITIES.filter((s) => card.counts[s as keyof typeof card.counts])
        .map((s) => `${card.counts[s as keyof typeof card.counts]} ${s}`).join(", ") });
    const legend = el("div", { class: "sc-legend" });
    for (const s of SEVERITIES) {
      const n = card.counts[s as keyof typeof card.counts] ?? 0;
      if (!n) continue;
      const seg = el("span", { class: `sev-${s}` });
      seg.style.flexGrow = String(n);
      bar.append(seg);
      legend.append(el("span", { class: `sc-chip sev-${s}` }, el("span", { class: "sev-dot" }), `${n} ${s}`));
    }
    root.append(bar, legend);
  }

  const section = (label: string, ...children: Node[]) =>
    root.append(el("div", { class: "sc-section" }, el("div", { class: "sc-label", text: label }), ...children));
  if (card.overall) section("Overall", el("div", { class: "sc-overall", text: card.overall }));
  if (card.fix_first.length) {
    const list = el("ol", { class: "sc-fix" });
    card.fix_first.forEach((item, i) => {
      const id = item.finding_ids[0];
      const text = el(id ? "button" : "span", { class: "sc-fix-text", text: item.text,
                                               ...(id ? { title: "Show this finding" } : {}) });
      if (id) text.onclick = () => showFinding(id);
      const li = el("li", {}, el("span", { class: "sc-num", text: String(i + 1) }), text);
      if (id && isWorkspace()) {
        li.append(button("Fix", "secondary small", () => {
          setTab("chat");
          send({ type: "fix", ids: item.finding_ids });
        }, "Let the fix agent fix this"));
      }
      list.append(li);
    });
    section("Fix first", list);
  }
  if (card.files.length) {
    const files = el("div", { class: "sc-files" });
    for (const f of card.files) {
      const { dir, name } = splitPath(f.path);
      const row = button("", "sc-file", () => showFile(f.path), `Show the findings in ${f.path}`);
      row.append(el("span", { class: "sc-file-name", text: name }),
                 el("span", { class: "sc-file-dir" }, el("span", { dir: "ltr", text: dir.replace(/\/$/, "") })),
                 el("span", { class: "count", text: String(f.count) }));
      files.append(row);
    }
    section("Most affected", files);
  }
  if (error) root.append(el("div", { class: "sc-warn", text: `Some steps had problems: ${error}` }));

  const actions = el("div", { class: "sc-actions" });
  if (card.likely_real && isWorkspace()) {
    actions.append(button("Fix all", "", () => send({ type: "send", text: "Fix all findings" }),
                          "Let the fix agent fix every finding that is not a likely false alarm"));
  }
  if (card.total) actions.append(button("View findings", "secondary", () => setTab("findings")));
  if (actions.childElementCount) root.append(actions);

  messages.append(assistantRow(root));
  updateWelcome();
  toBottom();
}

// --- fix agent transcript ---

interface AgentBlock { root: HTMLDetailsElement; title: HTMLElement; body: HTMLElement; files: Map<string, HTMLElement> }
const agentBlocks = new Map<string, AgentBlock>();

function nearBottom() {
  return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 80;
}

function agentStart(id: string, title: string) {
  const titleEl = el("span", { class: "agent-title", text: title });
  const body = el("div", { class: "agent-body" });
  const root = el("details", { class: "agent running", open: "" },
    el("summary", { class: "agent-head" }, el("span", { class: "spinner", "aria-hidden": "true" }), titleEl), body);
  agentBlocks.set(id, { root, title: titleEl, body, files: new Map() });
  messages.append(assistantRow(root));
  updateWelcome();
  toBottom();
}

/** Append one event: streamed text grows the last line of its kind, everything else is a new line. */
function agentEvent(id: string, e: AgentEvent) {
  const a = agentBlocks.get(id);
  if (!a) return;
  const follow = nearBottom();
  let section = a.body;
  if (e.file) {
    let s = a.files.get(e.file);
    if (!s) {
      s = el("div", { class: "agent-file" }, el("div", { class: "agent-file-name", text: e.file }));
      a.files.set(e.file, s);
      a.body.append(s);
    }
    section = s;
  }
  if (e.kind === "start") {
    if (e.text) section.querySelector(".agent-file-name")?.append(el("span", { class: "agent-dim", text: ` · ${e.text}` }));
  } else if (e.kind === "text" || e.kind === "thinking") {
    const last = section.lastElementChild;
    const line = last?.classList.contains(`agent-${e.kind}`) ? last as HTMLElement
      : section.appendChild(el("div", { class: `agent-${e.kind}` }));
    line.textContent += e.text;
    line.scrollTop = line.scrollHeight; // thinking scrolls inside its own box
  } else if (e.kind === "tool") {
    section.append(el("div", { class: "agent-tool" }, el("span", { class: "agent-bullet", text: "●" }), e.text));
  } else if (e.kind === "result") {
    section.append(el("div", { class: `agent-result${e.text.startsWith("Error") ? " error" : ""}`, text: `⎿ ${e.text}` }));
  } else if (e.kind === "done") {
    section.classList.add("done");
    a.title.dataset.progress = e.text;
  } else if (e.kind === "status") {
    section.append(el("div", { class: "agent-status", text: e.text }));
  }
  if (follow) toBottom();
}

function agentEnd(id: string, title: string) {
  const a = agentBlocks.get(id);
  if (!a) return;
  a.root.classList.remove("running");
  a.root.querySelector(".spinner")?.remove();
  a.title.textContent = title;
  agentBlocks.delete(id);
}

function showError(text: string, action?: { label: string; command: string }) {
  const msg = el("span", { class: "reason-text", text });
  if (action) msg.append(" ", actionButton(action));
  messages.append(el("div", { class: "ai-reason", "data-tone": "danger", role: "alert" }, icon("alert"), msg));
  toBottom();
  setTab("chat");
}

// --- findings ---

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function splitPath(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

function matches(f: FindingView, q: string) {
  if (!q) return true;
  const hay = `${f.title} ${f.path} ${f.rule_id} ${f.cwe ?? ""} ${f.message} ${f.tools.join(" ")}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function renderFindings() {
  const total = findings.length;
  findingsTab.replaceChildren(icon("search"), el("span", { text: "Findings" }),
    el("span", { class: "count", text: String(total) }));

  chips.replaceChildren();
  for (const sev of SEVERITIES) {
    const n = findings.filter((f) => f.severity === sev).length;
    if (!n) continue;
    const off = ui.severities.includes(sev);
    const chip = button("", `chip sev-${sev}${off ? " off" : ""}`, () => {
      ui.severities = off ? ui.severities.filter((s) => s !== sev) : [...ui.severities, sev];
      saveUi();
      renderFindings();
    }, `${off ? "Show" : "Hide"} ${sev} findings`);
    chip.setAttribute("aria-pressed", String(!off));
    chip.append(el("span", { class: "chip-dot" }), `${cap(sev)} `, el("strong", { text: String(n) }));
    chips.append(chip);
  }

  const shown = findings.filter((f) => !ui.severities.includes(f.severity) && matches(f, ui.query));
  const notes: string[] = [];
  if (shown.length !== total) notes.push(`Showing ${shown.length} of ${total}.`);
  if (hiddenFalsePositives && total) {
    notes.push(`${hiddenFalsePositives} likely false alarm${hiddenFalsePositives === 1 ? "" : "s"} hidden.`);
  }
  findingsNote.replaceChildren(notes.join(" "));
  if (hiddenFalsePositives && total) {
    findingsNote.append(" ", button("Show them", "link", () => send({ type: "showFalsePositives", on: true })));
  }
  findingsNote.classList.toggle("hidden", !notes.length);

  findingsList.replaceChildren();
  findingsEmpty.replaceChildren(total ? "No findings match the filter."
    : hiddenFalsePositives ? `No real problems found. ${hiddenFalsePositives} likely false alarm${hiddenFalsePositives === 1 ? " is" : "s are"} hidden. `
    : "No findings yet. Ask me to scan this project in the Chat tab.");
  if (!total && hiddenFalsePositives) {
    findingsEmpty.append(button("Show them", "link", () => send({ type: "showFalsePositives", on: true })));
  }
  findingsEmpty.classList.toggle("hidden", shown.length > 0);

  for (const sev of SEVERITIES) {
    const group = shown.filter((f) => f.severity === sev);
    if (!group.length) continue;
    const collapsed = ui.collapsed.includes(sev);
    const header = el("button", { class: `group-header sev-${sev}`, "aria-expanded": String(!collapsed) },
      el("span", { class: "chevron", text: collapsed ? "▸" : "▾" }), el("span", { class: "sev-dot" }),
      el("span", { class: "group-title", text: cap(sev) }), el("span", { class: "count", text: String(group.length) }));
    header.onclick = () => {
      ui.collapsed = collapsed ? ui.collapsed.filter((s) => s !== sev) : [...ui.collapsed, sev];
      saveUi();
      renderFindings();
    };
    const section = el("section", { class: "group" }, header);
    if (!collapsed) {
      let lastPath = "";
      for (const f of group) {
        if (f.path !== lastPath) {
          const { dir, name } = splitPath(f.path);
          const n = group.filter((x) => x.path === f.path).length;
          section.append(el("div", { class: "file-header", title: f.path },
            el("span", { class: "file-name", text: name }),
            // rtl clips long folders from the left; the inner ltr span keeps slashes in place
            el("span", { class: "file-dir" }, el("span", { dir: "ltr", text: dir.replace(/\/$/, "") })),
            el("span", { class: "count", text: String(n) })));
          lastPath = f.path;
        }
        section.append(renderFinding(f));
      }
    }
    findingsList.append(section);
  }
}

function isWorkspace() {
  return sessions.find((s) => s.session_id === current)?.target_type === "workspace";
}

/** Findings appear before the LLM has reviewed them; until then the explanation is empty. */
const pendingReview = (f: FindingView) => !f.explanation && !f.fix_recommendation;

// The finding the user just opened: only its details fade in. The list re-renders on every live
// update during a scan, and a CSS animation on every .details would restart each time.
let justOpened: string | null = null;

function renderFinding(f: FindingView) {
  const v = pendingReview(f) ? { label: "Reviewing…", cls: "pending" }
    : VERDICT[f.verdict] ?? { label: f.verdict, cls: "unsure" };
  const isOpen = expanded.has(f.id);
  const row = el("div", { class: `finding sev-${f.severity}${isOpen ? " open" : ""}`, "data-id": f.id });

  const head = el("button", { class: "finding-head", "aria-expanded": String(isOpen), title: f.title },
    el("span", { class: `badge sev-${f.severity}`, text: BADGE[f.severity] ?? f.severity.toUpperCase() }),
    el("span", { class: "finding-main" },
      el("span", { class: "finding-title", text: f.title }),
      el("span", { class: "finding-meta" },
        el("span", { class: "loc", text: `${splitPath(f.path).name}:${f.start_line}` }),
        el("span", { class: `verdict ${v.cls}`, text: v.label }),
        el("span", { class: "tools", text: f.tools.join(" + ") }),
        ...(f.status === "new" ? [el("span", { class: "new", text: "NEW" })] : []),
        ...(f.outdated ? [el("span", { class: "outdated", text: "file changed", title: "This file changed since the scan" })] : []))));
  head.onclick = () => {
    if (expanded.has(f.id)) expanded.delete(f.id);
    else { expanded.add(f.id); justOpened = f.id; }
    renderFindings();
    justOpened = null;
  };
  row.append(head);
  if (isOpen) row.append(renderDetails(f, f.id === justOpened));
  return row;
}

function renderDetails(f: FindingView, animate = false) {
  const card = el("div", { class: animate ? "details enter" : "details" });
  if (f.outdated) {
    card.append(el("div", { class: "callout warn",
      text: "This file changed since the scan. The line may have moved. Click Rescan to update." }));
  }
  const section = (label: string, text: string) => {
    if (!text) return;
    const body = el("div", { class: "body" });
    body.innerHTML = md.render(text);
    card.append(el("div", { class: "label", text: label }), body);
  };
  if (pendingReview(f)) {
    card.append(el("div", { class: "callout", text: "The LLM is still reviewing this finding. The scanner says:" }));
    section("Scanner message", f.message);
  } else {
    section("What's wrong", f.explanation || f.message);
    section("How to fix", f.fix_recommendation);
  }
  if (f.suggested_patch) {
    card.append(el("div", { class: "label", text: "Suggested patch" }),
      el("pre", { class: "patch" }, el("code", { text: f.suggested_patch })));
  }
  const actions = el("div", { class: "detail-actions" },
    button("Open", "", () => send({ type: "openFinding", id: f.id }), f.web_url ? "Open on GitHub" : "Open in the editor"));
  if (isWorkspace() && !pendingReview(f)) {
    actions.append(button("Fix", "secondary", () => {
      setTab("chat");
      send({ type: "fix", ids: [f.id] });
    }, "Let the assistant fix this in your code. You see the change before it is applied."));
  }
  if (f.suggested_patch) actions.append(copyButton(() => f.suggested_patch ?? "", "secondary", "Copy patch"));
  actions.append(button("Ask in chat", "secondary", () => {
    setTab("chat");
    send({ type: "send", text: `Explain finding \`${f.id}\` (${f.title} in ${f.path}:${f.start_line}) and how to fix it.` });
  }));
  card.append(actions);
  card.append(el("div", { class: "facts" },
    el("span", { text: f.path, title: "File" }),
    el("span", { text: `Lines ${f.start_line}${f.end_line !== f.start_line ? `–${f.end_line}` : ""}` }),
    el("span", { text: f.rule_id, title: "Rule" }),
    ...(f.cwe ? [el("span", { text: f.cwe })] : [])));
  return card;
}

// --- events ---

function submit() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;
  input.value = "";
  autoGrow();
  send({ type: "send", text });
}

sendBtn.onclick = submit;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});
search.value = ui.query;
search.addEventListener("input", () => {
  ui.query = search.value.trim();
  saveUi();
  renderFindings();
});
chatTab.onclick = () => setTab("chat");
findingsTab.onclick = () => setTab("findings");
stopBtn.onclick = () => send({ type: "cancel" });
rescanBtn.onclick = () => {
  setTab("chat");
  send({ type: "runCommand", command: "vulnScanner.rescan" });
};
fixAllBtn.onclick = () => {
  setTab("chat");
  send({ type: "send", text: "Fix all findings" });
};
summarizeBtn.onclick = () => {
  setTab("chat");
  send({ type: "send", text: "Summarize all findings" });
};
historyBtn.onclick = () => toggleMenu(historyMenu, historyBtn);
modelPill.onclick = (e) => { e.stopPropagation(); toggleMenu(modelPanel, modelPill); };
setupToggle.onclick = () => (setupChosen = true) && setSetupOpen(setupToggle.getAttribute("aria-expanded") !== "true");
modelSelect.onchange = updateModelButtons;
modelInput.addEventListener("input", updateModelButtons);
providerSelect.onchange = () => { viewedProvider = providerSelect.value; keyInput.value = ""; renderModelOptions(); };
testBtn.onclick = () => {
  if (!viewedProvider) return;
  setPickerStatus("Testing…", "muted");
  const base_url = baseRow.classList.contains("hidden") ? undefined : baseInput.value.trim();
  const api_key = keyRow.classList.contains("hidden") ? undefined : (keyInput.value || undefined);
  send({ type: "testProvider", id: viewedProvider, model: currentModel() || undefined, base_url, api_key });
};
baseInput.addEventListener("input", updateModelButtons);
activateBtn.onclick = () => viewedProvider && currentModel()
  && send({ type: "activateModel", id: viewedProvider, model: currentModel() });

window.addEventListener("message", (event: MessageEvent<ToWebview>) => {
  const msg = event.data;
  switch (msg.type) {
    case "state":
      setStatus(msg.connection);
      sessions = msg.sessions;
      if (msg.current !== current) {
        messages.replaceChildren();
        updateWelcome();
        findings = [];
        expanded.clear();
        renderFindings();
      }
      current = msg.current;
      scanning = msg.scanning;
      changedFiles = msg.changed;
      providers = msg.providers;
      activeModel = msg.activeModel;
      renderSessions();
      renderModel();
      updateControls();
      break;
    case "testResult":
      providers = providers.map((p) => (p.id === msg.provider.id ? msg.provider : p));
      renderModel();
      showProviderStatus(msg.provider);
      break;
    case "history":
      messages.replaceChildren();
      msg.messages.forEach(renderMessage);
      updateWelcome();
      break;
    case "confirm":
      renderConfirm(msg.id, msg.yes, msg.no);
      break;
    case "confirmDone":
      confirmRows.get(msg.id)?.remove();
      confirmRows.delete(msg.id);
      break;
    case "message":
      renderMessage(msg.message);
      break;
    case "summaryCard":
      renderSummaryCard(msg.card, msg.hidden, msg.error);
      break;
    case "agentStart":
      agentStart(msg.id, msg.title);
      break;
    case "agentEvent":
      agentEvent(msg.id, msg.event);
      break;
    case "agentEnd":
      agentEnd(msg.id, msg.title);
      break;
    case "thinking":
      thinking.classList.toggle("hidden", !msg.on);
      if (msg.on) toBottom();
      break;
    case "progress":
      progress.classList.toggle("hidden", !!msg.done);
      progressBar.style.width = `${Math.max(0, Math.min(100, msg.percent))}%`;
      progressText.textContent = `${msg.percent}% · ${msg.message}`;
      break;
    case "findings": {
      const wasEmpty = findings.length === 0;
      findings = msg.findings;
      hiddenFalsePositives = msg.hidden;
      renderFindings();
      updateControls();
      // A finished scan brings new findings: show them.
      if (wasEmpty && findings.length && scanning) setTab("findings");
      break;
    }
    case "error":
      showError(msg.message, msg.action);
      break;
  }
});

setTab(ui.tab);
updateWelcome();
renderFindings();
renderModel();
updateControls();
send({ type: "ready" });
