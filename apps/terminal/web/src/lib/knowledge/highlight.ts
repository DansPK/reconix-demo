/* Text with its references marked (pure: browser and tests). The API says where each reference
   and topic is named in a passage (spans); this cuts the text into plain parts and marked parts,
   without overlaps (the first-starting, then longest, wins), and cuts a snippet around one
   reference for "Mentions". */

export interface Span {
  type: string;
  ref_id: string;
  start: number;
  end: number;
}
export type Part = { text: string; span: Span | null };

export interface TextRange {
  start: number;
  end: number;
}
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
  parts: Part[];
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out",
  "has", "his", "how", "its", "may", "new", "now", "old", "see", "way", "who", "did", "get", "let", "put",
  "say", "she", "too", "use", "that", "this", "with", "from", "they", "have", "been", "were", "what", "when",
  "will", "more", "than", "into", "such", "only", "some", "them", "then", "most", "also", "very", "like",
  "just", "over", "does", "each", "even", "both", "must", "used", "using", "about", "which", "there", "their",
  "would", "could", "should", "other", "where", "these", "those", "while", "being", "based", "according",
  "provided", "document", "knowledge",
]);

function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w),
  );
}

function bigramsOf(tokens: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

function splitSentences(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let lineStart = 0;
  for (const rawLine of text.split("\n")) {
    const lineEnd = lineStart + rawLine.length;
    let pos = lineStart;
    const chunks = rawLine.split(/(?<=[.!?])\s+/);
    for (const chunk of chunks) {
      const idx = text.indexOf(chunk, pos);
      if (idx >= 0) {
        const trimmed = chunk.trim();
        if (trimmed) {
          const lead = chunk.indexOf(trimmed);
          ranges.push({ start: idx + lead, end: idx + lead + trimmed.length });
        }
        pos = idx + chunk.length;
      }
    }
    lineStart = lineEnd + 1;
  }
  return ranges;
}

/** Sentences or lines in `passage` that overlap meaningfully with `answer`. */
export function matchedRanges(passage: string, answer: string): TextRange[] {
  if (!passage.trim() || !answer.trim()) return [];
  const answerTokens = contentTokens(answer);
  if (answerTokens.length === 0) return [];
  const answerSet = new Set(answerTokens);
  const answerBigrams = bigramsOf(answerTokens);

  const scored: { range: TextRange; hits: number; ratio: number; bigram: boolean }[] = [];
  for (const range of splitSentences(passage)) {
    const segTokens = contentTokens(passage.slice(range.start, range.end));
    if (segTokens.length < 2) continue;
    const uniq = new Set(segTokens);
    let hits = 0;
    for (const t of uniq) if (answerSet.has(t)) hits += 1;
    if (hits === 0) continue;
    const ratio = hits / uniq.size;
    let bigram = false;
    for (const b of bigramsOf(segTokens)) {
      if (answerBigrams.has(b)) {
        bigram = true;
        break;
      }
    }
    scored.push({ range, hits, ratio, bigram });
  }

  const strong = scored
    .filter((s) => (s.hits >= 3 && s.ratio >= 0.38) || (s.hits >= 3 && s.bigram && s.hits * s.ratio >= 1.5))
    .map((s) => s.range);
  if (strong.length > 0) return strong;

  const best = scored.filter((s) => s.hits >= 2).sort((a, b) => b.hits * b.ratio - a.hits * a.ratio)[0];
  return best ? [best.range] : [];
}

/** Splits `text` into highlighted and unhighlighted segments, preserving inner `spans`. */
export function splitHighlightSegments(text: string, spans: readonly Span[], highlights: readonly TextRange[]): HighlightSegment[] {
  const ordered = highlights
    .filter((h) => h.start >= 0 && h.end <= text.length && h.end > h.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  if (ordered.length === 0) return [{ text, highlighted: false, parts: partsOf(text, spans) }];

  const shift = (from: number, to: number): Span[] =>
    spans
      .filter((s) => s.start >= from && s.end <= to)
      .map((s) => ({ ...s, start: s.start - from, end: s.end - from }));

  const out: HighlightSegment[] = [];
  let at = 0;
  for (const h of ordered) {
    if (h.start < at) continue;
    if (h.start > at) {
      const slice = text.slice(at, h.start);
      out.push({ text: slice, highlighted: false, parts: partsOf(slice, shift(at, h.start)) });
    }
    const slice = text.slice(h.start, h.end);
    out.push({ text: slice, highlighted: true, parts: partsOf(slice, shift(h.start, h.end)) });
    at = h.end;
  }
  if (at < text.length) {
    const slice = text.slice(at);
    out.push({ text: slice, highlighted: false, parts: partsOf(slice, shift(at, text.length)) });
  }
  return out;
}

/** The text as plain and marked parts, in order. Spans outside the text are dropped. */
export function partsOf(text: string, spans: readonly Span[]): Part[] {
  const ordered = spans.filter((s) => s.start >= 0 && s.end <= text.length && s.end > s.start).sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: Part[] = [];
  let at = 0;
  for (const s of ordered) {
    if (s.start < at) continue; // overlaps one already marked
    if (s.start > at) parts.push({ text: text.slice(at, s.start), span: null });
    parts.push({ text: text.slice(s.start, s.end), span: s });
    at = s.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), span: null });
  return parts;
}

/** About `around` characters of text on each side of the first place `type`/`refId` is named,
    with "…" where it was cut, and the spans moved to fit. null: not named in this text. */
export function snippetOf(text: string, spans: readonly Span[], type: string, refId: string, around = 110): { text: string; spans: Span[] } | null {
  const hit = spans.find((s) => s.type === type && s.ref_id === refId);
  if (!hit) return null;
  let from = Math.max(0, hit.start - around);
  let to = Math.min(text.length, hit.end + around);
  // cut at a space where one is near, so words stay whole
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space >= 0 && space < hit.start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > hit.end) to = space;
  }
  const head = from > 0 ? "…" : "";
  const shift = head.length - from;
  const inside = spans.filter((s) => s.start >= from && s.end <= to).map((s) => ({ ...s, start: s.start + shift, end: s.end + shift }));
  return { text: `${head}${text.slice(from, to)}${to < text.length ? "…" : ""}`, spans: inside };
}
