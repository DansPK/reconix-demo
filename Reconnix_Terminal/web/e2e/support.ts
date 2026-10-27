/* Shared e2e helpers: sign in, and the expected numbers read straight from the sample files. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

import { TOKEN } from "../playwright.config";
import { isInfoFinding } from "../src/lib/data/schema";

/** Sign in through the sign-in link (the page's own flow). Specs start signed in through
    `storageState` (e2e/global-setup.ts); only the ones that test the sign-in itself call this. */
export async function signInFresh(page: Page, token = TOKEN) {
  await page.goto(`/login#token=${token}`);
  await page.waitForURL((url) => url.pathname === "/");
}

/** `<html data-hydrated>`: the dashboard is interactive (a click before it can be replayed or lost).
    The attribute sits on <html>, which Playwright never counts as "visible": wait for it attached. */
export const hydrated = (page: Page) => page.locator("html[data-hydrated]").waitFor({ state: "attached" });

/** A viewport's name in a test title. */
export const sizeLabel = (s: { width: number; height: number }) => `${s.width}×${s.height}`;

/** How far the page and the content area overflow sideways (0: nothing does). */
export function sideways(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement!;
    const main = document.querySelector("main")!;
    return { page: root.scrollWidth - root.clientWidth, content: main.scrollWidth - main.clientWidth };
  });
}

/** Wait for `n` painted frames (layout, observers and effects triggered by a change have run). */
export const frames = (page: Page, n = 2) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(count);
      }),
    n,
  );

/** Click an element that never holds still (the breathing panel and icons): the same checks as a
    click (it is visible, enabled, and the click lands on it, not on something over it), minus the
    wait for two identical frames that a looping animation never gives. No `force: true`. */
export async function clickMoving(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  const box = (await target.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const lands = await target.evaluate((el, [px, py]) => {
    const hit = document.elementFromPoint(px, py);
    return !!hit && el.contains(hit);
  }, [x, y]);
  expect(lands, "the click would land on something else").toBe(true);
  await page.mouse.click(x, y);
}

/** Runs the dashboard counts a finding for (assistant cards say "N across M runs"). */
export const runsWithFindings = () => sample().filter((a) => counted(a).length > 0);

/** Open the dashboard signed in (the saved state) and wait until it is interactive. */
export async function signIn(page: Page) {
  await page.goto("/");
  await hydrated(page);
}

interface SampleAssessment {
  uid: string;
  label: string;
  target: string;
  status: string;
  waiting_for: string;
  findings: { id: string; severity: string; severity_override?: string; effective_severity?: string; validation: string; title: string; status: string; cvss_score: number; triage_note?: string }[];
  verdicts: { allowed: boolean }[];
  approvals: unknown[];
  created_at: string;
  timeline: { type: string; who: string; text: string }[];
  run: { requests: number };
}

/** The sample files as the dashboard reads them: an informational finding an older file may
    hold is left out, as the reader leaves it out (lib/data/schema.ts `isInfoFinding`). */
export function sample(): SampleAssessment[] {
  const dir = path.join(__dirname, "..", "sample-data");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(readFileSync(path.join(dir, n), "utf8")) as SampleAssessment)
    .map((a) => ({ ...a, findings: a.findings.filter((f) => !isInfoFinding(f)) }));
}

/** The assessment the dashboard opens first: the newest by creation time (as store.ts sorts). */
export function newest(): SampleAssessment {
  return [...sample()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.uid.localeCompare(a.uid))[0];
}

/** Findings the dashboard counts (false positives are left out). */
export const counted = (a: SampleAssessment) => a.findings.filter((f) => f.status !== "false-positive");

/** The run's tool steps (TOOL lines of its activity log). */
export const toolSteps = (a: SampleAssessment) => a.timeline.filter((e) => e.type === "activity" && e.who === "TOOL").length;
