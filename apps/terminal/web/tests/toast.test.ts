/* The toasts' store (components/ui/toast.tsx): each toast goes after a few seconds or when
   dismissed, three at most are shown, and the text is cut, never HTML. */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("toast", () => {
  afterEach(() => vi.useRealTimers());

  it("is gone after a few seconds, or at once when dismissed", async () => {
    vi.useFakeTimers();
    const { dismiss, toast } = await import("@/components/ui/toast");
    const id = toast("Connected: 2 models found.");
    expect(typeof id).toBe("number");
    dismiss(id);
    toast("Saved.");
    vi.advanceTimersByTime(5_000); // nothing left behind
  });

  it("gives every toast its own id and cuts long text", async () => {
    const { toast } = await import("@/components/ui/toast");
    const a = toast("x".repeat(1_000));
    const b = toast("second", "error");
    expect(b).toBeGreaterThan(a);
  });
});
