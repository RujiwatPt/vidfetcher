export type VideoSourceType =
  | 'html5_video'
  | 'html5_source'
  | 'opengraph'
  | 'twitter_card'
  | 'schema_jsonld'
  | 'script_manifest'
  | 'iframe_embed'
  | 'anchor_link';

export type VideoFormat =
  | 'mp4'
  | 'm3u8'
  | 'mpd'
  | 'webm'
  | 'ogg'
  | 'mov'
  | 'mkv'
  | 'embed'
  | 'unknown';

export interface EmbedInfo {
  provider: 'youtube' | 'vimeo' | 'dailymotion' | 'loom' | 'streamable' | 'rumble' | 'bilibili' | 'tiktok' | 'generic';
  embedUrl: string;
  videoId?: string;
}

export interface VideoCandidate {
  id: string;
  url: string;
  originalUrl: string;
  sourceType: VideoSourceType;
  format: VideoFormat;
  mimeType?: string;
  resolution?: string;
  quality?: string;
  title?: string;
  thumbnail?: string;
  duration?: string | number;
  confidence: number; // 0 to 100
  context: string;
  isDirectStream: boolean;
  embedInfo?: EmbedInfo;
  attributes?: Record<string, string>;
}

export interface PageMetadata {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  description?: string;
  favicon?: string;
  thumbnail?: string;
  siteName?: string;
  statusCode: number;
  contentType?: string;
  fetchedAt: string;
}

export interface ProbeResult {
  url: string;
  status: number;
  statusText: string;
  contentType?: string;
  contentLength?: number;
  formattedSize?: string;
  acceptRanges: boolean;
  isPlayable: boolean;
  headers: Record<string, string>;
  error?: string;
}

export interface ExtractorContext {
  baseUrl: string;
  documentTitle?: string;
  pageThumbnail?: string;
}

export interface ExtractionStats {
  totalFound: number;
  directPlayable: number;
  hlsStreams: number;
  dashStreams: number;
  embeds: number;
  scanDurationMs: number;
}

export interface FetchResult {
  success: boolean;
  metadata: PageMetadata;
  videos: VideoCandidate[];
  stats: ExtractionStats;
  error?: string;
}

export interface RawInspectorData {
  videoElements: Array<{
    src?: string | null;
    poster?: string | null;
    sources: Array<{ src?: string | null; type?: string | null }>;
    dataAttributes: Record<string, string>;
  }>;
  metaTags: Array<{ property?: string | null; name?: string | null; content?: string | null }>;
  jsonLdObjects: unknown[];
  iframes: Array<{ src?: string | null; title?: string | null }>;
  scriptMatches: string[];
}
