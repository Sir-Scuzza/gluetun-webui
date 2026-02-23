# Gluetun Monitor

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
- **Poll history** — last 30 status ticks colour-coded (connected / paused / unknown)
- **No poll stacking** — uses recursive `setTimeout` + in-flight guard to prevent overlapping requests

---

## Screenshots

> VPN connected, WireGuard, Surfshark

| Banner | Cards |
|--------|-------|
| Green "VPN Connected" | Public IP, VPN Connection, Port Forwarding, DNS |

---

## Requirements

- Docker + Docker Compose
- Gluetun running with its HTTP control server enabled (default port `8000`)
- Both containers on the same Docker network

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/youruser/gluetun-webui.git
cd gluetun-webui
```

### 2. Configure

Edit `docker-compose.yml` and set the network name to match your existing stack:

```yaml
networks:
  arr-stack:
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

### 3. Deploy

```bash
docker compose up -d --build
```

The UI is available at **http://localhost:3000**

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
| UNKNOWN | Yellow | Service reachable but not running |
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

## Development

```bash
npm install
npm run dev    # starts with nodemon, auto-restarts on changes
```

The dev server expects gluetun reachable at `http://gluetun:8000` by default. Override with:

```bash
GLUETUN_CONTROL_URL=http://localhost:8000 npm run dev
```

---

## License

MIT
