/* Roving focus in a list of items with one tab stop (the model picker's lists): where Up/Down,
   Left/Right (wrapping), Home and End move from item `at` of `count`. They only move focus;
   choosing an item stays a deliberate Enter, Space or click. Pure: browser and tests. */

const NEXT = new Set(["ArrowDown", "ArrowRight"]);
const PREVIOUS = new Set(["ArrowUp", "ArrowLeft"]);

/** The item `key` moves to, or null when the key doesn't move (or nothing is focused). */
export function rovingIndex(key: string, at: number, count: number): number | null {
  if (count < 1 || at < 0 || at >= count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (NEXT.has(key)) return (at + 1) % count;
  if (PREVIOUS.has(key)) return (at - 1 + count) % count;
  return null;
}
