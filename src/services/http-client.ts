export interface FetchPageResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  contentType?: string;
}

export class HttpClient {
  private static readonly DESKTOP_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  private static readonly MOBILE_USER_AGENT =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  private static readonly BOT_USER_AGENT =
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

  /**
   * Fetches an HTML page with browser emulation headers, redirect tracking, and fallback strategies.
   */
  public static async fetchPage(
    url: string,
    timeoutMs: number = 15000
  ): Promise<FetchPageResult> {
    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }
    } catch {
      throw new Error(`Invalid URL provided: "${url}"`);
    }

    // Attempt 1: Standard Desktop Browser headers
    try {
      return await this.executeFetch(targetUrl.href, this.DESKTOP_USER_AGENT, timeoutMs);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // If blocked by 403 Forbidden or 401, attempt fallback with Googlebot or Mobile
      if (errorMsg.includes('status: 403') || errorMsg.includes('status: 401')) {
        try {
          return await this.executeFetch(targetUrl.href, this.MOBILE_USER_AGENT, timeoutMs);
        } catch {
          try {
            return await this.executeFetch(targetUrl.href, this.BOT_USER_AGENT, timeoutMs);
          } catch {
            throw new Error(`Target website returned access denied (${errorMsg})`);
          }
        }
      }
      throw err;
    }
  }

  private static async executeFetch(
    url: string,
    userAgent: string,
    timeoutMs: number
  ): Promise<FetchPageResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const parsed = new URL(url);
      const headers = new Headers({
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': userAgent.includes('Mobile') ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': userAgent.includes('iPhone') ? '"iOS"' : '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': `${parsed.protocol}//${parsed.host}/`
      });

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });

      if (!response.ok && response.status !== 304) {
        throw new Error(`Failed to fetch page, HTTP status: ${response.status} ${response.statusText}`);
      }

      const finalUrl = response.url || url;
      const contentType = response.headers.get('content-type') || undefined;
      const html = await response.text();

      return {
        html,
        finalUrl,
        statusCode: response.status,
        contentType
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
