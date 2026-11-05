import { describe, expect, it } from 'bun:test';
import { MetaTagExtractor } from '../src/extractors/meta-extractor.ts';
import type { ExtractorContext } from '../src/types/video.ts';

describe('MetaTagExtractor', () => {
  const extractor = new MetaTagExtractor();
  const context: ExtractorContext = {
    baseUrl: 'https://news.example.com/article/123',
    documentTitle: 'Breaking News Video'
  };

  it('extracts og:video and resolves dimensions and type', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="Exclusive Interview">
          <meta property="og:video" content="https://cdn.example.com/interview.mp4">
          <meta property="og:video:type" content="video/mp4">
          <meta property="og:video:width" content="1280">
          <meta property="og:video:height" content="720">
          <meta property="og:image" content="https://cdn.example.com/interview_poster.jpg">
        </head>
      </html>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://cdn.example.com/interview.mp4');
    expect(candidates[0]?.sourceType).toBe('opengraph');
    expect(candidates[0]?.format).toBe('mp4');
    expect(candidates[0]?.resolution).toBe('1280x720 (720p HD)');
    expect(candidates[0]?.title).toBe('Exclusive Interview');
    expect(candidates[0]?.thumbnail).toBe('https://cdn.example.com/interview_poster.jpg');
    expect(candidates[0]?.isDirectStream).toBe(true);
  });

  it('extracts twitter:player:stream for live streaming cards', async () => {
    const html = `
      <html>
        <head>
          <meta name="twitter:card" content="player">
          <meta name="twitter:player:stream" content="https://streams.twitter.com/live/feed.m3u8">
          <meta name="twitter:image" content="https://streams.twitter.com/thumb.jpg">
        </head>
      </html>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://streams.twitter.com/live/feed.m3u8');
    expect(candidates[0]?.sourceType).toBe('twitter_card');
    expect(candidates[0]?.format).toBe('m3u8');
    expect(candidates[0]?.isDirectStream).toBe(true);
  });

  it('extracts link rel="video_src"', async () => {
    const html = `
      <html>
        <head>
          <link rel="video_src" href="/media/feature.mp4">
        </head>
      </html>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://news.example.com/media/feature.mp4');
  });
});
