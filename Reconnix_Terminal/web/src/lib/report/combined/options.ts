/* The combined report's options and links: what the Report view's selection panel, the
   preview frame and the API route share, so they can never disagree. Pure metadata and URL
   helpers; safe to import from client components. */

/** `preview`: the report's HTML, served inline for the Report view's sandboxed frame (never a
    download); `pdf` and `docx`: the files it saves. */
export type CombinedFormat = "preview" | "pdf" | "docx";

/** The formats a combined report is saved in. */
export type CombinedFile = Exclude<CombinedFormat, "preview">;

export interface CombineOptions {
  /** Include each occurrence's masked evidence lines. */
  evidence: boolean;
  /** Include LOW findings (otherwise only CRITICAL, HIGH and MEDIUM); the address key `low=1`. */
  low: boolean;
  /** Include the appendix (tools, references, the run ids). */
  appendix: boolean;
}

export const DEFAULT_COMBINE_OPTIONS: CombineOptions = { evidence: true, low: true, appendix: true };

/** The options as the Report view's selection panel offers them: a label and what it means. */
export const COMBINE_OPTION_META: { key: keyof CombineOptions; label: string; hint: string }[] = [
  { key: "evidence", label: "Include masked evidence", hint: "each occurrence's evidence lines, as masked when they were saved" },
  { key: "low", label: "Include LOW findings", hint: "off: only CRITICAL, HIGH and MEDIUM" },
  { key: "appendix", label: "Include the appendix", hint: "tools, references and the saved copies' ids" },
];

/** How many runs one report may combine (the route refuses more). */
export const COMBINE_MAX = 5;

export const COMBINED_ROUTE = "/api/reports/combined";

const OPTION_KEYS: (keyof CombineOptions)[] = ["evidence", "low", "appendix"];

/** The route that builds the report: `?uids=a,b&format=preview&evidence=1&low=1&appendix=1`
    (an option is sent only when it is on). */
export function combinedHref(uids: readonly string[], format: CombinedFormat, opts: CombineOptions): string {
  const search = new URLSearchParams({ uids: uids.join(","), format });
  for (const key of OPTION_KEYS) if (opts[key]) search.set(key, "1");
  return `${COMBINED_ROUTE}?${search}`;
}

/** The download's name: ASCII only, so the Content-Disposition header never needs encoding. */
export const combinedFileName = (runs: number, format: CombinedFile, now: Date) =>
  `combined-${runs}-runs-${now.toISOString().slice(0, 10)}.${format}`;
