import { app } from './server.ts';

export interface Env {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // Route API requests to app handler
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request);
    }

    // Serve static assets via Cloudflare Assets binding if available
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return assetRes;
      }
    }

    // Fallback to app handler
    return app.fetch(request);
  }
};
