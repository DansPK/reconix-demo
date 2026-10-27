"use client";

/* A knowledge file's actions, the same in a table row and a grid card. **Open** shows the original
   (PDF and text in a new tab, a Word file downloaded); a file whose original wasn't kept (added
   before originals were saved) has Open unavailable, with the reason. **Remove** asks first, in
   place: "Remove this file?" with No (focused, the default) and Yes, remove; Escape is No. While
   it runs both are disabled; a refusal is shown under them. */
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { opensInline } from "@/lib/knowledge/format";
import { knowledgeOriginalRoute } from "@/lib/knowledge/paths";
import type { KnowledgeItem } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

export const NO_ORIGINAL = "No original was kept: it was added before originals were saved. Add it again to open it.";

export function FileActions({ item, onRemove }: { item: KnowledgeItem; onRemove: (item: KnowledgeItem) => Promise<string | null> }) {
  const [mode, setMode] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const wasAsking = useRef(false);

  // back from the question: the keyboard returns to Remove
  useEffect(() => {
    if (mode === "idle" && wasAsking.current) box.current?.querySelector<HTMLElement>("[data-remove]")?.focus();
    wasAsking.current = mode !== "idle";
  }, [mode]);

  const confirm = async () => {
    setMode("busy");
    const problem = await onRemove(item);
    if (problem) {
      setError(problem);
      setMode("idle");
    } // done: the row leaves the list
  };

  const inline = opensInline(item.kind);
  const OpenIcon = inline ? ExternalLink : Download;
  return (
    <div ref={box} className="kn-actions">
      {mode === "idle" ? (
        <div className="kn-action-row">
          {item.original ? (
            <a
              href={knowledgeOriginalRoute(item.id)}
              target={inline ? "_blank" : undefined}
              rel={inline ? "noopener noreferrer" : undefined}
              download={inline ? undefined : ""}
              aria-label={`Open ${item.name}`}
              title={inline ? "Open the original in a new tab" : "Download the original Word file"}
              className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
            >
              <OpenIcon className="size-3.5" aria-hidden />
              Open
            </a>
          ) : (
            <Button variant="outline" size="xs" aria-disabled="true" aria-label={`Open ${item.name} (unavailable: no original was kept)`} title={NO_ORIGINAL} onClick={(e) => e.preventDefault()}>
              <OpenIcon className="size-3.5" aria-hidden />
              Open
            </Button>
          )}
          <Button
            variant="quiet"
            size="xs"
            data-remove
            aria-label={`Remove ${item.name}`}
            title="Remove it from the AI's knowledge (asks first)"
            className="kn-remove"
            onClick={() => {
              setError(null);
              setMode("confirm");
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </Button>
        </div>
      ) : (
        <div
          role="group"
          aria-label={`Remove ${item.name}?`}
          className="kn-confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape" && mode === "confirm") {
              e.preventDefault();
              e.stopPropagation();
              setMode("idle");
            }
          }}
        >
          <span className="kn-confirm-text">Remove this file?</span>
          <Button variant="outline" size="xs" autoFocus disabled={mode === "busy"} onClick={() => setMode("idle")}>
            No
          </Button>
          <Button size="xs" className="kn-danger" disabled={mode === "busy"} onClick={confirm}>
            {mode === "busy" && <Loader className="size-3.5 animate-spin" aria-hidden />}
            {mode === "busy" ? "Removing…" : "Yes, remove"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="kn-error">
          {error}
        </p>
      )}
    </div>
  );
}
