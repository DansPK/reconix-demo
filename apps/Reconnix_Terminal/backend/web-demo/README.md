# ShopWave — demo ecommerce (controlled-exploitation target)

A good-looking full-stack **Next.js (App Router) + PostgreSQL** storefront, built as an **intentionally
vulnerable** target for the harness exploitation lab. UI uses Tailwind + shadcn-style components.

> ⚠️ **Intentionally insecure. Lab use only.** Do not deploy on a public/untrusted network.

## Stack
- Next.js 15 + React 19 + TypeScript (runs in dev mode so it always boots)
- PostgreSQL 16 (schema + seed auto-loaded via `db/init.sql`)
- Raw `pg` SQL (so SQL injection is real), weak JWT auth (`jsonwebtoken`)
- Tailwind CSS + shadcn-style `Button/Card/Input/Badge`, lucide icons

## Run

```bash
cd web-demo
docker compose up --build        # web on http://localhost:8080, postgres on 5432
```

To expose it to the Kali VM for scanning, change the web port mapping in `docker-compose.yml`
to `"8081:3000"` (the firewall already allows the VM subnet to 8081), then browse from the VM to
`http://192.168.210.1:8081`.

## Seed accounts
| email | password | role |
|---|---|---|
| admin@shopwave.test | admin123 | admin |
| alice@example.com | password1 | user |
| bob@example.com | hunter2 | user |

## Pages
`/` storefront · `/search?q=` search · `/product/[id]` detail + reviews · `/login` `/register` ·
`/account` orders · `/cart` checkout · `/admin` dashboard.

## API (attack surface)
`GET /api/products?search=` · `GET /api/products/[id]` · `POST /api/reviews` ·
`POST /api/auth/login` · `POST /api/auth/register` · `GET /api/orders/[id]` · `GET /api/users/[id]` ·
`POST /api/checkout` · `GET /api/admin/users`.

See **VULNERABILITIES.md** for the planted issues and one-line PoCs.
