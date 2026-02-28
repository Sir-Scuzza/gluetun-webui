const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;

// Multi-instance configuration.
// Falls back to legacy GLUETUN_CONTROL_URL / GLUETUN_API_KEY for instance 1.
const INSTANCES = {
  '1': {
    name:   process.env.GLUETUN_1_NAME    || 'Gluetun 1',
    url:    process.env.GLUETUN_1_URL     || process.env.GLUETUN_CONTROL_URL || '',
    apiKey: process.env.GLUETUN_1_API_KEY || process.env.GLUETUN_API_KEY     || '',
  },
  '2': {
    name:   process.env.GLUETUN_2_NAME    || 'Gluetun 2',
    url:    process.env.GLUETUN_2_URL     || '',
    apiKey: process.env.GLUETUN_2_API_KEY || '',
  },
};

function resolveInstance(req, res) {
  const id = req.query.instance;
  if (!id || !Object.prototype.hasOwnProperty.call(INSTANCES, id)) {
    res.status(400).json({ ok: false, error: 'Missing or invalid instance parameter. Use ?instance=1 or ?instance=2.' });
    return null;
  }
  const inst = INSTANCES[id];
  if (!inst.url) {
    res.status(503).json({ ok: false, error: 'Instance not configured' });
    return null;
  }
  return inst;
}

// General read rate limiter (covers all /api/* GET routes)
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later.' },
});

// UI/static route rate limiter – protects filesystem access for SPA index.html
const uiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests for the web UI, please try again later.',
});

app.use('/api/', (req, res, next) => req.method === 'GET' ? readLimiter(req, res, next) : next());

// Security headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '2kb' }));
app.use(uiLimiter, express.static(path.join(__dirname, 'public')));

async function gluetunFetch(endpoint, method = 'GET', body = null, baseUrl = '', apiKey = '') {
  const url = `${baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const opts = {
    method,
    signal: controller.signal,
    redirect: 'follow',
    headers: {
      ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  try {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (fetchErr) {
      const cause = fetchErr.cause?.code || fetchErr.cause?.message || fetchErr.message;
      throw new Error(`fetch failed for ${endpoint} (${cause})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Gluetun returned ${res.status} for ${endpoint}${text ? ': ' + text.slice(0, 200).trim() : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Tries /v1/vpn/settings first; falls back to /v1/openvpn/settings on 401/404
// so that Gluetun roles that only expose the legacy OpenVPN endpoint still work.
async function fetchVpnSettings(baseUrl, apiKey) {
  try {
    return await gluetunFetch('/v1/vpn/settings', 'GET', null, baseUrl, apiKey);
  } catch (err) {
    if (err.status === 401 || err.status === 404) {
      console.warn('[upstream] /v1/vpn/settings returned', err.status, '– falling back to /v1/openvpn/settings');
      return gluetunFetch('/v1/openvpn/settings', 'GET', null, baseUrl, apiKey);
    }
    throw err;
  }
}

// Tries /v1/portforward first (current Gluetun endpoint); falls back to
// /v1/openvpn/portforwarded on 404 for older Gluetun versions.
// Note: newer Gluetun redirects /v1/openvpn/portforwarded → /v1/portforward,
// so calling the new endpoint directly avoids redirect-induced 401s when the
// redirect target is not listed in a role-based ACL.
async function fetchPortForwarded(baseUrl, apiKey) {
  try {
    return await gluetunFetch('/v1/portforward', 'GET', null, baseUrl, apiKey);
  } catch (err) {
    if (err.status === 404) {
      return gluetunFetch('/v1/openvpn/portforwarded', 'GET', null, baseUrl, apiKey);
    }
    throw err;
  }
}

function handleUpstreamError(err, res) {
  console.error('[upstream]', err.message);
  if (err.status === 401) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: configure GLUETUN_API_KEY' });
  }
  res.status(502).json({ ok: false, error: 'Upstream error' });
}

// --- Instance list ---

app.get('/api/instances', (req, res) => {
  const list = Object.entries(INSTANCES).map(([id, inst]) => ({
    id,
    name: inst.name,
    configured: Boolean(inst.url),
  }));
  res.json({ ok: true, data: list });
});

// --- Proxy endpoints ---

app.get('/api/status', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await gluetunFetch('/v1/vpn/status', 'GET', null, inst.url, inst.apiKey);
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

app.get('/api/publicip', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await gluetunFetch('/v1/publicip/ip', 'GET', null, inst.url, inst.apiKey);
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

app.get('/api/portforwarded', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await fetchPortForwarded(inst.url, inst.apiKey);
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

app.get('/api/settings', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await fetchVpnSettings(inst.url, inst.apiKey);
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

app.get('/api/dns', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await gluetunFetch('/v1/dns/status', 'GET', null, inst.url, inst.apiKey);
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

// Aggregate health snapshot
app.get('/api/health', async (req, res) => {
  const inst = resolveInstance(req, res);
  if (!inst) return;
  const results = await Promise.allSettled([
    gluetunFetch('/v1/vpn/status',   'GET', null, inst.url, inst.apiKey),
    gluetunFetch('/v1/publicip/ip',  'GET', null, inst.url, inst.apiKey),
    fetchPortForwarded(inst.url, inst.apiKey),
    gluetunFetch('/v1/dns/status',   'GET', null, inst.url, inst.apiKey),
    fetchVpnSettings(inst.url, inst.apiKey),
  ]);

  results.forEach(r => { if (r.status === 'rejected') console.error('[upstream]', r.reason?.message); });
  // Only treat it as an auth error when the primary VPN status endpoint itself
  // returns 401.  Secondary endpoints (port-forward, settings) may legitimately
  // return 401 when a role-based ACL omits them; that should not block the
  // entire dashboard with a misleading "set your API key" banner.
  const authError = results[0].status === 'rejected' && results[0].reason?.status === 401;
  const [vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings] = results.map(r =>
    r.status === 'fulfilled' ? { ok: true, data: r.value } : { ok: false, error: 'Upstream error' }
  );

  res.json({
    timestamp: new Date().toISOString(),
    authError,
    vpnStatus,
    publicIp,
    portForwarded,
    dnsStatus,
    vpnSettings,
  });
});

// VPN control actions
const vpnActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later.' },
});

// Rate limiting for SPA/static index route
const staticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later.' },
});

app.put('/api/vpn/:action', vpnActionLimiter, async (req, res) => {
  const { action } = req.params;
  const allowed = ['start', 'stop'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ ok: false, error: 'Invalid action. Use start or stop.' });
  }
  const inst = resolveInstance(req, res);
  if (!inst) return;
  try {
    const data = await gluetunFetch(
      '/v1/vpn/status',
      'PUT',
      { status: action === 'start' ? 'running' : 'stopped' },
      inst.url,
      inst.apiKey,
    );
    res.json({ ok: true, data });
  } catch (err) {
    handleUpstreamError(err, res);
  }
});

// 404 for undefined /api/* routes – must come before SPA catch-all
app.use('/api/', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

app.get('*', staticLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler – catches synchronous throws and next(err) calls
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Gluetun Web UI running on port ${PORT}`);
  Object.entries(INSTANCES).forEach(([id, inst]) => {
    if (inst.url) {
      console.log(`Instance ${id} (${inst.name}): ${inst.url}`);
    } else {
      console.log(`Instance ${id} (${inst.name}): not configured`);
    }
  });
});
