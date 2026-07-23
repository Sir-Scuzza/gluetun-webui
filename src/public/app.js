/* Gluetun Web UI - app.js */

const MAX_HISTORY = 30;
const VALID_STATES = new Set(['connected', 'paused', 'disconnected', 'unknown']);
const LATENCY_GOOD_MS = 150;
const LATENCY_WARN_MS = 400;
const MAX_LATENCY_DISPLAY_MS = 800;

let instances    = [];   // [{ id, name }] from /api/instances
let isPolling    = false;
let refreshTimer = null;
const instanceSettings = new Map(); // id -> settings object (from /api/:instanceId/health vpnSettings.data)
const latencyHistory   = new Map(); // id -> number[] (ms, newest last)

// ---- Utility ----

function $(id) { return document.getElementById(id); }
function setText(id, val) { const el = $(id); if (el) el.textContent = val ?? '–'; }
function setEl(id, val)   { const el = document.getElementById(id); if (el) el.textContent = val ?? '–'; }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info', duration = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, duration);
}

// ---- Per-instance session history ----

function sessionKey(id) { return `gluetun_history_${id}`; }

function loadHistoryFor(id) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(sessionKey(id)));
    return Array.isArray(raw) ? raw.filter(s => VALID_STATES.has(s)) : [];
  } catch (_) { return []; }
}

function pushHistoryFor(id, state) {
  const hist = loadHistoryFor(id);
  hist.push(state);
  if (hist.length > MAX_HISTORY) hist.shift();
  try { sessionStorage.setItem(sessionKey(id), JSON.stringify(hist)); } catch (_) {}
}

function renderHistoryFor(id) {
  const track = document.getElementById(`i${id}-history-track`);
  if (!track) return;
  const hist = loadHistoryFor(id);
  track.innerHTML = '';
  hist.forEach((s, i) => {
    const tick = document.createElement('div');
    tick.className = `history-tick ${s}`;
    tick.title = `Poll #${i + 1}: ${s}`;
    track.appendChild(tick);
  });
}

function pushLatencyFor(id, ms) {
  const hist = latencyHistory.get(id) || [];
  hist.push(ms);
  if (hist.length > MAX_HISTORY) hist.shift();
  latencyHistory.set(id, hist);
  try { localStorage.setItem(`gluetun_latency_${id}`, JSON.stringify(hist)); } catch (_) {}
}

function loadLatencyFor(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(`gluetun_latency_${id}`));
    return Array.isArray(raw) ? raw.slice(0, MAX_HISTORY) : [];
  } catch (_) { return []; }
}

function latencyColor(ms) {
  if (ms === null || ms === undefined) return 'var(--muted)';
  if (ms < LATENCY_GOOD_MS)  return 'var(--green)';
  if (ms < LATENCY_WARN_MS)  return 'var(--yellow)';
  return 'var(--red)';
}

function renderLatencyChartFor(id) {
  const container = document.getElementById(`i${id}-latency-chart`);
  if (!container) return;
  const hist = latencyHistory.get(id) || [];
  if (hist.length === 0) {
    container.innerHTML = '';
    return;
  }

  const W = container.clientWidth || 600;
  const H = 64;
  const BAR_GAP = 2;
  const barW = Math.max(2, Math.floor((W - BAR_GAP) / MAX_HISTORY) - BAR_GAP);
  const cols = Math.floor((W + BAR_GAP) / (barW + BAR_GAP));
  const slice = hist.slice(-cols);
  const svgW = slice.length * (barW + BAR_GAP);

  const bars = slice.map((ms, i) => {
    const height = ms === null
      ? 4
      : Math.max(4, Math.round((ms / MAX_LATENCY_DISPLAY_MS) * H));
    const y = H - height;
    const color = latencyColor(ms);
    return `<rect x="${i * (barW + BAR_GAP)}" y="${y}" width="${barW}" height="${height}" rx="2" fill="${color}" opacity="0.85" />`;
  }).join('');

  container.innerHTML = `<svg width="${svgW}" height="${H}" style="display:block">${bars}</svg>`;

  const latest = hist[hist.length - 1];
  const statEl = document.getElementById(`i${id}-latency-stat`);
  if (statEl) {
    statEl.textContent = latest === null ? '–' : `${latest}ms`;
    statEl.style.color = latencyColor(latest);
  }
}

