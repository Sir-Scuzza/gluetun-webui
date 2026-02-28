/* Gluetun Web UI - app.js */

const MAX_HISTORY = 30;
const VALID_STATES = new Set(['connected', 'paused', 'disconnected', 'unknown']);
const INSTANCE_IDS = ['1', '2'];

// Per-instance history loaded from sessionStorage
const instanceHistory = {};
INSTANCE_IDS.forEach(n => {
  const key = `gluetun_history_${n}`;
  try {
    const raw = JSON.parse(sessionStorage.getItem(key));
    instanceHistory[n] = Array.isArray(raw) ? raw.filter(s => VALID_STATES.has(s)) : [];
  } catch (_) { instanceHistory[n] = []; }
});

let refreshTimer = null;
let isPolling = false;

// Per-instance configuration fetched from /api/instances
const instanceConfig = { '1': { name: 'Gluetun 1', configured: true }, '2': { name: 'Gluetun 2', configured: false } };

// ---- Utility ----

function $i(n, id) { return document.getElementById(`i${n}-${id}`); }

function setTextI(n, id, val) {
  const el = $i(n, id);
  if (el) el.textContent = val ?? '–';
}

function showToast(msg, type = 'info', duration = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, duration);
}

function setBadgeI(n, id, state) {
  const el = $i(n, id);
  if (!el) return;
  el.className = `badge ${state}`;
  el.textContent = state === 'ok' ? 'OK' : state === 'error' ? 'Error' : 'Warn';
}

// ---- History track ----

function pushHistory(n, state) {
  instanceHistory[n].push(state);
  if (instanceHistory[n].length > MAX_HISTORY) instanceHistory[n].shift();
  try { sessionStorage.setItem(`gluetun_history_${n}`, JSON.stringify(instanceHistory[n])); } catch (_) {}
  renderHistory(n);
}

function renderHistory(n) {
  const track = $i(n, 'history-track');
  if (!track) return;
  track.innerHTML = '';
  instanceHistory[n].forEach((s, i) => {
    const tick = document.createElement('div');
    tick.className = `history-tick ${s}`;
    tick.title = `Poll #${i + 1}: ${s}`;
    track.appendChild(tick);
  });
}

// ---- API calls ----

