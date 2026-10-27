"use client";

/* One tab stop for a list of the model picker's items (roving tabindex), kept in React state:
   each item carries `data-rove="<key>"`, tabIndex 0 only on the tab stop, and `onFocus` from
   here; the list's `onKeyDown` moves focus with Up/Down, Left/Right (wrapping), Home and End
   (roving.ts). Moving never chooses: Enter, Space or a click on the item does. The tab stop is
   the item focus last moved to while it is still listed, else `preferred`, else the first. */
import { useCallback, useState } from "react";

import { rovingIndex } from "./roving";

export const ROVE = "[data-rove]";

export function useRoving(keys: readonly string[], preferred: string | null) {
  const [focused, setFocused] = useState<string | null>(null);
  const tabStop = focused !== null && keys.includes(focused) ? focused : preferred !== null && keys.includes(preferred) ? preferred : (keys[0] ?? null);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ROVE)];
    const next = rovingIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
    if (next === null) return;
    e.preventDefault();
    setFocused(items[next].dataset.rove ?? null);
    items[next].focus();
  }, []);

  /** The props of the item `key`. */
  const item = useCallback(
    (key: string) => ({ "data-rove": key, tabIndex: key === tabStop ? 0 : -1, onFocus: () => setFocused(key) }),
    [tabStop],
  );

  return { tabStop, onKeyDown, item };
}
