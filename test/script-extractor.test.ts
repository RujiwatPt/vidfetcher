import { describe, expect, it } from 'bun:test';
import { ScriptStreamExtractor } from '../src/extractors/script-extractor.ts';
import type { ExtractorContext } from '../src/types/video.ts';

describe('ScriptStreamExtractor', () => {
  const extractor = new ScriptStreamExtractor();
  const context: ExtractorContext = {
    baseUrl: 'https://streamhub.net/channel/sport',
    documentTitle: 'Live Sports'
  };

  it('detects HLS .m3u8 master streams and escaped URLs', async () => {
    const html = `
      <script>
        var playerOptions = {
          autoplay: true,
          hlsUrl: "https:\\/\\/live.streamhub.net\\/hls\\/master.m3u8?token=xyz123"
        };
      </script>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://live.streamhub.net/hls/master.m3u8?token=xyz123');
    expect(candidates[0]?.format).toBe('m3u8');
    expect(candidates[0]?.sourceType).toBe('script_manifest');
    expect(candidates[0]?.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects JWPlayer file config and multiple qualities', async () => {
    const html = `
      <script>
        jwplayer("myPlayer").setup({
          file: "https://cdn.provider.com/videos/vod_1080p.mp4",
          image: "https://cdn.provider.com/poster.jpg"
        });
      </script>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://cdn.provider.com/videos/vod_1080p.mp4');
    expect(candidates[0]?.resolution).toBe('1080p (FHD)');
    expect(candidates[0]?.format).toBe('mp4');
  });

  it('ignores tracking scripts, images, and non-media assets', async () => {
    const html = `
      <script>
        var analytics = "https://google-analytics.com/video/track.js";
        var icon = "https://cdn.example.com/assets/video_icon.png";
      </script>
    `;

    const candidates = await extractor.extract(html, context);
    expect(candidates.length).toBe(0);
  });
});
