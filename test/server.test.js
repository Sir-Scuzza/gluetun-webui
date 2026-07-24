import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.GLUETUN_1_URL = 'http://localhost:9999';
process.env.GLUETUN_1_NAME = 'Test Instance';

let app;

beforeAll(async () => {
  const mod = await import('../src/server.js');
  app = mod.app;
});

describe('GET /api/health', () => {
  it('returns 503 when upstream is unreachable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe('GET /api/instances', () => {
  it('returns instance list', async () => {
    const res = await request(app).get('/api/instances');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });
});

describe('GET /api/:instanceId/health', () => {
  it('returns 400 for unknown instance', async () => {
    const res = await request(app).get('/api/99/health');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 503 for unreachable instance', async () => {
    const res = await request(app).get('/api/1/health');
    expect(res.status).toBe(503);
  });
});

describe('PUT /api/:instanceId/vpn/:action', () => {
  it('returns 400 for unknown instance', async () => {
    const res = await request(app).put('/api/99/vpn/start');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    const res = await request(app).put('/api/1/vpn/restart');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid action/);
  });
});

describe('Unknown /api/* routes', () => {
  it('returns 404 JSON', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describe('SPA catch-all', () => {
  it('returns index.html for non-API routes', async () => {
    const res = await request(app).get('/some/path');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
