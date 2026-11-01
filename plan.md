# Demo plan — "One search box opens the whole store"

A live demo that shows a **non-technical audience** why cybersecurity matters: Reconix
assesses a real-looking online store (Lumina), finds a **critical SQL-injection**, escalates
its plan to **extract and crack the customer database**, and reveals the leak —
customer emails, phones, addresses, **saved credit cards**, and cracked passwords.

## Audience & goal
- Audience: non-technical (investors / students / general public).
- Message: a single weak input can expose everyone's private data — this is what security work prevents.
- Rule of thumb: show **consequences the audience can feel** (your card, your password), not jargon.

## Locked decisions
- **Vuln:** SQL injection (not RCE) — invented but anchored to Lumina's real endpoint. RCE is too
  abstract for lay viewers; "a stranger read your data from the search box" lands.
- **Target stack reality:** lumina-neo is React + Java/Spring (no PHP), so the Java-stack framing is
  used; the vuln is framed **black-box** (what an HTTP scanner sees), so we never have to point at a
  "vulnerable line" — Lumina's real search code is actually safe.
- **Scan is scripted** inside Reconix (reliable on stage). Lumina is the visual target/prop; the leak
  data is **seeded in Reconix**, kept consistent with what the storefront shows.
- **Storefront:** full lumina-neo storefront, **stripped to run with no backend** (mock data), living
  in `apps/lumina-site/` (git removed). Accounts show a **saved credit card** so the leak hits home.
- **Masking:** the dump is **masked by default** everywhere (report/dashboard/PDF). The **raw** dump is
  revealed only in the **live TUI** via an **unmask keypress** — the on-stage reveal. Raw PII never
  reaches saved files.
- **Data:** entirely fake/reserved — `@example.com` emails, test card PANs (`4242…`), weak passwords.

## The flow (scenes)
1. **The shop.** Browse the Lumina storefront. Log in; show **My Account → saved card** (Visa ****4242).
   *"This is a real online store. It holds your name, address, phone, and your card."*
2. **The engagement.** Point Reconix at Lumina; approve scope + plan; the scripted scan plays.
3. **The find.** Reconix flags **CRITICAL — SQL injection in catalog search**
   (`GET /api/v1/products?q=`, unauthenticated).
4. **Plan updates to crack it.** Reconix escalates: *"extracting customer records… cracking password
   hashes…"* (run-script beat).
5. **The reveal.** Open finding 004. Masked dump shows first; press **`u`** → the **raw** dump appears:
   emails, phones, addresses, **card numbers**, and **cracked passwords** — including the card the
   audience just saw on the account page.
6. **The point + report.** *"Found in minutes. This is why security matters."* Export the PDF report
   (masked — the responsible client deliverable).

## Part A — Reconix (the tool)
Small, fully mapped. Files:
- `apps/terminal/reconix/store/templates/web_url.py`
  - Rework finding **004**: title → *"SQL injection in catalog search"*, `path` → `/api/v1/products`,
    `affected_url` → `{url}/api/v1/products?q=`, references `CWE-89 / OWASP A03:2021`, CVSS 9.8.
    Update description/impact to the unauth DB-read + card/password leak story.
  - `evidence[]` = **masked** dump table (email, phone, brand+last4 card, cracked = ••••••) + the
    existing HTTP probe lines. Flows to dashboard/PDF/DOCX verbatim (redaction leaves it alone).
  - `evidence_unmasked[]` = **raw** dump table (full email, phone, PAN, exp, plaintext password).
  - `build_run`: add the "plan updates to crack it" beat (say/log + a one-line `card`
    "Records read · Hashes cracked" + reveal 004 as the headline).
- `apps/terminal/reconix/models/finding.py`
  - Add `evidence_unmasked: List[str] = field(default_factory=list)` (a non-serialized field).
- `apps/terminal/reconix/store/templates/base.py`
  - One **optional** RunProfile hook so only web_url gets the crack beat (other templates unaffected).
- `apps/terminal/reconix/screens/finding_detail.py`
  - Add `Binding("u", "unmask", "unmask")`: when on and the finding has `evidence_unmasked`, render
    those rows under a red **"ATTACKER'S VIEW — UNMASKED"** heading instead of the masked evidence.
    Default off. (Per-screen state; reset when leaving.)
- `apps/terminal/reconix/store/snapshot.py` — **no change** (do NOT serialize `evidence_unmasked`, so
  raw PII stays out of saved files / web / PDF). Confirm the serializer ignores unknown-to-it fields.
