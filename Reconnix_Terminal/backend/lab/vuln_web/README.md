# Vuln Lab (intentionally vulnerable)

A tiny deliberately-insecure web app used as a **PoC target for the harness**. It has a real SQL injection
(`/item?id=`) and a reflected XSS (`/search?q=`).

**⚠️ Do not expose this to any untrusted network.** Bind it only to a private lab/VM network. Stdlib only.

```bash
python lab/vuln_web/app.py           # binds 0.0.0.0:8081 (override with VULN_HOST / VULN_PORT)
```

From the Kali VM (192.168.210.130) the host is reachable at `192.168.210.1`, so the scan target is
`http://192.168.210.1:8081/item?id=1`.
