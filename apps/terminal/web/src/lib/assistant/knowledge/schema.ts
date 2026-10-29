/* The knowledge folder's files, as the TUI's /add-on writes them (the contract:
   docs/KNOWLEDGE_OPENAPI_FINDINGS_PLAN.md §4) and `python -m reconix.knowledge` for the Security
   knowledge page. `index.json` lists the sources; `<id>.json` holds
   one source's passages, already cleaned and redacted by the TUI. Every shape is strict and
   bounded: a file that doesn't match is skipped (read.ts), never half-trusted. Lengths are
   counted in characters as Python counts them (code points), so a passage of emoji the TUI kept
   is not refused here. Pure. */
import { z } from "zod";

export const INDEX_FORMAT = "reconix.knowledge/v1";
export const SOURCE_FORMAT = "reconix.knowledge.source/v1";
export const INDEX_FILE = "index.json";

export const MAX_SOURCES = 50;
export const MAX_CHUNKS = 2_000; // passages of one source
export const MAX_CHUNK = 1_200; // characters of one passage
export const MAX_NAME = 120; // characters of a source's file name
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // the file /add-on read (at most 10 MB)
export const KINDS = ["txt", "md", "json", "yaml", "docx", "pdf"] as const;

/** A source's id: 32 lower-case hex digits (also its file name, `<id>.json`). */
export const SOURCE_ID = /^[0-9a-f]{32}$/;
/** An ISO-8601 time in UTC ("…Z" or "…+00:00", Python's isoformat). */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]00:00)$/;

/** How many characters `text` has, as Python's len() counts them. */
export function codePoints(text: string): number {
  return text.length - (text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0); // a surrogate pair is one
}

/** A string of at most `max` characters (code points; never more than 2 × max UTF-16 units). */
const chars = (max: number) =>
  z
    .string()
    .max(max * 2)
    .refine((s) => codePoints(s) <= max, { message: `at most ${max} characters` });

const Id = z.string().regex(SOURCE_ID);
const Name = chars(MAX_NAME).refine((s) => s.trim().length > 0, { message: "a name" });
const Count = (max: number) => z.number().int().min(0).max(max);

/** Where a source came from: the dashboard's Security knowledge page, or the TUI's /add-on. */
export const ORIGINS = ["web", "terminal"] as const;
export type KnowledgeOrigin = (typeof ORIGINS)[number];

export const IndexEntrySchema = z
  .object({
    id: Id,
    name: Name,
    kind: z.enum(KINDS),
    bytes: Count(MAX_SOURCE_BYTES),
    chunks: Count(MAX_CHUNKS),
    added_at: z.string().max(40).regex(ISO_UTC),
    // since the Security knowledge page (docs/WEB_KNOWLEDGE_PAGE_AND_MODELS_PLAN.md): an older
    // entry has neither, and reads as added in the terminal with no original kept
    source: z.enum(ORIGINS).default("terminal"),
    original: z.boolean().default(false),
  })
  .strict();
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const KnowledgeIndexSchema = z
  .object({ format: z.literal(INDEX_FORMAT), sources: z.array(IndexEntrySchema).max(MAX_SOURCES) })
  .strict();
export type KnowledgeIndex = z.infer<typeof KnowledgeIndexSchema>;

export const KnowledgeSourceSchema = z
  .object({ format: z.literal(SOURCE_FORMAT), id: Id, name: Name, chunks: z.array(chars(MAX_CHUNK)).max(MAX_CHUNKS) })
  .strict();
export type KnowledgeSourceFile = z.infer<typeof KnowledgeSourceSchema>;

/** A source's file name in the folder, from a checked id only (anything else throws). */
export function sourceFile(id: string): string {
  if (!SOURCE_ID.test(id)) throw new Error("not a knowledge source id");
  return `${id}.json`;
}
