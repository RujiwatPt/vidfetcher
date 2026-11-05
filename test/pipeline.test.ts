import { describe, expect, it } from 'bun:test';
import { VideoExtractionPipeline } from '../src/extractors/pipeline.ts';

describe('VideoExtractionPipeline', () => {
  const pipeline = new VideoExtractionPipeline();

  it('extracts metadata and orchestrates all extractors across a rich HTML page', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Big Buck Bunny - Blender Open Movie</title>
        <meta name="description" content="Watch Big Buck Bunny online in HD.">
        <meta property="og:title" content="Big Buck Bunny Feature">
        <meta property="og:video" content="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
        <meta property="og:video:type" content="video/mp4">
        <meta property="og:video:width" content="1920">
        <meta property="og:video:height" content="1080">
        <meta property="og:image" content="https://peach.blender.org/wp-content/uploads/bbb-splash.png">
        <link rel="icon" href="/favicon.ico">
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "name": "Big Buck Bunny 4K",
          "contentUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          "duration": "PT9M56S"
        }
        </script>
      </head>
      <body>
        <h1>Blender Animation Studio</h1>
        <video controls width="1280" height="720" poster="/posters/intro.jpg">
          <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4">
          <source src="/streams/bbb_720p.webm" type="video/webm">
        </video>
        <iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ" title="BBB on YouTube"></iframe>
        <script>
          var streamConfig = {
            hls: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
          };
        </script>
      </body>
      </html>
    `;

    const result = await pipeline.process(
      html,
      'https://peach.blender.org/download/',
      'https://peach.blender.org/download/',
      200,
      'text/html; charset=utf-8'
    );

    // 1. Verify Page Metadata
    expect(result.metadata.title).toBe('Big Buck Bunny - Blender Open Movie');
    expect(result.metadata.description).toBe('Watch Big Buck Bunny online in HD.');
    expect(result.metadata.thumbnail).toBe('https://peach.blender.org/wp-content/uploads/bbb-splash.png');
    expect(result.metadata.favicon).toBe('https://peach.blender.org/favicon.ico');

    // 2. Verify Deduplication of BigBuckBunny.mp4
    // BigBuckBunny.mp4 appeared in: <video><source>, og:video, and schema.org JSON-LD!
    // It should be deduplicated into a SINGLE entry with boosted confidence
    const bbbMatches = result.videos.filter((v) =>
      v.url.includes('BigBuckBunny.mp4')
    );
    expect(bbbMatches.length).toBe(1);
    expect(bbbMatches[0]?.confidence).toBe(100); // boosted for appearing in multiple sources
    expect(bbbMatches[0]?.context).toContain('source');
    expect(bbbMatches[0]?.context).toContain('opengraph');

    // 3. Verify HLS Stream (.m3u8) is extracted and ranked high
    const hlsStream = result.videos.find((v) => v.format === 'm3u8');
    expect(hlsStream).toBeDefined();
    expect(hlsStream?.url).toBe('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');

    // 4. Verify YouTube Iframe Embed
    const ytEmbed = result.videos.find((v) => v.format === 'embed');
    expect(ytEmbed).toBeDefined();
    expect(ytEmbed?.embedInfo?.provider).toBe('youtube');
    expect(ytEmbed?.embedInfo?.videoId).toBe('aqz-KE-bpKQ');

    // 5. Verify WebM source relative URL resolution
    const webmStream = result.videos.find((v) => v.format === 'webm');
    expect(webmStream).toBeDefined();
    expect(webmStream?.url).toBe('https://peach.blender.org/streams/bbb_720p.webm');

    // 6. Verify Sorting: Direct streams come before embeds
    expect(result.videos[0]?.isDirectStream).toBe(true);
    expect(result.videos[result.videos.length - 1]?.isDirectStream).toBe(false);

    // 7. Verify Stats
    expect(result.stats.totalFound).toBe(4);
    expect(result.stats.directPlayable).toBe(3);
    expect(result.stats.hlsStreams).toBe(1);
    expect(result.stats.embeds).toBe(1);
    expect(result.stats.scanDurationMs).toBeGreaterThanOrEqual(0);
  });
});
