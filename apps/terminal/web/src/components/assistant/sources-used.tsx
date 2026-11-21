"use client";

/* The muted line under an answer listing the knowledge it cites ("Sources: [CVE-2021-44228]
   Apache Log4j2 …"): the server's `sources` frame, kept with the streaming reply. Ref ids and
   titles are plain React text; only a url that starts with http(s) becomes an external link (so
   no other scheme can ever be clicked), and an uploaded knowledge document (USER_DOC) opens in
   the Security knowledge view at its cited passage. Hovering a clickable source previews its
   referenced passage or knowledge entry with color-highlighted references. */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ScrollText } from "lucide-react";

import { leaveAssistant } from "@/components/dashboard/view-url";
import { rememberCitedAnswer } from "@/lib/assistant/cited-answer";
import type { SourceRef } from "@/lib/assistant/protocol";
import * as knowledgeApi from "@/lib/knowledge/client";
import { matchedRanges, splitHighlightSegments } from "@/lib/knowledge/highlight";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABOUT_TYPE: Record<string, "CVE" | "CWE" | "OWASP" | "ATTACK" | "TOOL"> = {
  CVE: "CVE",
  CWE: "CWE",
  OWASP_TOP10: "OWASP",
  OWASP_API_TOP10: "OWASP",
  ATTACK: "ATTACK",
  TOOL_GUIDE: "TOOL",
};

export type SourcePreview =
  | { kind: "passage"; title: string; part: number | null; passage: knowledgeApi.Passage }
  | { kind: "about"; refType: "CVE" | "CWE" | "OWASP" | "ATTACK" | "TOOL"; title: string; text: string; source: string }
  | { kind: "error"; detail: string };

const previewCache = new Map<string, SourcePreview>();

