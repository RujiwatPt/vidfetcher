import { describe, expect, it } from 'bun:test';
import { JsonLdExtractor } from '../src/extractors/jsonld-extractor.ts';
import type { ExtractorContext } from '../src/types/video.ts';

describe('JsonLdExtractor', () => {
  const extractor = new JsonLdExtractor();
  const context: ExtractorContext = {
    baseUrl: 'https://video.example.com/watch?v=1',
    documentTitle: 'Site Title'
  };

  it('extracts Schema.org VideoObject with contentUrl and metadata', async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "Nature Documentary 4K",
            "description": "Breathtaking views of the forest",
            "thumbnailUrl": "https://video.example.com/nature_thumb.jpg",
            "uploadDate": "2026-01-01T00:00:00Z",
            "duration": "PT2M30S",
            "contentUrl": "https://cdn.example.com/nature_4k.mp4",
            "embedUrl": "https://video.example.com/embed/1"
          }
          </script>
        </head>
      </html>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(2);

    const direct = candidates.find((c) => c.url === 'https://cdn.example.com/nature_4k.mp4');
    expect(direct).toBeDefined();
    expect(direct?.sourceType).toBe('schema_jsonld');
    expect(direct?.format).toBe('mp4');
    expect(direct?.title).toBe('Nature Documentary 4K');
    expect(direct?.thumbnail).toBe('https://video.example.com/nature_thumb.jpg');
    expect(direct?.duration).toBe('PT2M30S');
    expect(direct?.isDirectStream).toBe(true);

    const embed = candidates.find((c) => c.url === 'https://video.example.com/embed/1');
    expect(embed).toBeDefined();
    expect(embed?.isDirectStream).toBe(false);
  });

  it('handles @graph arrays and nested video objects', async () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "name": "Article with video"
          },
          {
            "@type": "VideoObject",
            "name": "Nested Graph Video",
            "contentUrl": "/streams/master.m3u8"
          }
        ]
      }
      </script>
    `;

    const candidates = await extractor.extract(html, context);

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.url).toBe('https://video.example.com/streams/master.m3u8');
    expect(candidates[0]?.format).toBe('m3u8');
    expect(candidates[0]?.title).toBe('Nested Graph Video');
  });

  it('gracefully skips invalid JSON', async () => {
    const html = `
      <script type="application/ld+json">
        { not valid json here }
      </script>
    `;

    const candidates = await extractor.extract(html, context);
    expect(candidates.length).toBe(0);
  });
});
