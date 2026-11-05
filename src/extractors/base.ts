import type { ExtractorContext, RawInspectorData, VideoCandidate, VideoFormat } from '../types/video.ts';

export interface IExtractor {
  readonly name: string;
  extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> | VideoCandidate[];
}

/**
 * Standard utility functions for URL normalization, format inference, and candidate formatting.
 */
export class ExtractorUtils {
  /**
   * Resolves relative or protocol-relative URLs against the page's base URL.
   * Handles escaped slashes (e.g., https:\/\/...) and whitespace.
   */
  public static resolveUrl(rawUrl: string | null | undefined, baseUrl: string): string | null {
    if (!rawUrl) return null;

    let trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('#')) {
      return null;
    }

    // Unescape backslashes (common in JS payloads and JSON strings)
    trimmed = trimmed.replace(/\\\//g, '/').replace(/\\u002F/gi, '/');

    // Protocol-relative URL: //example.com/video.mp4
    if (trimmed.startsWith('//')) {
      try {
        const baseProto = new URL(baseUrl).protocol;
        return `${baseProto}${trimmed}`;
      } catch {
        return `https:${trimmed}`;
      }
    }

    try {
      const parsed = new URL(trimmed, baseUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Infers video format based on URL path, query parameters, or MIME type.
   */
  public static inferFormat(url: string, mimeType?: string): VideoFormat {
    const lowerMime = (mimeType || '').toLowerCase();
    if (lowerMime.includes('mpegurl') || lowerMime.includes('application/x-mpegurl')) return 'm3u8';
    if (lowerMime.includes('dash+xml')) return 'mpd';
    if (lowerMime.includes('mp4')) return 'mp4';
    if (lowerMime.includes('webm')) return 'webm';
    if (lowerMime.includes('ogg')) return 'ogg';
    if (lowerMime.includes('quicktime')) return 'mov';

    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();

      if (pathname.endsWith('.m3u8') || parsed.search.toLowerCase().includes('.m3u8')) return 'm3u8';
      if (pathname.endsWith('.mpd') || parsed.search.toLowerCase().includes('.mpd')) return 'mpd';
      if (pathname.endsWith('.mp4') || parsed.search.toLowerCase().includes('.mp4')) return 'mp4';
      if (pathname.endsWith('.webm') || parsed.search.toLowerCase().includes('.webm')) return 'webm';
      if (pathname.endsWith('.ogg') || parsed.search.toLowerCase().includes('.ogg')) return 'ogg';
      if (pathname.endsWith('.mov') || parsed.search.toLowerCase().includes('.mov')) return 'mov';
      if (pathname.endsWith('.mkv') || parsed.search.toLowerCase().includes('.mkv')) return 'mkv';
    } catch {
      // Fallback
    }

    const lower = url.toLowerCase();
    if (lower.includes('.m3u8')) return 'm3u8';
    if (lower.includes('.mpd')) return 'mpd';
    if (lower.includes('.mp4')) return 'mp4';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.ogg')) return 'ogg';

    return 'unknown';
  }

  /**
   * Generates a stable deterministic ID for a video candidate.
   */
  public static generateCandidateId(url: string, sourceType: string): string {
    const clean = `${sourceType}:${url}`;
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      const char = clean.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `vid_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Extracts resolution string if available (e.g. 1920x1080 -> 1080p).
   */
  public static formatResolution(width?: string | number, height?: string | number): string | undefined {
    if (!width && !height) return undefined;
    if (width && height) {
      const h = Number(height);
      if (!isNaN(h)) {
        if (h >= 2160) return `${width}x${height} (4K)`;
        if (h >= 1440) return `${width}x${height} (2K)`;
        if (h >= 1080) return `${width}x${height} (1080p FHD)`;
        if (h >= 720) return `${width}x${height} (720p HD)`;
        if (h >= 480) return `${width}x${height} (480p)`;
        return `${width}x${height}`;
      }
      return `${width}x${height}`;
    }
    if (height) return `${height}p`;
    return undefined;
  }
}
