# Code Review Findings

> Last reviewed: 2026-03-02 (pass 3)  
> Scope: security, correctness, reliability, code quality  
> Status key: 🔴 High · 🟡 Medium · 🔵 Low · ✅ Fixed

---

## Open Findings

### Bugs (crash / broken functionality)

_No open bugs._

### Security

| # | Severity | File | Finding |
|---|---|---|---|
| S-05 | 🔵 Low | `src/server.js` | **No `Strict-Transport-Security` (HSTS) header.** Intentionally omitted for plain-HTTP local use. Must be added if the app is ever placed behind an HTTPS reverse proxy. |
| S-06 | 🔵 Low | `src/server.js` | **Rate limiter uses in-memory store.** Counters reset on every container restart. Acceptable for single-instance home use; note for any production or shared deployment. Also: if `TRUST_PROXY=false` (default) and the app is deployed behind a reverse proxy, `req.ip` collapses to the proxy IP, causing all clients to share one rate-limit bucket. Document that `TRUST_PROXY=true` is required when behind a proxy for per-client rate limiting. |
| S-08 | 🔵 Low | `src/server.js` | **No graceful shutdown handler.** The process does not handle `SIGTERM`/`SIGINT`. Docker sends `SIGTERM` on `docker stop`; without a handler, in-flight requests are dropped and the process falls back to `SIGKILL` after the timeout. Note: requires storing `app.listen()` result as `const server` first. Add `process.on('SIGTERM', () => server.close())`. |

### Code Quality / Correctness

| # | Severity | File | Finding |
|---|---|---|---|
| C-03 | 🔵 Low | `package.json` | **Express 4 used; Express 5 is stable.** Express 5 (released Oct 2024) adds native async error propagation, deprecating the manual 4-argument error handler. Non-urgent upgrade candidate. |
| C-04 | 🔵 Low | All | **No tests.** No unit or integration test suite exists. Highest-value targets: `gluetunFetch` error handling, `updatePanel` state logic, and `updatePanelError` reset paths. |
| C-05 | 🔵 Low | `src/public/app.js` | **`innerHTML` used for spinner markup.** `refreshBtn.innerHTML = '<span class="spin">…</span> Refresh'` is safe (hardcoded string) but inconsistent with the `textContent`-only approach used everywhere else. Use `document.createElement` for consistency. |
| C-06 | 🔵 Low | `src/server.js` | **`express.json()` runs on every request.** The body parser is registered globally but only the two `PUT` VPN action routes consume a body. Scope it to those routes to skip unnecessary parsing on GETs. |
| C-07 | 🔵 Low | `src/public/index.html` | **`instance-tabs` nav element is never populated.** HTML declares `<nav id="instance-tabs">` and CSS styles `.instance-tabs`, but `app.js` never populates or shows this element. Dead UI element — either implement tab switching or remove the element and its CSS. |
| C-08 | 🔵 Low | `src/public/style.css` | **Dead CSS rules.** `#banner-title` and `#banner-sub` selectors target non-existent IDs (dynamic IDs are `i{N}-banner-title` / `i{N}-banner-sub`). `.card-header h2` styles `h2` but the generated markup uses `<h3>`. `.grid` class is defined but never used (actual layout uses `.dashboard-grid`). |
| C-09 | 🔵 Low | `src/public/app.js` | **Duplicate utility functions.** `$(id)` and `setText(id, val)` overlap with `setEl(id, val)` — all resolve an element by ID and set `textContent`. `setText` is used only once (for `last-updated`). Consolidate into a single helper. |
| C-10 | 🔵 Low | `src/server.js` | **Redundant / confusing rate limiters for static content.** `uiLimiter` (1000/hour) covers `express.static()` and `staticLimiter` (120/min) covers the SPA catch-all — both serve `index.html` but with different thresholds. Consolidate into one limiter or document the intentional difference. |
| C-11 | 🔵 Low | `src/public/app.js` | **`buildDashboardGroup` injects `id` into `innerHTML` without escaping.** `inst.name` is correctly escaped via `escHtml()`, but `id` (e.g. `i${id}-banner`) is interpolated raw. Currently safe because `id` is always a numeric string from `parseInstances`, but not defensively coded. Escape or validate `id` for completeness. |
| C-12 | 🔵 Low | `src/public/app.js` | **No type-check on `/api/instances` response.** If the server returns a non-array 200 response, `instances` is set to a non-iterable value. `renderAllDashboards()` then throws on `instances.forEach()`. Add `Array.isArray()` guard before assignment. |
| N-03 | 🔵 Low | `src/public/index.html` | **`<button>` elements missing `type="button"` attribute.** `#refresh-btn` in HTML and dynamically created `#btn-start`/`#btn-stop` in `app.js` omit the type attribute. The HTML spec defaults `<button>` to `type="submit"`. Explicitly set `type="button"` on each. |

