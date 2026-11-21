// A stand-in for an OpenAI-compatible model, for the e2e tests (playwright.config.ts starts it).
// By default it streams a short answer that names how many saved runs the system prompt
// described, how many earlier turns it was sent (the server reads them from its own file) and
// the last question, so the tests see that the route built the context and streamed the reply.
// Only explicit tokens change that (ordinary words never do, so other specs' questions echo):
//   [stub:markdown]  a table and a code block
//   [stub:long]      a long answer, then the stream stays open until the client goes away (or
//                    60 s pass), so Stop never races the end of the answer
//   [stub:fail]      HTTP 500 the first time each such question is asked, a normal answer after
//                    (so Retry can succeed)
//   [stub:empty]     a well-formed stream with no text at all (the model "answered" nothing)
// A model other than stub-model adds " Model: <name>." to the default answer (the Model menu's
// switch is visible), passages of /add-on knowledge in the system prompt add " Knowledge
// passages: <n>." (the route sent them), and GET /v1/models lists stub-model and stub-model-2
// ("Fetch models").
import { createServer } from "node:http";

const port = Number(process.env.LLM_STUB_PORT || 3195);
const HOLD_MS = 60_000;
const failed = new Set();

const MARKDOWN = [
  "## Findings by severity\n\n",
  "Here is what the saved data shows:\n\n",
  "| Finding | Severity | CVSS | Where |\n",
  "|:--|:-:|--:|:--|\n",
  "| F-001 | **High** | 7.5 | `/api/v1/orders?customer_id=1042&include=payment_details,shipping_address` |\n",
  "| F-002 | Medium | 6.3 | `/api/v1/users/me/preferences/notifications/email` |\n\n",
  "Reproduce the first one:\n\n",
  "```bash\n",
  "curl -s 'https://staging.example.com/api/v1/orders?customer_id=1042&include=payment_details,shipping_address' -H 'Accept: application/json' | jq '.items[] | {id, total, customer_id}'\n",
  "```\n\n",
  "- Decide on approvals in the TUI.\n",
];

const LONG = ["## A long answer\n\n"];
for (let i = 1; i <= 40; i++) LONG.push(`Paragraph ${i}: the saved data says this part of the run is described in detail, line after line, so the conversation grows taller than the screen.\n\n`);

const chunk = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

const MODELS = { object: "list", data: [{ id: "stub-model", object: "model" }, { id: "stub-model-2", object: "model" }] };

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(MODELS));
  if (req.method === "GET") return res.writeHead(200).end("stub ready");
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") return res.writeHead(404).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages = [], model = "stub-model" } = JSON.parse(body || "{}");
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const runs = system.match(/ALL SAVED ASSESSMENTS: (\d+)/)?.[1] ?? (system.includes("ASSESSMENT ") ? "1" : "0");
    const question = messages.at(-1)?.content ?? "";
    const earlier = messages.filter((m) => m.role !== "system").length - 1;
    const knowledge = system.split("Internal knowledge (from /add-on files")[1] ?? "";
    const passages = (knowledge.match(/^\[[^\]\n]+ #\d+\] /gm) ?? []).length;
    if (question.includes("[stub:fail]") && !failed.has(question)) {
      failed.add(question);
      return res.writeHead(500, { "Content-Type": "application/json" }).end('{"error":"stub failure"}');
    }
    const long = question.includes("[stub:long]");
    const words = question.includes("[stub:markdown]")
      ? MARKDOWN
      : long
        ? LONG
        : question.includes("[stub:empty]")
          ? []
          : [
              "Stub answer:",
              ` I saw ${runs} runs.`,
              ` Earlier turns: ${earlier}.`,
              " You asked:",
              ` ${question}`,
              ...(model === "stub-model" ? [] : [` Model: ${model}.`]),
              ...(passages ? [` Knowledge passages: ${passages}.`] : []),
            ];
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    let i = 0;
    const next = () => {
      if (res.destroyed) return;
      if (i < words.length) {
        res.write(chunk(words[i++]));
        setTimeout(next, long ? 30 : 40);
      } else if (long) {
        // hold the answer open until the client stops it (or a long time passes)
        const timer = setTimeout(() => res.destroyed || res.end(`${chunk("The end of the long answer.")}data: [DONE]\n\n`), HOLD_MS);
        res.on("close", () => clearTimeout(timer));
      } else res.end("data: [DONE]\n\n");
    };
    next();
  });
}).listen(port, "127.0.0.1");
