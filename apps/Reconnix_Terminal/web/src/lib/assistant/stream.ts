/* Reading an OpenAI-compatible streaming reply (server-sent events): each `data:` line holds a
   JSON chunk whose `choices[0].delta.content` is the next piece of text, until `data: [DONE]`.
   Reasoning models may wrap their thinking in <think>…</think>; that part is dropped. Pure, so
   the unit tests drive it directly. */

/** Feeds raw text in, calls `onText` with each piece of reply text, `onDone` at [DONE]. */
export function createEventParser(onText: (text: string) => void, onDone: () => void) {
  let buffer = "";
  const line = (raw: string) => {
    const l = raw.trim();
    if (!l.startsWith("data:")) return;
    const data = l.slice(5).trim();
    if (data === "[DONE]") return onDone();
    try {
      const json = JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[] };
      const text = json.choices?.[0]?.delta?.content;
      if (typeof text === "string" && text) onText(text);
    } catch {
      // a malformed chunk is skipped
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(line);
    },
    end() {
      if (buffer) line(buffer);
      buffer = "";
    },
  };
}

const OPEN = "<think>";
const CLOSE = "</think>";

/** Drops <think>…</think> sections from text that arrives in pieces (tags may be split). */
export function createThinkFilter() {
  let inside = false;
  let held = ""; // a tail that might be the start of a tag
  return (piece: string): string => {
    let text = held + piece;
    held = "";
    let out = "";
    for (;;) {
      const tag = inside ? CLOSE : OPEN;
      const at = text.indexOf(tag);
      if (at === -1) {
        // keep back a tail that could be the start of the tag
        let keep = 0;
        for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
          if (tag.startsWith(text.slice(-n))) {
            keep = n;
            break;
          }
        }
        if (!inside) out += text.slice(0, text.length - keep);
        held = text.slice(text.length - keep);
        return out;
      }
      if (!inside) out += text.slice(0, at);
      text = text.slice(at + tag.length);
      inside = !inside;
      if (!inside) text = text.replace(/^\s+/, "");
    }
  };
}
