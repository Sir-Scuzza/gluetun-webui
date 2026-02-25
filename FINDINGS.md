# Code Review Findings

> Last reviewed: 2026-02-25 (updated)  
> Scope: security, correctness, reliability, code quality  
> Status key: 🔴 High · 🟡 Medium · 🔵 Low · ✅ Fixed

---

## Open Findings

### Bugs (crash / broken functionality)

_No open bugs._

### Security

| # | Severity | File | Finding |
|---|---|---|---|
| S-03 | 🔵 Low | `src/server.js` | **`GLUETUN_CONTROL_URL` is not validated at startup.** The value is used verbatim as a fetch target. A malformed or attacker-controlled value could target arbitrary internal addresses. Validate with `new URL(GLUETUN_URL)` at boot and exit on failure. |
| S-05 | 🔵 Low | `src/server.js` | **No `Strict-Transport-Security` (HSTS) header.** Intentionally omitted for plain-HTTP local use. Must be added if the app is ever placed behind an HTTPS reverse proxy. |
| S-06 | 🔵 Low | `src/server.js` | **Rate limiter uses in-memory store.** Counters reset on every container restart. Acceptable for single-instance home use; note for any production or shared deployment. |
| S-08 | 🔵 Low | `src/server.js` | **No graceful shutdown handler.** The process does not handle `SIGTERM`/`SIGINT`. Docker sends `SIGTERM` on `docker stop`; without a handler, in-flight requests are dropped and the process falls back to `SIGKILL` after the timeout. Add `process.on('SIGTERM', () => server.close())`. |

### Code Quality / Correctness

| # | Severity | File | Finding |
|---|---|---|---|
| C-01 | 🔵 Low | `src/public/app.js` | **`running` is a dead destructured variable.** `renderVpnStatus` returns `{ state, running }` but `running` is never read in `poll()`. Remove from the destructuring assignment. |
| C-02 | 🔵 Low | `src/public/app.js` | **Total server failure does not reset card fields.** When `fetchHealth()` throws (Node server unreachable), the catch block only calls `renderBanner`. The four data cards retain stale values from the last successful poll. Call `renderPublicIp`, `renderPortForwarded`, `renderDns`, and reset the VPN card fields in the catch path. |
| C-03 | 🔵 Low | `package.json` | **Express 4 used; Express 5 is stable.** Express 5 (released Oct 2024) adds native async error propagation, deprecating the manual 4-argument error handler. Non-urgent upgrade candidate. |
| C-04 | 🔵 Low | All | **No tests.** No unit or integration test suite exists. The highest-value targets are `gluetunFetch` error handling, the `renderVpnStatus` state machine, and `renderBanner` output for each state. |
| C-05 | 🔵 Low | `src/public/app.js` | **`innerHTML` used for spinner markup.** `refreshBtn.innerHTML = '<span class="spin">…</span> Refresh'` is safe (hardcoded string) but inconsistent with the `textContent`-only approach used everywhere else. Use `document.createElement` for consistency. |
| C-06 | 🔵 Low | `src/server.js` | **`express.json()` runs on every request.** The body parser is registered globally but only the `PUT /api/vpn/:action` route consumes a body. Scope it to that route or to `/api/vpn` to skip unnecessary parsing on GETs. |

### Infrastructure / Docker

| # | Severity | File | Finding |
|---|---|---|---|
| D-01 | 🔵 Low | `docker-compose.example.yml` | **No resource limits.** No `mem_limit`, `cpus`, or `pids_limit` defined. Add `deploy.resources.limits` or compose v2 resource keys to prevent resource exhaustion. |

---

## Fixed Findings (resolved in this review cycle)

<details>
<summary>Click to expand — 33 issues resolved</summary>

