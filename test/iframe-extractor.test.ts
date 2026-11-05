import { describe, expect, it } from 'bun:test';
import { IframeEmbedExtractor } from '../src/extractors/iframe-extractor.ts';
import type { ExtractorContext } from '../src/types/video.ts';

describe('IframeEmbedExtractor', () => {
  const extractor = new IframeEmbedExtractor();
  const context: ExtractorContext = {
    baseUrl: 'https://myblog.com/post/awesome-video',
    documentTitle: 'Awesome Blog Post'
  };

  it('detects YouTube iframes, normalizes embed URL, and extracts video ID thumbnail', async () => {
    const html = `
      <div class="video-container">
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1" title="Music Video" width="560" height="315"></iframe>
      </div>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.sourceType).toBe('iframe_embed');
    expect(candidates[0]?.format).toBe('embed');
    expect(candidates[0]?.embedInfo?.provider).toBe('youtube');
    expect(candidates[0]?.embedInfo?.videoId).toBe('dQw4w9WgXcQ');
    expect(candidates[0]?.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(candidates[0]?.title).toBe('Music Video');
    expect(candidates[0]?.isDirectStream).toBe(false);
  });

  it('detects Vimeo iframes', async () => {
    const html = `
      <iframe src="https://player.vimeo.com/video/76979871" width="640" height="360"></iframe>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.embedInfo?.provider).toBe('vimeo');
    expect(candidates[0]?.embedInfo?.videoId).toBe('76979871');
  });

  it('detects Loom and Streamable embeds', async () => {
    const html = `
      <iframe src="https://www.loom.com/embed/abc123xyz"></iframe>
      <iframe src="https://streamable.com/e/moo456"></iframe>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(2);
    expect(candidates.some((c) => c.embedInfo?.provider === 'loom')).toBe(true);
    expect(candidates.some((c) => c.embedInfo?.provider === 'streamable')).toBe(true);
  });
});