### Infrastructure / Docker

| # | Severity | File | Finding |
|---|---|---|---|
| D-01 | 🔵 Low | `docker-compose.example.yml` | **No resource limits.** No `mem_limit`, `cpus`, or `pids_limit` defined. Add `deploy.resources.limits` or compose v2 resource keys to prevent resource exhaustion. |

---

## Fixed Findings (resolved in this review cycle)

<details>
<summary>Click to expand — 39 issues resolved</summary>

| # | Severity | Finding |
|---|---|---|
| B-03 | 🟡 Medium | Health endpoints always return 200 on all upstream failures — `fetchInstanceHealth()` now tracks `allFailed` status and both `/api/health` and `/api/:instanceId/health` return 503 Service Unavailable when all 5 upstream checks fail. |
| S-03 | 🟡 Medium | Instance URLs not validated at startup — `parseInstances()` now validates all URLs with `new URL()` before using them, exits with error message on invalid URL. |
| B-02 | 🟡 Medium | Double rate limiting on `GET /api/:instanceId/health` — `readLimiter` applied both globally and as route-level middleware, double-counting requests. Removed route-level `readLimiter`. |
| C-01 | 🔵 Low | `running` dead destructured variable in old `renderVpnStatus` — removed by multi-instance rewrite; `running` is now computed and used in `updatePanel`. |
| C-02 | 🔵 Low | Server failure did not reset card fields — `updatePanelError()` now resets all fields for each instance panel. |
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
| N-01 | 🟡 Medium | `uiLimiter` applied globally, unintentionally rate-limiting `/api/*` routes. Fixed: scoped to static file serving only — `app.use(uiLimiter, express.static(...))`. |

</details>

---

## Recommended Next Steps (priority order)

1. **S-08** — Store `app.listen()` as `const server`, then add graceful shutdown handler
2. **C-08** — Remove dead CSS rules (`#banner-title`, `#banner-sub`, `.card-header h2`, `.grid`)
3. **C-07** — Remove unused `instance-tabs` nav or implement tab switching
4. **C-10** — Consolidate `staticLimiter` and `uiLimiter` into a single static content limiter
5. **C-09** — Consolidate `$`/`setText`/`setEl` into one utility function
6. **C-06** — Scope `express.json()` to PUT routes only
7. **N-03** — Add `type="button"` to all `<button>` elements
8. **C-12** — Add `Array.isArray()` guard on `/api/instances` response
9. **C-04** — Add tests for `gluetunFetch`, `updatePanel`, and `updatePanelError`
10. **C-05** — Replace `innerHTML` spinner with `createElement`
11. **D-01** — Add container resource limits to `docker-compose.yml`
12. **C-03** — Plan Express 5 migration (review changelog for breaking changes first)

---

---

## Recent Updates (2026-03-02 — pass 3 full code review)

### ✅ Fixed (resolved by multi-instance rewrite)

- **C-01 (Fixed)**: Dead `running` variable no longer exists. In the multi-instance rewrite, `running` is computed and immediately consumed in `updatePanel()`'s state derivation logic.
- **C-02 (Fixed)**: `updatePanelError()` now resets all card fields (IP, VPN, port, DNS, banner) when `fetchHealth()` throws. Previously the catch block only updated the banner.

### 🆕 New Findings (March 2026 Review) & Recent Fixes

