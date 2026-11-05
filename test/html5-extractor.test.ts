import { describe, expect, it } from 'bun:test';
import { HTML5VideoExtractor } from '../src/extractors/html5-extractor.ts';
import type { ExtractorContext, RawInspectorData } from '../src/types/video.ts';

describe('HTML5VideoExtractor', () => {
  const extractor = new HTML5VideoExtractor();
  const context: ExtractorContext = {
    baseUrl: 'https://example.com/movies/index.html',
    documentTitle: 'Test Page'
  };

  it('extracts direct src from video tag and resolves relative URLs', async () => {
    const html = `
      <html>
        <body>
          <video src="/videos/test_1080p.mp4" width="1920" height="1080" poster="/posters/thumb.jpg" title="Action Movie"></video>
        </body>
      </html>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://example.com/videos/test_1080p.mp4');
    expect(candidates[0]?.sourceType).toBe('html5_video');
    expect(candidates[0]?.format).toBe('mp4');
    expect(candidates[0]?.resolution).toBe('1920x1080 (1080p FHD)');
    expect(candidates[0]?.thumbnail).toBe('https://example.com/posters/thumb.jpg');
    expect(candidates[0]?.title).toBe('Action Movie');
    expect(candidates[0]?.isDirectStream).toBe(true);
  });

  it('extracts source child tags with mime types', async () => {
    const html = `
      <video controls poster="https://cdn.example.com/poster.png">
        <source src="clip_720p.webm" type="video/webm">
        <source src="clip_720p.mp4" type="video/mp4">
      </video>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(2);
    expect(candidates[0]?.url).toBe('https://example.com/movies/clip_720p.webm');
    expect(candidates[0]?.format).toBe('webm');
    expect(candidates[0]?.mimeType).toBe('video/webm');

    expect(candidates[1]?.url).toBe('https://example.com/movies/clip_720p.mp4');
    expect(candidates[1]?.format).toBe('mp4');
    expect(candidates[1]?.mimeType).toBe('video/mp4');
  });

  it('extracts data-src and lazy loading attributes', async () => {
    const html = `
      <video data-src="https://cdn.site.com/lazy_video.mp4" data-hls-url="https://cdn.site.com/live.m3u8">
        <source data-src="/streams/backup.mp4" type="video/mp4">
      </video>
    `;

    const candidates = await extractor.extract(html, context);

    const urls = candidates.map((c) => c.url);
    expect(urls).toContain('https://cdn.site.com/lazy_video.mp4');
    expect(urls).toContain('https://cdn.site.com/live.m3u8');
    expect(urls).toContain('https://example.com/streams/backup.mp4');
  });

  it('populates rawInspector structure', async () => {
    const rawInspector: RawInspectorData = {
      videoElements: [],
      metaTags: [],
      jsonLdObjects: [],
      iframes: [],
      scriptMatches: []
    };

    const html = `
      <video src="clip.mp4" poster="thumb.jpg">
        <source src="clip.webm" type="video/webm">
      </video>
    `;

    await extractor.extract(html, context, rawInspector);

    expect(rawInspector.videoElements.length).toBe(1);
    expect(rawInspector.videoElements[0]?.src).toBe('clip.mp4');
    expect(rawInspector.videoElements[0]?.sources.length).toBe(1);
  });
});