// ---- Dashboard group builder (old layout per instance) ----

function buildDashboardGroup(inst) {
  const id = inst.id;
  const group = document.createElement('div');
  group.className = 'dashboard-group';
  group.id = `dashboard-${id}`;
  group.innerHTML = `
    <!-- Status banner -->
    <div class="status-banner unknown" id="i${id}-banner">
      <div class="banner-icon">&#9679;</div>
      <div class="banner-text">
        <span id="i${id}-banner-title">Checking VPN status…</span>
        <span id="i${id}-banner-sub" class="muted"></span>
      </div>
      <div class="banner-actions">
        <button id="i${id}-btn-start" class="btn-success">&#9654; Start</button>
        <button id="i${id}-btn-stop" class="btn-danger">&#9209; Stop</button>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Public IP card -->
      <div class="card">
        <div class="card-header">
          <span class="card-icon">&#127760;</span>
          <h3>${escHtml(inst.name)}</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Public IP</span><span class="stat-value mono" id="i${id}-ip-address">–</span></div>
          <div class="stat-row"><span class="stat-label">Country</span><span class="stat-value" id="i${id}-ip-country">–</span></div>
          <div class="stat-row"><span class="stat-label">City</span><span class="stat-value" id="i${id}-ip-city">–</span></div>
          <div class="stat-row"><span class="stat-label">Organisation</span><span class="stat-value" id="i${id}-ip-org">–</span></div>
        </div>
      </div>

      <!-- VPN details card -->
      <div class="card">
        <div class="card-header">
          <span class="card-icon">&#128274;</span>
          <h3>VPN Connection</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="i${id}-vpn-status">–</span></div>
          <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value" id="i${id}-vpn-provider">–</span></div>
          <div class="stat-row"><span class="stat-label">Server</span><span class="stat-value mono" id="i${id}-vpn-server">–</span></div>
          <div class="stat-row"><span class="stat-label">Protocol</span><span class="stat-value" id="i${id}-vpn-protocol">–</span></div>
          <div class="stat-row"><span class="stat-label">Country</span><span class="stat-value" id="i${id}-vpn-country">–</span></div>
          <div class="stat-row"><span class="stat-label">City</span><span class="stat-value" id="i${id}-vpn-city">–</span></div>
        </div>
      </div>

      <!-- Port forwarding card -->
      <div class="card">
        <div class="card-header">
          <span class="card-icon">&#128268;</span>
          <h3>Port Forwarding</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Forwarded Port</span><span class="stat-value mono" id="i${id}-port-number">–</span></div>
        </div>
      </div>

      <!-- DNS card -->
      <div class="card">
        <div class="card-header">
          <span class="card-icon">&#128225;</span>
          <h3>DNS</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="i${id}-dns-status">–</span></div>
        </div>
      </div>

      <!-- History card -->
      <div class="card card-wide">
        <div class="card-header">
          <span class="card-icon">&#128200;</span>
          <h3>Status History (last 30 polls)</h3>
        </div>
        <div class="card-body">
          <div class="history-track" id="i${id}-history-track"></div>
          <div class="history-legend">
            <span class="dot connected"></span> Connected &nbsp;
            <span class="dot paused"></span> Paused &nbsp;
            <span class="dot disconnected"></span> Disconnected &nbsp;
            <span class="dot unknown"></span> Unknown
          </div>
        </div>
      </div>
    <!-- Latency card -->
      <div class="card card-wide">
        <div class="card-header">
          <span class="card-icon">&#9889;</span>
          <h3>Latency (last 30 polls)</h3>
          <span id="i${id}-latency-stat" class="stat-value" style="margin-left:auto;font-size:0.9rem">–</span>
        </div>
        <div class="card-body">
          <div class="latency-chart-wrapper">
            <div class="latency-chart" id="i${id}-latency-chart"></div>
          </div>
          <div class="history-legend">
            <span class="dot latency-good"></span> <150ms &nbsp;
            <span class="dot latency-warn"></span> 150–400ms &nbsp;
            <span class="dot latency-bad"></span> >400ms &nbsp;
            <span class="dot unknown"></span> Failed
          </div>
        </div>
      </div>
    </div>
  `;
  group.querySelector(`#i${id}-btn-start`).addEventListener('click', () => vpnAction(id, 'start'));
  group.querySelector(`#i${id}-btn-stop`).addEventListener('click', () => vpnAction(id, 'stop'));
  return group;
}

