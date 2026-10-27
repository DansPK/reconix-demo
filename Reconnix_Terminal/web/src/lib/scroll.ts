/* Bringing an element into view by hand, never with scrollIntoView: that would also move where
   the keyboard's Tab starts from, and it can drag an outer scroller along. The dashboard has one
   scroller at a time, the content area on the fixed desktop frame and the window elsewhere
   (styles/frame.css); the helpers find the one that scrolls the element and honour the content
   area's scroll padding, so nothing lands flush with an edge. Browser only. */

const CONTENT = ".dash-content"; // the content area (frame.css): its scroll padding applies either way

/** Whether `el` scrolls its content vertically (overflow-y auto or scroll). */
export function isScroller(el: Element): boolean {
  const overflow = getComputedStyle(el).overflowY;
  return overflow === "auto" || overflow === "scroll";
}

/** `scroll-padding-block-start` of `el` in px (0 when auto). */
const paddingOf = (el: Element): number => parseFloat(getComputedStyle(el).scrollPaddingBlockStart) || 0;

interface Viewport {
  top: number; // in viewport coordinates
  bottom: number;
  padding: number; // the scroll padding kept at the top
  scrollBy: (dy: number, behavior: ScrollBehavior) => void;
}

/** The viewport that shows `el`: its nearest scrolling ancestor, else the window. */
function viewportOf(el: HTMLElement): Viewport {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (isScroller(node)) {
      const r = node.getBoundingClientRect();
      const scroller = node;
      return { top: r.top, bottom: r.bottom, padding: paddingOf(node), scrollBy: (dy, behavior) => scroller.scrollBy({ top: dy, behavior }) };
    }
  }
  const content = el.closest(CONTENT);
  return {
    top: 0,
    bottom: window.innerHeight,
    padding: content ? paddingOf(content) : 0,
    scrollBy: (dy, behavior) => window.scrollBy({ top: dy, behavior }),
  };
}

/**
 * Scroll so the top of `el` sits at its viewport's padding edge: always, only when it is
 * `above` the viewport (turning a page from the bottom of a long list), or only when it is
 * `outside` the band between the viewport's edge and its padding (a pane that takes focus).
 */
export function revealTop(el: HTMLElement, { when = "outside", behavior = "instant" }: { when?: "always" | "above" | "outside"; behavior?: ScrollBehavior } = {}): void {
  const v = viewportOf(el);
  const top = el.getBoundingClientRect().top;
  const edge = v.top + v.padding;
  if (when === "above" && top >= v.top) return;
  if (when === "outside" && top >= v.top && top <= edge) return;
  v.scrollBy(top - edge, behavior);
}

/** Scroll so `el` is wholly in view, centred in its viewport, when any of it is out of view. */
export function revealCentred(el: HTMLElement): void {
  const v = viewportOf(el);
  const r = el.getBoundingClientRect();
  if (r.top >= v.top && r.bottom <= v.bottom) return;
  v.scrollBy(r.top - v.top - (v.bottom - v.top - r.height) / 2, "instant");
}

/** Scroll `scroller` the least that brings `el` wholly into it (a selected row in a list). */
export function revealWithin(el: Element, scroller: Element): void {
  const r = el.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  const padding = paddingOf(scroller);
  if (r.top < s.top + padding) scroller.scrollBy({ top: r.top - s.top - padding, behavior: "instant" });
  else if (r.bottom > s.bottom - padding) scroller.scrollBy({ top: r.bottom - s.bottom + padding, behavior: "instant" });
}
