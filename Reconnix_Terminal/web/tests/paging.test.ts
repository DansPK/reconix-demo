/* The paging rules (lib/paging.ts) behind the 10-row lists. */
import { describe, expect, it } from "vitest";

import { pageOf, paginate, PER_PAGE, slicePage } from "@/lib/paging";

describe("paginate", () => {
  it("shows ten rows a page and says where it is", () => {
    expect(PER_PAGE).toBe(10);
    expect(paginate(30, "2")).toEqual({ page: 2, pages: 3, start: 10, end: 20, total: 30, label: "Page 2 of 3 · 30 results" });
    expect(paginate(25, 3)).toMatchObject({ page: 3, pages: 3, start: 20, end: 25 });
  });

  it("clamps an address value that is missing, not a number or out of range", () => {
    expect(paginate(30, null).page).toBe(1);
    expect(paginate(30, "zzz").page).toBe(1);
    expect(paginate(30, "0").page).toBe(1);
    expect(paginate(30, "-4").page).toBe(1);
    expect(paginate(30, "99").page).toBe(3);
    expect(paginate(30, "2.9").page).toBe(2);
  });

  it("always has one page, even with nothing to show", () => {
    expect(paginate(0, "5")).toEqual({ page: 1, pages: 1, start: 0, end: 0, total: 0, label: "0 results" });
    expect(paginate(1, "1").label).toBe("1 result");
    expect(paginate(10, "1").label).toBe("10 results"); // one page: no "Page 1 of 1"
  });

  it("finds the page of a row, and slices it", () => {
    expect(pageOf(0)).toBe(1);
    expect(pageOf(9)).toBe(1);
    expect(pageOf(10)).toBe(2);
    expect(pageOf(-1)).toBe(1);
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(slicePage(rows, paginate(rows.length, 3))).toEqual([20, 21, 22]);
  });
});
