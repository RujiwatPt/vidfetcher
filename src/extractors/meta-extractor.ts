import type { ExtractorContext, RawInspectorData, VideoCandidate } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class MetaTagExtractor implements IExtractor {
  public readonly name = 'Meta & OpenGraph Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];

    const metaRecords: Array<{ property?: string | null; name?: string | null; content?: string | null }> = [];
    const linkRecords: Array<{ rel?: string | null; href?: string | null }> = [];

    const rewriter = new HTMLRewriter()
      .on('meta', {
        element(el) {
          const prop = el.getAttribute('property');
          const name = el.getAttribute('name');
          const content = el.getAttribute('content');
          if (content && (prop || name)) {
            metaRecords.push({ property: prop, name, content });
          }
        }
      })
      .on('link[rel="video_src"]', {
        element(el) {
          const href = el.getAttribute('href');
          const rel = el.getAttribute('rel');
          if (href) {
            linkRecords.push({ rel, href });
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    if (rawInspector) {
      for (const m of metaRecords) {
        if (
          (m.property && m.property.startsWith('og:video')) ||
          (m.name && m.name.startsWith('twitter:player'))
        ) {
          rawInspector.metaTags.push(m);
        }
      }
    }

    // Find OpenGraph dimensions and types
    let ogType: string | undefined;
    let ogWidth: string | undefined;
    let ogHeight: string | undefined;
    let ogTitle: string | undefined;
    let ogImage: string | undefined;

    for (const m of metaRecords) {
      const p = (m.property || '').toLowerCase();
      if (p === 'og:video:type') ogType = m.content || undefined;
      if (p === 'og:video:width') ogWidth = m.content || undefined;
      if (p === 'og:video:height') ogHeight = m.content || undefined;
      if (p === 'og:title') ogTitle = m.content || undefined;
      if (p === 'og:image') ogImage = m.content || undefined;
    }

    const resolution = ExtractorUtils.formatResolution(ogWidth, ogHeight);

    // Extract OpenGraph videos
    for (const m of metaRecords) {
      const p = (m.property || '').toLowerCase();
      if (
        p === 'og:video' ||
        p === 'og:video:url' ||
        p === 'og:video:secure_url'
      ) {
        const rawUrl = m.content;
        const resolved = ExtractorUtils.resolveUrl(rawUrl, context.baseUrl);
        if (resolved) {
          const format = ExtractorUtils.inferFormat(resolved, ogType);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'opengraph'),
            url: resolved,
            originalUrl: rawUrl || '',
            sourceType: 'opengraph',
            format,
            mimeType: ogType,
            resolution,
            title: ogTitle || context.documentTitle,
            thumbnail: ogImage || context.pageThumbnail,
            confidence: 85,
            context: `OpenGraph meta tag <meta property="${m.property}" content="...">`,
            isDirectStream: format !== 'embed'
          });
        }
      }
    }

    // Extract Twitter Player Stream
    for (const m of metaRecords) {
      const n = (m.name || '').toLowerCase();
      if (n === 'twitter:player:stream' || n === 'twitter:player') {
        const rawUrl = m.content;
        const resolved = ExtractorUtils.resolveUrl(rawUrl, context.baseUrl);
        if (resolved) {
          const isStream = n === 'twitter:player:stream';
          const format = ExtractorUtils.inferFormat(resolved);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'twitter_card'),
            url: resolved,
            originalUrl: rawUrl || '',
            sourceType: 'twitter_card',
            format,
            title: ogTitle || context.documentTitle,
            thumbnail: ogImage || context.pageThumbnail,
            confidence: isStream ? 85 : 70,
            context: `Twitter Card meta tag <meta name="${m.name}" content="...">`,
            isDirectStream: format !== 'embed'
          });
        }
      }
    }

    // Extract <link rel="video_src" href="...">
    for (const link of linkRecords) {
      const resolved = ExtractorUtils.resolveUrl(link.href, context.baseUrl);
      if (resolved) {
        const format = ExtractorUtils.inferFormat(resolved);
        candidates.push({
          id: ExtractorUtils.generateCandidateId(resolved, 'opengraph'),
          url: resolved,
          originalUrl: link.href || '',
          sourceType: 'opengraph',
          format,
          title: context.documentTitle,
          thumbnail: context.pageThumbnail,
          confidence: 80,
          context: `<link rel="video_src" href="...">`,
          isDirectStream: format !== 'embed'
        });
      }
    }

    return candidates;
  }
}
