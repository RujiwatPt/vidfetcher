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

  it('POST /api/fetch executes complete end-to-end extraction and returns JSON payload', async () => {
    // Save original fetch
    const originalFetch = globalThis.fetch;

    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cinema Premiere - The Matrix</title>
          <meta property="og:video" content="https://cdn.cinema.example.com/matrix_trailer.mp4" />
          <meta property="og:video:type" content="video/mp4" />
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "The Matrix Official Trailer",
            "contentUrl": "https://cdn.cinema.example.com/matrix_1080p.mp4",
            "duration": "PT2M30S"
          }
          </script>
        </head>
        <body>
          <video controls poster="/posters/matrix.jpg">
            <source src="/media/stream.m3u8" type="application/x-mpegURL">
            <source src="/media/stream.mp4" type="video/mp4">
          </video>
          <iframe src="https://www.youtube.com/embed/vKQi3bBA1y8" title="YouTube Clip"></iframe>
        </body>
      </html>
    `;

    try {
      globalThis.fetch = (async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('cinema.example.com/watch/matrix')) {
          return new Response(mockHtml, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          });
        }
        return originalFetch(input, init);
      }) as any;

      const req = new Request('http://localhost:3000/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://cinema.example.com/watch/matrix' })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.metadata.title).toBe('Cinema Premiere - The Matrix');
      expect(data.videos.length).toBeGreaterThanOrEqual(4);

      // Verify formats found
      const formats = data.videos.map((v: any) => v.format);
      expect(formats).toContain('m3u8');
      expect(formats).toContain('mp4');
      expect(formats).toContain('embed');

      // Verify stats
      expect(data.stats.totalFound).toBeGreaterThanOrEqual(4);
      expect(data.stats.directPlayable).toBeGreaterThanOrEqual(3);
      expect(data.stats.hlsStreams).toBe(1);
      expect(data.stats.embeds).toBe(1);

      // Verify raw inspector has elements
      expect(data.rawInspector.videoElements.length).toBe(1);
      expect(data.rawInspector.metaTags.length).toBeGreaterThanOrEqual(1);
      expect(data.rawInspector.jsonLdObjects.length).toBe(1);
      expect(data.rawInspector.iframes.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('GET /api/probe successfully probes video stream headers and size', async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async (input: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('cdn.cinema.example.com/video.mp4')) {
          return new Response(null, {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'video/mp4',
              'content-length': '10485760', // 10 MB
              'accept-ranges': 'bytes'
            }
          });
        }
        return new Response(null, { status: 404 });
      }) as any;

      const req = new Request(
        'http://localhost:3000/api/probe?url=' + encodeURIComponent('https://cdn.cinema.example.com/video.mp4')
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe(200);
      expect(data.contentType).toBe('video/mp4');
      expect(data.contentLength).toBe(10485760);
      expect(data.formattedSize).toBe('10 MB');
      expect(data.acceptRanges).toBe(true);
      expect(data.isPlayable).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('GET /api/proxy streams video with attachment Content-Disposition header', async () => {
    const originalFetch = globalThis.fetch;
    const testVideoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // mp4 ftyp header

    try {
      globalThis.fetch = (async (input: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('cdn.cinema.example.com/sample.mp4')) {
          return new Response(testVideoBytes, {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(testVideoBytes.length),
              'accept-ranges': 'bytes'
            }
          });
        }
        return new Response(null, { status: 404 });
      }) as any;

      const req = new Request(
        'http://localhost:3000/api/proxy?url=' +
          encodeURIComponent('https://cdn.cinema.example.com/sample.mp4') +
          '&download=1&filename=custom_movie.mp4'
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="custom_movie.mp4"');

      const bodyBuffer = await res.arrayBuffer();
      expect(bodyBuffer.byteLength).toBe(testVideoBytes.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
