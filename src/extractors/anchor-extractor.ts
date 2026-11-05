import type { ExtractorContext, RawInspectorData, VideoCandidate } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class AnchorLinkExtractor implements IExtractor {
  public readonly name = 'Anchor Link Video Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    _rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];
    const anchors: Array<{ href?: string | null; download?: string | null; title?: string | null }> = [];

    const rewriter = new HTMLRewriter()
      .on('a[href]', {
        element(el) {
          const href = el.getAttribute('href');
          const download = el.getAttribute('download');
          const title = el.getAttribute('title') || el.getAttribute('aria-label');
          if (href) {
            anchors.push({ href, download, title });
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    const seenUrls = new Set<string>();

    for (const a of anchors) {
      if (!a.href) continue;
      const resolved = ExtractorUtils.resolveUrl(a.href, context.baseUrl);
      if (!resolved || seenUrls.has(resolved)) continue;

      const format = ExtractorUtils.inferFormat(resolved);
      if (format !== 'unknown' && format !== 'embed') {
        seenUrls.add(resolved);
        candidates.push({
          id: ExtractorUtils.generateCandidateId(resolved, 'anchor_link'),
          url: resolved,
          originalUrl: a.href,
          sourceType: 'anchor_link',
          format,
          title: a.title || a.download || context.documentTitle,
          thumbnail: context.pageThumbnail,
          confidence: 75,
          context: `Direct link <a href="${a.href}"> pointing to ${format.toUpperCase()} video`,
          isDirectStream: true
        });
      }
    }

    return candidates;
  }
}
