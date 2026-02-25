const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const GLUETUN_URL = process.env.GLUETUN_CONTROL_URL || 'http://gluetun:8000';

// Optional auth – set GLUETUN_API_KEY for Bearer token,
// or GLUETUN_USER + GLUETUN_PASSWORD for HTTP Basic auth.
const GLUETUN_API_KEY    = process.env.GLUETUN_API_KEY    || '';
const GLUETUN_USER       = process.env.GLUETUN_USER       || '';
const GLUETUN_PASSWORD   = process.env.GLUETUN_PASSWORD   || '';

function buildAuthHeaders() {
  if (GLUETUN_API_KEY) {
    return { Authorization: `Bearer ${GLUETUN_API_KEY}` };
  }
  if (GLUETUN_USER && GLUETUN_PASSWORD) {
    const encoded = Buffer.from(`${GLUETUN_USER}:${GLUETUN_PASSWORD}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
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
  max: 100, // limit each IP to 100 requests per windowMs
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

async function gluetunFetch(endpoint, method = 'GET', body = null) {
  const url = `${GLUETUN_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const opts = {
    method,
    signal: controller.signal,
    redirect: 'error',
    headers: {
      ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
      ...buildAuthHeaders(),
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gluetun returned ${res.status}${text ? ': ' + text.slice(0, 200).trim() : ''}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Proxy endpoints ---

app.get('/api/status', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/vpn/status');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

app.get('/api/publicip', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/publicip/ip');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

app.get('/api/portforwarded', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/portforward');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/vpn/settings');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

app.get('/api/dns', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/dns/status');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

// Aggregate health snapshot
app.get('/api/health', async (req, res) => {
  const results = await Promise.allSettled([
    gluetunFetch('/v1/vpn/status'),
    gluetunFetch('/v1/publicip/ip'),
    gluetunFetch('/v1/portforward'),
    gluetunFetch('/v1/dns/status'),
    gluetunFetch('/v1/vpn/settings'),
  ]);

  results.forEach(r => { if (r.status === 'rejected') console.error('[upstream]', r.reason?.message); });
  const [vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings] = results.map(r =>
    r.status === 'fulfilled' ? { ok: true, data: r.value } : { ok: false, error: 'Upstream error' }
  );

  res.json({
    timestamp: new Date().toISOString(),
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

app.put('/api/vpn/:action', vpnActionLimiter, async (req, res) => {
  const { action } = req.params;
  const allowed = ['start', 'stop'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ ok: false, error: 'Invalid action. Use start or stop.' });
  }
  try {
    const data = await gluetunFetch(
      '/v1/vpn/status',
      'PUT',
      { status: action === 'start' ? 'running' : 'stopped' }
    );
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[upstream]', err.message);
    res.status(502).json({ ok: false, error: 'Upstream error' });
  }
});

// 404 for undefined /api/* routes – must come before SPA catch-all
app.use('/api/', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

app.get('*', (req, res) => {
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
  console.log(`Proxying to Gluetun at: ${GLUETUN_URL}`);
});
