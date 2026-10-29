/* The AI Assistant's reply stream, shared by POST /api/assistant and the page: one JSON object
   per line (NDJSON). A reply is `meta` (which conversation it went into, and the names of the
   /add-on files whose passages went to the model with the question, when any did), then the
   cards the server picked and built from the saved data (lib/assistant/cards.ts), then the
   model's text in pieces, an `error` if something went wrong, and `done`. Cards are facts taken
   from the saved files; the model only writes the text around them, so it can never invent a
   finding, a count or a state (knowledge never makes a card). Every card is plain data: the
   page renders it as React text and builds its links itself (internal addresses from a checked
   uid only). Pure: browser and server. */
import { z } from "zod";

import { SEVERITIES, STATUSES } from "../data/schema";
import { TOP_K } from "./knowledge/rank";
import { MAX_NAME } from "./knowledge/schema";

/** A saved run's uid, as lib/data/store.ts names the files. */
export const RUN_UID = /^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}$/;
/** A conversation's id: a random (v4) UUID, lower case. */
export const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isConversationId = (value: unknown): value is string => typeof value === "string" && CONVERSATION_ID.test(value);

const short = z.string().max(120);
const line = z.string().max(400);
const count = z.number().int().min(0).max(1_000_000);

/** The run a card row is about. */
export const RunRefSchema = z.object({ uid: z.string().regex(RUN_UID), label: short, when: short }).strict();
export type RunRef = z.infer<typeof RunRefSchema>;

/** The /add-on files a reply used (their names, each once; at most one per passage sent). */
export const KnowledgeNamesSchema = z.array(z.string().min(1).max(MAX_NAME)).min(1).max(TOP_K);

/** What a conversation is about: one saved run, or every run (uid null). */
export const ScopeRefSchema = z.object({ uid: z.string().regex(RUN_UID).nullable(), label: short }).strict();
export type ScopeRef = z.infer<typeof ScopeRefSchema>;

const Severity = z.enum(SEVERITIES);
const Review = z.enum(["confirmed", "review", "closed"]);
const StepStatus = z.enum(["pending", "active", "done"]);
const ApprovalState = z.enum(["APPROVED", "REJECTED", "PENDING", "NOT REACHED"]);

const FindingItemSchema = z
  .object({
    id: short,
    title: line,
    severity: Severity,
    cvss: z.number().min(0).max(10).nullable(),
    target: line,
    review: Review,
    run: RunRefSchema,
  })
  .strict();
export type FindingItem = z.infer<typeof FindingItemSchema>;

const FindingsCardSchema = z
  .object({
    kind: z.literal("findings"),
    total: count,
    // the four levels (a conversation saved with an INFO count reads back without it:
    // history-schema.ts `withoutInfoCards`)
    counts: z.object({ CRITICAL: count, HIGH: count, MEDIUM: count, LOW: count }).strict(),
    items: z.array(FindingItemSchema).max(8),
    runs: count, // how many runs the findings come from
  })
  .strict();

const FindingCardSchema = z
  .object({
    kind: z.literal("finding"),
    item: FindingItemSchema,
    cwe: short,
    tool: short,
    description: z.string().max(1_200),
    impact: z.string().max(800),
    remediation: z.array(line).max(6),
  })
  .strict();

const ProgressCardSchema = z
  .object({
    kind: z.literal("progress"),
    runs: z
      .array(
        z
          .object({
            run: RunRefSchema,
            status: z.enum(STATUSES),
            progress: z.number().min(0).max(100),
            phases: z.array(z.object({ label: short, status: StepStatus, pct: z.number().min(0).max(100) }).strict()).max(12),
          })
          .strict(),
      )
      .max(8),
    more: count,
  })
  .strict();

