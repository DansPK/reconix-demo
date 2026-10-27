/* The page's side of the assistant's routes (lib/assistant/client.ts), in the node environment
   with fetch mocked: reading an answer frame by frame (the conversation id from the header,
   a broken stream, a missing "done"), what a retry sends, failures in words, a conversation
   that is gone, and turning a saved conversation into the page's messages. */
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/assistant/client";
import { CONVERSATION_FORMAT, type Conversation } from "@/lib/assistant/history-schema";
import { encodeFrame, type Frame } from "@/lib/assistant/protocol";

const ID = "0b0e2d55-1c5a-4b1e-9b8c-2f1d3c4b5a69";
const Q = "11111111-1111-4111-8111-111111111111";
const scope = { uid: null, label: "All assessments" };
const frames: Frame[] = [
  { t: "meta", conversationId: ID, title: "What waits?", scope },
  { t: "text", delta: "Nothing " },
  { t: "text", delta: "waits ✓" },
  { t: "done" },
];

/** A streamed response that sends `chunks` (strings, or an Error to break off). */
function streamed(chunks: (string | Error)[], headers: Record<string, string> = { "x-conversation-id": ID }) {
  const bytes = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[i++];
      if (next === undefined) controller.close();
      else if (next instanceof Error) controller.error(next);
      else controller.enqueue(bytes.encode(next));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson", ...headers } });
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const body: api.AskBody = { uid: null, question: "What waits?" };
const run = async (response: Response, request: api.AskBody = body) => {
  fetchMock.mockResolvedValueOnce(response);
  const seen: Frame[] = [];
  const started: string[] = [];
  const result = await api.askQuestion(request, new AbortController().signal, (f) => seen.push(f), (id) => started.push(id));
  return { result, seen, started };
};

describe("askQuestion", () => {
  it("reads frames split anywhere, and the conversation id from the header first", async () => {
    const text = frames.map(encodeFrame).join("");
    const pieces = Array.from({ length: Math.ceil(text.length / 5) }, (_, i) => text.slice(i * 5, i * 5 + 5));
    const { result, seen, started } = await run(streamed(pieces));
    expect(result).toEqual({ ok: true, complete: true });
    expect(seen).toEqual(frames);
    expect(started).toEqual([ID]);
  });
  it("says when the answer ended without its done frame", async () => {
    const { result, seen } = await run(streamed(frames.slice(0, 2).map(encodeFrame)));
    expect(result).toEqual({ ok: true, complete: false });
    expect(seen).toHaveLength(2);
  });
  it("rejects when the stream breaks off, after the frames that arrived", async () => {
    fetchMock.mockResolvedValueOnce(streamed([encodeFrame(frames[0]), encodeFrame(frames[1]), new Error("socket hang up")]));
    const seen: Frame[] = [];
    await expect(api.askQuestion(body, new AbortController().signal, (f) => seen.push(f))).rejects.toThrow();
    expect(seen.map((f) => f.t)).toEqual(["meta", "text"]);
  });
  it("skips lines that aren't frames and ignores a header that isn't a conversation id", async () => {
    const { seen, started } = await run(streamed(["not json\n", '{"t":"html","html":"<b>"}\n', encodeFrame({ t: "done" })], { "x-conversation-id": "../x" }));
    expect(seen).toEqual([{ t: "done" }]);
    expect(started).toEqual([]);
  });
  it("sends only the conversation, the run, the question and retry", async () => {
    await run(streamed([encodeFrame({ t: "done" })]), { conversationId: ID, uid: null, question: "Again?", retry: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ conversationId: ID, uid: null, question: "Again?", retry: true });
  });
  it("turns a refusal into words: the server's, or a fallback", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ detail: "Too many questions at once." }, { status: 429 }));
    expect(await api.askQuestion(body, new AbortController().signal, () => {})).toEqual({ ok: false, status: 429, detail: "Too many questions at once." });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    const failed = await api.askQuestion(body, new AbortController().signal, () => {});
    expect(failed).toMatchObject({ ok: false, status: 502 });
    expect(!failed.ok && failed.detail).toContain("HTTP 502");
  });
});

describe("the conversation calls", () => {
  const conversation: Conversation = {
    format: CONVERSATION_FORMAT,
    id: ID,
    title: "What waits?",
    scope,
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { id: Q, role: "user", content: "What waits?", at: 1 },
      { id: "22222222-2222-4222-8222-222222222222", role: "assistant", replyTo: Q, content: "", cards: [], state: "error", detail: "Model down.", at: 2 },
    ],
  };
  it("reports a conversation that is gone as 404, and a broken answer as not understood", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ detail: "That conversation is not saved any more." }, { status: 404 }));
    expect(await api.readConversation(ID)).toEqual({ ok: false, status: 404, detail: "That conversation is not saved any more." });
    fetchMock.mockResolvedValueOnce(Response.json({ conversation: { ...conversation, messages: "nope" } }));
    expect(await api.readConversation(ID)).toMatchObject({ ok: false, status: 500 });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await api.listConversations()).toMatchObject({ ok: false, status: 0 });
  });
  it("reads one, and lists them", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ conversation }));
    expect(await api.readConversation(ID)).toEqual({ ok: true, conversation });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/assistant/conversations/${ID}`);
    fetchMock.mockResolvedValueOnce(Response.json({ conversations: [{ id: ID, title: "t", scope, createdAt: 1, updatedAt: 2, count: 2 }], retentionDays: 30 }));
    expect(await api.listConversations()).toMatchObject({ ok: true, conversations: [{ id: ID }] });
  });
  it("renames and deletes with the right methods, and returns how many went", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: ID, title: "New name" }));
    expect(await api.renameConversation(ID, "New name")).toEqual({ ok: true, title: "New name" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ title: "New name" }) });
    fetchMock.mockResolvedValueOnce(Response.json({ deleted: 3 }));
    expect(await api.deleteAllConversations()).toEqual({ ok: true, deleted: 3 });
    fetchMock.mockResolvedValueOnce(Response.json({ detail: "Some conversations could not be deleted." }, { status: 500 }));
    expect(await api.deleteAllConversations()).toEqual({ ok: false, status: 500, detail: "Some conversations could not be deleted." });
  });
  it("turns a saved conversation into the page's messages, with Retry's question", () => {
    expect(api.toMessages(conversation)).toEqual([
      { id: Q, role: "user", content: "What waits?" },
      { id: "22222222-2222-4222-8222-222222222222", role: "assistant", content: "", cards: [], state: "error", detail: "Model down.", question: "What waits?" },
    ]);
    const done = { ...conversation, messages: [conversation.messages[0], { ...conversation.messages[1], state: "done" as const, content: "ok", detail: undefined }] };
    expect(api.toMessages(done)[1]).toMatchObject({ content: "ok", state: undefined });
  });
});

describe("asQuestion", () => {
  it("masks first, then cuts to the limit", async () => {
    const { asQuestion } = await import("@/components/assistant/use-asking");
    const masked = asQuestion(`  ${"x".repeat(3_988)} password=a  `);
    expect(masked.length).toBe(4_000);
    expect(masked).not.toContain("password=a");
  });
});
