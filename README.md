# VideoFetcher 🎬

A modern, high-performance web application that extracts video stream and download links from any website by deeply analyzing the HTML, metadata, structured schema, embedded players, and inline JavaScript streaming configurations.

---

## ✨ Features

- **Universal Multi-Strategy Video Extraction**:
  - **HTML5 Elements**: Inspects `<video src>`, `<video poster>`, `<source src type>`, and lazy data attributes (`data-src`, `data-video-url`, `data-mp4`, `data-stream`, `data-hls-url`).
  - **Social & Metadata Tags**: Extracts OpenGraph (`og:video`, `og:video:url`, `og:video:secure_url`, `og:video:type`, dimensions) and Twitter Player Cards (`twitter:player:stream`, `twitter:player`).
  - **Schema.org Structured Data**: Deeply parses `<script type="application/ld+json">` for `VideoObject`, `Clip`, `contentUrl`, `embedUrl`, `duration`, `thumbnailUrl`, and handles `@graph` arrays.
  - **Inline JavaScript & Streaming Manifests**: Deep regex and JSON parser detecting `.m3u8` (HLS master streams), `.mpd` (DASH manifests), `.mp4`, `.webm`, `.mov`, escaped URLs (`https:\/\/...`), and player configurations (JWPlayer, Video.js, Plyr, FluidPlayer).
  - **Embedded Player Iframes**: Recognizes and formats iframes from YouTube, Vimeo, Dailymotion, Loom, Streamable, Rumble, Bilibili, and generic video embed players.
  - **Direct Video Anchor Links**: Detects `<a href="...">` pointing directly to video media files.
- **Deduplication & Confidence Ranking**:
  - Automatically merges identical streams discovered across multiple sources.
  - Boosts confidence scores for cross-verified streams.
  - Ranks direct playable streams (HLS 1080p > MP4 > WebM > Embeds) at the top.
- **In-Browser Video Playback with HLS.js**:
  - Native HTML5 video player for MP4, WebM.
  - Integrated HLS.js engine enabling live and VOD `.m3u8` stream playback directly inside the card in all modern browsers.
  - Inline preview for YouTube and Vimeo iframes.
- **Bypass CORS & Anti-Hotlink Protection via Streaming Proxy**:
  - `/api/proxy?url=...&referer=...&download=1` streams video files with the original website's `Referer` and proper `Content-Disposition: attachment; filename="..."` headers so users can download directly to disk without cross-origin blocks.
  - Supports HTTP `Range` headers for seeking during playback.
- **Real-Time Stream Diagnostics Modal**:
  - `/api/probe?url=...` inspects upstream HTTP status, Content-Type, Content-Length (formatted in KB/MB/GB), Accept-Ranges, and response headers.
- **Raw HTML Extraction Inspector**:
  - Direct trace view displaying exact DOM tags, meta tags, JSON-LD payloads, script matches, and iframes detected during extraction.
- **Polished Modern UI**:
  - Dark and Light mode toggle (persisted in localStorage).
  - One-click "Paste from Clipboard".
  - Quick test preset buttons.
  - Recent lookups history bar.
  - Toast copy notifications.

---

## 🏗️ Architecture

```
videofetcher/
├── src/
│   ├── types/                  # Domain contracts and ambient declarations
│   │   ├── bun.d.ts            # Bun & test runner type definitions
│   │   ├── htmlrewriter.d.ts   # HTMLRewriter interface
│   │   └── video.ts            # VideoCandidate, PageMetadata, FetchResult
│   ├── extractors/             # Extraction strategies (SOLID Open/Closed & SRP)
│   │   ├── base.ts             # IExtractor interface & normalization utilities
│   │   ├── html5-extractor.ts  # <video>, <source>, data attributes
│   │   ├── meta-extractor.ts   # OpenGraph, Twitter Cards, link rel="video_src"
│   │   ├── jsonld-extractor.ts # Schema.org VideoObject JSON-LD
│   │   ├── script-extractor.ts # .m3u8, .mpd, escaped URLs, player configs
│   │   ├── iframe-extractor.ts # YouTube, Vimeo, Dailymotion, Loom, embeds
│   │   ├── anchor-extractor.ts # Direct video links in <a> tags
│   │   └── pipeline.ts         # Composite extraction orchestrator & deduplicator
│   ├── services/
│   │   ├── http-client.ts      # Resilient HTTP fetcher with browser emulation
│   │   ├── probe-service.ts    # Stream header and size inspector
│   │   └── proxy-service.ts    # Range-capable streaming download proxy
│   └── server.ts               # HTTP server and REST API endpoints
├── public/                     # Frontend client dashboard
│   ├── index.html              # Modern, responsive UI layout
│   ├── app.css                 # Dark/light theme design system
│   └── app.js                  # Client logic, HLS.js player, history, probe modal
├── test/                       # 100% automated test suite (25 tests)
│   ├── html5-extractor.test.ts
│   ├── meta-extractor.test.ts
│   ├── jsonld-extractor.test.ts
│   ├── script-extractor.test.ts
│   ├── iframe-extractor.test.ts
│   ├── pipeline.test.ts
│   └── server.test.ts
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.2+) or Node.js

### Running the App

```bash
# Start development server with hot-reload
bun run dev

# Or start standard production server
bun run start
```

The web application will be accessible at:
👉 **`http://localhost:3000`**

---

## 🧪 Testing & Verification

Run the automated test suite:

```bash
# Run all unit and integration tests
bun test
```

Run TypeScript strict type checking:

```bash
# Verify static types (zero errors)
bun run typecheck
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/fetch` | Extracts video streams from given URL `{ url: string }` |
| `GET` | `/api/probe?url=...&referer=...` | Probes upstream stream headers, Content-Type, file size, status |
| `GET` | `/api/proxy?url=...&referer=...&download=1` | Proxies media stream / downloads video with CORS & referer bypass |
| `GET` | `/api/health` | Healthcheck returning server uptime and status |

---

## 📄 License

MIT
