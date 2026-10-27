/* End-to-end tests: start the built dashboard on the sample data and drive it in Chromium.
   Run `npm run build` first. Uses Playwright's Chromium (`npx playwright install chromium`)
   or the browser at CHROMIUM_PATH. */
import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// E2E_PORT moves the test ports together, so several checkouts can test at once.
export const PORT = Number(process.env.E2E_PORT || 3199);
export const TOKEN = "e2e-token-0123456789abcdef";
export const LLM_PORT = PORT - 4; // e2e/llm-stub.mjs, the AI Assistant's stand-in model
export const LIVE_PORT = PORT - 2; // a second dashboard with live refresh on (e2e/live-refresh.spec.ts)
/** The signed-in state every spec starts from (e2e/global-setup.ts writes it once per run). */
export const STATE_FILE = path.join(tmpdir(), `reconix-e2e-state-${PORT}.json`);
/** The /add-on knowledge folder the e2e server reads: missing (no knowledge) except while
    e2e/assistant-knowledge.spec.ts writes it or e2e/knowledge.spec.ts uploads to it, never
    ~/.reconix/knowledge. */
export const KNOWLEDGE_DIR = path.join(tmpdir(), `reconix-e2e-knowledge-${PORT}`);
/** The knowledge CLI's key file (the real CLI makes it on its first upload), never ~/.reconix's. */
export const KNOWLEDGE_KEY_FILE = path.join(tmpdir(), `reconix-e2e-knowledge-${PORT}.key`);

const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  workers: 3,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    storageState: STATE_FILE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  /* `parallel`: the specs that share nothing, three at a time, with motion reduced (they test
     content, not the transition). Then, after it, the specs that write to the assistant's
     conversation folder or the knowledge folder on one worker (`serial-assistant`: no two of
     them at once); last, alone, the one that needs the whole CPU for frame timing
     (`serial-motion`). */
  projects: [
    {
      name: "parallel",
      testMatch: /\/(access|assessments|findings|docs|dashboard-fit|scroll|a11y|pages|reports|live-refresh)\.spec\.ts$/,
      fullyParallel: true,
      use: { ...DESKTOP, reducedMotion: "reduce" },
    },
    {
      name: "serial-assistant",
      testMatch: /\/(assistant|assistant-knowledge|knowledge|a11y-assistant|scroll-assistant)\.spec\.ts$/,
      workers: 1,
      dependencies: ["parallel"],
      use: { ...DESKTOP, reducedMotion: "reduce" },
    },
    { name: "serial-motion", testMatch: /\/motion\.spec\.ts$/, dependencies: ["serial-assistant"], use: DESKTOP },
  ],
  webServer: [
    {
      // the same built dashboard with live refresh on every second: only the live-refresh spec uses it
      command: "node scripts/serve.mjs start --no-open",
      url: `http://127.0.0.1:${LIVE_PORT}/login`,
      env: {
        RECONIX_WEB_PORT: String(LIVE_PORT),
        RECONIX_WEB_TOKEN: TOKEN,
        RECONIX_DATA_DIR: "sample-data",
        RECONIX_STALE_AFTER_HOURS: "0",
        RECONIX_LIVE_REFRESH_MS: "1000",
        RECONIX_WEB_URL_FILE: path.join(tmpdir(), `reconix-e2e-live-${PORT}.url`),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node e2e/llm-stub.mjs",
      url: `http://127.0.0.1:${LLM_PORT}/`,
      env: { LLM_STUB_PORT: String(LLM_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "node scripts/serve.mjs start --no-open",
      url: `http://127.0.0.1:${PORT}/login`,
      env: {
        RECONIX_WEB_PORT: String(PORT),
        RECONIX_WEB_TOKEN: TOKEN,
        RECONIX_DATA_DIR: "sample-data",
        // the sample files are old: keep their waiting run waiting instead of reading it as stale
        RECONIX_STALE_AFTER_HOURS: "0",
        // no 10 s self-refresh under a test (a spec that wants it sets its own server)
        RECONIX_LIVE_REFRESH_MS: "0",
        // honour RECONIX_KNOWLEDGE_CLI below (the knowledge CLI's stand-in)
        RECONIX_KNOWLEDGE_CLI_TEST: "1",
        // keep the test server's sign-in link out of ~/.reconix/web.url (a running dashboard's)
        RECONIX_WEB_URL_FILE: path.join(tmpdir(), `reconix-e2e-${PORT}.url`),
        // the AI Assistant's saved conversations go to a test folder, never ~/.reconix/assistant
        RECONIX_ASSISTANT_DIR: path.join(tmpdir(), `reconix-e2e-assistant-${PORT}`),
        // the /add-on knowledge it reads (written only by e2e/assistant-knowledge.spec.ts and, through
        // the Security knowledge page, e2e/knowledge.spec.ts)
        RECONIX_KNOWLEDGE_DIR: KNOWLEDGE_DIR,
        RECONIX_KNOWLEDGE_KEY_FILE: KNOWLEDGE_KEY_FILE,
        // the page's uploads, opens and removals run the CLI's stand-in (honoured only with
        // RECONIX_KNOWLEDGE_CLI_TEST=1, above); remove this line to run them against python -m reconix.knowledge
        RECONIX_KNOWLEDGE_CLI: path.join(__dirname, "e2e", "knowledge-cli-stub.mjs"),
        // the specs ask more than the default 12 questions a minute
        RECONIX_ASSISTANT_RATE_PER_MINUTE: "120",
        // the AI Assistant asks the stand-in, saved as its only model by e2e/global-setup.ts
        // (e2e/models.ts)
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
