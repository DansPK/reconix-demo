/* The dashboard ↔ AI Assistant transition (components/assistant/motion.ts, assistant-stage.tsx):
   its directions and timing sampled frame by frame, the one globe carried behind the welcome and
   faded out once the conversation starts, a reply's mark glowing while it is written (the header's
   still), the history entry and rapid clicks, the direct address,
   phones and reduced motion. The globe runs on SwiftShader here, so the timing tests hide its
   canvas (the carrier still travels) to keep the frames coming. Times are measured from the first
   frame that moves, with room for a slow (2–4 core) machine. */
import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { MOTION } from "../src/components/assistant/motion";
import { clickMoving, counted, newest, sample as savedRuns, signIn } from "./support";

/** When a MOTION tween ends, in ms from its timeline's start (a staggered one: its last piece). */
const ends = (t: { at: number; duration: number; stagger?: number }, pieces = 1) => Math.round((t.at + t.duration + (t.stagger ?? 0) * (pieces - 1)) * 1000);
/** The floor of a measured time: 0.8 × the design value (a machine can only be slower). */
const atLeast = (designMs: number) => 0.8 * designMs;
const PIECES = 3; // the assistant's header, conversation and composer ([data-assistant-piece])
/** The whole open: the last piece landing (≈1.6 s); the whole close: the top bar back (≈1.4 s). */
const OPEN_MS = ends(MOTION.open.pieces, PIECES);
const CLOSE_MS = ends(MOTION.close.topbar);

test.use({
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
});

const tab = (page: Page) => page.locator('nav[aria-label="Views"] button[aria-label="AI Assistant"]');
const nav = (page: Page, name: string) => page.locator(`nav[aria-label="Views"] button[aria-label^="${name}"]`);
/** The panel breathes, so the button is never "stable": clickMoving does every other check. */
const minimize = (page: Page) => clickMoving(page, page.getByRole("button", { name: "Back to the dashboard" }));
const composer = (page: Page) => page.getByRole("textbox", { name: /^Ask about/ }).last();
const settled = (page: Page) => expect(page.locator(".dash-frame[data-breathing]")).toHaveCount(1, { timeout: 8000 });
const closed = (page: Page) => expect(page.locator(".dash-assistant-stage[data-on]")).toHaveCount(0, { timeout: 8000 });
const canvas = (page: Page) => page.locator(".dash-globe-canvas");
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
/** The active marker of the sidebar's `name` item (its ::after), as the page draws it now. */
const marker = (page: Page, name: string) =>
  nav(page, name).evaluate((el) => {
    const cs = getComputedStyle(el, "::after");
    return { opacity: cs.opacity, transform: cs.transform, duration: cs.transitionDuration, animation: cs.animationName };
  });
const carrierOpacity = (page: Page) => page.locator(".dash-globe-carrier").evaluate((el) => Number(getComputedStyle(el).opacity));

// The Overview's groups, by the data-motion contract only (the first "fade" is the hero's title),
// and the frame's own top bar.
const PARTS = {
  topbar: ".dash-frame > header",
  top: '[data-motion="top"]',
  right: '[data-motion="right"]',
  bottom: '[data-motion="bottom"]',
  hero: '[data-motion="hero"]',
  fade: '[data-motion="fade"]',
  surface: ".dash-assistant-surface",
  front: ".dash-assistant-front",
  stage: ".dash-assistant-stage",
  carrier: ".dash-globe-carrier",
} as const;
type Name = keyof typeof PARTS;
type Sample = { box: { x: number; y: number; w: number; h: number }; o: number; tx: number; ty: number; s: number } | null;
type Frame = Record<Name, Sample> & { t: number; pieces: number[]; settled: boolean };

