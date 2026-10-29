import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "../../src/routing";

const cases: [string, string][] = [
  ["scan https://github.com/acme/app please", "github"],
  ["check https://github.com/acme/app.git", "github"],
  ["rescan https://github.com/acme/app", "github"], // a link wins over rescan
  ["rescan", "rescan"],
  ["please rescan now", "rescan"],
  ["can you scan again?", "rescan"],
  ["scan this project", "scan"],
  ["Analyze the workspace", "scan"],
  ["analyse my code", "scan"],
  ["check this folder for problems", "scan"],
  ["scan", "chat"], // a verb alone is not enough
  ["what is SQL injection?", "chat"],
  ["explain finding abc123", "chat"],
  ["is this code safe?", "chat"],
  ["the scanner missed a bug in my project", "chat"],
  ["https://gitlab.com/acme/app", "chat"],
  ["switch to anthropic/claude-opus-5-5", "switch"],
  ["use anthropic claude-opus-5-5", "switch"],
  ["change the model", "chat"], // no provider named
  ["use the backend folder", "chat"], // a verb but no provider id
];

for (const [text, kind] of cases) {
  test(`route: ${text}`, () => assert.equal(route(text).kind, kind));
}

test("route parses a switch target", () => {
  assert.deepEqual(route("switch to anthropic/claude-opus-5-5"),
    { kind: "switch", provider: "anthropic", model: "claude-opus-5-5" });
  assert.deepEqual(route("use openai gpt-4o"), { kind: "switch", provider: "openai", model: "gpt-4o" });
  assert.deepEqual(route("switch to reconix"), { kind: "switch", provider: "reconix", model: undefined });
});

test("route extracts a clean GitHub URL", () => {
  assert.deepEqual(route("look at https://github.com/acme/my-app.git, thanks"),
    { kind: "github", url: "https://github.com/acme/my-app" });
  assert.deepEqual(route("(https://github.com/acme/app)."), { kind: "github", url: "https://github.com/acme/app" });
});
