/* Gluetun Web UI - app.js */

const MAX_HISTORY = 30;
const statusHistory = [];
let refreshTimer = null;
let isPolling = false;

// ---- Utility ----

function $(id) { return document.getElementById(id); }

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val ?? '–';
}

function showToast(msg, type = 'info', duration = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, duration);
}

function setBadge(id, state) {
  // state: 'ok' | 'error' | 'warn'
  const el = $(id);
  if (!el) return;
  el.className = `badge ${state}`;
  el.textContent = state === 'ok' ? 'OK' : state === 'error' ? 'Error' : 'Unknown';
}

// ---- History track ----

function pushHistory(state) {
  statusHistory.push(state);
  if (statusHistory.length > MAX_HISTORY) statusHistory.shift();
  renderHistory();
}

function renderHistory() {
  const track = $('history-track');
  track.innerHTML = '';
  statusHistory.forEach((s, i) => {
    const tick = document.createElement('div');
    tick.className = `history-tick ${s}`;
    tick.title = `Poll #${i + 1}: ${s}`;
    track.appendChild(tick);
  });
}

// ---- API calls ----

async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Render health data ----

function renderVpnStatus(vpnStatus, vpnSettings, publicIp) {
  if (!vpnStatus.ok) {
    setText('vpn-status', 'Unreachable');
    setBadge('badge-vpn', 'error');
    return { state: 'unknown', running: false };
  }
  const d = vpnStatus.data;
  const s = vpnSettings?.ok ? vpnSettings.data : null;
  const ip = publicIp?.ok ? publicIp.data : null;
  const running = d?.status === 'running';
  const stopped = d?.status === 'stopped';

  setText('vpn-status', d?.status ?? '–');
  // provider from settings
  setText('vpn-provider', s?.provider?.name ?? '–');
  // protocol type from settings (wireguard / openvpn)
  setText('vpn-protocol', s?.type ?? '–');
  // actual connected location from public IP response
  setText('vpn-country', ip?.country ?? '–');
  setText('vpn-city',    ip?.city    ?? '–');
  // server: hostname from publicIp, or selected hostname/name from settings
  const serverName = ip?.hostname
    ?? s?.provider?.server_selection?.hostnames?.[0]
    ?? s?.provider?.server_selection?.names?.[0]
    ?? '–';
  setText('vpn-server', serverName);

  // 'stopped' is intentional – warn; anything else non-running is an error
  setBadge('badge-vpn', running ? 'ok' : stopped ? 'warn' : 'error');
  return { state: running ? 'connected' : stopped ? 'paused' : 'disconnected', running };
}

function renderPublicIp(publicIp) {
  if (!publicIp.ok) {
    setBadge('badge-ip', 'error');
    return;
  }
  const d = publicIp.data;
  setText('ip-address', d?.public_ip ?? d?.ip ?? d?.IP ?? '–');
  setText('ip-country', d?.country ?? '–');
  setText('ip-region', d?.region ?? '–');
  setText('ip-city', d?.city ?? '–');
  setText('ip-org', d?.org ?? d?.organization ?? '–');
  // IP is always fetched via gluetun's own API, so it's always gluetun's exit IP
  setBadge('badge-ip', 'ok');
}

function renderPortForwarded(portForwarded) {
  if (!portForwarded.ok) {
    setBadge('badge-port', 'warn');
    setText('port-number', 'N/A');
    return;
  }
  const d = portForwarded.data;
  const port = d?.port ?? 0;
  setText('port-number', port > 0 ? port : 'Not forwarded');
  setBadge('badge-port', port > 0 ? 'ok' : 'warn');
}

function renderDns(dnsStatus) {
  if (!dnsStatus.ok) {
    setBadge('badge-dns', 'warn');
    setText('dns-status', 'Unavailable');
    return;
  }
  const d = dnsStatus.data;
  setText('dns-status', d?.status ?? 'OK');
  setBadge('badge-dns', 'ok');
}

function renderBanner(state, publicIp) {
  const banner = $('status-banner');
  banner.className = `status-banner ${state}`;
  if (state === 'connected') {
    setText('banner-title', 'VPN Connected');
    const ip = publicIp.ok
      ? (publicIp.data?.public_ip ?? publicIp.data?.ip ?? '')
      : '';
    setText('banner-sub', ip ? `Public IP: ${ip}` : 'Tunnel is up');
  } else if (state === 'paused') {
    setText('banner-title', 'VPN Paused');
    const ip = publicIp.ok
      ? (publicIp.data?.public_ip ?? publicIp.data?.ip ?? '')
      : '';
    setText('banner-sub', ip ? `Gluetun active – exit IP: ${ip}` : 'Gluetun active – VPN process stopped');
  } else if (state === 'disconnected') {
    setText('banner-title', 'VPN Disconnected');
    setText('banner-sub', 'Tunnel is down – traffic may be unprotected');
  } else {
    setText('banner-title', 'Status Unknown');
    setText('banner-sub', 'Could not reach Gluetun control API');
  }
}

// ---- Main poll ----

async function poll() {
  if (isPolling) return;
  isPolling = true;

  const refreshBtn = $('refresh-btn');
  refreshBtn.innerHTML = '<span class="spin">&#x21bb;</span> Refresh';
  refreshBtn.disabled = true;

  try {
    const health = await fetchHealth();
    const { vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings } = health;

    const { state, running } = renderVpnStatus(vpnStatus, vpnSettings, publicIp);
    renderPublicIp(publicIp);
    renderPortForwarded(portForwarded);
    renderDns(dnsStatus);
    renderBanner(state, publicIp);
    pushHistory(state);

    const now = new Date();
    setText('last-updated', `Updated ${now.toLocaleTimeString()}`);
  } catch (err) {
    showToast(`Failed to reach server: ${err.message}`, 'error');
    pushHistory('unknown');
    renderBanner('unknown', { ok: false });
  } finally {
    refreshBtn.innerHTML = '&#x21bb; Refresh';
    refreshBtn.disabled = false;
    isPolling = false;
  }
}

// ---- VPN actions ----

async function vpnAction(action) {
  const label = action === 'start' ? 'Starting' : 'Stopping';
  showToast(`${label} VPN…`, 'info', 5000);
  try {
    const res = await fetch(`/api/vpn/${action}`, { method: 'PUT' });
    const data = await res.json();
    if (data.ok) {
      showToast(`VPN ${action} command sent`, 'success');
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
  const interval = parseInt($('refresh-interval').value, 10);
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

$('refresh-btn').addEventListener('click', poll);
$('refresh-interval').addEventListener('change', applyAutoRefresh);
$('btn-start').addEventListener('click', () => vpnAction('start'));
$('btn-stop').addEventListener('click',  () => vpnAction('stop'));

poll().then(() => scheduleNextPoll());
