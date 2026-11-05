import { VideoExtractionPipeline } from './extractors/pipeline.ts';
import { HttpClient } from './services/http-client.ts';
import { ProbeService } from './services/probe-service.ts';
import { ProxyService } from './services/proxy-service.ts';

const pipeline = new VideoExtractionPipeline();
const PORT = Number(process.env.PORT) || 3000;

export const app = {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range'
        }
      });
    }

    try {
      // 1. Health check
      if (path === '/api/health') {
        return Response.json({
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }

      // 2. Main fetch endpoint: POST /api/fetch
      if (path === '/api/fetch' && req.method === 'POST') {
        let body: { url?: string };
        try {
          body = await req.json();
        } catch {
          return Response.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
        }

        const targetUrl = (body.url || '').trim();
        if (!targetUrl) {
          return Response.json({ success: false, error: 'Target URL is required' }, { status: 400 });
        }

        try {
          const pageData = await HttpClient.fetchPage(targetUrl);
          const extraction = await pipeline.process(
            pageData.html,
            targetUrl,
            pageData.finalUrl,
            pageData.statusCode,
            pageData.contentType
          );

          return Response.json({
            success: true,
            metadata: extraction.metadata,
            videos: extraction.videos,
            stats: extraction.stats,
            rawInspector: extraction.rawInspector
          });
        } catch (fetchErr: unknown) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          return Response.json({ success: false, error: msg }, { status: 502 });
        }
      }

      // 3. Probe video stream: GET /api/probe?url=...&referer=...
      if (path === '/api/probe' && req.method === 'GET') {
        const videoUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('referer') || undefined;

        if (!videoUrl) {
          return Response.json({ success: false, error: 'Video URL is required' }, { status: 400 });
        }

        const probeResult = await ProbeService.probeUrl(videoUrl, referer);
        return Response.json(probeResult);
      }

      // 4. Proxy media stream/download: GET /api/proxy?url=...
      if (path === '/api/proxy' && req.method === 'GET') {
        const videoUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('referer') || undefined;
        const filename = url.searchParams.get('filename') || undefined;
        const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';

        if (!videoUrl) {
          return new Response('Video URL query parameter is required', { status: 400 });
        }

        return await ProxyService.proxyStream(videoUrl, req, referer, filename, isDownload);
      }

      // 5. Static file serving for Frontend
      if (path === '/' || path === '/index.html') {
        const file = Bun.file('./public/index.html');
        return new Response(file, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      if (path === '/app.css') {
        const file = Bun.file('./public/app.css');
        return new Response(file, {
          headers: { 'Content-Type': 'text/css; charset=utf-8' }
        });
      }

      if (path === '/app.js') {
        const file = Bun.file('./public/app.js');
        return new Response(file, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
        });
      }

      // 404 Not Found
      return new Response('Not Found', { status: 404 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ success: false, error: `Internal Server Error: ${msg}` }, { status: 500 });
    }
  }
};

// Start server when run directly
if (import.meta.main) {
  const server = Bun.serve({
    port: PORT,
    fetch: app.fetch
  });

  console.log(`Video Fetcher running at http://localhost:${server.port}`);
}
