/* Masking a saved assessment once more, at the boundary, before a report is built from it:
   every string leaf goes through lib/assistant/redact.ts (the TUI's own patterns), so no field a
   report prints can escape it. Enums, uids and timestamps pass through unchanged, since no
   pattern matches them. Lists of strings are masked as one text and split back on the element
   boundaries, so a private key spread over several evidence lines is caught as one block while
   an element holding newlines of its own stays one element. Pure. */
import { redact } from "@/lib/assistant/redact";
import type { Assessment } from "@/lib/data/schema";

const isStrings = (value: unknown[]): value is string[] => value.length > 0 && value.every((v) => typeof v === "string"); // [] stays []

/** A list of strings masked as one text: the elements are joined by a separator the joined text
    splits back on exactly (a newline inside it ends a value or a header line the way a line's end
    does, so no pattern reads across a boundary except the private-key block, which is meant to)
    and split back on it. When a match did run across elements (a key block, a quoted value), the
    elements it covered become one: masking them one by one instead would leave a key's middle
    lines bare, since the BEGIN line is a match on its own. */
function maskStrings(list: string[]): string[] {
  // "\n\u0000<n>\u0000\n" for the first n whose core no element holds: the core then occurs only
  // inside a real separator (none of its characters is a newline, so it can't straddle one), so
  // the split is exact; the round trip is checked all the same
  let n = 0;
  const separator = () => `\n\u0000${n}\u0000\n`;
  const exact = () => {
    const back = list.join(separator()).split(separator());
    return back.length === list.length && back.every((s, i) => s === list[i]);
  };
  while (list.some((s) => s.includes(`\u0000${n}\u0000`)) || !exact()) n++;
  return redact(list.join(separator())).split(separator());
}

/** `value` with every string inside it masked (arrays and plain objects are walked). */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) {
    if (isStrings(value)) return maskStrings(value) as T;
    return value.map(maskDeep) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v)])) as T;
  }
  return value;
}

/** The assessment as a report may read it: masked again, field for field. */
export const maskAssessment = (a: Assessment): Assessment => maskDeep(a);