| # | Severity | Finding |
|---|---|---|
| F-01 | 🔴 High | `favicon.svg` missing — every page load 404'd and fell through to the SPA handler |
| F-02 | 🔴 High | No rate limiting on read endpoints — `/api/health` (5 parallel upstream fetches) had no protection |
| F-03 | 🔴 High | `npm install` instead of `npm ci` — non-deterministic builds |
| F-04 | 🔴 High | `--no-audit` suppressed npm vulnerability scanning in the Docker build |
| F-05 | 🔴 High | Port bound to `0.0.0.0` — UI exposed to entire local network |
| F-23 | 🔴 High | CVE-2026-26996 (minimatch 10.1.2) — CVSS 8.7 high severity vulnerability in transitive dependency |
| F-24 | 🔴 High | CVE-2026-26960 (tar 7.5.7) — CVSS 7.1 high severity vulnerability in transitive dependency |
| F-25 | 🟡 Medium | Docker base image Alpine 20 — reached end-of-life; upgraded to Alpine 25 for security patches |
| F-26 | 🟡 Medium | Missing rate limiting on static file routes — UI assets unprotected from request flood attacks |
| F-06 | 🟡 Medium | `NODE_ENV=production` not set in Dockerfile |
| F-07 | 🟡 Medium | `node-fetch` dependency unnecessary — Node 20 ships native `fetch` |
| F-08 | 🟡 Medium | `docker-compose` healthcheck missing `start_period` |
| F-09 | 🟡 Medium | `X-Powered-By: Express` header leaked server fingerprint |
| F-10 | 🟡 Medium | `redirect: 'error'` missing on upstream fetch — SSRF redirect amplification risk |
| F-11 | 🟡 Medium | No `Permissions-Policy` header |
| F-12 | 🟡 Medium | Docker base image not pinned to digest (mutable tag) |
| F-13 | 🟡 Medium | `sessionStorage` history not validated on restore — CSS class injection via tampered storage |
| F-14 | 🔵 Low | Duplicate `Content-Security-Policy` (meta tag + HTTP header) |
| F-15 | 🔵 Low | Unknown `/api/*` GET paths returned `index.html` instead of a JSON 404 |
| F-16 | 🔵 Low | `readLimiter` applied to all HTTP methods — `PUT` action requests double-counted |
| F-17 | 🔵 Low | `express.json()` body parser registered without size limit — resolved by S-01 fix |
| F-18 | 🔵 Low | `badge.warn` state displayed text "Unknown" — semantically incorrect |
| F-19 | 🔵 Low | Stale IP fields displayed with error badge after failed `publicIp` poll |
| F-20 | 🔵 Low | Toast element missing `role="status"` / `aria-live="polite"` |
| F-21 | 🔵 Low | `no-new-privileges`, `cap_drop: ALL`, `read_only` filesystem not set in compose |
| F-22 | 🔵 Low | `redundant PORT=3000` env var in docker-compose |
| F-27 | 🔴 High | `uiLimiter` referenced before declaration — server crashed on startup (B-01). Moved definition above `app.use()` call. |
| D-02 | 🟡 Medium | docker-compose.example.yml network key mismatch — service referenced Docker network name instead of Compose key, silently creating wrong network. Fixed: service changed to `networks: - ext-network`. |
| D-03 | 🟡 Medium | `npm install` used instead of `npm ci` — non-deterministic builds (F-03 regression). Fixed: `package-lock.json` generated and committed; Dockerfile switched to `npm ci --omit=dev --no-fund`. |
| D-04 | 🟡 Medium | Docker base image not pinned to digest (F-12 regression). Fixed: both `FROM` stages pinned to `node:25-alpine@sha256:b9b5737eabd423ba73b21fe2e82332c0656d571daf1ebf19b0f89d0dd0d3ca93`. |
| S-01 | 🟡 Medium | `express.json()` had no body size limit — tightened to `express.json({ limit: '2kb' })`. |
| S-07 | 🟡 Medium | Upstream error details leaked to browser in all 7 route handlers and the health endpoint map. Fixed: all catch blocks now log via `console.error('[upstream]', err.message)` server-side and return a generic `'Upstream error'` to the client. |
| S-02 | 🟡 Medium | No UI-layer authentication documented. Fixed: README Security section expanded with working Caddy, Nginx, and Traefik reverse-proxy auth examples. |

