import type { ExtractorContext, RawInspectorData, VideoCandidate } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class JsonLdExtractor implements IExtractor {
  public readonly name = 'JSON-LD Schema Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];
    const jsonBlocks: string[] = [];

    let currentJson = '';

    const rewriter = new HTMLRewriter()
      .on('script[type="application/ld+json"]', {
        text(chunk) {
          currentJson += chunk.text;
          if (chunk.lastInTextNode) {
            if (currentJson.trim()) {
              jsonBlocks.push(currentJson.trim());
            }
            currentJson = '';
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    for (const raw of jsonBlocks) {
      try {
        const parsed = JSON.parse(raw);
        if (rawInspector) {
          rawInspector.jsonLdObjects.push(parsed);
        }
        this.traverseObject(parsed, context, candidates);
      } catch {
        // Silently skip malformed JSON blocks
      }
    }

    return candidates;
  }

  private traverseObject(
    obj: unknown,
    context: ExtractorContext,
    candidates: VideoCandidate[]
  ): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.traverseObject(item, context, candidates);
      }
      return;
    }

    const record = obj as Record<string, unknown>;

    // Handle @graph array
    if (Array.isArray(record['@graph'])) {
      for (const item of record['@graph']) {
        this.traverseObject(item, context, candidates);
      }
    }

    // Check if this object is a VideoObject or Clip
    const rawType = record['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isVideoObject = types.some(
      (t) => typeof t === 'string' && (t.toLowerCase() === 'videoobject' || t.toLowerCase() === 'clip')
    );

    const contentUrl = typeof record.contentUrl === 'string' ? record.contentUrl : undefined;
    const embedUrl = typeof record.embedUrl === 'string' ? record.embedUrl : undefined;

    if (isVideoObject || contentUrl || embedUrl) {
      const name = typeof record.name === 'string' ? record.name : (typeof record.headline === 'string' ? record.headline : undefined);
      const description = typeof record.description === 'string' ? record.description : undefined;
      const duration = typeof record.duration === 'string' ? record.duration : undefined;

      // Extract thumbnail
      let thumbUrl: string | undefined;
      if (typeof record.thumbnailUrl === 'string') {
        thumbUrl = record.thumbnailUrl;
      } else if (Array.isArray(record.thumbnailUrl) && record.thumbnailUrl.length > 0) {
        thumbUrl = String(record.thumbnailUrl[0]);
      } else if (typeof record.thumbnail === 'string') {
        thumbUrl = record.thumbnail;
      } else if (record.thumbnail && typeof record.thumbnail === 'object') {
        const thumbObj = record.thumbnail as Record<string, unknown>;
        if (typeof thumbObj.url === 'string') {
          thumbUrl = thumbObj.url;
        } else if (typeof thumbObj.contentUrl === 'string') {
          thumbUrl = thumbObj.contentUrl;
        }
      }

      const resolvedThumb = thumbUrl ? ExtractorUtils.resolveUrl(thumbUrl, context.baseUrl) : undefined;

      // 1. If direct contentUrl exists
      if (contentUrl) {
        const resolved = ExtractorUtils.resolveUrl(contentUrl, context.baseUrl);
        if (resolved) {
          const format = ExtractorUtils.inferFormat(resolved);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'schema_jsonld'),
            url: resolved,
            originalUrl: contentUrl,
            sourceType: 'schema_jsonld',
            format,
            title: name || context.documentTitle,
            thumbnail: (resolvedThumb || context.pageThumbnail) ?? undefined,
            duration,
            confidence: 95,
            context: 'Schema.org JSON-LD VideoObject contentUrl',
            isDirectStream: format !== 'embed' && format !== 'unknown'
          });
        }
      }

      // 2. If embedUrl exists
      if (embedUrl) {
        const resolved = ExtractorUtils.resolveUrl(embedUrl, context.baseUrl);
        if (resolved) {
          const format = ExtractorUtils.inferFormat(resolved);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'schema_jsonld_embed'),
            url: resolved,
            originalUrl: embedUrl,
            sourceType: 'schema_jsonld',
            format: format === 'unknown' ? 'embed' : format,
            title: name || context.documentTitle,
            thumbnail: (resolvedThumb || context.pageThumbnail) ?? undefined,
            duration,
            confidence: 85,
            context: 'Schema.org JSON-LD VideoObject embedUrl',
            isDirectStream: false
          });
        }
      }
    }

    // Traverse any nested properties (e.g. video: { ... }, mainEntity: { ... })
    for (const key of Object.keys(record)) {
      if (key !== '@graph') {
        const val = record[key];
        if (val && typeof val === 'object') {
          this.traverseObject(val, context, candidates);
        }
      }
    }
  }
}
