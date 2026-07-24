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

    <div class="dashboard-grid" id="i${id}-grid">
      <!-- Public IP card -->
      <div class="card" data-card-id="ip" draggable="false">
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
      <div class="card" data-card-id="vpn" draggable="false">
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
      <div class="card" data-card-id="port" draggable="false">
        <div class="card-header">
          <span class="card-icon">&#128268;</span>
          <h3>Port Forwarding</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Forwarded Port</span><span class="stat-value mono" id="i${id}-port-number">–</span></div>
        </div>
      </div>

      <!-- DNS card -->
      <div class="card" data-card-id="dns" draggable="false">
        <div class="card-header">
          <span class="card-icon">&#128225;</span>
          <h3>DNS</h3>
        </div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="i${id}-dns-status">–</span></div>
        </div>
      </div>

      <!-- History card -->
      <div class="card card-wide" data-card-id="history" draggable="false">
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
    applyLayout(inst.id);
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

// ---- Edit Mode ----

const CARD_IDS = ['ip', 'vpn', 'port', 'dns', 'history'];
let editMode = false;
let dragSrcCard = null;

function layoutKey(instId) { return `gluetun_layout_${instId}`; }

function defaultLayout() {
  return { order: [...CARD_IDS], sizes: {}, hidden: [] };
}

function loadLayout(instId) {
  try {
    const raw = JSON.parse(localStorage.getItem(layoutKey(instId)));
    if (raw && Array.isArray(raw.order)) return raw;
  } catch (_) {}
  return defaultLayout();
}

function saveLayout(instId, layout) {
  try { localStorage.setItem(layoutKey(instId), JSON.stringify(layout)); } catch (_) {}
}

function applyLayout(instId) {
  const grid = document.getElementById(`i${instId}-grid`);
  if (!grid) return;
  const layout = loadLayout(instId);
  const cards = {};

  grid.querySelectorAll('.card[data-card-id]').forEach(c => {
    cards[c.dataset.cardId] = c;
  });

  // Reorder
  layout.order.forEach(cid => {
    if (cards[cid]) grid.appendChild(cards[cid]);
  });

  // Sizes
  CARD_IDS.forEach(cid => {
    const card = cards[cid];
    if (!card) return;
    const span = layout.sizes[cid] || 1;
    card.style.gridColumn = span >= 4 ? '1 / -1' : `span ${span}`;
    // card-wide class is just for initial default, override with explicit span
    card.classList.toggle('card-wide', false);
  });

  // Hidden
  CARD_IDS.forEach(cid => {
    const card = cards[cid];
    if (!card) return;
    card.style.display = layout.hidden.includes(cid) ? 'none' : '';
  });

  applyLayoutUI(instId);
}

function applyLayoutUI(instId) {
  const layout = loadLayout(instId);
  document.querySelectorAll(`#i${instId}-grid .card[data-card-id]`).forEach(card => {
    const cid = card.dataset.cardId;
    // Drag
    card.draggable = editMode;
    // Resize handle (right edge)
    let rh = card.querySelector('.resize-handle');
    if (editMode) {
      if (!rh) {
        rh = document.createElement('div');
        rh.className = 'resize-handle';
        rh.title = 'Drag to resize';
        rh.addEventListener('mousedown', (e) => startResize(e, instId, cid));
        card.appendChild(rh);
      }
      rh.style.display = '';
    } else if (rh) {
      rh.style.display = 'none';
    }
  });

  // Drag events for reorder
  if (editMode) {
    const gridEl = document.getElementById(`i${instId}-grid`);
    if (gridEl) {
      gridEl.querySelectorAll('.card[data-card-id]').forEach(card => {
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragover', onDragOver);
        card.addEventListener('drop', onDrop);
        card.addEventListener('dragend', onDragEnd);
      });
    }
  }

  // Update show/hide panel
  renderVisibilityPanel(instId);
}

// ---- Edge-drag resize ----

