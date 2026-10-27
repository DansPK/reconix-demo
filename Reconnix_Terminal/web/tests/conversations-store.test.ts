/* The AI Assistant's saved conversations (lib/assistant/history-store.ts), on a temporary
   folder (RECONIX_ASSISTANT_DIR): owner-only permissions, atomic writes, refusing symlinks and
   oversized or foreign files, retention and limits, masking, ids, and what goes back to the
   model (turns.ts). Never touches ~/.reconix. */
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONVERSATION_FORMAT, type Conversation, MAX_CONVERSATION_MESSAGES, MAX_CONVERSATIONS, MAX_FILE_BYTES } from "@/lib/assistant/history-schema";
import {
  addQuestion,
  deleteAllConversations,
  deleteConversation,
  HistoryError,
  historyDir,
  keptQuestion,
  listConversations,
  markStreaming,
  readConversation,
  renameConversation,
  retentionDays,
  saveReply,
} from "@/lib/assistant/history-store";
import { MAX_QUESTION } from "@/lib/assistant/request";
import { MASK } from "@/lib/assistant/redact";
import { earlierTurns } from "@/lib/assistant/turns";

const ALL = { uid: null, label: "All assessments" };
const DAY = 86_400_000;
const posix = process.platform !== "win32";
let root = "";
let dir = "";
const saved = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "reconix-conv-test-"));
  dir = path.join(root, "assistant");
  process.env.RECONIX_ASSISTANT_DIR = dir;
  delete process.env.RECONIX_ASSISTANT_RETENTION_DAYS;
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

/** A question that must have been saved. */
const added = <T,>(result: T | "busy" | null): T => {
  if (!result || result === "busy") throw new Error(`not saved: ${result}`);
  return result;
};
const ask = async (question: string, id?: string, now?: number) => added(await addQuestion({ id, scope: ALL, question }, now));
const fileOf = (id: string) => path.join(dir, `${id}.json`);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function craft(id: string, updatedAt: number, messages: Conversation["messages"] = [{ id: uuid(999_999), role: "user", content: "hi", at: updatedAt }]): Conversation {
  return { format: CONVERSATION_FORMAT, id, title: `Conversation ${id.slice(-4)}`, scope: ALL, createdAt: updatedAt, updatedAt, messages };
}
const put = (c: Conversation) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(c.id), JSON.stringify(c), { mode: 0o600 });
};

