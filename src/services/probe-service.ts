import type { ProbeResult } from '../types/video.ts';

export class ProbeService {
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  /**
   * Probes a candidate URL via HEAD or ranged GET to check responsiveness, Content-Type, and size.
   */
  public static async probeUrl(videoUrl: string, referer?: string): Promise<ProbeResult> {
    const headers: Record<string, string> = {
      'User-Agent': this.USER_AGENT,
      'Accept': '*/*'
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    try {
      // 1. Try HEAD request
      let response = await fetch(videoUrl, {
        method: 'HEAD',
        headers,
        redirect: 'follow'
      }).catch(() => null);

      // If HEAD is rejected or method not allowed, try range GET
      if (!response || response.status === 405 || response.status === 501) {
        response = await fetch(videoUrl, {
          method: 'GET',
          headers: {
            ...headers,
            'Range': 'bytes=0-1024'
          },
          redirect: 'follow'
        });
      }

      const resHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        resHeaders[key.toLowerCase()] = val;
      });

      const contentType = resHeaders['content-type'];
      const rawLength = resHeaders['content-length'];
      const contentRange = resHeaders['content-range'];
      const acceptRanges = resHeaders['accept-ranges'] === 'bytes' || Boolean(contentRange);

      let contentLength: number | undefined;

      // Extract length from content-range if available (e.g. bytes 0-1024/10485760)
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts[1] && parts[1] !== '*') {
          const total = parseInt(parts[1], 10);
          if (!isNaN(total)) contentLength = total;
        }
      }

      if (contentLength === undefined && rawLength) {
        const parsed = parseInt(rawLength, 10);
        if (!isNaN(parsed)) contentLength = parsed;
      }

      const formattedSize = contentLength !== undefined ? this.formatBytes(contentLength) : undefined;
      const isPlayable = response.ok || response.status === 206;

      return {
        url: videoUrl,
        status: response.status,
        statusText: response.statusText,
        contentType,
        contentLength,
        formattedSize,
        acceptRanges,
        isPlayable,
        headers: resHeaders
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        url: videoUrl,
        status: 0,
        statusText: 'Network Error',
        acceptRanges: false,
        isPlayable: false,
        headers: {},
        error: msg
      };
    }
  }

  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${val} ${sizes[i]}`;
  }
}