function startResize(e, instId, cid) {
  e.preventDefault();
  e.stopPropagation();
  const grid = document.getElementById(`i${instId}-grid`);
  const card = grid.querySelector(`[data-card-id="${cid}"]`);
  if (!grid || !card) return;

  const startX = e.clientX;
  const gridRect = grid.getBoundingClientRect();
  const numCols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const colWidth = gridRect.width / numCols;
  const startSpan = loadLayout(instId).sizes[cid] || 1;

  card.classList.add('resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  // Create grid overlay
  const overlay = document.createElement('div');
  overlay.className = 'grid-overlay';
  overlay.style.cssText = `
    position:absolute; top:0; left:${gridRect.left - grid.parentElement.getBoundingClientRect().left}px;
    width:${gridRect.width}px; height:${gridRect.height}px;
    display:flex; pointer-events:none; z-index:10;
  `;
  for (let i = 0; i < numCols; i++) {
    const col = document.createElement('div');
    col.className = 'grid-col-guide';
    col.style.cssText = `flex:1; border-right:1px dashed rgba(74,222,128,0.3); transition: background 0.1s;`;
    overlay.appendChild(col);
  }
  grid.parentElement.style.position = 'relative';
  grid.parentElement.appendChild(overlay);

  let activeSpan = startSpan;

  function onMove(ev) {
    const delta = ev.clientX - startX;
    const spanDelta = Math.round(delta / colWidth);
    activeSpan = Math.max(1, Math.min(numCols, startSpan + spanDelta));
    card.style.gridColumn = activeSpan >= numCols ? '1 / -1' : `span ${activeSpan}`;
    // Highlight active columns in overlay
    overlay.querySelectorAll('.grid-col-guide').forEach((col, i) => {
      col.style.background = i < activeSpan ? 'rgba(74,222,128,0.08)' : '';
    });
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    card.classList.remove('resizing');
    overlay.remove();

    const layout = loadLayout(instId);
    layout.sizes[cid] = activeSpan;
    saveLayout(instId, layout);
    applyLayout(instId);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onDragStart(e) {
  dragSrcCard = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.cardId);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  const instId = this.closest('.dashboard-group')?.id?.replace('dashboard-', '');
  if (!instId || !dragSrcCard || dragSrcCard === this) return;
  const layout = loadLayout(instId);
  const fromId = dragSrcCard.dataset.cardId;
  const toId = this.dataset.cardId;
  const fromIdx = layout.order.indexOf(fromId);
  const toIdx = layout.order.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return;
  layout.order.splice(fromIdx, 1);
  layout.order.splice(toIdx, 0, fromId);
  saveLayout(instId, layout);
  applyLayout(instId);
}

function onDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragSrcCard = null;
}

function renderVisibilityPanel(instId) {
  let panel = document.getElementById(`i${instId}-visibility-panel`);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = `i${instId}-visibility-panel`;
    panel.className = 'visibility-panel';
    const group = document.getElementById(`dashboard-${instId}`);
    if (group) group.insertBefore(panel, group.querySelector('.dashboard-grid'));
  }
  if (!editMode) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const layout = loadLayout(instId);
  const labels = { ip: 'Public IP', vpn: 'VPN Connection', port: 'Port Forwarding', dns: 'DNS', history: 'History' };
  panel.innerHTML = CARD_IDS.map(cid => {
    const vis = !layout.hidden.includes(cid);
    return `<label class="vis-toggle"><input type="checkbox" data-vis-cid="${cid}" ${vis ? 'checked' : ''}> ${labels[cid]}</label>`;
  }).join('') + `<button class="reset-layout-btn" title="Reset to default layout">↺ Reset</button>`;
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const layout = loadLayout(instId);
      const cid = cb.dataset.visCid;
      if (cb.checked) {
        layout.hidden = layout.hidden.filter(h => h !== cid);
      } else {
        if (!layout.hidden.includes(cid)) layout.hidden.push(cid);
      }
      saveLayout(instId, layout);
      applyLayout(instId);
    });
  });
  panel.querySelector('.reset-layout-btn')?.addEventListener('click', () => {
    saveLayout(instId, defaultLayout());
    applyLayout(instId);
    showToast('Layout reset to defaults', 'success');
  });
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = $('edit-toggle');
  btn.classList.toggle('active', editMode);
  btn.innerHTML = editMode ? '&#10003; Done' : '&#9998; Edit';
  document.querySelectorAll('.dashboard-group').forEach(group => {
    const instId = group.id.replace('dashboard-', '');
    applyLayout(instId);
    applyLayoutUI(instId);
    const panel = document.getElementById(`i${instId}-visibility-panel`);
    if (panel) panel.style.display = editMode ? '' : 'none';
  });
}

// ---- Init ----

$('refresh-btn').addEventListener('click', () => {
  clearTimeout(refreshTimer);
  pollAll().then(() => scheduleNextPoll());
});
$('refresh-interval').addEventListener('change', applyAutoRefresh);
$('edit-toggle').addEventListener('click', toggleEditMode);

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
})();
