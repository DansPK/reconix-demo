/* When the AI Assistant asks "Continue this chat, or a new chat about the run the dashboard shows
   now?": a saved conversation with messages is open, it is about another run than the dashboard
   shows, and this pair (conversation, dashboard run) hasn't been answered yet. Asked once per
   switch: an answer holds until the dashboard is back on the conversation's own run or another
   conversation is open (forget()), so the next switch asks again. */
import type { ScopeRef } from "@/lib/assistant/protocol";

/** An answered pair: conversation `id` while the dashboard showed run `uid`. */
export interface Answered {
  id: string;
  uid: string | null;
}

export interface SwitchState {
  id: string | null; // the open conversation (null: a new chat, which follows the dashboard)
  about: ScopeRef; // what it is about
  page: ScopeRef; // what the dashboard shows now
  messages: number;
  opening: boolean; // a saved conversation is being read
  answered: Answered | null;
}

export interface SwitchAsk {
  id: string; // the open conversation
  from: ScopeRef; // what it is about
  to: ScopeRef; // what the dashboard shows now
}

export function switchAsk(s: SwitchState): SwitchAsk | null {
  if (!s.id || s.opening || s.messages === 0 || s.about.uid === s.page.uid) return null;
  if (s.answered?.id === s.id && s.answered.uid === s.page.uid) return null;
  return { id: s.id, from: s.about, to: s.page };
}

/** True when the last answer no longer applies (the next switch asks again). */
export function forget(s: SwitchState): boolean {
  if (!s.answered) return false;
  return s.answered.id !== s.id || s.about.uid === s.page.uid;
}
