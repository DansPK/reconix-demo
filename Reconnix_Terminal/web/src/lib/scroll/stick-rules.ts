/* When a scrolling box (the assistant's conversation) follows its newest content: the pure
   rules behind useStickToBottom (components/assistant/use-stick-to-bottom.ts). No DOM, no React;
   unit-tested in tests/stick-to-bottom.test.ts.

   - Any scroll UP that leaves the very bottom lets go, even a small one: the reader is reading.
     Only the reader moves the box up; following new content only ever moves it down, and a box
     that shrinks clamps to the bottom, which is not "up" in this sense.
   - Coming back down to within NEAR_PX of the bottom holds on again.
   - A glide to the bottom (`seeking`) keeps holding on all the way down. */

/** Within this many pixels of the bottom, scrolling down holds on to the bottom again. */
export const NEAR_PX = 48;
/** Rounding: a box this close to its end is at the end (fractional zoom, subpixel layout). */
export const EPSILON = 1;

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };
/** `pinned`: follow new content. `seeking`: a smooth scroll to the bottom is on its way down. */
export type StickState = { pinned: boolean; seeking: boolean; lastTop: number };

export const distanceToBottom = (m: ScrollMetrics) => Math.max(0, m.scrollHeight - m.clientHeight - m.scrollTop);

/** What one scroll event means for the state. */
export function nextStick(s: StickState, m: ScrollMetrics): StickState {
  const gap = distanceToBottom(m);
  const top = m.scrollTop;
  if (gap <= EPSILON) return { pinned: true, seeking: false, lastTop: top }; // at the end
  if (top < s.lastTop - EPSILON) return { pinned: false, seeking: false, lastTop: top }; // the reader went up
  if (top > s.lastTop + EPSILON && gap <= NEAR_PX) return { pinned: true, seeking: s.seeking, lastTop: top }; // back down
  return { ...s, lastTop: top };
}
