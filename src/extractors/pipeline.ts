import type {
  ExtractionStats,
  ExtractorContext,
  PageMetadata,
  RawInspectorData,
  VideoCandidate
} from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';
import { HTML5VideoExtractor } from './html5-extractor.ts';
import { MetaTagExtractor } from './meta-extractor.ts';
import { JsonLdExtractor } from './jsonld-extractor.ts';
import { ScriptStreamExtractor } from './script-extractor.ts';
import { IframeEmbedExtractor } from './iframe-extractor.ts';
import { AnchorLinkExtractor } from './anchor-extractor.ts';

export class VideoExtractionPipeline {
  private readonly extractors: IExtractor[];

  constructor(customExtractors?: IExtractor[]) {
    this.extractors = customExtractors || [
      new HTML5VideoExtractor(),
      new MetaTagExtractor(),
      new JsonLdExtractor(),
      new ScriptStreamExtractor(),
      new IframeEmbedExtractor(),
      new AnchorLinkExtractor()
    ];
  }

  /**
   * Extracts page metadata (title, description, thumbnail, favicon, base tag) using streaming HTMLRewriter.
   */
  public async extractPageMetadata(
    html: string,
    requestedUrl: string,
    finalUrl: string,
    statusCode: number,
    contentType?: string
  ): Promise<{ metadata: PageMetadata; context: ExtractorContext }> {
    let title = '';
    let description: string | undefined;
    let ogImage: string | undefined;
    let favicon: string | undefined;
    let siteName: string | undefined;
    let baseHref: string | undefined;

    let inTitle = false;

    const rewriter = new HTMLRewriter()
      .on('title', {
        element() {
          inTitle = true;
        },
        text(chunk) {
          if (inTitle) {
            title += chunk.text;
          }
          if (chunk.lastInTextNode) {
            inTitle = false;
          }
        }
      })
      .on('base[href]', {
        element(el) {
          const href = el.getAttribute('href');
          if (href) baseHref = href;
        }
      })
      .on('meta', {
        element(el) {
          const prop = (el.getAttribute('property') || '').toLowerCase();
          const name = (el.getAttribute('name') || '').toLowerCase();
          const content = el.getAttribute('content');

          if (!content) return;

          if (prop === 'og:title' && !title) title = content;
          if (prop === 'og:description' || name === 'description') {
            if (!description) description = content;
          }
          if (prop === 'og:image' || name === 'twitter:image') {
            if (!ogImage) ogImage = content;
          }
          if (prop === 'og:site_name') {
            siteName = content;
          }
        }
      })
      .on('link', {
        element(el) {
          const rel = (el.getAttribute('rel') || '').toLowerCase();
          const href = el.getAttribute('href');
          if (href && (rel === 'icon' || rel === 'shortcut icon' || rel.includes('icon'))) {
            if (!favicon) favicon = href;
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    // Determine actual base URL considering <base href="...">
    let effectiveBase = finalUrl;
    if (baseHref) {
      try {
        effectiveBase = new URL(baseHref, finalUrl).href;
      } catch {
        effectiveBase = finalUrl;
      }
    }

    const resolvedThumbnail = ogImage ? ExtractorUtils.resolveUrl(ogImage, effectiveBase) || undefined : undefined;
    const resolvedFavicon = favicon ? ExtractorUtils.resolveUrl(favicon, effectiveBase) || undefined : undefined;

    const metadata: PageMetadata = {
      requestedUrl,
      finalUrl,
      title: title.trim() || new URL(finalUrl).hostname,
      description: description?.trim(),
      favicon: resolvedFavicon,
      thumbnail: resolvedThumbnail,
      siteName,
      statusCode,
      contentType,
      fetchedAt: new Date().toISOString()
    };

    const context: ExtractorContext = {
      baseUrl: effectiveBase,
      documentTitle: metadata.title,
      pageThumbnail: metadata.thumbnail
    };

    return { metadata, context };
  }

  /**
   * Runs the complete multi-strategy extraction pipeline.
   */
  public async process(
    html: string,
    requestedUrl: string,
    finalUrl: string,
    statusCode: number,
    contentType?: string
  ): Promise<{
    metadata: PageMetadata;
    videos: VideoCandidate[];
    stats: ExtractionStats;
    rawInspector: RawInspectorData;
  }> {
    const startTime = performance.now();

    const rawInspector: RawInspectorData = {
      videoElements: [],
      metaTags: [],
      jsonLdObjects: [],
      iframes: [],
      scriptMatches: []
    };

    // 1. Extract metadata and context
    const { metadata, context } = await this.extractPageMetadata(
      html,
      requestedUrl,
      finalUrl,
      statusCode,
      contentType
    );

    // 2. Run all extractors concurrently
    const extractorPromises = this.extractors.map((extractor) =>
      Promise.resolve(extractor.extract(html, context, rawInspector)).catch((err) => {
        console.error(`Extractor "${extractor.name}" failed:`, err);
        return [] as VideoCandidate[];
      })
    );

    const results = await Promise.all(extractorPromises);
    const rawCandidates = results.flat();

    // 3. Deduplicate and merge candidates
    const dedupedVideos = this.deduplicateCandidates(rawCandidates, metadata);

    // 4. Sort candidates by fidelity, format, and resolution
    const sortedVideos = this.sortCandidates(dedupedVideos);

    // 5. Compute metrics
    const duration = Math.round(performance.now() - startTime);
    const stats: ExtractionStats = {
      totalFound: sortedVideos.length,
      directPlayable: sortedVideos.filter((v) => v.isDirectStream).length,
      hlsStreams: sortedVideos.filter((v) => v.format === 'm3u8').length,
      dashStreams: sortedVideos.filter((v) => v.format === 'mpd').length,
      embeds: sortedVideos.filter((v) => v.format === 'embed').length,
      scanDurationMs: duration
    };

    return {
      metadata,
      videos: sortedVideos,
      stats,
      rawInspector
    };
  }

  /**
   * Deduplicates candidates by normalized URL and merges complementary metadata.
   */
  private deduplicateCandidates(candidates: VideoCandidate[], metadata: PageMetadata): VideoCandidate[] {
    const map = new Map<string, VideoCandidate>();

    for (const c of candidates) {
      const normalizedKey = this.normalizeUrlKey(c.url);
      const existing = map.get(normalizedKey);

      if (!existing) {
        map.set(normalizedKey, { ...c });
      } else {
        // Merge attributes and boost confidence
        existing.confidence = Math.min(100, Math.max(existing.confidence, c.confidence) + 5);
        if (!existing.title && c.title) existing.title = c.title;
        if (!existing.thumbnail && c.thumbnail) existing.thumbnail = c.thumbnail;
        if (!existing.resolution && c.resolution) existing.resolution = c.resolution;
        if (!existing.mimeType && c.mimeType) existing.mimeType = c.mimeType;
        if (!existing.duration && c.duration) existing.duration = c.duration;
        if (c.embedInfo && !existing.embedInfo) existing.embedInfo = c.embedInfo;

        // Combine context descriptions
        if (!existing.context.includes(c.sourceType)) {
          existing.context = `${existing.context} | Found also via ${c.sourceType}`;
        }
      }
    }

    const merged = Array.from(map.values());

    // Fall back to page title/thumbnail if candidate is missing them
    for (const item of merged) {
      if (!item.title) item.title = metadata.title;
      if (!item.thumbnail) item.thumbnail = metadata.thumbnail;
    }

    return merged;
  }

  private normalizeUrlKey(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash and common tracking parameters for key comparison
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      return parsed.origin + parsed.pathname.replace(/\/+$/, '') + parsed.search;
    } catch {
      return url.toLowerCase().trim();
    }
  }

  /**
   * Sorts candidates so the best playable video streams appear first.
   */
  private sortCandidates(candidates: VideoCandidate[]): VideoCandidate[] {
    const formatWeights: Record<string, number> = {
      m3u8: 100, // Master HLS playlist
      mp4: 90,  // Direct MP4
      webm: 85, // WebM
      mpd: 80,  // DASH
      mov: 70,
      ogg: 60,
      mkv: 50,
      embed: 40,
      unknown: 10
    };

    return [...candidates].sort((a, b) => {
      // 1. Direct stream over embeds
      if (a.isDirectStream && !b.isDirectStream) return -1;
      if (!a.isDirectStream && b.isDirectStream) return 1;

      // 2. Format weight
      const weightA = formatWeights[a.format] || 0;
      const weightB = formatWeights[b.format] || 0;
      if (weightA !== weightB) return weightB - weightA;

      // 3. Confidence score
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;

      return 0;
    });
  }
}
