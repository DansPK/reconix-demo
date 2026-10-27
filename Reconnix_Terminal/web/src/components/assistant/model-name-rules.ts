/* A model name typed in the model picker ("Set the provider", "Type a model name…"), before the
   server checks it again: the characters model ids use (llama3.2, openai/gpt-4o-mini,
   qwen:7b@q4), at most 128. Pure: browser and tests. */
import { MODEL_NAME } from "@/lib/assistant/models/schema";

/** The longest model name (the field's maxLength; MODEL_NAME allows no more). */
export const MODEL_NAME_MAX = 128;

/** Why the typed `name` (trimmed) can't be used as a model name, or null. */
export function nameProblem(name: string): string | null {
  const typed = name.trim();
  if (!typed) return "Type a model name.";
  return MODEL_NAME.test(typed) ? null : `A model name uses letters, digits and . _ : / @ + - only (at most ${MODEL_NAME_MAX}).`;
}
