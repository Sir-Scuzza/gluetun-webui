# Gluetun Webui

A lightweight web UI for monitoring and controlling [Gluetun](https://github.com/qdm12/gluetun) — the VPN client container for Docker.

![Status: Connected](https://img.shields.io/badge/status-connected-brightgreen)
![Node 20](https://img.shields.io/badge/node-20--alpine-blue)
![Docker](https://img.shields.io/badge/docker-compose-blue)

---

## Features

- **VPN status** — live running/stopped/paused state with visual banner
- **Public IP details** — exit IP, country, region, city, organisation
- **VPN connection details** — provider, protocol (WireGuard or OpenVPN auto-detected), server hostname, country, city
- **Port forwarding** — shows the currently forwarded port if enabled
- **DNS status** — confirms gluetun's internal DNS resolver is running
- **Start / Stop controls** — send start/stop commands to gluetun from the UI
- **Auto-refresh** — configurable polling interval (5s / 10s / 30s / 60s / off)
- **Poll history** — last 30 status ticks colour-coded (connected / paused / disconnected / unknown)
- **No poll stacking** — uses recursive `setTimeout` + in-flight guard to prevent overlapping requests

---

## Screenshots
![alt text](image.png)
---

## Requirements

- Docker + Docker Compose
- Gluetun running with its HTTP control server enabled (default port `8000`)
- Both containers on the same Docker network

---

## Quick Start

### Option A: Docker Hub (Recommended)

Use the pre-built image from Docker Hub:

```bash
docker pull scuzza/gluetun-webui:latest
```

Then create a `docker-compose.yml` (see example below) and run:

```bash
docker compose up -d
```

**Example docker-compose.yml:**

```yaml
name: gluetun-webui

services:
  gluetun-webui:
    image: scuzza/gluetun-webui:latest
    container_name: gluetun-webui
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - GLUETUN_CONTROL_URL=http://gluetun:8000
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

networks:
  ext-network:
    external: true
    name: your_network_name
```

### Option B: Build Locally

Clone and build from source:

```bash
git clone https://github.com/Sir-Scuzza/gluetun-webui.git
cd gluetun-webui
```

### 4. Configure

Edit your `docker-compose.yml` and set the network name to match your existing stack:

```yaml
networks:
  ext-network:
    external: true
    name: your_network_name   # ← change this
```

If gluetun has auth enabled, uncomment the relevant env vars:

```yaml
environment:
  - GLUETUN_CONTROL_URL=http://gluetun:8000
  # Bearer token auth:
  # - GLUETUN_API_KEY=yourtoken
  # HTTP Basic auth:
  # - GLUETUN_USER=username
  # - GLUETUN_PASSWORD=password
```

### 5. Deploy

For Docker Hub images, use:
```bash
docker compose up -d
```

For local builds, use:
```bash
docker compose up -d --build
```

The UI is available at **http://localhost:3000**

> **Note:** The port is bound to `127.0.0.1` only. It is not exposed to the wider network. To access it remotely, use a reverse proxy (see [Security](#security)).

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the web UI listens on |
| `GLUETUN_CONTROL_URL` | `http://gluetun:8000` | URL of gluetun's HTTP control server |
| `GLUETUN_API_KEY` | _(empty)_ | Bearer token (if gluetun API key auth is enabled) |
| `GLUETUN_USER` | _(empty)_ | Username for HTTP Basic auth |
| `GLUETUN_PASSWORD` | _(empty)_ | Password for HTTP Basic auth |

---

## API Endpoints

The Node.js server proxies gluetun's control API and exposes:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Aggregate snapshot of all status endpoints |
| `GET` | `/api/status` | VPN running status |
| `GET` | `/api/publicip` | Public exit IP and geo info |
| `GET` | `/api/portforwarded` | Forwarded port number |
| `GET` | `/api/settings` | VPN provider and protocol settings |
| `GET` | `/api/dns` | DNS resolver status |
| `PUT` | `/api/vpn/start` | Start the VPN tunnel |
| `PUT` | `/api/vpn/stop` | Stop the VPN tunnel |

---

## Status Indicators

### Banner states

| State | Colour | Meaning |
|---|---|---|
| **VPN Connected** | Green | Tunnel is up and running |
| **VPN Paused** | Yellow | Gluetun is reachable but VPN process is stopped |
| **VPN Disconnected** | Red | Tunnel is down |
| **Status Unknown** | Yellow | Could not reach gluetun control API |

### Badge states

| Badge | Colour | Meaning |
|---|---|---|
| OK | Green | Service healthy |
| Warn | Yellow | Service reachable but not running |
| Error | Red | Service unreachable |

---

## Gluetun API Endpoints Used

| Gluetun endpoint | Purpose |
|---|---|
| `GET /v1/vpn/status` | Protocol-agnostic VPN running state |
| `PUT /v1/vpn/status` | Start / stop the VPN |
| `GET /v1/vpn/settings` | Provider name, protocol type (wireguard/openvpn) |
| `GET /v1/publicip/ip` | Exit IP, country, city, hostname |
| `GET /v1/portforward` | Forwarded port |
| `GET /v1/dns/status` | DNS resolver status |

> **Note:** `/v1/vpn/status` and `/v1/vpn/settings` are protocol-agnostic — this UI works with both WireGuard and OpenVPN without any configuration change.

---

## Security

### Rate limiting

The server enforces per-IP rate limits to protect the upstream Gluetun API:

| Scope | Limit |
|---|---|
| All `GET /api/*` routes | 120 requests / minute |
| `PUT /api/vpn/:action` | 10 requests / minute |

### Security headers

Every response includes: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

### Docker hardening

The provided `docker-compose.yml` and `Dockerfile` apply the following hardening by default:

- Port bound to `127.0.0.1` only (not exposed to the network)
- Non-root user inside the container
- Read-only root filesystem (`read_only: true`) with a `tmpfs` at `/tmp`
- `no-new-privileges: true` and `cap_drop: ALL`
- `X-Powered-By` header suppressed

### Reverse-proxy authentication

The VPN start/stop endpoints (`PUT /api/vpn/:action`) have no UI-layer authentication. If you expose this service beyond localhost, place it behind a reverse proxy with HTTP Basic auth (Nginx, Caddy, Traefik, etc.).

---

## Project Structure

```
gluetun-webui/
├── Dockerfile
├── docker-compose.yml
├── package.json
└── src/
    ├── server.js          # Express proxy server
    └── public/
        ├── index.html     # UI markup
        ├── app.js         # Polling, rendering, VPN control logic
        └── style.css      # Dark theme styles
```

---

## Acknowledgments

- **[Gluetun](https://github.com/qdm12/gluetun)** — The excellent VPN client container this webui was designed for
- **[gluetun-monitor](https://github.com/csmarshall/gluetun-monitor)** — Excellent monitoring tool to pair with this webui
- **AI-Assisted Development** — This project was built with AI assistance

---

## License

MIT