</details>

---

## Recommended Next Steps (priority order)

1. **C-02** — Reset all card fields in `poll()` catch block
2. **S-03** — Validate `GLUETUN_CONTROL_URL` at startup with `new URL()`
3. **S-08** — Add graceful shutdown handler (`SIGTERM` / `SIGINT`)
4. **C-01** — Remove unused `running` from destructuring in `poll()`
5. **C-06** — Scope `express.json()` to PUT routes only
6. **C-04** — Add tests for `gluetunFetch`, `renderVpnStatus`, and `renderBanner`
7. **C-05** — Replace `innerHTML` spinner with `createElement`
8. **D-01** — Add container resource limits to `docker-compose.yml`
9. **C-03** — Plan Express 5 migration (review changelog for breaking changes first)

---

## Recent Updates (2026-02-25)

- **S-01 (Fixed)**: `express.json()` tightened to `express.json({ limit: '2kb' })` to prevent body-flood attacks.
- **S-07 (Fixed)**: All 7 route catch blocks and the `/api/health` map updated — upstream error details now logged server-side only via `console.error('[upstream]', err.message)`; clients receive a generic `'Upstream error'` string.
- **S-02 (Fixed — documentation)**: README Security section expanded with working reverse-proxy auth examples for Caddy, Nginx, and Traefik.
- **D-02 (Fixed)**: docker-compose.example.yml service network reference corrected from `your_network_name` to `ext-network` (the Compose key). Also updated README with two-scenario network setup guide (same compose file vs separate compose file).
- **D-03 (Fixed — F-03 regression resolved)**: `package-lock.json` generated and committed. Dockerfile updated from `npm install` to `npm ci --omit=dev --no-fund` for fully deterministic builds.
- **D-04 (Fixed — F-12 regression resolved)**: Both `FROM` stages in Dockerfile pinned to `node:25-alpine@sha256:b9b5737eabd423ba73b21fe2e82332c0656d571daf1ebf19b0f89d0dd0d3ca93`.
- **README**: Condensed from ~285 lines to ~120 lines — removed developer-facing tables (API endpoints, status indicators, Gluetun endpoints, project structure) and verbose setup steps.

---

## Previous Updates (2026-02-24)

- **F-23 & F-24 (CVE Fixes)**: Added explicit `minimatch@^10.2.1` and `tar@^7.5.8` to `package.json` to resolve high-severity transitive dependency vulnerabilities. Docker image now contains minimatch 10.2.2 and tar 7.5.9.
- **F-25 (Alpine Upgrade)**: Updated Dockerfile base image from `node:20-alpine` to `node:25-alpine` to receive latest security patches and address EOL concerns.
- **F-26 (UI Rate Limiting)**: Applied `uiLimiter` middleware to static file routes (`express.static`) to protect `/` and asset serving from request floods. Limits: 100 requests per 15 minutes per IP.
- **Docker image digest**: `sha256:22f8880cc914f3c85e17afe732b0fcef8d5b4382e2c24b7cee5720828ae28e70`

### Code Review (2026-02-24 — follow-up pass)

- **B-01 (NEW — 🔴 Critical)**: Discovered `uiLimiter` is used before its `const` declaration in `server.js`, causing a `ReferenceError` that prevents the server from starting at all. **✅ Fixed** — moved `uiLimiter` definition above `app.use(uiLimiter)`.
- **D-02 (NEW)**: docker-compose.example.yml has a network key mismatch — the service references the Docker network name instead of the Compose key, silently creating the wrong network.
- **D-03 / D-04 (Regressions)**: F-03 (`npm ci`) and F-12 (image digest pinning) were previously marked fixed but have regressed. `package-lock.json` was never committed, and the Dockerfile still uses a mutable tag.
- All previously open findings (S-01 through S-08, C-01 through C-06, D-01) confirmed still present.
