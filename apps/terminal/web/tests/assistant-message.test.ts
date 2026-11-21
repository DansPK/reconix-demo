/* Assistant message waiting indicator (components/assistant/message.tsx): shows "Thinking…"
   while waiting for the first response tokens and rotates through status words without
   repeating the current word. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Message, pickNextWord, THINKING_WORDS } from "@/components/assistant/message";
import type { ChatMessage } from "@/components/assistant/types";

const renderMessage = (m: ChatMessage) => renderToStaticMarkup(createElement(Message, { m }));

describe("assistant message waiting indicator", () => {
  it("shows Thinking… while streaming before response text arrives", () => {
    const html = renderMessage({ id: "m1", role: "assistant", content: "", state: "streaming" });
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="The assistant is answering"');
    expect(html).toContain("ai-typing-label");
    expect(html).toContain("Thinking…");
  });

  it("keeps showing the waiting word when cards arrived before response text", () => {
    const html = renderMessage({
      id: "m2",
      role: "assistant",
      content: "",
      state: "streaming",
      cards: [
        {
          kind: "notice",
          tone: "info",
          title: "Scope",
          body: "Checking findings",
          steps: [],
          action: null,
        },
      ],
    });
    expect(html).toContain("Thinking…");
  });

  it("hides the waiting indicator once text arrives or streaming ends", () => {
    const withText = renderMessage({ id: "m3", role: "assistant", content: "Done.", state: "streaming" });
    expect(withText).not.toContain("ai-typing-label");
    const done = renderMessage({ id: "m4", role: "assistant", content: "", state: "stopped" });
    expect(done).not.toContain("ai-typing-label");
  });

  it("rotates to another word in THINKING_WORDS without repeating the current word", () => {
    for (const current of THINKING_WORDS) {
      const first = pickNextWord(current, () => 0);
      const last = pickNextWord(current, () => 0.999);
      expect(THINKING_WORDS).toContain(first);
      expect(THINKING_WORDS).toContain(last);
      expect(first).not.toBe(current);
      expect(last).not.toBe(current);
    }
  });
});