/** Extract a 1-based passage number from a section like "/Part 31/". */
export function partNumberOf(section: string): number | null {
  const match = /Part\s+(\d+)/i.exec(section);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Whether `s` points to an uploaded knowledge add-on document inside Security knowledge. */
export function isKnowledgeDocSource(s: SourceRef): boolean {
  return s.source === "USER_DOC" && UUID_RE.test(s.ref_id);
}

function cacheKey(s: SourceRef): string {
  return `${s.source}:${s.ref_id}:${s.section}`;
}

async function fetchPreview(s: SourceRef): Promise<SourcePreview> {
  const key = cacheKey(s);
  const cached = previewCache.get(key);
  if (cached) return cached;

  let next: SourcePreview;
  if (isKnowledgeDocSource(s)) {
    const part = partNumberOf(s.section);
    const index = part ? part - 1 : 0;
    const res = await knowledgeApi.loadPassages(s.ref_id, index, 1);
    if (!res.ok) return { kind: "error", detail: res.detail };
    const passage = res.value.passages.find((p) => p.index === index) ?? res.value.passages[0];
    if (!passage) return { kind: "error", detail: "Cited passage could not be found in this document." };
    next = { kind: "passage", title: s.title || s.ref_id, part: passage.index + 1, passage };
  } else {
    const refType = ABOUT_TYPE[s.source];
    if (!refType) return { kind: "error", detail: s.url };
    const res = await knowledgeApi.loadAbout(refType, s.ref_id, s.title || s.ref_id);
    if (!res.ok) return { kind: "error", detail: res.detail };
    if (!res.value) return { kind: "error", detail: "No summary found in the local knowledge base." };
    next = {
      kind: "about",
      refType,
      title: res.value.title || s.title || s.ref_id,
      text: res.value.text,
      source: res.value.source,
    };
  }

  if (previewCache.size >= 100) previewCache.clear();
  previewCache.set(key, next);
  return next;
}

/** Hover card showing a cited passage (with highlighted text the AI drew from) or reference summary. */
export function SourcePreviewCard({ source, preview, answer = "" }: { source: SourceRef; preview: SourcePreview | null; answer?: string }) {
  const docSource = isKnowledgeDocSource(source);
  const dataType = docSource ? "DOC" : (ABOUT_TYPE[source.source] ?? "TOPIC");
  const part = partNumberOf(source.section);
  const title = source.title || source.ref_id;

  const renderHighlighted = (text: string, spans: readonly knowledgeApi.Passage["spans"][number][]) =>
    splitHighlightSegments(text, spans, matchedRanges(text, answer)).map((seg, segIdx) => {
      const inner = seg.parts.map((p, idx) =>
        p.span ? (
          <span key={idx} className="kn-mark" data-type={p.span.type}>
            {p.text}
          </span>
        ) : (
          <span key={idx}>{p.text}</span>
        ),
      );
      return seg.highlighted ? (
        <mark key={segIdx} className="kn-used">
          {inner}
        </mark>
      ) : (
        <span key={segIdx}>{inner}</span>
      );
    });

  return (
    <div className="ai-source-card" data-type={dataType} role="tooltip">
      <div className="ai-source-card-head">
        <span className="kn-type-dot" data-type={dataType} aria-hidden />
        <span className="ai-source-card-kind">
          {docSource ? (part ? `Document · Part ${part}` : "Document") : source.source.replace(/_/g, " ")}
        </span>
      </div>
      <p className="ai-source-card-title">{title}</p>
      {preview === null ? (
        <div className="kn-skeleton ai-source-card-skeleton" aria-label="Loading reference preview">
          <span />
          <span />
          <span />
        </div>
      ) : preview.kind === "passage" ? (
        <div className="ai-source-card-passage" data-type="DOC">
          <p className="ai-source-card-text">{renderHighlighted(preview.passage.text, preview.passage.spans)}</p>
        </div>
      ) : preview.kind === "about" ? (
        <div className="ai-source-card-passage" data-type={preview.refType}>
          <p className="ai-source-card-text">{renderHighlighted(preview.text, [])}</p>
        </div>
      ) : (
        <p className="ai-source-card-empty">{preview.detail}</p>
      )}
      <p className="ai-source-card-foot">
        {docSource ? (
          "Click to open and highlight in Security knowledge"
        ) : (
          <>
            Opens external reference <ExternalLink className="size-3" aria-hidden />
          </>
        )}
      </p>
    </div>
  );
}

function InteractiveSource({ source, answer }: { source: SourceRef; answer: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SourcePreview | null>(() => previewCache.get(cacheKey(source)) ?? null);
  const closeTimer = useRef<number | null>(null);
  const label = source.title || source.ref_id;
  const part = partNumberOf(source.section);
  const external = /^https?:\/\//.test(source.url);

  const show = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const hide = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open || preview !== null) return;
    let active = true;
    void fetchPreview(source).then((next) => {
      if (active) setPreview(next);
    });
    return () => {
      active = false;
    };
  }, [open, preview, source]);

  const showRefPrefix = Boolean(source.title && !UUID_RE.test(source.ref_id));

  return (
    <span className="ai-source-item" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {showRefPrefix ? `[${source.ref_id}] ` : ""}
      {external ? (
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {label}
        </a>
      ) : (
        <button
          type="button"
          className="ai-source-link"
          onClick={() => {
            rememberCitedAnswer(source.ref_id, part, answer);
            leaveAssistant("knowledge", { doc: source.ref_id, ...(part ? { part: String(part) } : {}) });
          }}
          title={part ? `Open ${label} (Part ${part}) in Security knowledge` : `Open ${label} in Security knowledge`}
        >
          {label}
          {part ? ` (Part ${part})` : ""}
        </button>
      )}
      {open && <SourcePreviewCard source={source} preview={preview} answer={answer} />}
    </span>
  );
}

export function SourcesUsed({ sources, answer = "" }: { sources?: SourceRef[]; answer?: string }) {
  if (!sources?.length) return null;
  return (
    <div className="ai-knowledge">
      <ScrollText className="size-3.5 shrink-0" aria-hidden />
      <span className="ai-sources">
        <span>Sources:</span>
        {sources.map((s, i) =>
          /^https?:\/\//.test(s.url) || isKnowledgeDocSource(s) ? (
            <InteractiveSource key={i} source={s} answer={answer} />
          ) : (
            <span key={i}>
              {s.title && !UUID_RE.test(s.ref_id) ? `[${s.ref_id}] ` : ""}
              {s.title || s.ref_id}
            </span>
          ),
        )}
      </span>
    </div>
  );
}
