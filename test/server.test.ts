import { describe, expect, it } from 'bun:test';
import { app } from '../src/server.ts';

describe('Server HTTP API Integration Tests', () => {
  it('GET /api/health returns ok status', async () => {
    const req = new Request('http://localhost:3000/api/health');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.uptime).toBe('number');
  });

  it('OPTIONS / preflight returns CORS headers', async () => {
    const req = new Request('http://localhost:3000/api/fetch', {
      method: 'OPTIONS'
    });
    const res = await app.fetch(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('POST /api/fetch rejects empty or invalid body', async () => {
    const req = new Request('http://localhost:3000/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const res = await app.fetch(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Target URL is required');
  });

  it('POST /api/fetch rejects non-http URLs', async () => {
    const req = new Request('http://localhost:3000/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    const res = await app.fetch(req);

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('GET /api/probe rejects missing url param', async () => {
    const req = new Request('http://localhost:3000/api/probe');
    const res = await app.fetch(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('GET /api/proxy rejects missing url param', async () => {
    const req = new Request('http://localhost:3000/api/proxy');
    const res = await app.fetch(req);

    expect(res.status).toBe(400);
  });

  it('serves static files', async () => {
    // 1. Index page
    const indexReq = new Request('http://localhost:3000/');
    const indexRes = await app.fetch(indexReq);
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get('Content-Type')).toContain('text/html');

    // 2. CSS
    const cssReq = new Request('http://localhost:3000/app.css');
    const cssRes = await app.fetch(cssReq);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('Content-Type')).toContain('text/css');

    // 3. JS
    const jsReq = new Request('http://localhost:3000/app.js');
    const jsRes = await app.fetch(jsReq);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('Content-Type')).toContain('application/javascript');
  });

  it('returns 404 for unknown routes', async () => {
    const req = new Request('http://localhost:3000/unknown-route-12345');
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });
});
