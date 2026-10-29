# Reconix website

Public landing page and documentation for Reconix, built with Next.js, TypeScript, Tailwind CSS, shadcn-style components and GSAP ScrollTrigger.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Run with Docker on your server

```bash
SITE_URL=https://your-domain.example docker compose up -d --build
# serves on port 8080; SITE_URL is baked into the share image, sitemap and robots.txt at build time
```

## Where things are

- `src/app/page.tsx`: the landing page, assembled from `src/components/sections/`
- `src/app/docs/`: documentation routes; structure in `src/lib/docs-nav.ts` (`DOCS_NAV`), page content in `src/content/docs/`
- `src/components/ui/`: shadcn-style Button, Card and Badge
- `src/components/reveal.tsx`: GSAP ScrollTrigger reveal animation
- `src/components/smooth-scroll.tsx`: Lenis smooth scrolling on native scroll, wired into GSAP ScrollTrigger
- `src/components/section-shell.tsx`: section wrapper with a themed backdrop (`grid`, `dots`, `hazard`, `scanlines`, `glow`) and an ambient `tint`; names in `section-themes.ts`
- `src/components/scroll-ambient.tsx`: fixed glow behind the landing page that crossfades to each section's tint on scroll
- `src/lib/dot-field.ts` (+ `src/components/dot-field.tsx`): cursor-reactive dot grid behind the Categories section
- `src/components/sections/showcase.tsx`: pinned feature showcase; one node map whose camera pans and zooms between hubs as you scroll (scrubbed), text alternating sides
- `src/lib/node-graph.js`: framework-free canvas node map (hubs, leaves, camera); keep it free of imports
- `src/components/ascii-banner.tsx`: figlet banners, server-rendered — "ANSI Shadow" for section titles, "Pagga" for the hero wordmark (`ascii-art.tsx` is the figlet-free renderer)
- `src/components/sections/hero.tsx`: centered figlet wordmark that boots in row by row, typed tagline, status chips
- `src/components/sections/integrations.tsx`: integrated tools and stack, grouped by function (`integrations-data.ts` + `tool-logo.tsx`, marks from `simple-icons`)
- `src/app/globals.css`: colour and font tokens, hero/banner effects, section backdrops

The install commands in Getting started are placeholders. Update them when the repository and packages exist.
