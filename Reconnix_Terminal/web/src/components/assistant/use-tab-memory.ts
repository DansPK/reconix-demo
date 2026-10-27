"use client";

/* What this tab remembers (sessionStorage): which conversation is open, for which view, and the
   unsent draft (masked). Never the messages: those stay on the server. A reload of the same
   view reopens its conversation; one that can't be opened any more is forgotten, so its notice
   shows once. The earlier copy of whole conversations (v1) is removed. */
import { useEffect, useRef } from "react";

import { redact } from "@/lib/assistant/redact";
import { MAX_QUESTION } from "@/lib/assistant/request";
import type { AssistantInfo } from "./types";
import { useLatest } from "./use-latest";
import type { OpenState } from "./use-open-conversation";

const STORE_KEY = "reconix.assistant.v2"; // { openId, pageUid, draft }
const OLD_KEY = "reconix.assistant.v1";

interface Kept {
  openId: string | null; // the open conversation
  pageUid: string | null | undefined; // what the dashboard showed then
  draft: string;
}

function load(): Kept {
  try {
    window.sessionStorage.removeItem(OLD_KEY);
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const data = raw ? (JSON.parse(raw) as { openId?: unknown; pageUid?: unknown; draft?: unknown }) : {};
    return {
      openId: typeof data.openId === "string" ? data.openId : null,
      pageUid: typeof data.pageUid === "string" || data.pageUid === null ? data.pageUid : undefined,
      draft: typeof data.draft === "string" ? data.draft.slice(0, MAX_QUESTION) : "",
    };
  } catch {
    return { openId: null, pageUid: undefined, draft: "" };
  }
}

function save({ openId, pageUid, draft }: Kept): void {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ openId, pageUid, draft: redact(draft) }));
  } catch {
    // storage blocked or full: the page still works, a reload just starts fresh
  }
}

export function useTabMemory(info: AssistantInfo, open: OpenState, draft: string, setDraft: (text: string) => void) {
  const restored = useRef(false);
  const latest = useLatest({ info, open, draft });
  const openId = open.opened?.id ?? null;

  // restore after hydration (the server knows nothing of this tab's storage)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const kept = load();
      const { info: now, open: state } = latest.current;
      setDraft(latest.current.draft || kept.draft);
      restored.current = true;
      if (!kept.openId || kept.pageUid !== now.scope.uid || state.opened || state.messages.length) return;
      void state.openConversation(kept.openId).then((ok) => {
        if (!ok && !latest.current.open.opened) save({ openId: null, pageUid: latest.current.info.scope.uid, draft: latest.current.draft }); // forget it
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [latest, setDraft]);

  useEffect(() => {
    if (restored.current) save({ openId, pageUid: info.scope.uid, draft });
  }, [openId, draft, info.scope.uid]);
}
