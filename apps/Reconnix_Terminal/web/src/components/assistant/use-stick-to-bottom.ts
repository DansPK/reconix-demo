"use client";

/* Keeps a scrolling box (the conversation) on its newest content while the reader is at the
   bottom, and leaves them alone once they scroll up: then `atBottom` is false and the page offers
   "↓ New messages" (scroll-to-bottom.tsx), whose click calls `scrollToBottom()`.

     const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>();
     <div ref={ref} role="log" className="min-h-0 flex-1 overflow-y-auto">…</div>
     <ScrollToBottom show={!atBottom} onClick={scrollToBottom} />
     scrollToBottom({ instant: true }); // jump, e.g. when a long saved conversation opens
     scrollToTop(); // show the start and stop following (a welcome screen)

   The rules are in lib/scroll/stick-rules.ts and the DOM work in lib/scroll/stick-controller.ts
   (both unit-tested); this file only ties them to React state. */
import { useState } from "react";
import { createStickToBottom, type ScrollToBottom, type StickRef } from "@/lib/scroll/stick-controller";

export type { ScrollToBottomOptions, StickRef } from "@/lib/scroll/stick-controller";

export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(): {
  ref: StickRef<T>;
  atBottom: boolean;
  scrollToBottom: ScrollToBottom;
  scrollToTop: () => void;
} {
  const [atBottom, setAtBottom] = useState(true);
  // created once; setAtBottom is stable
  const [stick] = useState(() => createStickToBottom<T>({ onPinned: setAtBottom }));
  return { ref: stick.ref, atBottom, scrollToBottom: stick.scrollToBottom, scrollToTop: stick.scrollToTop };
}
