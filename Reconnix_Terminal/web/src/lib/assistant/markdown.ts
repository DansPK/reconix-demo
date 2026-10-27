/* The small Markdown subset the assistant's replies use, as blocks (paragraphs, headings,
   lists, quotes, rules, code with its language, tables with their alignment). Pure and
   unit-tested; components/assistant/message-text.tsx renders the blocks as React elements.
   Nothing here is HTML: every piece stays text. */

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 3 | 4; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: string[]; align: Align[]; rows: string[][] };

const BULLET = /^\s*[-*•+]\s+/;
const NUMBER = /^\s*\d{1,3}[.)]\s+/;
const HEADING = /^\s*(#{1,6})\s+/;
const QUOTE = /^\s*>\s?/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)\s*([\w+#.-]{0,24})/;
// a table's separator line, matched on the trimmed line (linear: no nested repeats)
const TABLE_SEP = /^\|?\s*:?-+:?(?:\s*\|\s*:?-+:?)*\s*\|?$/;
const MAX_COLUMNS = 12;

/** The cells of a table line ("| a | b |" → ["a", "b"]); `\|` stays a bar inside a cell. */
export function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return trimmed
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"))
    .slice(0, MAX_COLUMNS);
}

const alignOf = (sep: string): Align => {
  const s = sep.trim();
  if (s.startsWith(":") && s.endsWith(":")) return "center";
  if (s.endsWith(":")) return "right";
  return s.startsWith(":") ? "left" : null;
};

/** Splits reply text into blocks (pure; unit-tested). */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      const close = fence[1];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith(close); i++) code.push(lines[i]);
      blocks.push({ kind: "code", lang: fence[2].toLowerCase(), text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // a table: a line with bars, then a separator line (| --- | :-: |)
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim()) && lines[i + 1].includes("|")) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) {
        const row = cells(lines[i]);
        rows.push(head.map((_, c) => row[c] ?? ""));
      }
      i -= 1;
      blocks.push({ kind: "table", head, align: head.map((_, c) => align[c] ?? null), rows });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    const list = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : null;
    if (list) {
      flush();
      const item = line.replace(list === "ul" ? BULLET : NUMBER, "");
      const last = blocks[blocks.length - 1];
      if (last && last.kind === list) last.items.push(item);
      else blocks.push({ kind: list, items: [item] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "h", level: heading[1].length <= 2 ? 3 : 4, text: line.replace(HEADING, "").trimEnd().replace(/\s#+$/, "").trimEnd() }); // linear: no backtracking on long lines
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const text = line.replace(QUOTE, "");
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "quote") last.text += ` ${text}`;
      else blocks.push({ kind: "quote", text });
      continue;
    }
    const last = blocks[blocks.length - 1];
    // a wrapped line right under a list item belongs to it
    if (!para.length && last && (last.kind === "ul" || last.kind === "ol") && /^\s{2,}/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
