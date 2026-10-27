# Delegated scanning: harness + Kali MCP container

The harness no longer runs Semgrep, Gitleaks and SonarScanner itself — it **delegates** their
execution to the [reconix-kali-container](https://github.com/SokpisethNhoeun/Reconnix_Terminal)
(the Kali MCP tool container) over MCP. The harness still does all the rest: merging, secret
masking, incremental carry-over and the LLM review/chat/fix agents.

Two Docker Compose projects run side by side on **one host**, joined by a shared code volume and
by host ports. The Kali container reads the code the harness unpacks through the shared volume — no
files cross the MCP connection.

```
VS Code ──MCP──► harness (brain)  ──MCP (host.docker.internal:8090/mcp)──►  kali-mcp (hands)
                   │  /data  ══ shared "reconix-code" volume ══  /workspace:ro  │
                   └── SonarQube API (host.docker.internal:9000) ◄── sonar_scan ┘ + bundled SonarQube (H2)
```

## One-time setup

```sh
# 1. The shared code volume (both compose projects reference it as external).
docker volume create reconix-code

# 2. Pick an auth token the harness uses to call the Kali container.
export KALI_MCP_AUTH_TOKEN=$(openssl rand -hex 24)

# 3. Start the Kali container + its bundled SonarQube (H2), from the reconix-kali-container dir:
cd /path/to/reconix-kali-container
docker compose -f docker-compose.yml \
  -f /path/to/analyzer-agent-harness/deploy/kali-mcp.override.yml \
  --profile sonar up -d --build

# 4. Bootstrap a SonarQube token (waits for SonarQube, prints/sets SONAR_TOKEN):
#    its script lives in the Kali repo; default login admin/admin.
./scripts/sonar-bootstrap.sh         # -> SONAR_TOKEN
export SONAR_TOKEN=<the token>

# 5. Restart the Kali container so sonar_scan picks up SONAR_TOKEN.
docker compose -f docker-compose.yml \
  -f /path/to/analyzer-agent-harness/deploy/kali-mcp.override.yml --profile sonar up -d

# 6. Put the same KALI_MCP_AUTH_TOKEN and SONAR_TOKEN in the harness .env, then start the harness:
cd /path/to/analyzer-agent-harness
docker compose up -d --build
```

The host needs `vm.max_map_count >= 524288` for SonarQube (`sysctl -w vm.max_map_count=524288`).

## Harness env vars

| Variable | Default | Meaning |
|---|---|---|
| `KALI_MCP_URL` | `http://host.docker.internal:8090/mcp` | The Kali container's MCP endpoint. **Unset it to run the local scanner binaries instead** (the default for dev/tests). |
| `KALI_MCP_AUTH_TOKEN` | — | Bearer token for the Kali container (must match its `KALI_MCP_AUTH_TOKEN`). |
| `KALI_WORKSPACE_MAP` | `/data=/workspace` | `host=container` path prefixes for the shared volume (comma-separated for several). |
| `SONAR_HOST_URL` | `http://host.docker.internal:9000` | The Kali container's bundled SonarQube (H2). |
| `SONAR_TOKEN` | — | SonarQube token, from the bootstrap step. |

## Local (no container)

Leave `KALI_MCP_URL` empty and the harness runs Semgrep/Gitleaks/SonarScanner from its own image,
exactly as before. This is what the unit tests use.
