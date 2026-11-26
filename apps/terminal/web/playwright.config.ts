/* Build the dashboard first. Playwright starts the normal offline launcher with bundled sample data and drives it in Chromium. */
import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// E2E_PORT moves the test ports together, so several checkouts can test at once.
export const PORT = Number(process.env.E2E_PORT || 3199);
export const TOKEN = "e2e-token-0123456789abcdef";
export const LIVE_PORT = PORT - 2; // a second dashboard with live refresh on (e2e/live-refresh.spec.ts)
/** The signed-in state every spec starts from (e2e/global-setup.ts writes it once per run). */
export const STATE_FILE = path.join(tmpdir(), `reconix-e2e-state-${PORT}.json`);
/** The local /add-on knowledge folder src/lib/assistant/knowledge still reads: always missing
    under a test, never ~/.reconix/knowledge (the page and the answers use the Core API's
    knowledge add-ons, e2e/core-api-stub.mjs). */
export const KNOWLEDGE_DIR = path.join(tmpdir(), `reconix-e2e-knowledge-${PORT}`);

const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
/* The axe pass at a common laptop size with the OS's own motion setting. Always reducing motion
   hid three serious WCAG 2.2 AA violations from this suite (QA-LOCAL-WEB-REPORT, QAL-002), so the
   axe tests of e2e/a11y.spec.ts run a second time here: 1366x768, motion left alone. */
export const AXE_MOTION = "axe-motion";

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
      testMatch: /\/(assistant|knowledge|a11y-assistant|scroll-assistant)\.spec\.ts$/,
      workers: 1,
      dependencies: ["parallel"],
      use: { ...DESKTOP, reducedMotion: "reduce" },
    },
    {
      name: AXE_MOTION,
      testMatch: /\/a11y\.spec\.ts$/,
      grep: /axe/, // its axe tests only: the keyboard ones set their own size and motion
      fullyParallel: true,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
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
        RECONIX_DATA_DIR: "tests/sample-data",
        RECONIX_STALE_AFTER_HOURS: "0",
        RECONIX_LIVE_REFRESH_MS: "1000",
        RECONIX_WEB_URL_FILE: path.join(tmpdir(), `reconix-e2e-live-${PORT}.url`),
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node scripts/serve.mjs start --no-open",
      url: `http://127.0.0.1:${PORT}/login`,
      env: {
        RECONIX_WEB_PORT: String(PORT),
        RECONIX_WEB_TOKEN: TOKEN,
        RECONIX_DATA_DIR: "tests/sample-data",
        // the sample files are old: keep their waiting run waiting instead of reading it as stale
        RECONIX_STALE_AFTER_HOURS: "0",
        // no 10 s self-refresh under a test (a spec that wants it sets its own server)
        RECONIX_LIVE_REFRESH_MS: "0",
        // keep the test server's sign-in link out of ~/.reconix/web.url (a running dashboard's)
        RECONIX_WEB_URL_FILE: path.join(tmpdir(), `reconix-e2e-${PORT}.url`),
        // the AI Assistant's saved conversations go to a test folder, never ~/.reconix/assistant
        RECONIX_ASSISTANT_DIR: path.join(tmpdir(), `reconix-e2e-assistant-${PORT}`),
        // keep the local /add-on folder (still read by src/lib/assistant/knowledge) a test one
        RECONIX_KNOWLEDGE_DIR: KNOWLEDGE_DIR,
        // the specs ask more than the default 12 questions a minute
        RECONIX_ASSISTANT_RATE_PER_MINUTE: "120",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
