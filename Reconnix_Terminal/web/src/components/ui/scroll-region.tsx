"use client";

/* A box whose content may scroll inside it (a wide code block or table, a finding's evidence):
   while it does, it is a tab stop with a name and a focus mark (.ui-scroll-region in ui.css),
   so a keyboard reader can reach and scroll it; when everything fits it stays out of the Tab
   order (a docs page can hold a dozen code blocks). Measured on mount, on resize, and on every
   render, since the content may change under it. */
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = HTMLAttributes<HTMLElement> & {
  /** The element to render: a `pre` for code, a `div` for anything else. */
  as?: "div" | "pre";
  /** Its name once it is a tab stop (a region landmark): what scrolls inside it. */
  label: string;
  children: ReactNode;
};

export function ScrollRegion({ as: Tag = "div", label, className, children, ...rest }: Props) {
  const ref = useRef<HTMLDivElement & HTMLPreElement>(null);
  const [scrolls, setScrolls] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (el) setScrolls(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  };
  useEffect(measure); // no dependency list: the content is whatever the parent rendered this time
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // the tab stop's attributes come last, so nothing in `rest` can override them
  const stop = scrolls ? { tabIndex: 0, role: "region", "aria-label": label } : {};
  return (
    <Tag ref={ref} className={cn("ui-scroll-region", className)} {...rest} {...stop}>
      {children}
    </Tag>
  );
}
