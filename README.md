# Gluetun WebUI

A lightweight web UI for monitoring and controlling [Gluetun](https://github.com/qdm12/gluetun) — the VPN client container for Docker.

![Status: Connected](https://img.shields.io/badge/status-connected-brightgreen)
![Node 25](https://img.shields.io/badge/node-25--alpine-blue)
![Docker](https://img.shields.io/badge/docker-compose-blue)

---

## Features

- Live VPN status banner (connected / paused / disconnected)
- Public exit IP, country, region, city, and organisation
- VPN provider, protocol (WireGuard / OpenVPN), server details
- Port forwarding and DNS status
- Start / Stop VPN controls
- Auto-refresh with configurable interval (5s – 60s)
- Last 30 poll ticks colour-coded in history bar

---

## Screenshots
![alt text](image-1.png)

---

## Requirements

- Docker + Docker Compose
- Gluetun running with its HTTP control server enabled (default port `8000`)
- Gluetun and gluetun-webui on the same Docker network

> Supports `linux/amd64` and `linux/arm64` (works on Mac Intel/Apple Silicon, Linux, and Windows).

---

## Quick Start

### Option A: Docker Hub (Recommended)

Add `gluetun-webui` to your existing compose file alongside Gluetun:

```yaml
gluetun-webui:
  image: scuzza/gluetun-webui:latest
  container_name: gluetun-webui
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    # Instance 1
    - GLUETUN_1_NAME=Gluetun 1
    - GLUETUN_1_URL=http://gluetun1:8000
    # - GLUETUN_1_API_KEY=yourtoken1
    # Instance 2 (omit or leave GLUETUN_2_URL empty to show as unavailable)
    - GLUETUN_2_NAME=Gluetun 2
    - GLUETUN_2_URL=http://gluetun2:8000
    # - GLUETUN_2_API_KEY=yourtoken2
  networks:
    - your_network_name
  restart: unless-stopped
  read_only: true
  tmpfs:
    - /tmp
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/instances"]
    interval: 30s
    timeout: 5s
    start_period: 10s
    retries: 3
```

Then run:

```bash
docker compose up -d
```

The UI is available at **http://localhost:3000**

### Option B: Build Locally

```bash
git clone https://github.com/Sir-Scuzza/gluetun-webui.git
cd gluetun-webui
docker compose up -d --build
```

---

## Network Setup

Both Gluetun and gluetun-webui must be on the same Docker network so `http://gluetun:8000` resolves correctly.

**Same compose file** — just add both services to the same network (most common):

```yaml
services:
  gluetun:
    networks:
      - arr-stack
  gluetun-webui:
    networks:
      - arr-stack

networks:
  arr-stack:
    driver: bridge
```

**Separate compose files** — reference Gluetun's existing network as external. Find your network name with `docker network ls`:

```yaml
networks:
  ext-network:
    external: true
    name: your_gluetun_network_name
```

---

## Configuration

### Two-instance mode (recommended)

| Variable | Default | Description |
|---|---|---|
| `GLUETUN_1_NAME` | `Gluetun 1` | Display name for instance 1 |
| `GLUETUN_1_URL` | _(from `GLUETUN_CONTROL_URL`)_ | Gluetun HTTP control server URL for instance 1 |
| `GLUETUN_1_API_KEY` | _(from `GLUETUN_API_KEY`)_ | Bearer token for instance 1 (if API key auth is enabled) |
| `GLUETUN_2_NAME` | `Gluetun 2` | Display name for instance 2 |
| `GLUETUN_2_URL` | _(empty)_ | Gluetun HTTP control server URL for instance 2 (leave empty to show as unavailable) |
| `GLUETUN_2_API_KEY` | _(empty)_ | Bearer token for instance 2 (if API key auth is enabled) |
| `PORT` | `3000` | Port the web UI listens on |

### Legacy single-instance variables (still supported)

| Variable | Default | Description |
|---|---|---|
| `GLUETUN_CONTROL_URL` | `http://gluetun:8000` | Gluetun HTTP control server URL (maps to instance 1 if `GLUETUN_1_URL` is not set) |
| `GLUETUN_API_KEY` | _(empty)_ | Bearer token (maps to instance 1 if `GLUETUN_1_API_KEY` is not set) |

> **Note:** The UI always shows two fixed columns. If instance 2 is not configured (`GLUETUN_2_URL` is empty), the second column remains visible but shows "Not Configured".

---

## Security

- Port is bound to `127.0.0.1` — not exposed to the network
- Container runs as non-root with read-only filesystem and dropped capabilities
- Rate limiting applied to all API routes
- Upstream error details are logged server-side only — generic messages returned to the browser

### Reverse-proxy authentication

The VPN start/stop controls have no built-in authentication. If you expose the UI beyond localhost, place it behind a reverse proxy with HTTP Basic auth.

**Caddy** (`Caddyfile`):
```
your.domain.com {
  basicauth {
    user $2a$14$<bcrypt-hash>
  }
  reverse_proxy localhost:3000
}
```
Generate a hash with: `caddy hash-password`

**Nginx** (`nginx.conf`):
```nginx
location / {
  auth_basic "Restricted";
  auth_basic_user_file /etc/nginx/.htpasswd;
  proxy_pass http://localhost:3000;
}
```
Generate a password file with: `htpasswd -c /etc/nginx/.htpasswd user`

**Traefik** (Docker labels):
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.gluetun-webui.rule=Host(`your.domain.com`)"
  - "traefik.http.routers.gluetun-webui.middlewares=auth"
  - "traefik.http.middlewares.auth.basicauth.users=user:$$apr1$$<hash>"
```
Generate a hash with: `htpasswd -nb user password`

---

## Acknowledgments

- **[Gluetun](https://github.com/qdm12/gluetun)** — The VPN client container this webui was built for
- **[gluetun-monitor](https://github.com/csmarshall/gluetun-monitor)** — Great monitoring tool to pair with this webui
- **AI-Assisted Development** — This project was built with AI assistance

---

## License

MIT