describe("the folder and the files", () => {
  it("lives where RECONIX_ASSISTANT_DIR says, else in ~/.reconix/assistant", () => {
    expect(historyDir()).toBe(dir);
    expect(historyDir({})).toMatch(/[/\\]\.reconix[/\\]assistant$/);
  });
  it.runIf(posix)("is made owner-only (0700) with one 0600 file per conversation", async () => {
    const { conversation } = await ask("What waits on me?");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(readdirSync(dir)).toEqual([`${conversation.id}.json`]);
    expect(statSync(fileOf(conversation.id)).mode & 0o777).toBe(0o600);
  });
  it.runIf(posix)("takes group and other permissions away from an existing folder", async () => {
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    await listConversations();
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });
  it.runIf(posix)("refuses a folder that is a symlink", async () => {
    const real = path.join(root, "elsewhere");
    mkdirSync(real);
    symlinkSync(real, dir);
    await expect(listConversations()).rejects.toBeInstanceOf(HistoryError);
    await expect(addQuestion({ scope: ALL, question: "hi" })).rejects.toBeInstanceOf(HistoryError);
    expect(readdirSync(real)).toEqual([]);
  });
  it("writes atomically: a complete file under the id's name, no temporary file left", async () => {
    const { conversation } = await ask("first");
    await ask("second", conversation.id);
    expect(readdirSync(dir)).toEqual([`${conversation.id}.json`]);
    const text = readFileSync(fileOf(conversation.id), "utf8");
    expect(JSON.parse(text).messages.map((m: { content: string }) => m.content)).toEqual(["first", "second"]);
  });
  it.runIf(posix)("replaces a symlink planted at a conversation's name instead of writing through it", async () => {
    const { conversation } = await ask("first");
    const victim = path.join(root, "victim.txt");
    writeFileSync(victim, "keep me");
    rmSync(fileOf(conversation.id));
    symlinkSync(victim, fileOf(conversation.id));
    expect(await readConversation(conversation.id)).toBeNull(); // never read through a link
    expect(await addQuestion({ id: conversation.id, scope: ALL, question: "again" })).toBeNull();
    expect(await renameConversation(conversation.id, "new")).toBeNull();
    expect(await saveReply(conversation.id, { replyTo: conversation.messages[0].id, content: "x", cards: [], state: "done" })).toBe(false);
    expect(readFileSync(victim, "utf8")).toBe("keep me");
    expect(await listConversations()).toEqual([]);
  });
  it.runIf(posix)("never reads a conversation through a symlink", async () => {
    const outside = path.join(root, "outside.json");
    const c = craft(uuid(1), Date.now());
    writeFileSync(outside, JSON.stringify(c));
    mkdirSync(dir, { mode: 0o700 });
    symlinkSync(outside, fileOf(c.id));
    expect(await readConversation(c.id)).toBeNull();
    expect(await listConversations()).toEqual([]);
  });
  it("skips files that are too big, not JSON, not the format, or named after another id", async () => {
    const big = craft(uuid(1), Date.now());
    put(big);
    writeFileSync(fileOf(big.id), JSON.stringify(big).padEnd(MAX_FILE_BYTES + 10, " "));
    const broken = uuid(2);
    writeFileSync(fileOf(broken), "{not json");
    const foreign = uuid(3);
    writeFileSync(fileOf(foreign), JSON.stringify({ ...craft(foreign, Date.now()), format: "something/else" }));
    const swapped = craft(uuid(4), Date.now());
    writeFileSync(fileOf(uuid(5)), JSON.stringify(swapped));
    const extra = craft(uuid(6), Date.now());
    writeFileSync(fileOf(extra.id), JSON.stringify({ ...extra, injected: "field" }));
    for (const id of [big.id, broken, foreign, uuid(5), extra.id]) expect(await readConversation(id)).toBeNull();
    expect(await listConversations()).toEqual([]);
    expect(existsSync(fileOf(broken))).toBe(true); // not ours to delete
  });
});

describe("refusals", () => {
  it.runIf(posix)("refuses a parent folder others can write to, unless it is sticky", async () => {
    chmodSync(root, 0o777);
    await expect(listConversations()).rejects.toThrow("can be changed by other users");
    chmodSync(root, 0o1777);
    await expect(listConversations()).resolves.toEqual([]);
    chmodSync(root, 0o700);
  });
  it("only 'no such file' means already deleted; anything else is reported", async () => {
    mkdirSync(path.join(dir, `${uuid(7)}.json`), { recursive: true }); // a folder can't be unlinked
    expect(await deleteConversation(uuid(8))).toBe(false);
    await expect(deleteConversation(uuid(7))).rejects.toThrow("The conversation could not be deleted.");
    await ask("one");
    await expect(deleteAllConversations()).rejects.toThrow("Some conversations could not be deleted.");
  });
  it.runIf(posix)("never names a path in an error", async () => {
    mkdirSync(path.join(dir, `${uuid(7)}.json`), { recursive: true });
    const errors: string[] = [];
    for (const attempt of [() => deleteConversation(uuid(7)), () => deleteAllConversations()]) await attempt().catch((e: Error) => errors.push(e.message));
    rmSync(dir, { recursive: true });
    symlinkSync(root, dir);
    await listConversations().catch((e: Error) => errors.push(e.message));
    expect(errors).toHaveLength(3);
    for (const message of errors) {
      expect(message).not.toContain(root);
      expect(message).not.toContain(tmpdir());
    }
  });
  it("keeps one change queue for every module copy (on globalThis)", async () => {
    await ask("one");
    expect((globalThis as Record<symbol, unknown>)[Symbol.for("reconix.assistant.history.queue")]).toBeInstanceOf(Promise);
  });
});

