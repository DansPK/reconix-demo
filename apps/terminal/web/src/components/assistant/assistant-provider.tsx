"use client";

/* The AI Assistant's state, shared by the Overview's Ask bar and the assistant screen: the open
   conversation and its messages (use-open-conversation), asking, streaming, Stop and Retry
   (use-asking), the saved conversations for History and changes to them (use-history-list,
   use-conversation-changes), what this tab remembers (use-tab-memory), and the model that
   answers next: the page says which (info.model), and the model picker replaces it after a switch
   without a reload (until a render of the page brings the server's word for it). The Viewer
   mounts it once, so switching views, the live refresh and the open/close animation never touch
   it.

   Conversations are kept by the dashboard's server (lib/assistant/history-store.ts): a
   question carries only the open conversation's id and the question, never the conversation
   so far. A conversation stays about the run it was started on; once the dashboard shows another
   run, the assistant asks whether to keep it or start a new chat about that run (use-switch-ask). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { MAX_QUESTION } from "@/lib/assistant/request";
import { liveSwitch, type Switched, switchOver } from "./model-switch";
import { createSlot } from "./slot";
import type { AssistantInfo, ChatMessage, ModelSummary } from "./types";
import { useAsking } from "./use-asking";
import { useConversationChanges } from "./use-conversation-changes";
import { type HistoryState, useHistoryList } from "./use-history-list";
import { useLatest } from "./use-latest";
import { type OpenConversation, useOpenConversation } from "./use-open-conversation";
import { type SwitchChoice, useSwitchAsk } from "./use-switch-ask";
import { useTabMemory } from "./use-tab-memory";

export type { HistoryState, OpenConversation, SwitchChoice };

interface Assistant {
  info: AssistantInfo; // info.model: the model that answers next, as last switched
  canAsk: boolean;
  /** After the model picker changed something: the model that answers next now. */
  setModel: (model: ModelSummary) => void;
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  setDraft: (text: string) => void;
  /** Ask `text` (default: the draft). False when it can't be asked now (the draft stays). */
  ask: (text?: string) => boolean;
  stop: () => void;
  /** Ask the last failed question again (its error is replaced). */
  retry: () => void;
  conversation: OpenConversation;
  opening: boolean; // a saved conversation is being read
  notice: string | null; // why the last open didn't work
  newChat: () => void;
  openConversation: (id: string) => void;
  history: HistoryState;
  loadHistory: () => void;
  /** Each resolves to null when it worked, or what went wrong. */
  renameConversation: (id: string, title: string) => Promise<string | null>;
  deleteConversation: (id: string) => Promise<string | null>;
  deleteAllConversations: () => Promise<string | null>;
  /** "Continue this chat, or a new chat about the run the dashboard shows?" */
  switchChoice: SwitchChoice;
}

const AssistantContext = createContext<Assistant | null>(null);

export function useAssistant(): Assistant {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant needs an AssistantProvider above it.");
  return value;
}

export function AssistantProvider({ info: page, children }: { info: AssistantInfo; children: React.ReactNode }) {
  // The model picker's latest word on the model, kept while the page still names the model it
  // replaced, compared by value (model-switch.ts): a live refresh the server rendered before
  // the switch brings a new object with the old model in it, and mustn't win. Once the page
  // has caught up its word wins, and the switch is dropped (so a later change back shows too).
  const [switched, setSwitched] = useState<Switched | null>(null);
  const latestPage = useLatest(page);
  const setModel = useCallback((model: ModelSummary) => setSwitched(switchOver(latestPage.current.model, model)), [latestPage]);
  const live = liveSwitch(page.model, switched);
  if (switched && !live) setSwitched(null); // adjusting state to new props, during render
  const model = live ? live.model : page.model;
  const info = useMemo(() => (model === page.model ? page : { ...page, model }), [page, model]);

  const [draft, setDraftState] = useState("");
  const setDraft = useCallback((text: string) => setDraftState(text.slice(0, MAX_QUESTION)), []);
  const clearDraft = useCallback(() => setDraftState(""), []);
  const [stream] = useState(() => createSlot<AbortController>()); // the reply being streamed
  const onHaltRef = useRef<() => void>(() => {});

  const onHalt = useCallback(() => onHaltRef.current(), []);
  const list = useHistoryList();
  const open = useOpenConversation(page, stream, list.forget, onHalt);
  const asking = useAsking({ info, open, stream, draft, clearDraft, refreshHistory: list.refreshHistory });
  useEffect(() => {
    onHaltRef.current = asking.clearBusy;
  }, [asking.clearBusy]);
  const changes = useConversationChanges(list, open);
  const switchChoice = useSwitchAsk({ info, open, ask: asking.ask, setDraft });
  useTabMemory(page, open, draft, setDraft);

  const canAsk = info.model.configured; // no model chosen: nothing can be asked
  const { messages, conversation, opening, notice, newChat, openConversation } = open;
  const { busy, retry, stop } = asking;
  const ask = switchChoice.askOrHold; // waits while the switch question is open
  const { history, loadHistory } = list;
  const { renameConversation, deleteConversation, deleteAllConversations } = changes;
  const openSaved = useCallback((id: string) => void openConversation(id), [openConversation]);

  const value = useMemo<Assistant>(
    () => ({
      info,
      canAsk,
      setModel,
      messages,
      draft,
      busy,
      setDraft,
      ask,
      stop,
      retry,
      conversation,
      opening,
      notice,
      newChat,
      openConversation: openSaved,
      history,
      loadHistory,
      renameConversation,
      deleteConversation,
      deleteAllConversations,
      switchChoice,
    }),
    [info, canAsk, setModel, messages, draft, busy, setDraft, ask, stop, retry, conversation, opening, notice, newChat, openSaved, history, loadHistory, renameConversation, deleteConversation, deleteAllConversations, switchChoice],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