function renderAllDashboards() {
  const container = $('dashboards-container');
  container.innerHTML = '';
  instances.forEach(inst => {
    container.appendChild(buildDashboardGroup(inst));
    renderHistoryFor(inst.id);
    renderLatencyChartFor(inst.id);
  });
  // Set grid columns: 1=full, 2=half, 3=third, 4=quarter
  const cols = Math.min(instances.length, 4) || 1;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

// ---- Update a panel with health data ----

function updatePanel(inst, health) {
  const id = inst.id;
  const { vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings } = health;

  const d  = vpnStatus?.ok   ? vpnStatus.data   : null;
  const s  = vpnSettings?.ok ? vpnSettings.data  : null;
  const ip = publicIp?.ok    ? publicIp.data     : null;

  const running = d?.status === 'running';
  const stopped = d?.status === 'stopped';
  const state = !vpnStatus?.ok ? 'unknown'
    : running ? 'connected'
    : stopped ? 'paused'
    : 'disconnected';

  const banner = document.getElementById(`i${id}-banner`);
  if (banner) banner.className = `status-banner ${state}`;

  const pubIpStr = ip?.public_ip ?? ip?.ip ?? '';
  let sub = '';
  if      (state === 'connected')    sub = pubIpStr ? `Public IP: ${pubIpStr}` : 'Tunnel is up';
  else if (state === 'paused')       sub = pubIpStr ? `Gluetun active – exit IP: ${pubIpStr}` : 'Gluetun active – VPN process stopped';
  else if (state === 'disconnected') sub = 'Tunnel is down – traffic may be unprotected';
  else                               sub = 'Could not reach Gluetun control API';
  
  const title = state === 'connected' ? 'VPN Connected' 
    : state === 'paused' ? 'VPN Paused'
    : state === 'disconnected' ? 'VPN Disconnected'
    : 'Status Unknown';
  setEl(`i${id}-banner-title`, title);
  setEl(`i${id}-banner-sub`, sub);

  setEl(`i${id}-ip-address`, ip?.public_ip ?? ip?.ip ?? ip?.IP ?? '–');
  setEl(`i${id}-ip-country`, ip?.country ?? '–');
  setEl(`i${id}-ip-city`, ip?.city ?? '–');
  setEl(`i${id}-ip-org`, ip?.org ?? ip?.organization ?? '–');

  setEl(`i${id}-vpn-status`,   d?.status ?? '–');
  setEl(`i${id}-vpn-provider`, s?.provider?.name ?? '–');
  setEl(`i${id}-vpn-protocol`, s?.type ?? '–');
  setEl(`i${id}-vpn-server`,
    ip?.hostname
    ?? s?.provider?.server_selection?.hostnames?.[0]
    ?? s?.provider?.server_selection?.names?.[0]
    ?? '–');
  setEl(`i${id}-vpn-country`, ip?.country ?? '–');
  setEl(`i${id}-vpn-city`, ip?.city ?? '–');

  const port = portForwarded?.ok ? (portForwarded.data?.port ?? 0) : 0;
  setEl(`i${id}-port-number`, port > 0 ? String(port) : portForwarded?.ok ? 'Not forwarded' : 'N/A');

  setEl(`i${id}-dns-status`, dnsStatus?.ok ? (dnsStatus.data?.status ?? 'OK') : 'Unavailable');

  pushHistoryFor(id, state);
  renderHistoryFor(id);
}

function updatePanelError(inst) {
  const id = inst.id;
  const banner = document.getElementById(`i${id}-banner`);
  if (banner) banner.className = 'status-banner unknown';
  setEl(`i${id}-banner-title`, 'Status Unknown');
  setEl(`i${id}-banner-sub`, 'Could not reach Gluetun control API');
  setEl(`i${id}-ip-address`, '–');
  setEl(`i${id}-ip-country`, '–');
  setEl(`i${id}-ip-city`, '–');
  setEl(`i${id}-ip-org`, '–');
  setEl(`i${id}-vpn-status`, '–');
  setEl(`i${id}-vpn-provider`, '–');
  setEl(`i${id}-vpn-server`, '–');
  setEl(`i${id}-vpn-protocol`, '–');
  setEl(`i${id}-vpn-country`, '–');
  setEl(`i${id}-vpn-city`, '–');
  setEl(`i${id}-port-number`, 'N/A');
  setEl(`i${id}-dns-status`, 'Unavailable');
  pushHistoryFor(id, 'unknown');
  renderHistoryFor(id);
}

// ---- API ----

async function fetchHealth(instanceId) {
  const res = await fetch(`/api/${instanceId}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Poll all instances in parallel ----

async function pollAll() {
  if (isPolling) return;
  isPolling = true;
  const refreshBtn = $('refresh-btn');
  refreshBtn.innerHTML = '<span class="spin">&#x21bb;</span> Refresh';
  refreshBtn.disabled = true;

  await Promise.allSettled(instances.map(async inst => {
    try {
      const t0 = performance.now();
      const health = await fetchHealth(inst.id);
      const latencyMs = Math.round(performance.now() - t0);
      pushLatencyFor(inst.id, latencyMs);
      updatePanel(inst, health);
      renderLatencyChartFor(inst.id);
    } catch (_) {
      pushLatencyFor(inst.id, null);
      updatePanelError(inst);
      renderLatencyChartFor(inst.id);
    }
  }));

  setText('last-updated', `Updated ${new Date().toLocaleTimeString()}`);
  refreshBtn.innerHTML = '&#x21bb; Refresh';
  refreshBtn.disabled = false;
  isPolling = false;
}

// ---- VPN actions ----

async function vpnAction(instanceId, action) {
  const inst  = instances.find(i => i.id === instanceId);
  const name  = inst?.name ?? instanceId;
  const label = action === 'start' ? 'Starting' : 'Stopping';
  showToast(`${label} ${name}…`, 'info', 5000);
  try {
    const res  = await fetch(`/api/${instanceId}/vpn/${action}`, { method: 'PUT' });
    const data = await res.json();
    if (data.ok) {
      showToast(`${name}: VPN ${action} command sent`, 'success');
      setTimeout(async () => { await pollAll(); scheduleNextPoll(); }, 2000);
    } else {
      showToast(`${name}: ${data.error ?? 'Unknown error'}`, 'error', 5000);
    }
  } catch (err) {
    showToast(`${name}: Request failed: ${err.message}`, 'error', 5000);
  }
}

// ---- Auto refresh ----

function scheduleNextPoll() {
  clearTimeout(refreshTimer);
  const interval = parseInt($('refresh-interval').value, 10);
  if (interval > 0) {
    refreshTimer = setTimeout(async () => {
      await pollAll();
      scheduleNextPoll();
    }, interval);
  }
}

function applyAutoRefresh() {
  clearTimeout(refreshTimer);
  scheduleNextPoll();
}

// ---- Init ----

$('refresh-btn').addEventListener('click', () => {
  clearTimeout(refreshTimer);
  pollAll().then(() => scheduleNextPoll());
});
$('refresh-interval').addEventListener('change', applyAutoRefresh);

(async () => {
  try {
    const res = await fetch('/api/instances');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    instances = await res.json();
  } catch (_) {
    instances = [{ id: '1', name: 'Gluetun' }];
  }
  instances.forEach(inst => {
    const hist = loadLatencyFor(inst.id);
    if (hist.length > 0) latencyHistory.set(inst.id, hist);
  });
  renderAllDashboards();
  await pollAll();
  scheduleNextPoll();
})();
