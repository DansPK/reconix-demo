# Web dashboard: landing-site look + About page

The local dashboard (`web/`) used a soft-UI (neumorphism) look with a cyan accent, while
the public landing site (`reconix-web-ui`) is a dark operator console: navy, teal, amber
for approval gates. This change makes the dashboard look like the landing site and adds an
**About** page that explains the project to someone opening the dashboard for the first time.

## Decisions (agreed with the owner)

- Re-theme the **whole dashboard**; the TUI keeps its own palette (`theme.py` core colors).
- **Keep light mode** (a light version of the landing palette) and the theme toggle.
- The About page is **layered**: plain words first (what it is, the flow, the safety
  gates), then the technical part (how the pieces fit, code map, commands).
- Exported reports (HTML / PDF / DOCX) keep their print palette: they are documents.

## Palette (`theme.WEB_TOKENS` → `scripts/export_tokens.py` → `tokens.css`)

| Token | Dark (landing) | Light | Use |
|---|---|---|---|
| `bg` | `#0A0F17` | `#F3F6F9` | page |
| `card` (new) | `#0F1622` | `#FFFFFF` | raised surfaces |
| `well` (new) | `#152032` | `#EAEFF4` | inputs, tracks, chips |
| `line` | `#1E2A3C` | `#D5DDE6` | borders |
| `text` / `muted` / `faint` | `#E8EDF5` / `#8E9BB0` / `#67768C` | `#0F1622` / `#4B5A6D` / `#77869A` | |
| `accent` | `#2DD4BF` teal | `#0F766E` | links, active state, focus |
| `warn` | `#F2B544` amber | `#806600` | approval gates, waiting |
| `ok` / `bad` | `#39D353` / `#F87171` | `#13773A` / `#C8283E` | |
| `sd` | shadow color | shadow color | elevation (replaces `sd`/`sl` pair) |

Severity keeps five distinct colors (MEDIUM moves to the landing amber). Text colors clear
4.5:1 on `bg`, `card` and `well` in both themes (checked); `faint` is for marks (3:1).

## Look

`globals.css` keeps the `--raise` / `--press` names (raised object, recessed well) but
draws them the landing way: raised = `card` surface, 1px `line` border, soft shadow and a
faint teal light along the top edge; pressed = `well` surface with an inset border. Active
nav item = teal wash + teal left bar (the landing's viewer mock). Headings use Space
Grotesk (the landing's display font); body IBM Plex Sans, code JetBrains Mono as before.
The page gets the landing's soft teal glow and faint grid behind the content.

## About page (`/about`)

- `app/(dash)/about/page.tsx`: `requireViewer()` (the proxy already requires it; second
  lock), no saved data read. Sidebar link "About" for every role.
- Content in `components/about/content.ts` (data only); one component per section in
  `components/about/`: intro, flow steps (approval in amber), safety gates, how the pieces
  fit (TUI → store → saved copies → dashboard; Terminal page → helper → TUI), code map,
  run commands, glossary. Shared `SectionHeading` in `components/layout/`.
- Only states what the README / CLAUDE.md already say.

## Tests

- e2e: the About page shows its sections; sidebar has the link for viewers too.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`;
  screenshots of every page in both themes.