/** Every frame for `ms` after the next pointerdown: each part's box, opacity and transform. */
function sample(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    ({ parts, ms }) =>
      new Promise<Frame[]>((resolve) => {
        const out: Frame[] = [];
        let clickAt: number | null = null;
        document.addEventListener("pointerdown", () => (clickAt ??= performance.now()), { capture: true, once: true });
        const read = (selector: string): Sample => {
          const el = document.querySelector<HTMLElement>(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
          const o = Number(cs.opacity) * (cs.visibility === "hidden" ? 0 : 1);
          return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, o, tx: m.e, ty: m.f, s: m.a };
        };
        const tick = () => {
          if (clickAt !== null) {
            const frame = { t: performance.now() - clickAt } as Frame;
            for (const [name, selector] of Object.entries(parts)) frame[name as Name] = read(selector);
            frame.pieces = [...document.querySelectorAll("[data-assistant-piece]")].map((p) => Number(getComputedStyle(p).opacity));
            frame.settled = document.querySelector(".dash-frame")!.hasAttribute("data-breathing");
            out.push(frame);
            if (frame.t > ms) return resolve(out);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { parts: PARTS, ms },
  );
}

/** The first and last frame times at which `pick` changes by more than `eps`. */
function moves(frames: Frame[], pick: (f: Frame) => number, eps = 0.5): [number, number] {
  let first = -1;
  let last = -1;
  for (let i = 1; i < frames.length; i++) {
    if (Math.abs(pick(frames[i]) - pick(frames[i - 1])) > eps) {
      if (first < 0) first = frames[i - 1].t;
      last = frames[i].t;
    }
  }
  return [first, last];
}

/** Signed in, with the intro's reveal over: the frame unscaled and the parts still for 5 frames. */
async function ready(page: Page) {
  await signIn(page);
  await page.waitForFunction(
    (parts) =>
      new Promise<boolean>((resolve) => {
        const key = () => {
          const frame = document.querySelector(".dash-frame");
          if (!frame || getComputedStyle(frame).transform !== "none") return null;
          const els = [parts.topbar, parts.top, parts.right, parts.bottom, parts.hero, parts.fade, ".dash-navbtn"].map((s) =>
            document.querySelector<HTMLElement>(s),
          );
          if (els.some((el) => !el || getComputedStyle(el).opacity !== "1")) return null;
          return els.map((el) => JSON.stringify(el!.getBoundingClientRect())).join("|");
        };
        let last = key();
        let still = 0;
        const tick = () => {
          const now = key();
          still = now !== null && now === last ? still + 1 : 0;
          last = now;
          if (still >= 5) resolve(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    PARTS,
    { timeout: 20_000 },
  );
}
const hideCanvas = (page: Page) => page.addStyleTag({ content: ".dash-globe-canvas { display: none !important; }" });

test("opening grows the hero into the assistant while the dashboard leaves, closing reverses it", async ({ page }) => {
  await ready(page);
  await hideCanvas(page);
  const recording = sample(page, 2600);
  await tab(page).click();
  const open = await recording;
  const first = open[0];
  const last = open.at(-1)!;
  const hero = first.hero!.box;

  // the four directions, all fading
  expect(last.topbar!.ty).toBeLessThanOrEqual(-first.topbar!.box.h + 1);
  expect(last.top!.ty).toBeLessThanOrEqual(-40); // the summary strip, up
  expect(last.right!.tx).toBeGreaterThanOrEqual(100);
  expect(last.bottom!.ty).toBeGreaterThanOrEqual(100);
  for (const part of ["topbar", "top", "right", "bottom", "fade"] as const) expect(last[part]!.o).toBe(0);
  // from the first frame that moves: the hero text goes first; the top bar, the summary strip,
  // the right column and the bottom row leave in that order, overlapping
  const [t0] = moves(open, (f) => f.topbar!.ty);
  const after = (f: Frame) => f.t - t0;
  expect(after(open.find((f) => f.fade!.o === 0)!)).toBeLessThan(650);
  // each one's start: 3% of its own travel (the strip moves 48 px, the others 140)
  const started = (pick: (f: Frame) => number, travel: number) => open.find((f) => Math.abs(pick(f)) > travel * 0.03)!.t;
  const topStart = started((f) => f.top!.ty, 48);
  const rightStart = started((f) => f.right!.tx, 140);
  const bottomStart = started((f) => f.bottom!.ty, 140);
  const [, bottomEnd] = moves(open, (f) => f.bottom!.ty);
  expect(topStart).toBeGreaterThanOrEqual(t0);
  expect(rightStart).toBeGreaterThanOrEqual(topStart);
  expect(bottomStart).toBeGreaterThanOrEqual(rightStart);
  expect(bottomEnd).toBeGreaterThan(atLeast(ends(MOTION.open.bottom))); // from the click
  expect(bottomEnd - t0).toBeLessThan(1500);

  // the surface: from the hero's box to the whole stage, growing the whole time it moves
  const growing = open.filter((f) => f.t > t0);
  const start = growing[0].surface!.box;
  expect(Math.abs(start.x - hero.x)).toBeLessThan(4);
  expect(Math.abs(start.w - hero.w)).toBeLessThan(6);
  expect(Math.abs(start.h - hero.h)).toBeLessThan(6);
  expect(last.surface!.box).toEqual(last.stage!.box);
  for (let i = 1; i < growing.length; i++) expect(growing[i].surface!.box.w).toBeGreaterThanOrEqual(growing[i - 1].surface!.box.w - 0.5);
  const [growStart, growEnd] = moves(open, (f) => f.surface!.box.w);
  expect(growStart).toBeLessThan(bottomEnd); // continuous: it grows while the dashboard is still leaving
  expect(growEnd).toBeGreaterThan(atLeast(ends(MOTION.open.surface)));
  expect(growEnd - t0).toBeLessThan(1900);

  // the pieces come in at the end; the whole open lands in about 1.6 s
  expect(open.filter((f) => f.t > t0 + 50 && f.t < t0 + 850).every((f) => f.pieces.every((o) => o === 0))).toBe(true);
  const landed = open.find((f) => f.settled)!;
  expect(landed.t).toBeGreaterThan(atLeast(OPEN_MS));
  expect(landed.t - t0).toBeLessThan(2300);
  expect(landed.pieces.every((o) => o === 1)).toBe(true);
  await expect(composer(page)).toBeFocused();

  // close: the reverse, about 1.4 s, back onto the hero box
  const recordingClose = sample(page, 2200);
  await minimize(page);
  const close = await recordingClose;
  const c0 = close.find((f) => f.pieces.some((o) => o < 0.99))!.t; // the close's first frame
  // the chat goes first: gone within twice its design time (room for a loaded machine)
  const gone = close.find((f) => f.t > c0 && f.pieces.every((o) => o < 0.05))!;
  expect(gone.t - c0).toBeLessThan(2 * ends(MOTION.close.pieces, PIECES));
  const onHero = close.find((f) => f.t > c0 && Math.abs(f.surface!.box.w - hero.w) < 6 && Math.abs(f.surface!.box.h - hero.h) < 6)!;
  expect(onHero.t - c0).toBeLessThan(1500);
  const atRest = (f: Frame) => f.topbar!.ty === 0 && f.top!.ty === 0 && f.right!.tx === 0 && f.bottom!.ty === 0 && f.fade!.o === 1;
  const back = close.find((f) => f.t > c0 + 200 && atRest(f))!;
  expect(back.t).toBeGreaterThan(atLeast(CLOSE_MS)); // from the click
  expect(back.t - c0).toBeLessThan(2000);
  // the surface shrinks for its design time (its last frame of movement, before everything is back)
  const [, shrinkEnd] = moves(close.filter((f) => f.t < back.t && f.surface), (f) => f.surface!.box.w);
  expect(shrinkEnd).toBeGreaterThan(atLeast(ends(MOTION.close.surface)));
  await closed(page);
  await expect(tab(page)).toBeFocused(); // the opener
});

test("the one globe sits behind the welcome at about 0.18, fades out once the conversation starts, and returns", async ({ page }) => {
  await ready(page);
  await expect(page.locator(PARTS.carrier)).toHaveCount(1);
  await expect(canvas(page), "the globe needs WebGL (SwiftShader here)").toHaveAttribute("data-globe", "running");
  await tab(page).click();
  await settled(page);
  await expect(page.locator(`.dash-assistant-globe ${PARTS.carrier}`)).toHaveCount(1); // carried, not copied
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => carrierOpacity(page)).toBeCloseTo(0.18, 2);
  await expect(canvas(page)).toHaveAttribute("data-globe", "running");
  await expect(canvas(page)).toHaveAttribute("data-globe-mode", "ambient");
  // drawn at the size it is shown (seated), not a small hero's canvas scaled up
  const scale = () => page.locator(PARTS.carrier).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  await expect.poll(scale).toBeCloseTo(1, 1);

  await composer(page).fill("Which runs wait on me?");
  await composer(page).press("Enter");
  await expect(page.getByRole("log", { name: "Conversation" })).toContainText("Stub answer");
  await expect.poll(() => carrierOpacity(page)).toBe(0);
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused"); // it stops drawing

  await clickMoving(page, page.getByRole("button", { name: /new (chat|conversation)/i }));
  await expect.poll(() => carrierOpacity(page)).toBeCloseTo(0.18, 2);
  await expect(canvas(page)).toHaveAttribute("data-globe", "running");

  await minimize(page);
  await closed(page);
  await expect(page.locator(`.dash-globe-wrap ${PARTS.carrier}`)).toHaveCount(1); // home again
  await expect.poll(() => carrierOpacity(page)).toBe(1);
  await expect(canvas(page)).toHaveAttribute("data-globe-mode", "full");
});

test("text never moves: once a conversation shows, the panel, the card and everything around a message hold still", async ({ page }) => {
  await ready(page);
  await tab(page).click();
  await settled(page);
  // on the welcome the icon and the globe breathe (they hold no text); the panel and its card never do
  await expect(page.locator(".dash-ai-icon")).toHaveCSS("animation-name", "dash-breath-icon-in, dash-breath-icon");
  await expect(page.locator(".dash-assistant-globe-breath")).toHaveCSS("animation-name", "dash-breath-globe-in, dash-breath-globe");
  for (const still of [".dash-assistant-panel", ".dash-assistant-card", ".dash-assistant-glow"]) {
    await expect(page.locator(still)).toHaveCSS("animation-name", "none");
    await expect(page.locator(still)).toHaveCSS("transform", "none");
  }
  await composer(page).fill("Which runs wait on me?");
  await composer(page).press("Enter");
  await expect(log(page).locator(".ai-row-assistant")).toHaveCount(1); // the reply (streaming or done)
  // every 100 ms for 1.6 s: the panel, the card, every ancestor of a message and every element
  // in the messages that holds text has no transform (or the identity) and no animation at all
  const samples = await page.evaluate(async () => {
    const messages = document.querySelector(".ai-messages")!;
    const chain: Element[] = [];
    for (let el: Element | null = messages; el; el = el.parentElement) chain.push(el);
    const textful = [...messages.querySelectorAll("*")].filter((el) => (el.textContent ?? "").trim() !== "");
    const layers = [".dash-assistant-panel", ".dash-assistant-card", ".dash-assistant-glow"].map((s) => document.querySelector(s)!);
    const all = [...new Set([...chain, ...textful, ...layers])];
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${el.className && typeof el.className === "string" ? el.className.split(" ")[0] : ""}`;
    const moving = (el: Element) => {
      const cs = getComputedStyle(el);
      const t = cs.transform;
      const still = t === "none" || new DOMMatrixReadOnly(t).isIdentity;
      return still && cs.animationName === "none" ? null : `${name(el)} transform=${t} animation=${cs.animationName}`;
    };
    const out: { at: number; moving: string[] }[] = [];
    const start = performance.now();
    while (performance.now() - start < 1600) {
      await new Promise((r) => setTimeout(r, 100));
      out.push({ at: Math.round(performance.now() - start), moving: all.map(moving).filter((m): m is string => m !== null) });
    }
    return { count: all.length, out };
  });
  expect(samples.count).toBeGreaterThan(10);
  expect(samples.out.length).toBeGreaterThanOrEqual(10);
  for (const s of samples.out) expect(s.moving, `at ${s.at} ms`).toEqual([]);
  await expect(log(page)).toContainText("Stub answer");
  // the loops that hold no text carry on meanwhile (the sidebar's icon), and the frame still
  // counts as breathing
  await expect(page.locator(".dash-ai-icon")).toHaveCSS("animation-name", "dash-breath-icon-in, dash-breath-icon");
  await expect(page.locator(".dash-frame[data-breathing]")).toHaveCount(1);
  // the globe, faded out behind the conversation, stops its loop too (nothing runs unseen)
  await expect(page.locator(".dash-assistant-globe-breath[data-idle]")).toHaveCount(1);
  await expect(page.locator(".dash-assistant-globe-breath")).toHaveCSS("animation-name", "none");
  // a saved conversation opened again shows still text too
  await page.reload();
  await expect(log(page)).toContainText("Stub answer");
  await settled(page);
  for (const still of [".dash-assistant-panel", ".dash-assistant-card"]) {
    await expect(page.locator(still)).toHaveCSS("animation-name", "none");
    await expect(page.locator(still)).toHaveCSS("transform", "none");
  }
});

test("a reply's mark glows on the breathing cycle while it is written; the marks never scale", async ({ page }) => {
  await ready(page);
  await tab(page).click();
  await settled(page);
  const logo = page.locator(".ai-header [data-reconix-mark]");
  await expect(logo).toHaveCSS("animation-name", "none"); // the header's logo holds still
  await expect(logo).toHaveCSS("transform", "none");
  await composer(page).fill("Tell me the whole story [stub:long]"); // stays open until Stop
  await composer(page).press("Enter");
  const live = log(page).locator(".ai-row-assistant > [data-reconix-mark][data-live]");
  await expect(live).toHaveCount(1);
  await expect(live).toHaveCSS("animation-name", "dash-mark-live");
  await expect(live).toHaveCSS("animation-duration", "6s");
  await expect(live).toHaveAttribute("style", /animation-delay: ?-\d+ms/); // in phase with the page clock
  await expect(live).toHaveCSS("transform", "none"); // a glow only
  await clickMoving(page, page.getByRole("button", { name: "Stop the answer" }));
  await expect(log(page).getByText("Stopped")).toBeVisible();
  await expect(live).toHaveCount(0);
  await expect(log(page).locator(".ai-row-assistant > [data-reconix-mark]")).toHaveCSS("animation-name", "none");
});

test("open and close keep the address (run and filters), the scroll position and the page", async ({ page }) => {
  await signIn(page);
  await hideCanvas(page);
  const marked = () => page.evaluate(() => (window as unknown as { kept?: number }).kept);
  // one run with Findings filters: the address comes back exactly, without a reload
  const run = [...savedRuns()].sort((a, b) => counted(b).length - counted(a).length)[0];
  await page.goto(`/?uid=${run.uid}&view=findings&sev=HIGH,MEDIUM&val=review&q=api`);
  await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 7));
  const url = page.url();
  await tab(page).click();
  await settled(page);
  await expect(page).toHaveURL(/view=assistant/);
  await expect(page).toHaveURL(new RegExp(`uid=${run.uid}`)); // the run stays chosen
  await expect(page).toHaveURL(/sev=HIGH%2CMEDIUM|sev=HIGH,MEDIUM/);
  await minimize(page);
  await closed(page);
  expect(page.url()).toBe(url);
  await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
  expect(await marked()).toBe(7);

  // every run's findings, scrolled: the list pane (its own scroller on the fixed frame, since
  // redesign v3's Findings paging) is where it was
  await page.goto("/?view=findings&sev=HIGH,MEDIUM,LOW");
  await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 8));
  const content = page.locator(".dash-content");
  const rows = page.locator("ul.dash-findings-rows");
  await rows.evaluate((el) => el.scrollTo({ top: 240, behavior: "instant" }));
  const before = await rows.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0); // ten rows are taller than the pane at 1440×900
  const findingsUrl = page.url();
  await tab(page).click();
  await settled(page);
  await minimize(page);
  await closed(page);
  expect(page.url()).toBe(findingsUrl);
  expect(await rows.evaluate((el) => el.scrollTop)).toBe(before);
  expect(await marked()).toBe(8);

  // the Overview with a run chosen: the grow-and-shrink keeps the run and the scroll
  await page.goto(`/?uid=${newest().uid}`);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 9));
  const overviewUrl = page.url();
  const scrolled = await content.evaluate((el) => el.scrollTop);
  await tab(page).click();
  await settled(page);
  await minimize(page);
  await closed(page);
  expect(page.url()).toBe(overviewUrl);
  expect(await content.evaluate((el) => el.scrollTop)).toBe(scrolled);
  expect(await marked()).toBe(9);
});

test("the sidebar's active marker slides in once, over 0.2 s, and nothing on it loops", async ({ page }) => {
  await ready(page);
  await hideCanvas(page);
  expect(await marker(page, "Overview")).toMatchObject({ opacity: "1", transform: "none", animation: "none" });
  expect(await marker(page, "Findings")).toMatchObject({ opacity: "0", animation: "none" });
  await nav(page, "Findings").click();
  await expect.poll(() => marker(page, "Findings").then((m) => m.opacity)).toBe("1");
  await expect.poll(() => marker(page, "Findings").then((m) => m.transform)).toBe("none"); // landed, nothing left over
  const findings = await marker(page, "Findings");
  expect(findings.duration).toBe("0.2s, 0.2s");
  expect(findings.animation).toBe("none");
  expect(await marker(page, "Overview")).toMatchObject({ opacity: "0", animation: "none" });
  // the item itself (icon and label) never moves
  await expect(nav(page, "Findings")).toHaveCSS("transform", "none");
  await expect(nav(page, "Findings").locator("svg")).toHaveCSS("animation-name", "none");
});

test("opened from another view with a conversation, the globe stays home and doesn't draw", async ({ page }) => {
  await ready(page);
  await tab(page).click();
  await settled(page);
  await composer(page).fill("Which runs wait on me?");
  await composer(page).press("Enter");
  await expect(page.getByRole("log", { name: "Conversation" })).toContainText("Stub answer");
  await nav(page, "Findings").click();
  await closed(page);
  await tab(page).click(); // from Findings, with the conversation
  await settled(page);
  await expect(page.locator(`.dash-globe-wrap ${PARTS.carrier}`)).toHaveCount(1); // never came in
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused");
  await page.waitForTimeout(700); // and it stays paused (the Overview under it is laid out, "visible")
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused");
  await minimize(page);
  await closed(page);
  await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
});

test("leaving the dashboard with the assistant open leaves the next globe drawing at full quality", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 7));
  await tab(page).click();
  await settled(page);
  await composer(page).fill("Which runs wait on me?");
  await composer(page).press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused"); // faded behind the chat
  await page.locator('a[href="/docs"]').first().click();
  await expect(page).toHaveURL(/\/docs/);
  // back through the rail's Overview (the docs top bar holds no link): the same page, no reload
  await page.locator('nav[aria-label="Views"] a[data-view="overview"]').click();
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(7);
  await expect(canvas(page)).toHaveAttribute("data-globe", "running");
  await expect(canvas(page)).toHaveAttribute("data-globe-mode", "full");
});

test("on a low-power device the globe behind the assistant is a still frame", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }));
  await ready(page);
  await expect(canvas(page)).toHaveAttribute("data-globe", "running");
  await tab(page).click();
  await settled(page);
  await expect(canvas(page)).toHaveAttribute("data-globe-mode", "ambient");
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused"); // not drawing behind it
  // …but it still shows: with the rest of the stage hidden, its part of the stage isn't flat (the
  // canvas itself is never touched: a paused canvas couldn't draw itself again)
  const globeShows = async () => {
    await expect.poll(() => carrierOpacity(page)).toBeCloseTo(0.18, 2); // its fade has ended
    const content = ".dash-assistant-front, .dash-assistant-surface, .dash-assistant-halo { visibility: hidden !important; }";
    const rest = await page.addStyleTag({ content });
    const c = (await page.locator(PARTS.carrier).boundingBox())!;
    const s = (await page.locator(PARTS.stage).boundingBox())!;
    const [x, y] = [Math.max(c.x, s.x), Math.max(c.y, s.y)];
    const clip = { x, y, width: Math.min(c.x + c.width, s.x + s.width) - x, height: Math.min(c.y + c.height, s.y + s.height) - y };
    const shot = (await page.screenshot({ clip })).toString("base64");
    await rest.evaluate((el) => (el as Element).remove());
    return page.evaluate(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const cv = document.createElement("canvas");
      [cv.width, cv.height] = [img.width, img.height];
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let [sum, sq, n] = [0, 0, 0];
      for (let i = 1; i < d.length; i += 4, n++) [sum, sq] = [sum + d[i], sq + d[i] * d[i]];
      return Math.sqrt(sq / n - (sum / n) ** 2); // the green channel's spread
    }, shot);
  };
  expect(await globeShows()).toBeGreaterThan(3); // a flat (blank) stage: ≈0
  await minimize(page);
  await closed(page);
  await expect(canvas(page)).toHaveAttribute("data-globe", "running");
  await expect(canvas(page)).toHaveAttribute("data-globe-mode", "full");

  // a phone: the crossfade carries it in as the open lands, into a box of its own size, and the
  // resize that clears the canvas comes after it paused: it redraws the still frame
  await page.setViewportSize({ width: 390, height: 844 });
  await tab(page).click();
  await settled(page);
  await expect(canvas(page)).toHaveAttribute("data-globe", "paused");
  expect(await globeShows()).toBeGreaterThan(3);
});

test("no reload, one history entry per open, and rapid clicks leave nothing stuck", async ({ page }) => {
  await ready(page);
  await hideCanvas(page);
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 7));
  const length = () => page.evaluate(() => history.length);
  const before = await length();
  await tab(page).click();
  await tab(page).click(); // open (or opening) already: nothing more
  expect(await length()).toBe(before + 1);
  await settled(page);
  await page.goBack();
  await closed(page);
  await expect(page).not.toHaveURL(/view=assistant/);

  // eight clicks, the last one on the Overview: it ends closed, with nothing left behind
  for (let i = 0; i < 8; i++) {
    await (i % 2 ? nav(page, "Overview") : tab(page)).click();
    await page.waitForTimeout(60 + i * 35);
  }
  const state = () =>
    page.evaluate((parts) => {
      const inline = [parts.topbar, parts.top, parts.right, parts.bottom, parts.fade].filter((s) => {
        const el = document.querySelector<HTMLElement>(s)!;
        return el.style.transform || el.style.opacity;
      });
      const carrier = document.querySelector<HTMLElement>(parts.carrier)!;
      return {
        view: new URLSearchParams(location.search).get("view"),
        on: document.querySelector(".dash-assistant-stage")!.hasAttribute("data-on"),
        breathing: document.querySelector(".dash-frame")!.hasAttribute("data-breathing"),
        backdrop: document.querySelector("[data-assistant-backdrop]") !== null,
        carriedIn: carrier.parentElement!.className,
        carrierOpacity: getComputedStyle(carrier).opacity,
        inline,
      };
    }, PARTS);
  await expect
    .poll(state, { timeout: 8000 })
    .toEqual({ view: null, on: false, breathing: false, backdrop: false, carriedIn: "dash-globe-wrap", carrierOpacity: "1", inline: [] });
  expect(await length()).toBeLessThanOrEqual(before + 1);
  expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(7);
});

test("the direct address opens the assistant with no box to grow from", async ({ page }) => {
  await page.goto("/assistant");
  await expect(page).toHaveURL(/\/\?view=assistant$/);
  await expect(page.getByRole("heading", { name: "AI Assistant", level: 1 })).toBeVisible();
  await settled(page);
  await expect(composer(page)).toBeFocused();
  await expect(page.locator(`.dash-assistant-globe ${PARTS.carrier}`)).toHaveCount(1);
  await expect.poll(() => carrierOpacity(page)).toBeCloseTo(0.18, 2);
  await minimize(page);
  await closed(page);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(page.locator(`.dash-globe-wrap ${PARTS.carrier}`)).toHaveCount(1);
  await expect(page.locator(PARTS.right)).toHaveCSS("transform", "none");
});

test("a click on the Ask bar's background opens it, and focus comes back to the Ask bar's field", async ({ page }) => {
  await ready(page);
  await hideCanvas(page);
  await page.locator(".dash-askbar").click({ position: { x: 240, y: 72 } }); // not the field, not a button
  await settled(page);
  await expect(composer(page)).toBeFocused();
  await minimize(page);
  await closed(page);
  await expect(page.locator(".dash-askbar input")).toBeFocused();
});

for (const [width, height] of [
  [1024, 768],
  [390, 844],
] as const) {
  test.describe(`at ${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test("the stage keeps a screen's height through the crossfade, with no jump as it lands", async ({ page }) => {
      await ready(page);
      await hideCanvas(page);
      const recording = sample(page, 1400);
      await tab(page).click();
      const open = await recording;
      await settled(page);
      const landed = (await page.locator(PARTS.stage).boundingBox())!;
      expect(landed.y + landed.height).toBeGreaterThan(height - 40); // it reaches the screen's foot
      expect(landed.y + landed.height).toBeLessThanOrEqual(height);
      const [fadeStart] = moves(open, (f) => f.front!.o, 0.01);
      for (const f of open.filter((f) => f.t > fadeStart)) {
        expect(Math.abs(f.stage!.box.h - landed.height)).toBeLessThan(2); // never short, never stretched
        expect(Math.abs(f.stage!.box.y - landed.y)).toBeLessThan(2);
      }
    });
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("it crossfades instead of growing, and the composer stays in reach", async ({ page }) => {
    await ready(page);
    await hideCanvas(page);
    const recording = sample(page, 1200);
    await tab(page).click();
    const open = await recording;
    const stageWidth = open.at(-1)!.stage!.box.w;
    for (const f of open) expect(Math.abs(f.surface!.box.w - stageWidth)).toBeLessThan(1); // no grow
    const [fadeStart, fadeEnd] = moves(open, (f) => f.front!.o, 0.01);
    expect(fadeStart).toBeGreaterThanOrEqual(0);
    expect(fadeEnd - fadeStart).toBeLessThan(700);
    await settled(page);
    await expect(composer(page)).toBeFocused();
    const box = (await composer(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await composer(page).fill("still usable");
    await expect(composer(page)).toHaveValue("still usable");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a short crossfade, nothing moves, and a still halo instead of the loops", async ({ page }) => {
    await ready(page);
    const recording = sample(page, 1000);
    await tab(page).click();
    const open = await recording;
    for (const f of open) {
      for (const part of ["topbar", "right", "bottom"] as const) expect([f[part]!.tx, f[part]!.ty]).toEqual([0, 0]);
      expect(f.surface!.box.w).toBe(open.at(-1)!.stage!.box.w);
    }
    const [fadeStart, fadeEnd] = moves(open, (f) => f.front!.o, 0.01);
    expect(fadeEnd - fadeStart).toBeLessThan(OPEN_MS / 2); // short beside the 1.6 s grow, with room for a loaded machine
    await settled(page);
    const loops = [".dash-ai-icon", ".dash-ai-halo", ".dash-assistant-globe-breath", ".dash-assistant-halo-glow"];
    const still = [".dash-assistant-panel", ".dash-assistant-card", ".dash-assistant-glow"]; // never loop, motion or not
    for (const selector of [...loops, ...still]) await expect(page.locator(selector).first()).toHaveCSS("animation-name", "none");
    expect(await marker(page, "AI Assistant")).toMatchObject({ opacity: "1", transform: "none", duration: "0s", animation: "none" });
    await expect.poll(() => page.locator(".dash-ai-halo").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
    await minimize(page);
    await closed(page);
    await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  });
});
