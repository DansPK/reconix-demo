"use client";

/* Keyboard navigation between a chart's marks (a roving tab stop): the chart is one stop in
   the Tab order, the arrow keys move between its marks (←/→ along a row, ↑/↓ to the nearest mark
   in the next row, Home/End to a row's ends) and Enter or Space opens the focused one. Marks are
   elements with `data-mark`, `data-row` (their lane) and `data-pos` (0–1), in reading order.
   The marks can change under it (the live refresh merges events, another run opens), so the tab
   stop is chosen from the marks there are now: the remembered one if it still exists, else the
   first. There is always exactly one while the chart has marks. */
import { useCallback, useState } from "react";

const near = (pos: number) => (a: HTMLElement, b: HTMLElement) =>
  Math.abs(Number(b.dataset.pos) - pos) < Math.abs(Number(a.dataset.pos) - pos) ? b : a;

/** The mark that takes the chart's tab stop: `current` while it is still one of `keys`, else
    the first key (null when there are no marks). */
export function tabStop(current: string | null, keys: readonly string[]): string | null {
  return current !== null && keys.includes(current) ? current : (keys[0] ?? null);
}

export function useMarkNav(keys: readonly string[]) {
  const [current, setCurrent] = useState<string | null>(null);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const marks = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-mark]")];
    const el = e.target as HTMLElement;
    const at = marks.indexOf(el);
    if (at < 0) return;
    const row = el.dataset.row;
    const inRow = (r: string | undefined) => marks.filter((m) => m.dataset.row === r);
    let next: HTMLElement | undefined;
    switch (e.key) {
      case "ArrowRight":
        next = marks.slice(at + 1).find((m) => m.dataset.row === row);
        break;
      case "ArrowLeft":
        next = marks.slice(0, at).reverse().find((m) => m.dataset.row === row);
        break;
      case "Home":
        next = inRow(row)[0];
        break;
      case "End":
        next = inRow(row).at(-1);
        break;
      case "ArrowDown":
      case "ArrowUp": {
        const rows = [...new Set(marks.map((m) => m.dataset.row))];
        const step = e.key === "ArrowDown" ? 1 : -1;
        for (let r = rows.indexOf(row) + step; r >= 0 && r < rows.length; r += step) {
          const there = inRow(rows[r]);
          if (there.length) {
            next = there.reduce(near(Number(el.dataset.pos)));
            break;
          }
        }
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  }, []);

  return { active: tabStop(current, keys), setCurrent, onKeyDown };
}