- Regenerate: `python scripts/make_sample_data.py` (so the dashboard shows the masked dump).
- Test: extend a store test to assert finding 004 has both evidence sets and that the snapshot omits
  the raw one; keep `tests/test_static_data.py` green (dot-free `@example.com` locals — done).

## Part B — Lumina storefront (`apps/lumina-site/`)
Full storefront, stripped to run offline. The app already boots with no backend (empty states), so the
mock layer is purely **additive**. Confirmed seams (frontend map):
- **API seam — ONE file:** `src/api/client.js` (`request()` + the `api` object). Stub `request()` to
  switch on `method + path` and return the **inner** `data` object (post-`unwrap()`, not the
  `{success,message,data}` envelope). Baked data in a new `src/api/mockData.js`. No other api/*.js edits.
- **Auth — no AuthContext change:** on boot write any string to `localStorage["lumina.refreshToken"]`
  and have the mocked `GET /v1/profile` return Sophea `{id,name:"Sophea Chan",email,phone,address,
  role:"CUSTOMER"}`; `AuthContext` restore effect signs her in. Google button self-hides with no client id.
- **Account + card:** `/account` → `AccountPage.jsx` → `ProfilePanel.jsx` already renders
  name/phone/address. **Saved-card UI does not exist — build it:** add a "Payment methods" card
  (invent shape `{brand,last4,expMonth,expYear,holder}`) = Visa ****4242, matching the dump.
- **Catalog mock:** bake products in the `PageRes` shape `{content,totalElements,totalPages,page,size}`
  with the product fields `toStorefrontProduct` expects (`id,slug,name,basePrice,effectivePrice,
  images:[{imageUrl}],variants:[{color,size,...}],categoryPath,section,...`). Tag some with sections
  `featured/trend/atelier/under10/footwear` so the home rails fill; `GET /v1/categories/tree` =
  man/woman/kid nodes. Search box already navigates `/category?q=` client-side.
- **Endpoints to mock:** `/v1/categories/tree`, `/v1/products*` (+ `/{id|slug}`, `/{id}/related`),
  `/v1/profile`, `/v1/cart`, `/v1/wishlist`, `/v1/notifications/preferences`,
  `/v1/store-settings/delivery-fee`. Checkout/KHQR payment stay **stubbed** (out of demo scope).
- **Assets:** point mock `images[].imageUrl` at the local `/images/products/...` placeholders already
  in `public/` (man/*, woman/*, banner/*) — zero 404s. `adapt.js` already has a fallback image too.
- **Env/boot:** defaults work (`VITE_API_BASE` falls back to `/api`; the dev proxy just never gets hit).
  No `.env` needed. `npm install && npm run dev`.
- **Consistency:** Sophea + Visa ****4242 on the account page must equal the seeded Reconix dump row.

## Leaked data (fake/reserved) — 12 rows
Generated in scratchpad (`dump_masked.txt` / `dump_raw.txt`): `@example.com` (dot-free locals),
`+855` phones, Phnom Penh addresses, test card PANs (`4242 4242 4242 4242`, `5555…4444`, etc.) with
expiry, MD5 hashes paired to weak plaintext (`123456`, `password`, `lumina123`, `Lumina2024`, …).
No CVVs. Masked view → brand + last-4; unmask view → full PAN + plaintext.

## Safety & consistency
- Authorized demo only; all data fabricated and reserved. No real PANs, domains, or people.
- Never write `password:`/`secret:`/`token:`/`cookie:` keyword shapes in evidence (redaction would mask
  them); keep the dump as space-aligned columns.
- Keep each evidence line < 20,000 chars and < ~95 cols (so the PDF doesn't wrap the table).

## Verification
- `pytest -q apps/terminal/tests/test_static_data.py apps/terminal/tests/test_store_report.py`
- Run the TUI, play the web_url assessment, open finding 004, press `u`, confirm masked↔raw.
- `apps/lumina-site`: `npm install && npm run dev` boots with no backend; account shows the saved card.

## Sequence
1. Part A (small, self-contained) — build + test first; it's the core "tool finds it" story.
2. Part B strip (after the frontend map) — storefront prop + account/card.
3. Dress rehearsal end-to-end; export the PDF.

## Open items
- ~~Frontend strip specifics~~ — resolved (see Part B: single `src/api/client.js` seam + `mockData.js`).
- Reconix target label: recommend keeping `www.lumina.com` (reads as Lumina's production site; the
  scan is scripted) while the audience browses the local lumina-site separately. Change only if you
  want the finding's `affected_url` to show the local URL.
