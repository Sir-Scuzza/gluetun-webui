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
|---|----------|------|---------|
| S-05 | 🔵 Low | `src/server.js` | **No `Strict-Transport-Security` (HSTS) header.** Intentionally omitted for plain-HTTP local use. Must be added if the app is ever placed behind an HTTPS reverse proxy. |
| S-06 | 🔵 Low | `src/server.js` | **Rate limiter uses in-memory store.** Counters reset on every container restart. Acceptable for single-instance home use; note for any production or shared deployment. Also: if `TRUST_PROXY=false` (default) and the app is deployed behind a reverse proxy, `req.ip` collapses to the proxy IP, causing all clients to share one rate-limit bucket. Document that `TRUST_PROXY=true` is required when behind a proxy for per-client rate limiting. |
| S-08 | 🔵 Low | `src/server.js` | **No graceful shutdown handler.** The process does not handle `SIGTERM`/`SIGINT`. Docker sends `SIGTERM` on `docker stop`; without a handler, in-flight requests are dropped and the process falls back to `SIGKILL` after the timeout. Note: requires storing `app.listen()` result as `const server` first. Add `process.on('SIGTERM', () => server.close())`. |

### Code Quality / Correctness

| # | Severity | File | Finding |
|---|----------|------|---------|
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
|---|----------|------|---------|
| D-01 | 🔵 Low | `docker-compose.example.yml` | **No resource limits.** No `mem_limit`, `cpus`, or `pids_limit` defined. Add `deploy.resources.limits` or compose v2 resource keys to prevent resource exhaustion. |

---

## Fixed Findings (resolved in this review cycle)

<details>
<summary>Click to expand — 39 issues resolved</summary>

| # | Severity | Finding |
|---|----------|---------|
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
| F-23 | 🔴 High | CVE-2026-26996 (minimatch 10.1.2) — CVSS 0 GB