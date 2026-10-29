"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "dash-popover-open";

/**
 * Small accessible popover: trigger button + panel. One open at a time (siblings close on an
 * open event), Escape closes and returns focus to the trigger, outside pointerdown closes.
 * The trigger carries aria-expanded / aria-haspopup / aria-controls. `children` may be a
 * function that receives `close`, for panels whose own buttons should close them (it
 * doesn't move focus: such a button usually leads somewhere, or its caller places focus).
 */
export function Popover({
  triggerContent,
  triggerClassName,
  triggerAriaLabel,
  align = "end",
  panelClassName,
  children,
}: {
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  align?: "start" | "end";
  panelClassName?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const id = useId();
  const panelId = `pop-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOther);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [open, id]);

  const close = () => setOpen(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={triggerAriaLabel}
        onClick={toggle}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            "dash-pop absolute top-[calc(100%+8px)] z-50",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
