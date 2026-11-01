---
name: check-demo-slop
description: Audit the Reconix demo for audience-facing "demo slop" — fake/placeholder/templated values an audience would notice (example.com, the words demo/test/sample, lorem ipsum, John Doe, $0.00, broken images, styled "this is a breach" banners, cross-engine mismatches). Use before showing the demo, or when reviewing any audience-facing surface for realism. The checking counterpart to realistic-demo-data.
---

# Check for demo slop

The demo is shown to (often non-technical) audiences; anything they see must read as **real**. This is
how to find the opposite — slop — without flagging the things that only *look* like slop but are
required. It is the audit counterpart to generating data with [[realistic-demo-data]].

## What counts as slop (audience-facing only)
- **Placeholder domains in visible data**: `example.com`/`.org`, `test.com`, `placeholder.*`, a visible `localhost`.
- **The literal words** demo / test / sample / placeholder / TODO / FIXME / lorem ipsum in **visible text or data**.
- **Generic fake identities**: John/Jane Doe, Jane Smith, Acme, "Test User", "test account", `user@example.com`.
- **Obviously fake values**: `$0.00`, round-number everything, `123 Main St`, `555-01xx` phones, "Product 1/2/3", empty/stub copy.
- **Broken or placeholder images** — an image the audience sees that 404s or is a grey box.
- **Styled "this is a demo / database exposed" banners** — a real system never announces its own breach; show the raw thing instead.
- **Cross-engine mismatch** — the same record differing between the storefront and Reconix (see consistency below).

## Allowed — do NOT flag these
- **Code identifiers and flags**: `VITE_DEMO`, the `DEMO` constant, `RECONIX_*` env vars, comments, variable names.
- **Test files**: paths with `__tests__`, `.test.`, or `/tests/`.
- **Backend the audience never runs**: `apps/lumina-site/server/**` (the planted vulnerable backend — the storefront runs offline on mock data).
- **SAFETY — reserved hosts in Reconix snapshots.** `apps/terminal/tests/test_static_data.py` asserts every hostname in a **saved snapshot** is a reserved domain (`example.com` family). That is a deliberate guard so no real target is ever named — **required, not slop.** Realistic leak email providers (gmail/yahoo/outlook/hotmail) are allowed via `DEMO_LEAK_DOMAINS`.
  - **Exception → a human decision:** if the web **dashboard visibly displays** those `example.com` targets to the audience, that is a realism-vs-safety tension. Don't silently "fix" it (it would break the guard) and don't dismiss it — surface it.

## Where the audience looks
- **Lumina storefront** (`apps/lumina-site/src`): catalog data (`api/mockData.js` `PRODUCTS`), category/account pages, UI copy, the SQL-injection leak view.
- **Reconix TUI + dashboard** (`apps/terminal`): the Lumina run (`reconix/store/templates/web_url.py`), narration (`reconix/store/scenario.py`), the dashboard's `web/sample-data/*.json`, and the exported PDF/DOCX report (which stays masked).
- **VS Code scanner** (`apps/scanner/extension/server/server.ts`): `DEMO_FINDINGS` / `FIXES` titles, descriptions, messages, and the file paths they point at.
- **Marketing site** (`apps/public-web/src`): copy, logos, testimonials, stat numbers.

## How to check
- **Quick grep, then judge each hit** (most `example.com` hits in `apps/terminal` are the safety guard, not slop):
  ```
  grep -rniE "example\.(com|org)|lorem ipsum|placeholder|john doe|jane doe|\bacme\b|123 main|555-01" \
    apps/*/src apps/terminal/reconix apps/terminal/web/sample-data --exclude-dir=node_modules --exclude-dir=__tests__
  ```
  Then scan visible strings for ` demo `, `test account`, `sample` (skipping `VITE_DEMO`, env names, comments).
- **Images**: every `imageUrl`/`src` the storefront references must have a real file under `apps/lumina-site/public/images/`.
- **Consistency**: the 12 leaked rows must match across the storefront `LEAK` (`apps/lumina-site/src/api/mockData.js`) and the Reconix `_DUMP` (`web_url.py`) — name, email, phone, brand, card, exp, and MD5↔cracked password. Sophea is the anchor: **Sophea Chan · Visa ****5466 · 08/27 · sophea_chan@gmail.com**. Card numbers are fabricated-but-realistic (Luhn-valid, generated), not the obvious `4242…` test PANs.
- **Full sweep**: fan out a Workflow — one reviewer per surface (storefront data, storefront copy, Reconix Lumina run, dashboard samples, scanner + marketing site) producing findings, then a triage pass classifying each **slop / allowed / decision**. Keeps the safety nuance explicit and parallelizes the read.

## Verdicts
- **slop** → fix with a realistic value, following [[realistic-demo-data]] (and keep the reserved-host guard green: `pytest -q tests/test_static_data.py`; regenerate with `python scripts/make_sample_data.py`).
- **allowed** → leave it.
- **decision** → surface to the user (realism vs. the safety guard — e.g. `example.com` targets shown in the dashboard).

Related: [[realistic-demo-data]], [[reconix-finding]], [[scanner-finding]].
