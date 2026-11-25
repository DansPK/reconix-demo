/* Switching views (components/dashboard/view-url.ts showView): every view is mounted with its
   data, so a switch that keeps the run the page was rendered for stays in place (history only,
   no server round trip, nothing reloads); only a switch to another run's data navigates. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerViewNavigator, setRenderedRun, showView } from "@/components/dashboard/view-url";

let address: URL;
let pushed: string[];
let navigated: string[];

beforeEach(() => {
  address = new URL("http://127.0.0.1:3100/");
  pushed = [];
  navigated = [];
  vi.stubGlobal("window", {
    location: {
      get pathname() {
        return address.pathname;
      },
      get search() {
        return address.search;
      },
    },
    history: {
      pushState: (_s: unknown, _t: string, url: string) => {
        pushed.push(url);
        address = new URL(url, address);
      },
      replaceState: (_s: unknown, _t: string, url: string) => {
        address = new URL(url, address);
      },
    },
  });
  vi.stubGlobal("document", { documentElement: { hasAttribute: () => true } });
  registerViewNavigator((href) => navigated.push(href));
});
afterEach(() => {
  registerViewNavigator(null);
  vi.unstubAllGlobals();
});

const RUN = "11111111-1111-4111-8111-111111111111";

describe("showView", () => {
  it("switches between views of every run in place, with no server navigation", () => {
    setRenderedRun(null);
    showView("findings");
    showView("reports");
    showView("overview");
    expect(navigated).toEqual([]);
    expect(pushed).toEqual(["/findings", "/reports", "/"]);
  });

  it("keeps one run's views in place, through Security knowledge and back", () => {
    setRenderedRun(RUN);
    address = new URL(`http://127.0.0.1:3100/findings/${RUN}`);
    showView("reports");
    showView("knowledge");
    showView("overview");
    expect(navigated).toEqual([]);
    expect(pushed.at(-1)).toContain(RUN);
  });

  it("navigates when the switch needs another run's data", () => {
    setRenderedRun(RUN);
    address = new URL(`http://127.0.0.1:3100/findings/${RUN}`);
    showView("assessments"); // every run: the server renders it
    expect(navigated).toEqual(["/assessments"]);
  });
});
