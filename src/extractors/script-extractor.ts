import type { ExtractorContext, RawInspectorData, VideoCandidate, VideoFormat } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class ScriptStreamExtractor implements IExtractor {
  public readonly name = 'Script & Stream Manifest Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];
    const scriptBlocks: string[] = [];

    let currentScript = '';

    const rewriter = new HTMLRewriter()
      .on('script:not([type]), script[type="text/javascript"], script[type="application/javascript"], script[id*="state"], script[id*="data"]', {
        text(chunk) {
          currentScript += chunk.text;
          if (chunk.lastInTextNode) {
            if (currentScript.trim()) {
              scriptBlocks.push(currentScript);
            }
            currentScript = '';
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    // Also include raw HTML search in case scripts are dynamically formatted or unquoted
    const sourcesToScan = [...scriptBlocks, html];

    // Regex patterns for video streams
    // 1. Unescaped absolute URLs: https://.../stream.m3u8 or .mp4
    const directUrlRegex = /(?:https?:\/\/|\/\/)[^\s"'<>\\`]{4,500}?\.(?:m3u8|mpd|mp4|webm|mov|ogg)(?:\?[^\s"'<>\\`]*)?/gi;

    // 2. Escaped URLs: https:\/\/... or \u002F\u002F...
    const escapedUrlRegex = /(?:https?:\\\/\\\/|\\\/\\\/)[^\s"'<>`]{4,500}?\.(?:m3u8|mpd|mp4|webm|mov|ogg)(?:\?[^\s"'<>`]*)?/gi;

    // 3. Player configs: file: "...", src: "...", source: "..."
    const playerConfigRegex = /(?:file|source|src|videoUrl|streamUrl|hlsUrl|mp4Url)\s*[:=]\s*["']([^"']+\.(?:m3u8|mpd|mp4|webm|mov|ogg)(?:\?[^"']*)?)["']/gi;

    const seenUrls = new Set<string>();

    for (const content of sourcesToScan) {
      // 1. Direct URLs
      const directMatches = content.match(directUrlRegex) || [];
      for (const raw of directMatches) {
        this.addCandidate(raw, context, candidates, seenUrls, 'Direct media URL in script/HTML', rawInspector);
      }

      // 2. Escaped URLs
      const escapedMatches = content.match(escapedUrlRegex) || [];
      for (const raw of escapedMatches) {
        const unescaped = raw.replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
        this.addCandidate(unescaped, context, candidates, seenUrls, 'Escaped stream URL in script block', rawInspector);
      }

      // 3. Player Config attributes
      let configMatch: RegExpExecArray | null;
      while ((configMatch = playerConfigRegex.exec(content)) !== null) {
        const raw = configMatch[1];
        if (raw) {
          this.addCandidate(raw, context, candidates, seenUrls, 'Player configuration key (file/source/src)', rawInspector);
        }
      }

      // 4. Look for common JSON state structures (e.g. __NEXT_DATA__, __INITIAL_STATE__)
      this.extractFromJsonState(content, context, candidates, seenUrls, rawInspector);
    }

    return candidates;
  }

  private addCandidate(
    rawUrl: string,
    context: ExtractorContext,
    candidates: VideoCandidate[],
    seenUrls: Set<string>,
    contextDescription: string,
    rawInspector?: RawInspectorData
  ): void {
    const resolved = ExtractorUtils.resolveUrl(rawUrl, context.baseUrl);
    if (!resolved || seenUrls.has(resolved)) return;

    // Filter out common false positives (e.g. image files or script files containing "video")
    if (this.isFalsePositive(resolved)) return;

    seenUrls.add(resolved);

    if (rawInspector) {
      rawInspector.scriptMatches.push(resolved);
    }

    const format = ExtractorUtils.inferFormat(resolved);
    const resolution = this.detectResolutionFromUrl(resolved);

    // HLS manifests (.m3u8) get very high confidence because they are master streams
    let confidence = 80;
    if (format === 'm3u8') confidence = 92;
    if (format === 'mpd') confidence = 88;
    if (format === 'mp4') confidence = 85;

    candidates.push({
      id: ExtractorUtils.generateCandidateId(resolved, 'script_manifest'),
      url: resolved,
      originalUrl: rawUrl,
      sourceType: 'script_manifest',
      format,
      resolution,
      title: context.documentTitle,
      thumbnail: context.pageThumbnail,
      confidence,
      context: contextDescription,
      isDirectStream: format !== 'embed' && format !== 'unknown'
    });
  }

  private isFalsePositive(url: string): boolean {
    const lower = url.toLowerCase();
    // Exclude static images, JS, CSS, fonts, SVG icons
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp')) return true;
    if (lower.endsWith('.js') || lower.endsWith('.css') || lower.endsWith('.svg') || lower.endsWith('.woff2')) return true;
    // Exclude ad networks and analytics
    if (lower.includes('google-analytics') || lower.includes('doubleclick') || lower.includes('/ad/') || lower.includes('googletagmanager')) return true;
    return false;
  }

  private detectResolutionFromUrl(url: string): string | undefined {
    const lower = url.toLowerCase();
    if (lower.includes('2160p') || lower.includes('4k')) return '4K (2160p)';
    if (lower.includes('1440p') || lower.includes('2k')) return '2K (1440p)';
    if (lower.includes('1080p') || lower.includes('1920x1080')) return '1080p (FHD)';
    if (lower.includes('720p') || lower.includes('1280x720')) return '720p (HD)';
    if (lower.includes('480p') || lower.includes('854x480')) return '480p (SD)';
    if (lower.includes('360p') || lower.includes('640x360')) return '360p';
    if (lower.includes('240p')) return '240p';
    return undefined;
  }

  private extractFromJsonState(
    content: string,
    context: ExtractorContext,
    candidates: VideoCandidate[],
    seenUrls: Set<string>,
    rawInspector?: RawInspectorData
  ): void {
    const stateRegex = /(?:window\.__INITIAL_STATE__|window\.__NEXT_DATA__|window\.__NUXT__)\s*=\s*(\{[\s\S]*?\});/g;
    let match: RegExpExecArray | null;

    while ((match = stateRegex.exec(content)) !== null) {
      const jsonStr = match[1];
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          this.deepSearchJson(parsed, context, candidates, seenUrls, rawInspector);
        } catch {
          // Ignore parse errors on complex objects
        }
      }
    }
  }

  private deepSearchJson(
    obj: unknown,
    context: ExtractorContext,
    candidates: VideoCandidate[],
    seenUrls: Set<string>,
    rawInspector?: RawInspectorData
  ): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.deepSearchJson(item, context, candidates, seenUrls, rawInspector);
      }
      return;
    }

    const rec = obj as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('video') ||
          lowerKey.includes('stream') ||
          lowerKey.includes('m3u8') ||
          lowerKey.includes('url') ||
          lowerKey.includes('src') ||
          lowerKey.includes('file')
        ) {
          if (
            val.includes('.m3u8') ||
            val.includes('.mpd') ||
            val.includes('.mp4') ||
            val.includes('.webm')
          ) {
            this.addCandidate(val, context, candidates, seenUrls, `JSON state property "${key}"`, rawInspector);
          }
        }
      } else if (typeof val === 'object') {
        this.deepSearchJson(val, context, candidates, seenUrls, rawInspector);
      }
    }
  }
}
