/* The conversation's scrolling rules (lib/scroll/stick-rules.ts) and controller
   (lib/scroll/stick-controller.ts) behind components/assistant/use-stick-to-bottom.ts: follow new
   content only while the reader is at the bottom, let go as soon as they scroll up, hold on again
   when they come back down, and glide (or jump, under reduced motion) on "New messages". The DOM
   part runs here on a stand-in box; the browser part (wheel, layout) is in e2e/scroll.spec.ts. */
import { describe, expect, it } from "vitest";

import { createStickToBottom } from "@/lib/scroll/stick-controller";
import { distanceToBottom, NEAR_PX, nextStick, type StickState } from "@/lib/scroll/stick-rules";

const held: StickState = { pinned: true, seeking: false, lastTop: 700 };
const at = (scrollTop: number, scrollHeight = 1000, clientHeight = 300) => ({ scrollTop, scrollHeight, clientHeight });

describe("nextStick", () => {
  it("measures the gap to the end, never below zero", () => {
    expect(distanceToBottom(at(700))).toBe(0);
    expect(distanceToBottom(at(650))).toBe(50);
    expect(distanceToBottom(at(0, 200, 300))).toBe(0); // nothing to scroll
  });

  it("lets go on any scroll up, even within reach of the bottom", () => {
    expect(nextStick(held, at(690))).toEqual({ pinned: false, seeking: false, lastTop: 690 });
    expect(nextStick(held, at(100)).pinned).toBe(false);
  });

  it("holds on again only when the reader comes back down near the end", () => {
    const away: StickState = { pinned: false, seeking: false, lastTop: 400 };
    expect(nextStick(away, at(500)).pinned).toBe(false); // down, but still far
    expect(nextStick(away, at(700 - NEAR_PX)).pinned).toBe(true); // down, within reach
    expect(nextStick(away, at(700))).toEqual({ pinned: true, seeking: false, lastTop: 700 });
  });

  it("keeps holding on through a glide down and while nothing moves", () => {
    const gliding: StickState = { pinned: true, seeking: true, lastTop: 100 };
    expect(nextStick(gliding, at(300))).toEqual({ pinned: true, seeking: true, lastTop: 300 });
    expect(nextStick(gliding, at(700))).toEqual({ pinned: true, seeking: false, lastTop: 700 });
    expect(nextStick(held, at(700))).toEqual(held);
  });

  it("a box that shrinks under the reader clamps to the end and stays held", () => {
    // 1000 → 800 tall: scrollTop clamps from 700 to 500, which is the end
    expect(nextStick(held, at(500, 800))).toEqual({ pinned: true, seeking: false, lastTop: 500 });
  });
});

/** A scrolling box with just what the controller touches. */
class Box {
  scrollTop = 0;
  scrollHeight: number;
  clientHeight: number;
  children: Element[] = [];
  behaviors: string[] = [];
  target = -1; // where a glide was aimed
  private handlers = new Map<string, (event?: unknown) => void>();
  constructor(scrollHeight: number, clientHeight = 300) {
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
  }
  addEventListener(type: string, fn: (event?: unknown) => void) {
    this.handlers.set(type, fn);
  }
  removeEventListener(type: string) {
    this.handlers.delete(type);
  }
  get listening() {
    return this.handlers.has("scroll");
  }
  /** A wheel or key event reaching the box. */
  fire(type: "wheel" | "keydown", event: Partial<WheelEvent & KeyboardEvent>) {
    this.handlers.get(type)?.(event);
  }
  /** Programmatic scrolls land at once here (a glide's steps are sent with `user`). */
  scrollTo({ top, behavior }: { top: number; behavior: string }) {
    this.behaviors.push(behavior);
    this.move(top);
  }
  /** The reader (or a glide step) moves the box. */
  user(top: number) {
    this.move(top);
  }
  private move(top: number) {
    const next = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
    if (next === this.scrollTop) return;
    this.scrollTop = next;
    this.handlers.get("scroll")?.();
  }
}

function setup(reduced = false) {
  const pinned: boolean[] = [];
  const stick = createStickToBottom<HTMLElement>({ onPinned: (p) => pinned.push(p), reducedMotion: () => reduced });
  const box = new Box(1000);
  stick.ref(box as unknown as HTMLElement);
  return { stick, box, pinned, last: () => pinned[pinned.length - 1] };
}

