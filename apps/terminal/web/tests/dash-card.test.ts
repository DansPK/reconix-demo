/* The dashboard card's header (components/dashboard/dash-card.tsx), rendered to markup: the icon
   at the top right is a help icon, not an "open externally" arrow, so nobody reads it as "open
   the findings". Its accessible name says what it explains and that it leaves for the
   documentation, its tooltip (chart-tooltip.tsx, shown on hover and on keyboard focus) says the
   same for sighted users, and it still links the DOCS address the card was given. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashCard } from "@/components/dashboard/dash-card";
import { DOCS } from "@/lib/docs-nav";

const card = (title: string, docsHref: string, meta?: string) =>
  // eslint-disable-next-line react/no-children-prop -- DashCard's props type requires `children`, so createElement's third argument won't type-check
  renderToStaticMarkup(createElement(DashCard, { id: "findings-card", title, docsHref, meta, children: createElement("p", null, "body") }));

/** The card's help link alone (its own attributes, not the whole card's markup). */
const helpLink = (html: string) => html.match(/<a [^>]*aria-label="How to read [^>]*>/)![0];

const findings = card("Findings by Severity", DOCS.panelFindingsBySeverity, "3 findings");

describe("a dashboard card's help link", () => {
  it("is named for what it explains and says it opens the documentation", () => {
    expect(findings).toContain('aria-label="How to read Findings by Severity (documentation)"');
    expect(findings).not.toContain("Open Findings by Severity documentation");
  });

  it("links the docs address the card was given", () => {
    expect(helpLink(findings)).toContain(`href="${DOCS.panelFindingsBySeverity}"`);
    // the section that explains this panel, not the general findings guide
    expect(DOCS.panelFindingsBySeverity).toBe("/docs/reports#panels-findings-by-severity");
  });

  it("shows the help icon, hidden from screen readers, and no out-of-page arrow", () => {
    expect(findings).toMatch(/class="lucide[^"]*lucide-circle-help[^"]*"/);
    expect(findings).not.toMatch(/square-arrow-out-up-right/);
    expect(findings).toContain('aria-hidden="true"');
  });

  it("keeps the card's chrome: the heading names the region, the note sits beside it", () => {
    expect(findings).toContain('aria-labelledby="findings-card"');
    expect(findings).toContain('<h2 id="findings-card"');
    expect(findings).toContain("3 findings");
    expect(helpLink(findings)).toContain("focus-visible:ring-2");
  });

  it("pushes itself right only when the card has no note", () => {
    expect(helpLink(card("Activity", DOCS.dashboard))).toMatch(/ml-auto/);
    expect(helpLink(findings)).not.toMatch(/ml-auto/); // the note already took it
  });
});
