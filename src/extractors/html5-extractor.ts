import type { ExtractorContext, RawInspectorData, VideoCandidate } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class HTML5VideoExtractor implements IExtractor {
  public readonly name = 'HTML5 Video Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];

    // Temporary storage during streaming HTML parse
    interface RawVideoElement {
      src?: string | null;
      poster?: string | null;
      width?: string | null;
      height?: string | null;
      title?: string | null;
      dataAttrs: Record<string, string>;
      sources: Array<{
        src?: string | null;
        type?: string | null;
        media?: string | null;
        dataAttrs: Record<string, string>;
      }>;
    }

    const currentVideos: RawVideoElement[] = [];
    let activeVideo: RawVideoElement | null = null;

    const dataAttrKeys = [
      'data-src',
      'data-video-src',
      'data-video',
      'data-url',
      'data-stream',
      'data-mp4',
      'data-hls-url',
      'data-original',
      'data-file'
    ];

    const rewriter = new HTMLRewriter()
      .on('video', {
        element(el) {
          const videoEl: RawVideoElement = {
            src: el.getAttribute('src'),
            poster: el.getAttribute('poster'),
            width: el.getAttribute('width'),
            height: el.getAttribute('height'),
            title: el.getAttribute('title') || el.getAttribute('aria-label'),
            dataAttrs: {},
            sources: []
          };

          for (const key of dataAttrKeys) {
            const val = el.getAttribute(key);
            if (val) videoEl.dataAttrs[key] = val;
          }

          currentVideos.push(videoEl);
          activeVideo = videoEl;
        }
      })
      .on('video source, source', {
        element(el) {
          const source = {
            src: el.getAttribute('src'),
            type: el.getAttribute('type'),
            media: el.getAttribute('media'),
            dataAttrs: {} as Record<string, string>
          };

          for (const key of dataAttrKeys) {
            const val = el.getAttribute(key);
            if (val) source.dataAttrs[key] = val;
          }

          if (activeVideo) {
            activeVideo.sources.push(source);
          } else {
            // Standalone source tag (rare, but valid in malformed or dynamic DOM)
            currentVideos.push({
              dataAttrs: {},
              sources: [source]
            });
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    for (const v of currentVideos) {
      if (rawInspector) {
        rawInspector.videoElements.push({
          src: v.src,
          poster: v.poster,
          sources: v.sources.map((s) => ({ src: s.src, type: s.type })),
          dataAttributes: v.dataAttrs
        });
      }

      const posterUrl = v.poster ? ExtractorUtils.resolveUrl(v.poster, context.baseUrl) : undefined;
      const resolution = ExtractorUtils.formatResolution(v.width || undefined, v.height || undefined);

      // 1. Direct src on <video>
      if (v.src) {
        const resolved = ExtractorUtils.resolveUrl(v.src, context.baseUrl);
        if (resolved) {
          const format = ExtractorUtils.inferFormat(resolved);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'html5_video'),
            url: resolved,
            originalUrl: v.src,
            sourceType: 'html5_video',
            format,
            resolution,
            title: v.title || context.documentTitle,
            thumbnail: posterUrl || context.pageThumbnail,
            confidence: 95,
            context: 'Direct <video src="..."> element',
            isDirectStream: format !== 'embed'
          });
        }
      }

      // 2. Data attributes on <video>
      for (const [attrName, rawVal] of Object.entries(v.dataAttrs)) {
        const resolved = ExtractorUtils.resolveUrl(rawVal, context.baseUrl);
        if (resolved) {
          const format = ExtractorUtils.inferFormat(resolved);
          candidates.push({
            id: ExtractorUtils.generateCandidateId(resolved, 'html5_video'),
            url: resolved,
            originalUrl: rawVal,
            sourceType: 'html5_video',
            format,
            resolution,
            title: v.title || context.documentTitle,
            thumbnail: posterUrl || context.pageThumbnail,
            confidence: 90,
            context: `<video ${attrName}="..."> lazy/data attribute`,
            isDirectStream: format !== 'embed'
          });
        }
      }

      // 3. Child <source> tags
      for (const s of v.sources) {
        if (s.src) {
          const resolved = ExtractorUtils.resolveUrl(s.src, context.baseUrl);
          if (resolved) {
            const format = ExtractorUtils.inferFormat(resolved, s.type || undefined);
            candidates.push({
              id: ExtractorUtils.generateCandidateId(resolved, 'html5_source'),
              url: resolved,
              originalUrl: s.src,
              sourceType: 'html5_source',
              format,
              mimeType: s.type || undefined,
              resolution,
              title: v.title || context.documentTitle,
              thumbnail: posterUrl || context.pageThumbnail,
              confidence: 95,
              context: `<source src="..." type="${s.type || 'unknown'}"> element`,
              isDirectStream: format !== 'embed'
            });
          }
        }

        for (const [attrName, rawVal] of Object.entries(s.dataAttrs)) {
          const resolved = ExtractorUtils.resolveUrl(rawVal, context.baseUrl);
          if (resolved) {
            const format = ExtractorUtils.inferFormat(resolved, s.type || undefined);
            candidates.push({
              id: ExtractorUtils.generateCandidateId(resolved, 'html5_source'),
              url: resolved,
              originalUrl: rawVal,
              sourceType: 'html5_source',
              format,
              mimeType: s.type || undefined,
              resolution,
              title: v.title || context.documentTitle,
              thumbnail: posterUrl || context.pageThumbnail,
              confidence: 85,
              context: `<source ${attrName}="..."> lazy attribute`,
              isDirectStream: format !== 'embed'
            });
          }
        }
      }
    }

    return candidates;
  }
}