describe("ids", () => {
  it.each(["../x", "nope", "", "0B0E2D55-1C5A-4B1E-9B8C-2F1D3C4B5A69", `${uuid(1)}/../x`])("refuses %j", async (id) => {
    expect(await readConversation(id)).toBeNull();
    expect(await deleteConversation(id)).toBe(false);
    expect(await addQuestion({ id, scope: ALL, question: "hi" })).toBeNull();
    expect(await renameConversation(id, "x")).toBeNull();
  });
  it("gives each new conversation a random v4 id", async () => {
    const a = (await ask("a")).conversation.id;
    const b = (await ask("b")).conversation.id;
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("what is saved", () => {
  it("masks questions, titles and replies, and cuts the title to 60 characters", async () => {
    const { conversation, asked } = await ask("Why does password=hunter2 fail with Bearer abcdefghijklmnop on /login?");
    expect(asked.content).not.toContain("hunter2");
    expect(asked.content).toContain(MASK);
    expect(conversation.title).not.toContain("hunter2");
    expect(conversation.title.length).toBeLessThanOrEqual(60);
    await saveReply(conversation.id, { replyTo: asked.id, content: "Use token=s3cr3tvalue123 instead", cards: [], state: "done" });
    const text = readFileSync(fileOf(conversation.id), "utf8");
    expect(text).not.toMatch(/hunter2|abcdefghijklmnop|s3cr3tvalue123/);
  });
  it("keeps the scope a conversation was started with", async () => {
    const scope = { uid: "20261005-140300-9f76_RCX-DEMO-002", label: "RCX-DEMO-002 · 5 Oct 14:03" };
    const first = added(await addQuestion({ scope, question: "a" }));
    const next = added(await addQuestion({ id: first.conversation.id, scope: ALL, question: "b" }));
    expect(next.conversation.scope).toEqual(scope);
  });
  it("puts a reply right after its question, even when another question came first", async () => {
    const { conversation, asked: q1 } = await ask("one");
    const { asked: q2 } = await ask("two", conversation.id);
    expect(await saveReply(conversation.id, { replyTo: q1.id, content: "first answer", cards: [], state: "stopped" })).toBe(true);
    expect(await saveReply(conversation.id, { replyTo: q2.id, content: "second answer", cards: [], state: "done" })).toBe(true);
    const c = (await readConversation(conversation.id))!;
    expect(c.messages.map((m) => m.content)).toEqual(["one", "first answer", "two", "second answer"]);
    expect(c.messages[1]).toMatchObject({ role: "assistant", state: "stopped", replyTo: q1.id });
    expect(await saveReply(conversation.id, { replyTo: uuid(42), content: "lost", cards: [], state: "done" })).toBe(false);
  });
  it("replaces a failed question and its error on retry", async () => {
    const { conversation, asked } = await ask("one");
    await saveReply(conversation.id, { replyTo: asked.id, content: "", cards: [], state: "error", detail: "The model is down." });
    const again = added(await addQuestion({ id: conversation.id, scope: ALL, question: "one", retry: true }));
    expect(again.conversation.messages.map((m) => m.role)).toEqual(["user"]);
    const noReply = added(await addQuestion({ id: conversation.id, scope: ALL, question: "one", retry: true }));
    expect(noReply.conversation.messages).toHaveLength(1); // a question with no reply is replaced too
  });
  it("replaces only the same question on retry, never an earlier failed turn", async () => {
    const { conversation, asked } = await ask("one");
    await saveReply(conversation.id, { replyTo: asked.id, content: "", cards: [], state: "error", detail: "down" });
    const other = added(await addQuestion({ id: conversation.id, scope: ALL, question: "two", retry: true }));
    expect(other.conversation.messages.map((m) => m.content)).toEqual(["one", "", "two"]);
    await saveReply(conversation.id, { replyTo: other.asked.id, content: "fine", cards: [], state: "done" });
    const late = added(await addQuestion({ id: conversation.id, scope: ALL, question: "one", retry: true }));
    expect(late.conversation.messages.map((m) => m.content)).toEqual(["one", "", "two", "fine", "one"]);
  });
  it("refuses to retry a question that is still being answered", async () => {
    const { conversation, asked } = await ask("one");
    const done = markStreaming(asked.id);
    expect(await addQuestion({ id: conversation.id, scope: ALL, question: "one", retry: true })).toBe("busy");
    done();
    expect(added(await addQuestion({ id: conversation.id, scope: ALL, question: "one", retry: true })).conversation.messages).toHaveLength(1);
  });
  it("masks first, then cuts, so a question near the limit still fits", async () => {
    const question = `${"x".repeat(MAX_QUESTION - 12)} password=a`;
    expect(question.length).toBeLessThanOrEqual(MAX_QUESTION);
    expect(keptQuestion(question).length).toBe(MAX_QUESTION);
    const { asked } = await ask(question);
    expect(asked.content.length).toBe(MAX_QUESTION);
    expect(asked.content).not.toContain("password=a");
  });
  it("renames (masked, one line), and refuses an empty name", async () => {
    const { conversation } = await ask("one");
    expect((await renameConversation(conversation.id, "  Triage\\nnotes  api_key=abc123def  "))!.title).toBe(`Triage\\nnotes api_key=${MASK}`);
    expect((await renameConversation(conversation.id, "Line\none"))!.title).toBe("Line one");
    await expect(renameConversation(conversation.id, " ​ ")).rejects.toBeInstanceOf(HistoryError);
  });
  it("deletes one, or all (with unfinished writes)", async () => {
    const a = (await ask("a")).conversation.id;
    const b = (await ask("b")).conversation.id;
    expect(await deleteConversation(a)).toBe(true);
    expect(await deleteConversation(a)).toBe(false);
    writeFileSync(path.join(dir, `.${b}.0123456789ab.tmp`), "{");
    expect(await deleteAllConversations()).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("a conversation saved while there was an Info level", () => {
  const now = Date.now();
  const run = { uid: "20261005-140300-9f76_RCX-DEMO-002", label: "RCX-DEMO-002", when: "5 Oct 14:03" };
  const item = (id: string, severity: string) => ({ id, title: `Finding ${id}`, severity, cvss: null, target: "https://example.test", review: "review", run });
  const findings = { kind: "findings", total: 7, counts: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1, INFO: 2 }, items: [item("F-1", "CRITICAL"), item("IMP-5", "INFO")], runs: 1 };
  const finding = { kind: "finding", item: item("IMP-6", "INFO"), cwe: "—", tool: "nuclei", description: "d", impact: "i", remediation: [] };
  const reply = (n: number, cards: unknown[]) => ({ id: uuid(n + 1), role: "assistant", replyTo: uuid(n), content: `answer ${n}`, cards, state: "done", at: now });
  const old = {
    format: CONVERSATION_FORMAT,
    id: uuid(7),
    title: "Old findings",
    scope: ALL,
    createdAt: now,
    updatedAt: now,
    messages: [
      { id: uuid(1), role: "user", content: "Analyze the findings", at: now },
      reply(1, [findings]),
      { id: uuid(3), role: "user", content: "Explain IMP-6", at: now },
      reply(3, [finding, findings]),
    ],
  };

  it("still loads, without the INFO count, rows and card, and its total without them", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(fileOf(old.id), JSON.stringify(old), { mode: 0o600 });
    const c = (await readConversation(old.id))!;
    expect(c).not.toBeNull();
    expect(c.messages.map((m) => m.content)).toEqual(["Analyze the findings", "answer 1", "Explain IMP-6", "answer 3"]);
    const cards = c.messages.flatMap((m) => (m.role === "assistant" ? m.cards : []));
    expect(cards.map((x) => x.kind)).toEqual(["findings", "findings"]); // the card about the INFO finding is gone
    for (const card of cards) {
      expect(card).toMatchObject({ total: 5, counts: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1 }, runs: 1 });
      if (card.kind === "findings") expect(card.items.map((i) => i.id)).toEqual(["F-1"]);
    }
    expect(JSON.stringify(c)).not.toContain("INFO");
    expect((await listConversations()).map((s) => s.id)).toContain(old.id);
  });

  it("is saved back without Info on its next answer", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(fileOf(old.id), JSON.stringify(old), { mode: 0o600 });
    const { asked } = await ask("And now?", old.id);
    expect(await saveReply(old.id, { replyTo: asked.id, content: "fine", cards: [], state: "done" })).toBe(true);
    const text = readFileSync(fileOf(old.id), "utf8");
    expect(text).not.toContain("INFO");
    expect(text).not.toContain('"IMP-5"'); // the INFO rows left with their count
  });
});

describe("retention and limits", () => {
  it("deletes a conversation after 30 days without use, on the next list", async () => {
    const now = Date.now();
    put(craft(uuid(1), now - 31 * DAY));
    put(craft(uuid(2), now - 29 * DAY));
    expect(retentionDays()).toBe(30);
    expect((await readConversation(uuid(1)))).toBeNull(); // past its time: not read either
    expect((await listConversations(now)).map((c) => c.id)).toEqual([uuid(2)]);
    expect(existsSync(fileOf(uuid(1)))).toBe(false);
  });
  it("follows RECONIX_ASSISTANT_RETENTION_DAYS (0 keeps them)", async () => {
    const now = Date.now();
    put(craft(uuid(1), now - 400 * DAY));
    process.env.RECONIX_ASSISTANT_RETENTION_DAYS = "0";
    expect((await listConversations(now)).map((c) => c.id)).toEqual([uuid(1)]);
    process.env.RECONIX_ASSISTANT_RETENTION_DAYS = "1";
    put(craft(uuid(2), now - 2 * DAY));
    expect(await listConversations(now)).toEqual([]);
    process.env.RECONIX_ASSISTANT_RETENTION_DAYS = "soon";
    expect(retentionDays()).toBe(30);
  });
  it(`keeps at most ${MAX_CONVERSATIONS} conversations, the oldest go first`, async () => {
    const now = Date.now();
    for (let i = 0; i < MAX_CONVERSATIONS + 1; i++) put(craft(uuid(i + 1), now - (i + 1) * 60_000));
    const { conversation } = await ask("newest", undefined, now);
    const kept = await listConversations(now);
    expect(kept).toHaveLength(MAX_CONVERSATIONS);
    expect(kept[0].id).toBe(conversation.id);
    expect(existsSync(fileOf(uuid(MAX_CONVERSATIONS + 1)))).toBe(false);
    expect(existsSync(fileOf(uuid(MAX_CONVERSATIONS)))).toBe(false);
    expect(existsSync(fileOf(uuid(MAX_CONVERSATIONS - 1)))).toBe(true);
  });
  it(`keeps at most ${MAX_CONVERSATION_MESSAGES} messages, the newest, starting with a question`, async () => {
    const now = Date.now();
    const messages: Conversation["messages"] = [];
    for (let i = 0; i < MAX_CONVERSATION_MESSAGES / 2; i++) {
      messages.push({ id: uuid(2 * i + 1), role: "user", content: `q${i}`, at: now });
      messages.push({ id: uuid(2 * i + 2), role: "assistant", replyTo: uuid(2 * i + 1), content: `a${i}`, cards: [], state: "done", at: now });
    }
    put(craft(uuid(900_000), now, messages));
    const { conversation } = await ask("one more", uuid(900_000), now);
    expect(conversation.messages.length).toBeLessThanOrEqual(MAX_CONVERSATION_MESSAGES);
    expect(conversation.messages[0].role).toBe("user");
    expect(conversation.messages.at(-1)?.content).toBe("one more");
  });
  it("keeps a file under 1 MB by dropping the oldest messages", async () => {
    const now = Date.now();
    const messages: Conversation["messages"] = [];
    for (let i = 0; i < 90; i++) {
      messages.push({ id: uuid(2 * i + 1), role: "user", content: "q".repeat(3_900), at: now });
      messages.push({ id: uuid(2 * i + 2), role: "assistant", replyTo: uuid(2 * i + 1), content: "a".repeat(15_000), cards: [], state: "done", at: now });
    }
    const big = craft(uuid(800_000), now, messages);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(fileOf(big.id), JSON.stringify({ ...big, messages: messages.slice(-40) }));
    const { conversation } = await ask("x".repeat(3_000), big.id, now);
    expect(statSync(fileOf(big.id)).size).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(conversation.messages.at(-1)?.role).toBe("user");
  });
  it.runIf(posix)("removes an unreadable file named like a conversation once its last change is past retention", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const old = new Date(Date.now() - 40 * DAY);
    const stale = fileOf(uuid(1));
    const fresh = fileOf(uuid(2));
    const link = fileOf(uuid(3));
    const notOurs = path.join(dir, "notes.json");
    writeFileSync(stale, "{broken");
    writeFileSync(fresh, "{broken");
    writeFileSync(notOurs, "{broken");
    symlinkSync(stale, link);
    utimesSync(stale, old, old);
    utimesSync(notOurs, old, old);
    await listConversations();
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(lstatSync(link).isSymbolicLink()).toBe(true); // a link is left alone
    expect(existsSync(notOurs)).toBe(true);
    process.env.RECONIX_ASSISTANT_RETENTION_DAYS = "0";
    utimesSync(fresh, old, old);
    await listConversations();
    expect(existsSync(fresh)).toBe(true); // 0 keeps everything
  });
  it.runIf(posix)("removes an unfinished write after ten minutes", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stale = path.join(dir, `.${uuid(1)}.0123456789ab.tmp`);
    const fresh = path.join(dir, `.${uuid(2)}.0123456789ab.tmp`);
    writeFileSync(stale, "{");
    writeFileSync(fresh, "{");
    const old = new Date(Date.now() - 11 * 60_000);
    utimesSync(stale, old, old);
    await listConversations();
    expect(existsSync(stale)).toBe(false);
    expect(lstatSync(fresh).isFile()).toBe(true);
  });
});

describe("earlierTurns", () => {
  const at = 0;
  const q = (n: number, content = `q${n}`) => ({ id: uuid(n), role: "user" as const, content, at });
  const a = (n: number, replyTo: number, state: "done" | "stopped" | "error" = "done", content = `a${n}`) => ({ id: uuid(n), role: "assistant" as const, replyTo: uuid(replyTo), content, cards: [], state, at });
  it("sends answered turns before the new question, leaving failed ones out", () => {
    const messages = [q(1), a(2, 1), q(3), a(4, 3, "error", ""), q(5), a(6, 5, "stopped", "partial"), q(7)];
    expect(earlierTurns(messages, uuid(7))).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "q5" },
      { role: "assistant", content: "partial" },
    ]);
  });
  it("keeps the newest turns within the size budget", () => {
    const messages = Array.from({ length: 20 }, (_, i) => [q(2 * i + 1, "x".repeat(1_000)), a(2 * i + 2, 2 * i + 1, "done", "y".repeat(2_000))]).flat();
    const turns = earlierTurns([...messages, q(99)], uuid(99));
    expect(turns.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(24_000);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)?.content).toBe("y".repeat(2_000));
  });
});
