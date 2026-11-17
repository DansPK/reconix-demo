import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The custom font sizes from globals.css' @theme; unregistered, twMerge reads `text-micro` as a
// colour and drops it next to `text-muted-foreground`, leaving the text at the 20px root.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["micro", "caption", "small"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A URL query string from `params`, dropping empty values and "all". */
export function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && value !== "all") search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** The first value of a search param (Next passes string | string[] | undefined). */
export const param = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";