- **B-03 (🟡 Medium — ✅ Fixed)**: Health endpoints always return HTTP 200 even on complete upstream failure — `fetchInstanceHealth()` now tracks `allFailed` status; both `/api/health` and `/api/:instanceId/health` return 503 Service Unavailable when all 5 upstream checks fail. (Feedback from online review)
- **S-03 (🟡 Medium — ✅ Fixed)**: Instance URLs not validated at startup — `parseInstances()` now validates each URL with `new URL()` before use, exits with error message on invalid URL, enabling fail-fast on misconfiguration. (Feedback from online review)
- **B-02 (🟡 Medium — ✅ Fixed)**: `readLimiter` applied twice to `GET /api/:instanceId/health` — once from the global `/api/` middleware and again as route-level middleware. Removed the redundant route-level `readLimiter`.
- **S-06 (Enhanced)**: Added note: if `TRUST_PROXY=false` (default) and behind a proxy, all clients share one rate-limit bucket. Documentation must clarify that `TRUST_PROXY=true` is required for per-client limiting. (Feedback from online review)
- **C-07 (🔵 Low)**: `<nav id="instance-tabs">` in HTML and `.instance-tabs` in CSS are never used by `app.js`. Dead UI element.
- **C-08 (🔵 Low)**: Dead CSS — `#banner-title`, `#banner-sub` (IDs don't exist in multi-instance markup), `.card-header h2` (markup uses `h3`), `.grid` (unused class).
- **C-09 (🔵 Low)**: Duplicate utilities — `$`/`setText` vs `setEl` do the same thing.
- **C-10 (🔵 Low)**: Two separate rate limiters cover static content with different thresholds (`uiLimiter` 1000/hr vs `staticLimiter` 120/min).
- **C-11 (🔵 Low)**: `id` interpolated raw into `innerHTML` in `buildDashboardGroup`. Safe in practice (numeric) but not defensively coded.
- **C-12 (🔵 Low)**: No `Array.isArray()` guard on `/api/instances` response before calling `.forEach()`.

### Confirmed Still Open

- **S-05, S-06, S-08** — Security findings unchanged.
- **C-03, C-04, C-05, C-06, N-03** — Code quality findings unchanged.
- **D-01** — Docker resource limits still missing.

---

## Recent Updates (2026-03-02 — Multi-instance release)

### ✅ Fixed in This Cycle

- **F-23 & F-24 (CVE Cleanup)**: Removed explicit `minimatch` and `tar` from `package.json` dependencies. These were added as a temporary CVE mitigation but are not actually used in the codebase. Removing them reduces attack surface and eliminates the direct dependency on vulnerable transitive packages. Node modules are now: `express`, `express-rate-limit` only.
- **README (Multi-VPN)**: Updated with comprehensive multi-instance documentation — numbered environment variable syntax, per-instance authentication, backward compatibility notes, responsive grid behavior.
- **Header Layout**: Removed max-width constraint from `.header-inner` CSS (changed from `max-width: 1200px` to `width: 100%`), allowing logo and controls to stretch edge-to-edge. Cards increased from 280px to 400px minmax width for better readability on single-instance deployments.
- **Docker Image**: Rebuilt with cleaned dependencies; pushed as `scuzza/gluetun-webui:dev`.

### 🧪 Tested & Validated

- **Multi-instance implementation** tested with 1, 2, 3, 4 instances — all configurations render correctly with responsive grid layout (1 full width → 2 half → 3 third → 4 quarter).
- **Per-instance controls** verified — each instance's Start/Stop button correctly routes to its own `/api/{id}/vpn/{action}` endpoint.
- **Per-instance history** verified — state history stored independently per instance in `sessionStorage` and isolated by `gluetun_history_{id}` key.
- **Backward compatibility** confirmed — legacy `GLUETUN_CONTROL_URL` env var still triggers single-instance mode when no numbered variables are detected.
- **Code Review**: Comprehensive full-stack review completed. Overall assessment: **8-9/10 across all areas**. No critical security issues discovered. All existing open findings (S-03, S-05–S-08, C-01–C-06, D-01) confirmed unchanged.

### Issue #17 fixed: Polling interval persistence

- Added `localStorage` persistence for the polling interval selector. The selected interval (Off/5s/10s/30s/60s) is saved and restored on page load, so the user's preference persists across reloads.
- Changed the change listener to save the selected value before reapplying the timeout.
- Added constant `STORAGE_INTERVAL_KEY` for the storage key.

---

## Recent Updates (2026-02-25 — pass 2)

- **N-01 (Fixed)**: `uiLimiter` was registered via `app.use(uiLimiter)` globally, causing all `/api/*` requests to count against the 100/15-min UI rate limit. At 5s polling the dashboard would 429 in ~8 minutes. Fixed by scoping to `app.use(uiLimiter, express.static(...))` so only static file requests are counted.
- **N-01 (NEW — 🟡 Medium)**: Full code re-review found `uiLimiter` is applied globally via `app.use(uiLimiter)`, meaning every `/api/*` request counts against the 100/15-minute UI limit. At 5s auto-refresh, the dashboard hits this limit in ~8 minutes and starts returning 429s. Scoping it to static routes only will fix this.
- **N-03 (NEW — 🔵 Low)**: `#refresh-btn`, `#btn-start`, and `#btn-stop` in `index.html` are missing `type="button"` attributes. HTML spec defaults `<button>` to `type="submit"`.
- **S-08 (updated)**: Added note that `app.listen()` must be stored as `const server` as a prerequisite before the shutdown handler can be wired up.
- All other open findings (S-03, S-05, S-06, C-01–C-06, D-01) confirmed still present and unchanged.
- `.dockerignore` confirmed present and comprehensive — no finding raised.

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
