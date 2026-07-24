<div align="right">
  <details>
    <summary >🌐 Language</summary>
    <div>
      <div align="center">
        <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=en">English</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=zh-CN">简体中文</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=zh-TW">繁體中文</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=ja">日本語</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=ko">한국어</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=hi">हिन्दी</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=th">ไทย</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=fr">Français</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=de">Deutsch</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=es">Español</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=it">Italiano</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=ru">Русский</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=pt">Português</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=nl">Nederlands</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=pl">Polski</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=ar">العربية</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=fa">فارسی</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=tr">Türkçe</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=vi">Tiếng Việt</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=id">Bahasa Indonesia</a>
        | <a href="https://openaitx.github.io/view.html?user=Sir-Scuzza&project=gluetun-webui&lang=as">অসমীয়া</
      </div>
    </div>
  </details>
</div>

# Gluetun WebUI

A lightweight web UI for monitoring and controlling [Gluetun](https://github.com/qdm12/gluetun) — the VPN client container for Docker.

![Status: Connected](https://img.shields.io/badge/status-connected-brightgreen)
![Node 25](https://img.shields.io/badge/node-25--alpine-blue)
![Docker](https://img.shields.io/badge/docker-compose-blue)

---

## Features

- ✨ **Multi-VPN Support** — Monitor & control up to 20 Gluetun instances simultaneously
- Live VPN status banner (connected / paused / disconnected)
- Public exit IP with **auto-detected IPv6** — shows both IPv4 and IPv6 when available, with manual fallback
- VPN provider, protocol (WireGuard / OpenVPN), server details
- Port forwarding and DNS status
- Start / Stop VPN controls
- Auto-refresh with configurable interval (5s – 60s)
- Last 30 poll ticks colour-coded in history bar
- Responsive design (mobile, tablet, desktop)
- Ability to change VPN server (hostname/IP) via UI
- Persistent polling interval selection (via localStorage)

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

### Option A1: Single Instance (Recommended)

Add `gluetun-webui` to your existing compose file alongside Gluetun:

```yaml
gluetun-webui:
  image: scuzza/gluetun-webui:latest
  container_name: gluetun-webui
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    - GLUETUN_CONTROL_URL=http://gluetun:8000
    # Uncomment if Gluetun auth is enabled:
    #- GLUETUN_API_KEY=yourtoken
    #- GLUETUN_USER=username
    #- GLUETUN_PASSWORD=password
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
    test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
    interval: 30s
    timeout: 5s
    start_period: 10s
    retries: 3
```

### Option A2: Multiple Instances

Monitor 2+ Gluetun instances with separate dashboards:

```yaml
gluetun-webui:
  image: scuzza/gluetun-webui:latest
  container_name: gluetun-webui
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    - GLUETUN_1_NAME=VPN - London
    - GLUETUN_1_URL=http://gluetun-1:8000
    - GLUETUN_1_API_KEY=token1

    - GLUETUN_2_NAME=VPN - Amsterdam
    - GLUETUN_2_URL=http://gluetun-2:8000
    - GLUETUN_2_API_KEY=token2

    - GLUETUN_3_NAME=VPN - Singapore
    - GLUETUN_3_URL=http://gluetun-3:8000
    - GLUETUN_3_API_KEY=token3
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
```

### Option B: Build Locally

```bash
git clone https://github.com/Sir-Scuzza/gluetun-webui.git
cd gluetun-webui
docker compose up -d --build
```

Then run (either option):

```bash
docker compose up -d
```

The UI is available at **http://localhost:3000**

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

## Multi-VPN Support

### Multiple Instances

gluetun-webui supports monitoring and controlling **multiple Gluetun instances simultaneously**. Each instance displays as a separate dashboard in a responsive grid.

**Configuration**: Use numbered environment variables:

```yaml
gluetun-webui:
  image: scuzza/gluetun-webui:latest
  environment:
    # Instance 1
    - GLUETUN_1_NAME=VPN 1
    - GLUETUN_1_URL=http://gluetun-1:8000
    - GLUETUN_1_API_KEY=token1  # optional

    # Instance 2
    - GLUETUN_2_NAME=VPN 2
    - GLUETUN_2_URL=http://gluetun-2:8000
    - GLUETUN_2_API_KEY=token2  # optional

    # Instance 3
    - GLUETUN_3_NAME=VPN 3
    - GLUETUN_3_URL=http://gluetun-3:8000
    - GLUETUN_3_USER=admin
    - GLUETUN_3_PASSWORD=secret  # optional (HTTP Basic auth)
```

**Supported**: Up to 20 instances (via `GLUETUN_1_URL` through `GLUETUN_20_URL`)  
**Responsive**: 1 full-width dashboard → 2 half-width → 3 third-width → 4 quarter-width → scrollable at 5+

### Backward Compatibility

If no numbered variables are configured, falls back to **legacy single-instance mode**:

```yaml
environment:
  - GLUETUN_CONTROL_URL=http://gluetun:8000  # legacy
  - GLUETUN_API_KEY=token
```

### Per-Instance Authentication

Each instance can have different authentication:

```yaml
# Instance with API key
- GLUETUN_1_API_KEY=my-secret-token

# Instance with HTTP Auth
- GLUETUN_2_USER=admin
- GLUETUN_2_PASSWORD=mysecret

# Instance with no auth
- GLUETUN_3_URL=http://gluetun-3:8000  # auth optional
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GLUETUN_1_*` to `GLUETUN_20_*` | _(empty)_ | **Multi-instance config** (up to 20 instances) |
| `GLUETUN_{N}_URL` | – | Gluetun HTTP control server URL for instance N |
| `GLUETUN_{N}_NAME` | `Instance {N}` | Display name for instance N |
| `GLUETUN_{N}_API_KEY` | _(empty)_ | Bearer token for instance N (if auth enabled) |
| `GLUETUN_{N}_USER` | _(empty)_ | Username for HTTP Basic auth (instance N) |
| `GLUETUN_{N}_PASSWORD` | _(empty)_ | Password for HTTP Basic auth (instance N) |
| `GLUETUN_{N}_IP_DISPLAY_MODE` | `auto` | IP display mode: `auto` (show both if IPv6 detected), `dual` (force both), or single IPv4 only |
| `GLUETUN_{N}_SECONDARY_PUBLIC_IP` | _(empty)_ | Manual override for secondary IP (e.g. IPv6). Used when auto-detection fails. Typically not needed — see [IPv6 Setup](#ipv6-setup) |
| `GLUETUN_CONTROL_URL` | `http://gluetun:8000` | **Legacy** – single instance only (fallback if no `GLUETUN_1_*` vars) |
| `GLUETUN_API_KEY` | _(empty)_ | **Legacy** – Bearer token for single instance |
| `GLUETUN_USER` | _(empty)_ | **Legacy** – Username for HTTP Basic auth |
| `GLUETUN_PASSWORD` | _(empty)_ | **Legacy** – Password for HTTP Basic auth |
| `PORT` | `3000` | Port the web UI listens on |
| `TRUST_PROXY` | `false` | Set to `true` if running behind a reverse proxy (nginx, Traefik, etc.) |

---

## Security

- Port is bound to `127.0.0.1` — not exposed to the network
- Container runs as non-root with read-only filesystem and dropped capabilities
- Rate limiting applied to all API routes
- Upstream error details are logged server-side only — generic messages returned to the browser

### Reverse-proxy configuration

If you run gluetun-webui behind a reverse proxy (nginx, Traefik, Caddy, etc.), set `TRUST_PROXY=true` in your environment variables:

```yaml
gluetun-webui:
  image: scuzza/gluetun-webui:latest
  environment:
    - GLUETUN_CONTROL_URL=http://gluetun:8000
    - TRUST_PROXY=true  # Required for reverse proxies
```

This allows the app to correctly parse `X-Forwarded-For` and related headers for accurate rate limiting and IP detection. **Note:** Only enable this if you're actually behind a reverse proxy, as it trusts proxy headers from your reverse proxy.

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

## IPv6 Setup

The web UI **auto-detects** your public IPv6 address via an external service ([api6.ipify.org](https://api6.ipify.org)) and displays it alongside IPv4 when available. No configuration is needed on the web UI side — if Gluetun has IPv6 connectivity, the UI shows both addresses automatically.

**However**, Docker containers don't have IPv6 by default. You must configure your Docker daemon and Gluetun for IPv6 to work. Without this, the UI will only show IPv4.

### Step 1: Enable IPv6 in Docker Daemon

Edit `/etc/docker/daemon.json` on your Linux host:

```json
{
  "ipv6": true,
  "ip6tables": true,
  "fixed-cidr-v6": "fd7d:1234::/80"
}
```

> **Note:** `fixed-cidr-v6` assigns IPv6 addresses to containers on the default bridge network. For custom networks (recommended), you'll configure per-network subnets in Step 2. The `fd7d:1234::/80` prefix is a ULA (Unique Local Address) range — any routable ULA works.

Restart Docker after editing:

```bash
sudo systemctl restart docker
```

### Step 2: Configure Gluetun's Docker Network for IPv6

In your `docker-compose.yml`, add IPv6 to the network and sysctls to Gluetun:

```yaml
services:
  gluetun:
    image: qmcgaw/gluetun:latest
    sysctls:
      net.ipv6.conf.all.disable_ipv6: 0          # Enable IPv6 inside the container
    networks:
      - vpn

  gluetun-webui:
    image: scuzza/gluetun-webui:latest
    # ... rest of config ...
    networks:
      - vpn

networks:
  vpn:
    enable_ipv6: true
    ipam:
      config:
        - subnet: 172.28.0.0/16      # IPv4 subnet (adjust to your setup)
        - subnet: fd00:dead:beef::/48  # IPv6 subnet (ULA range)
```

> **Note:** The `fd00:dead:beef::/48` prefix is arbitrary — any ULA prefix works. The `/48` gives you plenty of room for multiple networks.

### Step 3: Add IPv6 to WireGuard Addresses

This is the critical step. Your VPN provider must assign you an IPv6 address via WireGuard. For AirVPN:

1. Go to [AirVPN WireGuard config generator](https://airvpn.org/wireguard/)
2. Note the `AllowedIPs` line — it contains both IPv4 and IPv6 CIDRs, e.g.:
   ```
   AllowedIPs = 0.0.0.0/0, ::/0
   Address = 10.x.x.x/32,2a0a:xxxx:xxxx::128/128
   ```
3. Set `WIREGUARD_ADDRESSES` in Gluetun with **both** addresses:

```yaml
services:
  gluetun:
    environment:
      - VPN_SERVICE_PROVIDER=airvpn
      - VPN_TYPE=wireguard
      - WIREGUARD_PRIVATE_KEY=yourkey
      - WIREGUARD_ADDRESSES=10.x.x.x/32,2a0a:xxxx:xxxx::128/128
```

> **Critical:** `WIREGUARD_ADDRESSES` must include the IPv6 CIDR from your provider. Without it, Gluetun won't route IPv6 traffic even if Docker is configured for it.

### Step 4: Verify

1. Restart Gluetun: `docker compose up -d gluetun`
2. Check Gluetun has IPv6:
   ```bash
   docker exec gluetun wget -qO- https://api6.ipify.org?format=json
   # Should return: {"ipv6":"2a0a:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx"}
   ```
3. Open the web UI — the AirVPN card should now show both IPs with labels:

```
Public IP
  213.152.187.215  (IPv4)
  2a0a:b640:1:5:bc4e:595b:17f4:659c  (IPv6)
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Only IPv4 shows in UI | Gluetun doesn't have IPv6 — check Steps 1–3 |
| `docker exec gluetun wget` returns "Network unreachable" | Docker daemon IPv6 not enabled or network missing `enable_ipv6: true` |
| Gluetun won't start | Check `WIREGUARD_ADDRESSES` format — must be `ipv4/32,ipv6/128` (comma-separated, no spaces) |
| IPv6 works but UI doesn't show it | Open browser devtools → Network tab → check `/api/1/health` response has `publicIpv6.ok: true` |

### Manual Fallback

If auto-detection fails (e.g. behind a restrictive proxy), you can manually set the IPv6 address:

```yaml
environment:
  - GLUETUN_1_SECONDARY_PUBLIC_IP=2a0a:xxxx:xxxx::128
  - GLUETUN_1_IP_DISPLAY_MODE=dual
```

This forces display of both addresses without relying on external detection.

---

## Acknowledgments

- **[Gluetun](https://github.com/qdm12/gluetun)** — The VPN client container this webui was built for
- **[gluetun-monitor](https://github.com/csmarshall/gluetun-monitor)** — Great monitoring tool to pair with this webui
- **AI-Assisted Development** — This project was built with AI assistance

---

## License

MIT