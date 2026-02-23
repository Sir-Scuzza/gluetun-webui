const express = require('express');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
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

// Security headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function gluetunFetch(endpoint, method = 'GET', body = null) {
  const url = `${GLUETUN_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const opts = {
    method,
    signal: controller.signal,
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
      throw new Error(`Gluetun returned ${res.status}${text ? ': ' + text.trim() : ''} for ${endpoint}`);
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
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/publicip', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/publicip/ip');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/portforwarded', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/portforward');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/vpn/settings');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/dns', async (req, res) => {
  try {
    const data = await gluetunFetch('/v1/dns/status');
    res.json({ ok: true, data });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
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

  const [vpnStatus, publicIp, portForwarded, dnsStatus, vpnSettings] = results.map(r =>
    r.status === 'fulfilled' ? { ok: true, data: r.value } : { ok: false, error: r.reason?.message }
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
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gluetun Web UI running on port ${PORT}`);
  console.log(`Proxying to Gluetun at: ${GLUETUN_URL}`);
});
