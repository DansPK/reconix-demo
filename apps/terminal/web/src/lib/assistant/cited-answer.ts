/* Short-lived in-memory map tying a clicked citation (doc id + optional 1-based part)
   to the AI answer text that cited it, so Security knowledge can highlight the sentences
   the model drew from without putting answer text into the URL. */

const citedAnswers = new Map<string, string>();

const keyFor = (docId: string, part: number | null) => `${docId}:${part ?? ""}`;

/** Remember the AI reply text when opening a cited knowledge document. */
export function rememberCitedAnswer(docId: string, part: number | null, answer: string): void {
  const trimmed = answer.trim();
  if (!docId || !trimmed) return;
  if (citedAnswers.size >= 50) citedAnswers.clear();
  citedAnswers.set(keyFor(docId, part), trimmed);
}

/** Look up the AI reply text that opened `(docId, part)`, if any. */
export function getCitedAnswer(docId: string | null, part: number | null): string | null {
  if (!docId) return null;
  return citedAnswers.get(keyFor(docId, part)) ?? null;
}
