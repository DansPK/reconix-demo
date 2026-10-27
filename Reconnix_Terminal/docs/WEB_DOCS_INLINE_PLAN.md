# Web: the docs read inline, one page per group

Status: done (2026-10-22). Branch `r4/web-docs` (from `feature/next`). `npm test`, lint,
typecheck, build and the full e2e (210) pass.

The owner: "Remove Settings from the sidebar. In Docs, remove all buttons that open links or
redirect to another page. Display documentation directly inside the Docs screen, without
requiring users to follow links."

## 1. One page per group

- `DOCS_NAV` (`web/src/lib/docs-nav.ts`) keeps its groups and pages, but a page is no longer
  an address of its own: it is a **part** of its group's page. `/docs/<group>` shows every page
  of the group, in order: an `h2` with the page title (id `<page-slug>`), its lede, then its
  body, whose `DocSection`s become `h3`s with ids `<page-slug>-<section-slug>` (so the 19
  command parts' "Purpose" / "Syntax" never clash). The page's `h1` is the group title.
- `/docs` renders the Getting started group (no card, no visible redirect). The old Overview
  "group" (the `/docs` home with its cards) goes: its "Where things are" list moves into
  Getting started → Introduction; the rest repeated Introduction and Requirements. The docs
  sidebar lists the eight groups.
- "On this page" lists the group's pages and, under the part being read, its sections; every
  entry is a same-page `#anchor`.
- Addresses: `DOCS_ROUTES` = `/docs` and the eight group pages. A page's address is
  `/docs/<group>#<page-slug>` (`DocPage.href`), and the `DOCS` link map points there.

## 2. Nothing in Docs leads elsewhere

Removed: the "Start here" card, the group cards and their chips, the page cards, the Commands
index list, Previous / Next (`docNeighbours`), the breadcrumb links, the top bar's "← Dashboard"
button, and every in-text `DocLink` (content and home): the words stay, as plain emphasized
text (`DocRef`). The left rail of views still leads back to the dashboard.

- The docs sidebar: the eight groups (links to `/docs/<group>`: choosing one shows that group's
  page) and, under the open group, its pages as in-page anchors, below xl only (at xl "On this
  page" lists the same pages beside the text). No Expand / Collapse. On a phone the "Docs menu"
  button opens the same list (and closes after a choice).
- The docs search (`components/docs-search.tsx`) looks only through the group shown (titles,
  section headings, descriptions, command aliases) and jumps within the page (`#anchor`, never
  a route change). Placeholder and name: "Search this section…".

## 3. The left rail

The "Configuration" item (Settings gear) leaves `components/dashboard/sidebar.tsx`, in the
dashboard and the docs. "Documentation" stays. `DOCS.configuration` loses its last caller and
goes.

## 4. Old addresses keep working

- Every page address `/docs/<group>/<page>` answers 308 to `/docs/<group>#<page>`: one rule
  in `lib/docs-redirects.ts` (`/docs/:group(<the eight ids>)/:page`), after the specific ones.
  The file stays plain data (next.config.ts loads it); the unit test checks its group list
  against `DOCS_NAV`.
- The redirects of the v2 addresses now land on the new anchors directly (one hop).
- `app/docs/[group]/[page]` goes; links from the dashboard (`DOCS`), the terminal notice, the
  assistant, and the top-bar docs search point at `/docs/<group>#<page>`.

## 5. Tests

Unit: the structure (groups, parts, unique anchors per group page, sections prefixed), the
redirect resolver (every old address → a live address, anchors included), the per-group search,
the `DOCS` map and every `/docs/…` literal (anchors checked too).
e2e: a group page shows its pages' text inline; nothing in the docs content or top bar links off
the page except the docs sidebar's group list; an old page address lands on its section; the
rail has no Configuration; the search jumps within the page; the phone menu; scroll, a11y,
access, pages and motion specs follow the new addresses.

Checks: `npm test`, `npm run lint`, `npx next typegen && npm run typecheck`, `npm run build`, the
full e2e.
