/* The Reconix mark (components/ui/reconix-mark.tsx), rendered to markup: the favicon's drawing
   (app/icon.svg: the 32-unit tile, its 8-unit corners, the diamond), coloured by tokens only (the
   diamond the TUI's cyan, --globe-glow), sized by its prop, hidden from assistive tech unless it
   is given a name, and passing the rest through (the reply avatar's class, phase and data-live).
   e2e/assistant.spec.ts checks the header and the replies show it. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReconixMark, type ReconixMarkProps } from "@/components/ui/reconix-mark";

const mark = (props: ReconixMarkProps) => renderToStaticMarkup(createElement(ReconixMark, props));
const favicon = readFileSync(path.join(__dirname, "../src/app/icon.svg"), "utf8");
const tokens = readFileSync(path.join(__dirname, "../src/styles/tokens.css"), "utf8");
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(tokens)?.[1];
const attr = (svg: string, tag: string, name: string) => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(svg)?.[1];

describe("the Reconix mark", () => {
  it("is the favicon's drawing: a rounded 32-unit tile with the diamond on it", () => {
    const svg = mark({ size: 26 });
    expect(attr(svg, "svg", "viewBox")).toBe("0 0 32 32");
    expect(attr(favicon, "svg", "viewBox")).toBe("0 0 32 32");
    for (const name of ["width", "height", "rx"]) expect(attr(svg, "rect", name)).toBe(attr(favicon, "rect", name));
    expect(attr(svg, "rect", "rx")).toBe("8");
    expect(attr(svg, "path", "d")).toBe(attr(favicon, "path", "d"));
    expect(attr(svg, "path", "d")).toBe("M16 6 26 16 16 26 6 16Z");
  });

  it("takes its colours from the tokens: the diamond is the TUI's cyan, as on the favicon", () => {
    const svg = mark({ size: 26 });
    expect(attr(svg, "rect", "class")).toBe("fill-surface");
    expect(attr(svg, "path", "class")).toBe("fill-globe-glow");
    expect(svg).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|\sfill=/); // no colour literal, no fill attribute
    expect(token("globe-glow")).toBe(attr(favicon, "path", "fill"));
    expect(token("surface")).toBeDefined();
  });

  it("is as big as its size", () => {
    for (const size of [16, 26, 32]) {
      const svg = mark({ size });
      expect(attr(svg, "svg", "width")).toBe(String(size));
      expect(attr(svg, "svg", "height")).toBe(String(size));
    }
  });

  it("is hidden beside a visible name, and named when it stands alone", () => {
    const hidden = mark({ size: 26 });
    expect(attr(hidden, "svg", "aria-hidden")).toBe("true");
    expect(hidden).not.toContain("role=");
    expect(hidden).toContain("data-reconix-mark");
    const named = mark({ size: 26, label: "Reconix" });
    expect(attr(named, "svg", "role")).toBe("img");
    expect(attr(named, "svg", "aria-label")).toBe("Reconix");
    expect(named).not.toContain("aria-hidden");
  });

  it("passes a class, a style and data attributes through (the reply's live avatar)", () => {
    const props = { size: 26, className: "ai-avatar", style: { animationDelay: "-1200ms" }, "data-live": "" } as ReconixMarkProps;
    const svg = mark(props);
    expect(attr(svg, "svg", "class")).toBe("ai-avatar");
    expect(attr(svg, "svg", "style")).toBe("animation-delay:-1200ms");
    expect(attr(svg, "svg", "data-live")).toBe("");
    expect(mark({ size: 26 })).not.toContain("data-live");
  });
});