async function fetchHealth(n) {
  const res = await fetch(`/api/health?instance=${n}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- Render health data ----

function renderVpnStatus(n, vpnStatus, vpnSettings, publicIp) {
  if (!vpnStatus.ok) {
    setTextI(n, 'vpn-status', 'Unreachable');
    setBadgeI(n, 'badge-vpn', 'error');
    return { state: 'unknown', running: false };
  }
  const d = vpnStatus.data;
  const s = vpnSettings?.ok ? vpnSettings.data : null;
  const ip = publicIp?.ok ? publicIp.data : null;
  const running = d?.status === 'running';
  const stopped = d?.status === 'stopped';

  setTextI(n, 'vpn-status', d?.status ?? '–');
  setTextI(n, 'vpn-provider', s?.provider?.name ?? '–');
  setTextI(n, 'vpn-protocol', s?.type ?? '–');
  setTextI(n, 'vpn-country', ip?.country ?? '–');
  setTextI(n, 'vpn-city',    ip?.city    ?? '–');
  const serverName = ip?.hostname
    ?? s?.provider?.server_selection?.hostnames?.[0]
    ?? s?.provider?.server_selection?.names?.[0]
    ?? '–';
  setTextI(n, 'vpn-server', serverName);

  setBadgeI(n, 'badge-vpn', running ? 'ok' : stopped ? 'warn' : 'error');
  return { state: running ? 'connected' : stopped ? 'paused' : 'disconnected', running };
}

function renderPublicIp(n, publicIp) {
  if (!publicIp.ok) {
    setBadgeI(n, 'badge-ip', 'error');
    setTextI(n, 'ip-address', '–');
    setTextI(n, 'ip-country', '–');
    setTextI(n, 'ip-region', '–');
    setTextI(n, 'ip-city', '–');
    setTextI(n, 'ip-org', '–');
    return;
  }
  const d = publicIp.data;
  setTextI(n, 'ip-address', d?.public_ip ?? d?.ip ?? d?.IP ?? '–');
  setTextI(n, 'ip-country', d?.country ?? '–');
  setTextI(n, 'ip-region', d?.region ?? '–');
  setTextI(n, 'ip-city', d?.city ?? '–');
  setTextI(n, 'ip-org', d?.org ?? d?.organization ?? '–');
  setBadgeI(n, 'badge-ip', 'ok');
}

function renderPortForwarded(n, portForwarded) {
  if (!portForwarded.ok) {
    setBadgeI(n, 'badge-port', 'warn');
    setTextI(n, 'port-number', 'N/A');
    return;
  }
  const d = portForwarded.data;
  const port = d?.port ?? 0;
  setTextI(n, 'port-number', port > 0 ? port : 'Not forwarded');
  setBadgeI(n, 'badge-port', port > 0 ? 'ok' : 'warn');
}

function renderDns(n, dnsStatus) {
  if (!dnsStatus.ok) {
    setBadgeI(n, 'badge-dns', 'warn');
    setTextI(n, 'dns-status', 'Unavailable');
    return;
  }
  const d = dnsStatus.data;
  setTextI(n, 'dns-status', d?.status ?? 'OK');
  setBadgeI(n, 'badge-dns', 'ok');
}

function renderBanner(n, state, publicIp) {
  const banner = $i(n, 'status-banner');
  if (!banner) return;
  banner.className = `status-banner ${state}`;
  if (state === 'connected') {
    setTextI(n, 'banner-title', 'VPN Connected');
    const ip = publicIp.ok ? (publicIp.data?.public_ip ?? publicIp.data?.ip ?? '') : '';
    setTextI(n, 'banner-sub', ip ? `Public IP: ${ip}` : 'Tunnel is up');
  } else if (state === 'paused') {
    setTextI(n, 'banner-title', 'VPN Paused');
    const ip = publicIp.ok ? (publicIp.data?.public_ip ?? publicIp.data?.ip ?? '') : '';
    setTextI(n, 'banner-sub', ip ? `Gluetun active – exit IP: ${ip}` : 'Gluetun active – VPN process stopped');
  } else if (state === 'disconnected') {
    setTextI(n, 'banner-title', 'VPN Disconnected');
    setTextI(n, 'banner-sub', 'Tunnel is down – traffic may be unprotected');
  } else if (state === 'unconfigured') {
    setTextI(n, 'banner-title', 'Not Configured');
    setTextI(n, 'banner-sub', `Set GLUETUN_${n}_URL to enable this instance`);
  } else {
    setTextI(n, 'banner-title', 'Status Unknown');
    setTextI(n, 'banner-sub', 'Could not reach Gluetun control API');
  }
}

function renderUnconfigured(n) {
  const banner = $i(n, 'status-banner');
  if (banner) banner.className = 'status-banner unknown';
  renderBanner(n, 'unconfigured', { ok: false });
  // Disable controls
  const btnStart = $i(n, 'btn-start');
  const btnStop  = $i(n, 'btn-stop');
  if (btnStart) btnStart.disabled = true;
  if (btnStop)  btnStop.disabled  = true;
}

// ---- Main poll (per instance) ----

async function pollInstance(n) {
  if (!instanceConfig[n].configured) {
    renderUnconfigured(n);
    return;
  }
  try {
    const health = await fetchHealth(n);
    const { vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings } = health;

    const { state } = renderVpnStatus(n, vpnStatus, vpnSettings, publicIp);
    renderPublicIp(n, publicIp);
    renderPortForwarded(n, portForwarded);
    renderDns(n, dnsStatus);
    renderBanner(n, state, publicIp);
    pushHistory(n, state);
  } catch (err) {
    // 503 = not configured (race: config changed after page load)
    if (err.message === 'Instance not configured') {
      renderUnconfigured(n);
      return;
    }
    showToast(`Instance ${n}: Failed to reach server: ${err.message}`, 'error');
    pushHistory(n, 'unknown');
    renderBanner(n, 'unknown', { ok: false });
  }
}

async function poll() {
  if (isPolling) return;
  isPolling = true;

  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.innerHTML = '<span class="spin">&#x21bb;</span> Refresh';
  refreshBtn.disabled = true;

  try {
    await Promise.allSettled(INSTANCE_IDS.map(n => pollInstance(n)));
    const now = new Date();
    document.getElementById('last-updated').textContent = `Updated ${now.toLocaleTimeString()}`;
  } finally {
    refreshBtn.innerHTML = '&#x21bb; Refresh';
    refreshBtn.disabled = false;
    isPolling = false;
  }
}

// ---- VPN actions ----

async function vpnAction(n, action) {
  if (!instanceConfig[n].configured) return;
  const label = action === 'start' ? 'Starting' : 'Stopping';
  showToast(`${label} VPN (instance ${n})…`, 'info', 5000);
  try {
    const res = await fetch(`/api/vpn/${action}?instance=${n}`, { method: 'PUT' });
    const data = await res.json();
    if (data.ok) {
      showToast(`VPN ${action} command sent (instance ${n})`, 'success');
      setTimeout(async () => { await poll(); scheduleNextPoll(); }, 2000);
    } else {
      showToast(`Error: ${data.error ?? 'Unknown error'}`, 'error', 5000);
    }
  } catch (err) {
    showToast(`Request failed: ${err.message}`, 'error', 5000);
  }
}

// ---- Auto refresh ----

function scheduleNextPoll() {
  clearTimeout(refreshTimer);
  const interval = parseInt(document.getElementById('refresh-interval').value, 10);
  if (interval > 0) {
    refreshTimer = setTimeout(async () => {
      await poll();
      scheduleNextPoll();
    }, interval);
  }
}

function applyAutoRefresh() {
  clearTimeout(refreshTimer);
  scheduleNextPoll();
}

// ---- Init ----

async function init() {
  // Load instance names/config from server
  try {
    const res = await fetch('/api/instances');
    if (res.ok) {
      const body = await res.json();
      if (body.ok && Array.isArray(body.data)) {
        body.data.forEach(inst => {
          instanceConfig[inst.id] = { name: inst.name, configured: inst.configured };
          const nameEl = document.getElementById(`i${inst.id}-instance-name`);
          if (nameEl) nameEl.textContent = inst.name;
          const badgeEl = document.getElementById(`i${inst.id}-instance-badge`);
          if (badgeEl) {
            badgeEl.textContent = inst.configured ? 'Active' : 'Not configured';
            badgeEl.className = `instance-badge ${inst.configured ? 'configured' : 'unconfigured'}`;
          }
        });
      }
    }
  } catch (_) { /* non-fatal */ }

  // Render initial history bars
  INSTANCE_IDS.forEach(n => renderHistory(n));

  // Wire up controls
  document.getElementById('refresh-btn').addEventListener('click', poll);
  document.getElementById('refresh-interval').addEventListener('change', applyAutoRefresh);

  INSTANCE_IDS.forEach(n => {
    const btnStart = document.getElementById(`i${n}-btn-start`);
    const btnStop  = document.getElementById(`i${n}-btn-stop`);
    if (btnStart) btnStart.addEventListener('click', () => vpnAction(n, 'start'));
    if (btnStop)  btnStop.addEventListener('click',  () => vpnAction(n, 'stop'));
  });

  await poll();
  scheduleNextPoll();
}

init();
