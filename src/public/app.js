/* Gluetun Web UI - app.js */

const MAX_HISTORY = 30;
const VALID_STATES = new Set(['connected', 'paused', 'disconnected', 'unknown']);

let instances    = [];   // [{ id, name }] from /api/instances
let isPolling    = false;
let refreshTimer = null;

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
      const health = await fetchHealth(inst.id);
      updatePanel(inst, health);
    } catch (_) {
      updatePanelError(inst);
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

// ---- Speed Test ----

let speedtestEnabled = false;
let speedtestRunning = false;

function buildSpeedtestCard() {
  const card = document.createElement('div');
  card.className = 'card card-wide';
  card.id = 'speedtest-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-icon">&#9889;</span>
      <h3>Speed Test</h3>
    </div>
    <div class="card-body">
      <div class="speedtest-controls">
        <button id="speedtest-run" class="btn-success">&#9654; Run Test</button>
        <span id="speedtest-status" class="muted"></span>
      </div>
      <div id="speedtest-result" class="speedtest-result hidden">
        <div class="speedtest-stats">
          <div class="speedtest-stat">
            <span class="speedtest-stat-label">Download</span>
            <span class="speedtest-stat-value mono" id="speedtest-dl">–</span>
          </div>
          <div class="speedtest-stat">
            <span class="speedtest-stat-label">Upload</span>
            <span class="speedtest-stat-value mono" id="speedtest-ul">–</span>
          </div>
          <div class="speedtest-stat">
            <span class="speedtest-stat-label">Ping</span>
            <span class="speedtest-stat-value mono" id="speedtest-ping">–</span>
          </div>
          <div class="speedtest-stat">
            <span class="speedtest-stat-label">Server</span>
            <span class="speedtest-stat-value mono" id="speedtest-server">–</span>
          </div>
        </div>
        <div class="speedtest-chart-wrap">
          <canvas id="speedtest-chart" width="400" height="80"></canvas>
        </div>
      </div>
    </div>
  `;
  card.querySelector('#speedtest-run').addEventListener('click', runSpeedtest);
  return card;
}

function formatMbps(bitsPerSec) {
  if (!bitsPerSec || bitsPerSec === 0) return '–';
  return (bitsPerSec / 1000000).toFixed(1) + ' Mbps';
}

async function runSpeedtest() {
  if (speedtestRunning) return;
  speedtestRunning = true;
  const btn = document.getElementById('speedtest-run');
  const status = document.getElementById('speedtest-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">&#x21bb;</span> Testing…';
  status.textContent = 'Running speed test (may take 15–30 seconds)…';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    const res = await fetch('/api/speedtest', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.ok) {
      document.getElementById('speedtest-dl').textContent = formatMbps(data.download);
      document.getElementById('speedtest-ul').textContent = formatMbps(data.upload);
      document.getElementById('speedtest-ping').textContent = data.ping ? data.ping.toFixed(0) + ' ms' : '–';
      document.getElementById('speedtest-server').textContent = data.server || '–';
      document.getElementById('speedtest-result').classList.remove('hidden');
      status.textContent = 'Completed';
      loadAndRenderSpeedtestChart();
    } else {
      status.textContent = data.error || 'Test failed';
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
  btn.disabled = false;
  btn.innerHTML = '&#9654; Run Test';
  speedtestRunning = false;
}

async function loadAndRenderSpeedtestChart() {
  try {
    const res = await fetch('/api/speedtest/history');
    const data = await res.json();
    if (!data.ok || !data.results.length) return;
    renderSpeedtestChart(data.results);
  } catch (_) {}
}

function renderSpeedtestChart(results) {
  const canvas = document.getElementById('speedtest-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.parentElement.clientWidth;
  const H = canvas.height = 80;
  ctx.clearRect(0, 0, W, H);

  const dl = results.map(r => r.download / 1000000);
  const ul = results.map(r => r.upload / 1000000);
  const maxVal = Math.max(...dl, ...ul, 1) * 1.15;
  const step = results.length > 1 ? W / (results.length - 1) : W / 2;

  function drawLine(values, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
      const x = results.length === 1 ? W / 2 : i * step;
      const y = H - (v / maxVal) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawLine(dl, '#4ade80');
  drawLine(ul, '#60a5fa');

  // Legend
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('↓ DL', 4, 12);
  ctx.fillStyle = '#60a5fa';
  ctx.fillText('↑ UL', 40, 12);
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText(results.length + ' tests', W - 4, 12);
  ctx.textAlign = 'left';
}

async function initSpeedtest() {
  try {
    const res = await fetch('/api/speedtest/status');
    const data = await res.json();
    speedtestEnabled = data.enabled;
  } catch (_) {}
  if (!speedtestEnabled) return;

  const card = buildSpeedtestCard();
  const container = $('dashboards-container');
  container.appendChild(card);

  // Load existing history
  try {
    const res = await fetch('/api/speedtest/history');
    const data = await res.json();
    if (data.ok && data.results.length) {
      const last = data.results[data.results.length - 1];
      document.getElementById('speedtest-dl').textContent = formatMbps(last.download);
      document.getElementById('speedtest-ul').textContent = formatMbps(last.upload);
      document.getElementById('speedtest-ping').textContent = last.ping ? last.ping.toFixed(0) + ' ms' : '–';
      document.getElementById('speedtest-server').textContent = last.server || '–';
      document.getElementById('speedtest-result').classList.remove('hidden');
      renderSpeedtestChart(data.results);
    }
  } catch (_) {}
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
  renderAllDashboards();
  await pollAll();
  scheduleNextPoll();
  initSpeedtest();
})();
