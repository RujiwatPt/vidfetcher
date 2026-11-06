export class ProxyService {
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  /**
   * Proxies a media stream request, supporting range seeking and forced file download.
   */
  public static async proxyStream(
    videoUrl: string,
    req: Request,
    referer?: string,
    forcedFilename?: string,
    isDownload?: boolean
  ): Promise<Response> {
    try {
      const parsedUrl = new URL(videoUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return new Response('Invalid media URL protocol', { status: 400 });
      }

      // Prepare upstream headers
      const upstreamHeaders = new Headers({
        'User-Agent': this.USER_AGENT,
        'Accept': '*/*'
      });

      if (referer) {
        upstreamHeaders.set('Referer', referer);
      }

      // Forward client Range header for video seeking
      const clientRange = req.headers.get('range');
      if (clientRange) {
        upstreamHeaders.set('Range', clientRange);
      }

      const upstreamRes = await fetch(videoUrl, {
        method: 'GET',
        headers: upstreamHeaders,
        redirect: 'follow'
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return new Response(
          `Upstream CDN returned status ${upstreamRes.status}: ${upstreamRes.statusText}`,
          { status: upstreamRes.status }
        );
      }

      // Prepare response headers for client
      const responseHeaders = new Headers();

      // Pass essential media headers
      const copyHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag'
      ];

      for (const h of copyHeaders) {
        const val = upstreamRes.headers.get(h);
        if (val) responseHeaders.set(h, val);
      }

      // Default content type if missing
      if (!responseHeaders.has('content-type')) {
        responseHeaders.set('content-type', 'video/mp4');
      }

      // Enable CORS for frontend player
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      // If user clicked "Download", attach Content-Disposition
      if (isDownload) {
        const contentType = responseHeaders.get('content-type');
        const filename = forcedFilename
          ? this.sanitizeFilename(forcedFilename, contentType)
          : this.sanitizeFilename(parsedUrl.pathname, contentType);
        responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
      }

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: responseHeaders
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Proxy error: ${msg}`, { status: 502 });
    }
  }

  private static sanitizeFilename(path: string, contentType?: string | null): string {
    const raw = path.split('?')[0] || 'video';
    const segments = raw.split('/').filter(Boolean);
    let last = segments.pop() || 'video';
    let clean = last.replace(/[^a-zA-Z0-9._-]/g, '_').trim();
    if (!clean) clean = 'video';

    // Check if filename already has a recognized video extension
    const hasExt = /\.(mp4|webm|m3u8|mpd|mov|ogg|mkv|ts|flv|avi)$/i.test(clean);
    if (!hasExt) {
      const ext = this.extensionFromMime(contentType);
      clean = `${clean}.${ext}`;
    }
    return clean;
  }

  private static extensionFromMime(contentType?: string | null): string {
    const lower = (contentType || '').toLowerCase();
    if (lower.includes('mpegurl') || lower.includes('x-mpegurl')) return 'm3u8';
    if (lower.includes('dash+xml')) return 'mpd';
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('ogg')) return 'ogg';
    if (lower.includes('quicktime')) return 'mov';
    return 'mp4';
  }
}