describe("createStickToBottom", () => {
  it("scrollToTop shows the start and stops following until asked again", () => {
    const { stick, box, last } = setup();
    stick.scrollToTop();
    expect(box.scrollTop).toBe(0);
    expect(last()).toBe(false);
    box.scrollHeight = 1400; // the welcome grows, or its box opens
    stick.follow();
    expect(box.scrollTop).toBe(0); // still at the start
    stick.scrollToBottom({ instant: true }); // a question was asked
    expect(box.scrollTop).toBe(1100);
    expect(last()).toBe(true);
  });

  it("stops a glide on the spot when the reader moves up, and lets go", () => {
    const { stick, box, last } = setup();
    box.user(100); // read from near the top, then ask to go down
    stick.scrollToBottom(); // a glide: the stand-in lands at once, so start it again mid-way
    box.user(400); // a glide step on its way down
    box.fire("wheel", { deltaY: -120 }); // the reader's wheel, up
    expect(last()).toBe(false);
    expect(box.behaviors.at(-1)).toBe("instant"); // the glide was halted where it was
    expect(box.scrollTop).toBe(400);
    box.scrollHeight = 1400;
    stick.follow();
    expect(box.scrollTop).toBe(400); // and nothing pulls them down any more
  });

  it("lets go on PageUp, ArrowUp, Home and Shift+Space, but not at the very top or on a wheel down", () => {
    for (const key of [{ key: "PageUp" }, { key: "ArrowUp" }, { key: "Home" }, { key: " ", shiftKey: true }]) {
      const { box, last } = setup();
      box.fire("keydown", key);
      expect(last()).toBe(false);
    }
    const down = setup();
    down.box.fire("wheel", { deltaY: 120 });
    expect(down.last()).toBe(true);
    const top = setup();
    top.box.user(0);
    top.stick.scrollToBottom({ instant: true });
    top.box.scrollTop = 0; // nothing above
    top.box.fire("wheel", { deltaY: -120 });
    expect(top.box.behaviors.at(-1)).toBe("instant");
  });

  it("opens on the newest content and follows growth at once", () => {
    const { stick, box, last } = setup();
    expect(box.scrollTop).toBe(700);
    expect(stick.ref.current).toBe(box);
    box.scrollHeight = 1400; // a streamed reply grows
    stick.follow();
    expect(box.scrollTop).toBe(1100);
    expect(box.behaviors).toEqual(["instant", "instant"]);
    expect(last()).toBe(true);
  });

  it("does not pull the reader down after they scroll up, and offers the way back", () => {
    const { stick, box, last } = setup();
    box.user(650); // a small scroll up, still within NEAR_PX
    expect(last()).toBe(false);
    box.scrollHeight = 1400;
    stick.follow();
    expect(box.scrollTop).toBe(650); // left alone
    box.user(1100 - 20); // back down near the end
    expect(last()).toBe(true);
  });

  it("follows the box getting shorter (the composer grew)", () => {
    const { stick, box } = setup();
    box.clientHeight = 250;
    stick.follow();
    expect(box.scrollTop).toBe(750);
  });

  it("glides to the bottom on request, re-aims when more arrives, and lets go if the reader turns back", () => {
    const { stick, box, last } = setup();
    box.user(100);
    expect(last()).toBe(false);
    box.scrollTo = function (this: Box, { top, behavior }: { top: number; behavior: string }) {
      this.behaviors.push(behavior); // a glide: record it, move in steps below
      this.target = top;
    } as Box["scrollTo"];
    stick.scrollToBottom();
    expect(last()).toBe(true); // the control hides at once
    expect(box.behaviors.at(-1)).toBe("smooth");
    box.user(300); // a glide step
    expect(stick.state()).toMatchObject({ pinned: true, seeking: true });
    box.scrollHeight = 1200; // more arrives mid-glide
    stick.follow();
    expect(box.behaviors.at(-1)).toBe("smooth");
    expect(box.target).toBe(900);
    box.user(250); // the reader scrolls up during the glide
    expect(stick.state()).toMatchObject({ pinned: false, seeking: false });
    expect(last()).toBe(false);
  });

  it("jumps when asked to, and a click event as the argument still glides", () => {
    const { stick, box, last } = setup();
    box.user(100);
    stick.scrollToBottom({ instant: true });
    expect(box.behaviors.at(-1)).toBe("instant");
    expect(box.scrollTop).toBe(700);
    expect(stick.state()).toMatchObject({ pinned: true, seeking: false });
    expect(last()).toBe(true);
    box.user(100);
    (stick.scrollToBottom as (e: unknown) => void)({ type: "click" }); // onClick={scrollToBottom}
    expect(box.behaviors.at(-1)).toBe("smooth");
  });

  it("jumps instead of gliding under reduced motion", () => {
    const { stick, box, last } = setup(true);
    box.user(100);
    stick.scrollToBottom();
    expect(box.behaviors.at(-1)).toBe("instant");
    expect(box.scrollTop).toBe(700);
    expect(last()).toBe(true);
  });

  it("moves to a new box when the ref is given one, and lets go of the old", () => {
    const { stick, box } = setup();
    const next = new Box(600);
    const release = stick.ref(next as unknown as HTMLElement);
    expect(box.listening).toBe(false);
    expect(next.listening).toBe(true);
    expect(next.scrollTop).toBe(300);
    expect(stick.ref.current).toBe(next);
    release();
    expect(next.listening).toBe(false);
    expect(stick.ref.current).toBeNull();
  });
});