// Fields marked optional came later: conversations saved before them still read back (the
// history store drops a file that fails this schema). The server always sends them.
const ApprovalsCardSchema = z
  .object({
    kind: z.literal("approvals"),
    items: z.array(z.object({ run: RunRefSchema, id: short, action: short, risk: short, target: line, state: ApprovalState }).strict()).max(10),
    waiting: z.array(z.object({ run: RunRefSchema, text: line }).strict()).max(8), // runs paused on another input
    pending: count,
    // every recorded decision counted over all the approvals, before the rows were cut
    counts: z.object({ APPROVED: count, REJECTED: count, PENDING: count, "NOT REACHED": count }).strict().optional(),
    more: count,
  })
  .strict();

const PolicyCardSchema = z
  .object({
    kind: z.literal("policy"),
    checks: count,
    blocked: count,
    // text: "METHOD path · reason" (older saved cards have only this); method, path and reason
    // are the same, each masked on its own
    items: z.array(z.object({ run: RunRefSchema, time: short, text: line, method: short.optional(), path: line.optional(), reason: line.optional() }).strict()).max(8),
    more: count,
  })
  .strict();

const ToolsCardSchema = z
  .object({
    kind: z.literal("tools"),
    runs: z
      .array(
        z
          .object({
            run: RunRefSchema,
            steps: z.array(z.object({ time: short, tool: short, text: line }).strict()).max(10),
            total: count,
            requests: count,
          })
          .strict(),
      )
      .max(6),
    more: count,
  })
  .strict();

const ReportCardSchema = z
  .object({
    kind: z.literal("report"),
    // one run: its downloads; several: "which run?" with these to pick from
    runs: z.array(z.object({ run: RunRefSchema, status: z.enum(STATUSES) }).strict()).min(1).max(8),
    more: count,
  })
  .strict();

const NoticeCardSchema = z
  .object({
    kind: z.literal("notice"),
    tone: z.enum(["info", "warning", "danger"]),
    title: short,
    body: line,
    steps: z.array(line).max(6),
    // always null now; an older saved card's "terminal" (the removed Terminal view's button)
    // still reads, and shows nothing. Nothing acts from the chat.
    action: z.enum(["terminal"]).nullable(),
  })
  .strict();

export const CardSchema = z.discriminatedUnion("kind", [
  FindingsCardSchema,
  FindingCardSchema,
  ProgressCardSchema,
  ApprovalsCardSchema,
  PolicyCardSchema,
  ToolsCardSchema,
  ReportCardSchema,
  NoticeCardSchema,
]);
export type Card = z.infer<typeof CardSchema>;
export type CardOf<K extends Card["kind"]> = Extract<Card, { kind: K }>;

export const MAX_CARDS = 4; // in one reply

// --- frames ------------------------------------------------------------------------------

export const FrameSchema = z.discriminatedUnion("t", [
  z
    .object({
      t: z.literal("meta"),
      conversationId: z.string().regex(CONVERSATION_ID),
      title: z.string().max(80),
      scope: ScopeRefSchema,
      knowledge: KnowledgeNamesSchema.optional(),
    })
    .strict(),
  z.object({ t: z.literal("card"), card: CardSchema }).strict(),
  z.object({ t: z.literal("text"), delta: z.string().max(20_000) }).strict(),
  z.object({ t: z.literal("error"), detail: z.string().max(400) }).strict(),
  z.object({ t: z.literal("done") }).strict(),
]);
export type Frame = z.infer<typeof FrameSchema>;

export const NDJSON = "application/x-ndjson; charset=utf-8";

/** One frame as a line of the stream. */
export const encodeFrame = (frame: Frame): string => `${JSON.stringify(frame)}\n`;

/** One line of the stream as a frame, or null when it isn't one (a broken or unknown line is
    skipped, never trusted). */
export function parseFrame(text: string): Frame | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const parsed = FrameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Splits text that arrives in pieces into frames (a line may be split anywhere). */
export function createFrameReader(onFrame: (frame: Frame) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) {
        const frame = parseFrame(l);
        if (frame) onFrame(frame);
      }
    },
    end() {
      const frame = parseFrame(buffer);
      buffer = "";
      if (frame) onFrame(frame);
    },
  };
}
