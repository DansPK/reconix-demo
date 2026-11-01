---
name: realistic-demo-data
description: Generate realistic BUT safe demo data for the Reconix demo — customer/leak tables, finding evidence, catalog, account data — without breaking the reserved-host safety guard or the redaction layer. Use whenever adding or editing any value the audience sees.
---

# Realistic demo data

The demo is shown to non-technical audiences, so visible data must look **real**. But everything is
fabricated and must stay safe. These two goals collide in a few exact places — this is how to satisfy both.

## Look real
- Real-sounding names, the **Lumina** brand, consumer email providers (`gmail.com`, `yahoo.com`,
  `outlook.com`, `hotmail.com`), `+855` phones, Phnom Penh addresses.
- **Avoid `example.com`/`example.org`** and the literal word "demo" in audience-facing data. Code
  flags/comments (`VITE_DEMO`, `# demo-only`) are fine — this rule is about data on screen.

## Stay safe (never cross)
- **No real people, no real target sites, no real card numbers.** Card numbers must be **fabricated
  but realistic**: Luhn-valid with a correct brand BIN (Visa `4…`, Mastercard `51–55`/`2221–2720`,
  Amex `34`/`37`, Discover `6011`/`65`) and varied digits — **generate them** with a seeded `python`
  Luhn script, never copy a real card. Avoid the obvious repeated-digit test PANs (`4242 4242 4242
  4242`) in audience-facing data; they read as fake. **Never store CVVs.** For secrets use
  placeholders (`sk_live_****`).
- **Reserved-host guard** — `apps/terminal/tests/test_static_data.py` asserts every dotted hostname in a
  saved snapshot is reserved. So in anything that reaches a snapshot (finding evidence, targets):
  - **Email local parts must be dot-free** — the host regex reads `first.last` as a bogus host. Use
    underscores/digits: `sophea_chan@gmail.com`, `darakim88@gmail.com`.
  - **Email domains** must be reserved (`example.com`, `contoso/fabrikam/northwind.*`, `lumina.com`) or
    in the `DEMO_LEAK_DOMAINS` allow-list. To use another provider, **extend `DEMO_LEAK_DOMAINS`** (with
    a comment) — never delete or weaken the guard.
  - Phones, addresses, card numbers and MD5 hashes carry no dotted host, so they are unconstrained.
- **Redaction** (`store/redact.py`) masks `password:`/`pwd:`/`secret:`/`token:`/`cookie:` as a
  `keyword: value` or `keyword=value` shape, plus bearer/JWT/AWS/PEM. **Never write those shapes** in
  evidence, or the value vanishes. Lay dumps out as space-aligned columns with a header row instead.

## Conventions
- **Masking uses the bullet `•` (U+2022).** In **Python source write `"•"`** — the Windows console
  mangles literal bullets, and `test_static_data` is unforgiving. Masked forms: `s•••@gmail.com`,
  `+855 12 ••• •••`, `visa ••••5466`, `••••••`.
- **One source of truth for Sophea.** The signed-in storefront shopper and her saved card
  (`apps/lumina-site`) MUST equal the leaked row in the Reconix dump: **Sophea Chan · Visa
  `4532 9859 9256 5466` (****5466) · exp 08/27 · sophea_chan@gmail.com · +855 12 684 207**, password
  `Sophea1995` (MD5 `4e99…`). Change both sides together.

## Workflow
1. Generate values with a throwaway `python -I` script in the scratchpad; for finding evidence, emit
   Python list literals (so column alignment and `•` are exact) and paste those.
2. Verify: `cd apps/terminal && pytest -q tests/test_static_data.py` (host guard + severities) and, if a
   report is involved, `tests/test_store_report.py`. Regenerate the dashboard data with
   `python scripts/make_sample_data.py`.

Related: [[reconix-finding]], [[scanner-finding]].
