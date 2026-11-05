import type { EmbedInfo, ExtractorContext, RawInspectorData, VideoCandidate } from '../types/video.ts';
import { type IExtractor, ExtractorUtils } from './base.ts';

export class IframeEmbedExtractor implements IExtractor {
  public readonly name = 'Iframe & Embed Extractor';

  public async extract(
    html: string,
    context: ExtractorContext,
    rawInspector?: RawInspectorData
  ): Promise<VideoCandidate[]> {
    const candidates: VideoCandidate[] = [];
    const iframes: Array<{ src?: string | null; dataSrc?: string | null; title?: string | null }> = [];

    const rewriter = new HTMLRewriter()
      .on('iframe', {
        element(el) {
          const src = el.getAttribute('src');
          const dataSrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src');
          const title = el.getAttribute('title') || el.getAttribute('aria-label');
          if (src || dataSrc) {
            iframes.push({ src, dataSrc, title });
          }
        }
      });

    const response = rewriter.transform(new Response(html));
    await response.text();

    for (const iframe of iframes) {
      if (rawInspector) {
        rawInspector.iframes.push({ src: iframe.src || iframe.dataSrc, title: iframe.title });
      }

      const targetSrc = iframe.src || iframe.dataSrc;
      if (!targetSrc) continue;

      const resolved = ExtractorUtils.resolveUrl(targetSrc, context.baseUrl);
      if (!resolved) continue;

      const embedInfo = this.analyzeEmbedUrl(resolved);
      if (embedInfo) {
        let thumbnail = context.pageThumbnail;
        if (embedInfo.provider === 'youtube' && embedInfo.videoId) {
          thumbnail = `https://img.youtube.com/vi/${embedInfo.videoId}/hqdefault.jpg`;
        }

        candidates.push({
          id: ExtractorUtils.generateCandidateId(resolved, 'iframe_embed'),
          url: resolved,
          originalUrl: targetSrc,
          sourceType: 'iframe_embed',
          format: 'embed',
          title: iframe.title || `${embedInfo.provider.toUpperCase()} Video Embed`,
          thumbnail,
          confidence: 80,
          context: `<iframe> embed player (${embedInfo.provider})`,
          isDirectStream: false,
          embedInfo
        });
      }
    }

    return candidates;
  }

  private analyzeEmbedUrl(url: string): EmbedInfo | null {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname;

      // 1. YouTube
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        let videoId: string | undefined;
        if (host.includes('youtu.be')) {
          videoId = path.slice(1).split('/')[0];
        } else if (path.includes('/embed/')) {
          videoId = path.split('/embed/')[1]?.split('?')[0];
        } else if (path.includes('/watch')) {
          videoId = parsed.searchParams.get('v') || undefined;
        } else if (path.includes('/v/')) {
          videoId = path.split('/v/')[1]?.split('?')[0];
        }

        return {
          provider: 'youtube',
          embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : url,
          videoId
        };
      }

      // 2. Vimeo
      if (host.includes('vimeo.com')) {
        let videoId: string | undefined;
        if (host.includes('player.vimeo.com')) {
          videoId = path.split('/video/')[1]?.split('?')[0];
        } else {
          const match = path.match(/\/(\d+)/);
          if (match) videoId = match[1];
        }

        return {
          provider: 'vimeo',
          embedUrl: videoId ? `https://player.vimeo.com/video/${videoId}` : url,
          videoId
        };
      }

      // 3. Dailymotion
      if (host.includes('dailymotion.com') || host.includes('dai.ly')) {
        let videoId: string | undefined;
        if (host.includes('dai.ly')) {
          videoId = path.slice(1);
        } else if (path.includes('/embed/video/')) {
          videoId = path.split('/embed/video/')[1]?.split('?')[0];
        } else if (path.includes('/video/')) {
          videoId = path.split('/video/')[1]?.split('?')[0];
        }

        return {
          provider: 'dailymotion',
          embedUrl: videoId ? `https://www.dailymotion.com/embed/video/${videoId}` : url,
          videoId
        };
      }

      // 4. Loom
      if (host.includes('loom.com')) {
        const match = path.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
        const videoId = match ? match[1] : undefined;
        return {
          provider: 'loom',
          embedUrl: videoId ? `https://www.loom.com/embed/${videoId}` : url,
          videoId
        };
      }

      // 5. Streamable
      if (host.includes('streamable.com')) {
        const videoId = path.split('/')[1]?.split('?')[0];
        return {
          provider: 'streamable',
          embedUrl: videoId ? `https://streamable.com/e/${videoId}` : url,
          videoId
        };
      }

      // 6. Rumble
      if (host.includes('rumble.com')) {
        return {
          provider: 'rumble',
          embedUrl: url
        };
      }

      // 7. Bilibili
      if (host.includes('bilibili.com')) {
        return {
          provider: 'bilibili',
          embedUrl: url
        };
      }

      // 8. TikTok
      if (host.includes('tiktok.com')) {
        return {
          provider: 'tiktok',
          embedUrl: url
        };
      }

      // 9. Generic video player iframes
      const lowerPath = path.toLowerCase();
      if (
        lowerPath.includes('player') ||
        lowerPath.includes('video') ||
        lowerPath.includes('embed') ||
        lowerPath.includes('watch') ||
        parsed.searchParams.has('video') ||
        parsed.searchParams.has('stream')
      ) {
        return {
          provider: 'generic',
          embedUrl: url
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}
