/* The shared masking cases (redact-vectors.json), with their long fake keys expanded. A key is
   written there as "{{X*N}}" (X repeated N times) so no file holds a key-shaped string a secret
   scanner would flag; the TUI's tests/test_redact_vectors.py expands them the same way. */
import raw from "./redact-vectors.json";

const REPEAT = /\{\{(.)\*(\d+)\}\}/g;

/** `text` with every "{{X*N}}" replaced by X repeated N times. */
export const expand = (text: string): string => text.replace(REPEAT, (_, ch: string, n: string) => ch.repeat(Number(n)));

export const redactVectors: [string, string][] = (raw as [string, string][]).map(([text, masked]) => [expand(text), expand(masked)]);
