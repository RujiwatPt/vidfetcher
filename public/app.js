// VideoFetcher Client Application

(function () {
  'use strict';

  // Global State
  let currentExtractionData = null;
  let activeFilter = 'all';
  let activeInspectorSubtab = 'videos';
  const HISTORY_STORAGE_KEY = 'videofetcher_history';
  const THEME_STORAGE_KEY = 'videofetcher_theme';

  // DOM Elements
  const fetchForm = document.getElementById('fetchForm');
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const submitBtn = document.getElementById('submitBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const apiStatus = document.getElementById('apiStatus');

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const resultsSection = document.getElementById('resultsSection');

  // Summary elements
  const pageTitle = document.getElementById('pageTitle');
  const pageFavicon = document.getElementById('pageFavicon');
  const pageFinalUrl = document.getElementById('pageFinalUrl');
  const pageLink = document.getElementById('pageLink');
  const pageDescription = document.getElementById('pageDescription');

  // Stats elements
  const statTotal = document.getElementById('statTotal');
  const statDirect = document.getElementById('statDirect');
  const statHls = document.getElementById('statHls');
  const statEmbeds = document.getElementById('statEmbeds');
  const statDuration = document.getElementById('statDuration');

  // Filter counters
  const countAll = document.getElementById('countAll');
  const countDirect = document.getElementById('countDirect');
  const countHls = document.getElementById('countHls');
  const countEmbeds = document.getElementById('countEmbeds');

  const videoCardsGrid = document.getElementById('videoCardsGrid');
  const rawInspectorPanel = document.getElementById('rawInspectorPanel');
  const inspectorCode = document.getElementById('inspectorCode');

  // Modal elements
  const probeModal = document.getElementById('probeModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const closeModalFooterBtn = document.getElementById('closeModalFooterBtn');
  const probeLoading = document.getElementById('probeLoading');
  const probeResults = document.getElementById('probeResults');
  const probeStatus = document.getElementById('probeStatus');
  const probeContentType = document.getElementById('probeContentType');
  const probeSize = document.getElementById('probeSize');
  const probeRanges = document.getElementById('probeRanges');
  const probeHeadersCode = document.getElementById('probeHeadersCode');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');

  // History elements
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  // 1. Initialize Application
  function init() {
    initTheme();
    initHistory();
    checkHealth();
    bindEvents();
  }

  // 2. Event Listeners
  function bindEvents() {
    fetchForm.addEventListener('submit', handleFormSubmit);

    // Paste button
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text.trim();
          urlInput.focus();
        }
      } catch {
        showToast('Please allow clipboard access or paste manually');
      }
    });

    // Theme toggle
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Preset sample chips
    document.querySelectorAll('.sample-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const url = chip.getAttribute('data-url');
        if (url) {
          urlInput.value = url;
          fetchVideos(url);
        }
      });
    });

    // History clear
    clearHistoryBtn.addEventListener('click', clearHistory);

    // Export / Download all video URLs
    downloadAllBtn?.addEventListener('click', handleExportAllUrls);

    // Filter tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-filter') || 'all';
        renderVideos();
      });
    });

    // Raw Inspector subtabs
    document.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeInspectorSubtab = btn.getAttribute('data-subtab') || 'videos';
        renderInspectorContent();
      });
    });

    // Modal close events
    closeModalBtn.addEventListener('click', closeModal);
    closeModalFooterBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && probeModal.style.display !== 'none') {
        closeModal();
      }
    });
  }

  // 3. Theme Handling
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  }

  // 4. API Health Check
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        apiStatus.style.display = 'flex';
      }
    } catch {
      apiStatus.style.display = 'none';
    }
  }

  // 5. Form Submit & Fetching
  async function handleFormSubmit(e) {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    await fetchVideos(url);
  }

  async function fetchVideos(targetUrl) {
    showLoading(true);
    hideError();
    resultsSection.style.display = 'none';

    try {
      const response = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch video streams');
      }

      currentExtractionData = data;
      saveToHistory(targetUrl, data.metadata.title);
      renderResults(data);
    } catch (err) {
      showError(err.message || 'Error occurred while contacting video fetcher service');
    } finally {
      showLoading(false);
    }
  }

  // 6. Render Results
  function renderResults(data) {
    resultsSection.style.display = 'block';

    // Summary metadata
    pageTitle.textContent = data.metadata.title || 'Untitled Page';
    pageFinalUrl.textContent = data.metadata.finalUrl;
    pageLink.href = data.metadata.finalUrl;
    pageDescription.textContent = data.metadata.description || 'No meta description found.';

    if (data.metadata.favicon) {
      pageFavicon.src = data.metadata.favicon;
      pageFavicon.style.display = 'inline-block';
    } else {
      pageFavicon.style.display = 'none';
    }

    // Stats
    statTotal.textContent = data.stats.totalFound;
    statDirect.textContent = data.stats.directPlayable;
    statHls.textContent = data.stats.hlsStreams;
    statEmbeds.textContent = data.stats.embeds;
    statDuration.textContent = `${data.stats.scanDurationMs}ms`;

    // Filter counts
    countAll.textContent = data.videos.length;
    countDirect.textContent = data.videos.filter((v) => v.isDirectStream).length;
    countHls.textContent = data.videos.filter((v) => v.format === 'm3u8').length;
    countEmbeds.textContent = data.videos.filter((v) => v.format === 'embed').length;

    // Subtab counts
    const inspector = data.rawInspector || {};
    document.getElementById('subtabVideoCount').textContent = (inspector.videoElements || []).length;
    document.getElementById('subtabMetaCount').textContent = (inspector.metaTags || []).length;
    document.getElementById('subtabJsonCount').textContent = (inspector.jsonLdObjects || []).length;
    document.getElementById('subtabScriptCount').textContent = (inspector.scriptMatches || []).length;
    document.getElementById('subtabIframeCount').textContent = (inspector.iframes || []).length;

    // Reset filter and render
    activeFilter = 'all';
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-filter="all"]')?.classList.add('active');

    renderVideos();
    renderInspectorContent();
  }

  // 7. Render Video Grid
  function renderVideos() {
    if (!currentExtractionData) return;

    if (activeFilter === 'inspector') {
      videoCardsGrid.style.display = 'none';
      rawInspectorPanel.style.display = 'block';
      return;
    }

    videoCardsGrid.style.display = 'grid';
    rawInspectorPanel.style.display = 'none';
    videoCardsGrid.innerHTML = '';

    const allVideos = currentExtractionData.videos;
    let filtered = allVideos;

    if (activeFilter === 'direct') {
      filtered = allVideos.filter((v) => v.isDirectStream);
    } else if (activeFilter === 'hls') {
      filtered = allVideos.filter((v) => v.format === 'm3u8');
    } else if (activeFilter === 'embeds') {
      filtered = allVideos.filter((v) => v.format === 'embed');
    }

    if (filtered.length === 0) {
      videoCardsGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 2.5rem;">
          <p style="color: var(--text-muted); font-size: 1rem;">No video streams found for the selected filter.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((video, index) => {
      const card = createVideoCard(video, index);
      videoCardsGrid.appendChild(card);
    });
  }

  // 8. Create Video Card Element
  function createVideoCard(video, index) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const formatPillClass = `pill-${video.format || 'unknown'}`;
    const formatLabel = (video.format || 'unknown').toUpperCase();
    const resolutionPill = video.resolution ? `<span class="pill pill-res">${escapeHtml(video.resolution)}</span>` : '';
    const sourceLabel = formatSourceLabel(video.sourceType);

    // Suggested sanitized filename
    const suggestedFilename = getFilenameForVideo(video);

    // Media Player Container HTML
    const mediaContainerId = `player-container-${index}`;

    card.innerHTML = `
      <div class="video-media-wrapper" id="${mediaContainerId}">
        ${createMediaPreviewHtml(video, index)}
      </div>

      <div class="video-card-body">
        <div class="badge-row">
          <span class="pill ${formatPillClass}">${formatLabel}</span>
          <span class="pill pill-source">${sourceLabel}</span>
          ${resolutionPill}
          <span class="pill" style="margin-left: auto; background-color: var(--bg-primary); color: var(--text-muted); font-size: 0.7rem;">
            ${video.confidence}% Conf.
          </span>
        </div>

        <h3 class="card-video-title" title="${escapeHtml(video.title || '')}">${escapeHtml(video.title || 'Video Stream')}</h3>

        <div class="context-row" title="${escapeHtml(video.context)}">
          ${escapeHtml(video.context)}
        </div>

        <div class="url-container">
          <div class="url-header-row">
            <span>Video Stream URL</span>
            <button type="button" class="url-copy-link" data-url="${escapeHtml(video.url)}" title="Copy full URL to clipboard">Copy</button>
          </div>
          <div class="url-preview-row" title="Full video URL (Click to select all)">${escapeHtml(video.url)}</div>
        </div>

        <div class="card-actions">
          ${
            video.isDirectStream
              ? `<a href="/api/proxy?url=${encodeURIComponent(video.url)}&referer=${encodeURIComponent(currentExtractionData?.metadata?.finalUrl || '')}&download=1&filename=${encodeURIComponent(suggestedFilename)}"
                    class="btn btn-primary download-btn"
                    download="${escapeHtml(suggestedFilename)}"
                    title="Download video file via high-speed proxy (bypasses CORS & Referer restrictions)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    ${video.format === 'm3u8' ? 'Download M3U8 Playlist' : 'Download Video'}
                 </a>
                 ${
                   video.format === 'm3u8'
                     ? `<button class="btn btn-secondary ffmpeg-btn" data-url="${escapeHtml(video.url)}" title="Copy ffmpeg command to convert and download full MP4 from this HLS stream">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="4 17 10 11 4 5"></polyline>
                            <line x1="12" y1="19" x2="20" y2="19"></line>
                          </svg>
                          ffmpeg CMD
                        </button>`
                     : ''
                 }
                 <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary direct-link-btn" title="Open direct media URL in new tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Direct Link
                 </a>`
              : `<a href="${escapeHtml(video.embedInfo?.embedUrl || video.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary download-btn" title="Open embed player in new window">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open Player
                 </a>
                 <button class="btn btn-secondary ytdlp-btn" data-url="${escapeHtml(video.url)}" title="Copy yt-dlp command to download this video">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <polyline points="4 17 10 11 4 5"></polyline>
                      <line x1="12" y1="19" x2="20" y2="19"></line>
                    </svg>
                    yt-dlp CMD
                 </button>`
          }
          <button class="btn btn-secondary copy-btn" data-url="${escapeHtml(video.url)}" title="Copy video stream URL to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy URL
          </button>
          <button class="btn btn-secondary probe-btn" data-url="${escapeHtml(video.url)}" title="Inspect HTTP headers, size, and status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Inspect
          </button>
        </div>
      </div>
    `;

    // Attach card event listeners
    const urlCopyLink = card.querySelector('.url-copy-link');
    urlCopyLink?.addEventListener('click', () => {
      copyToClipboard(video.url);
    });

    const urlPreviewRow = card.querySelector('.url-preview-row');
    urlPreviewRow?.addEventListener('click', () => {
      if (window.getSelection && document.createRange) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(urlPreviewRow);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });

    const copyBtn = card.querySelector('.copy-btn');
    copyBtn?.addEventListener('click', () => {
      copyToClipboard(video.url);
    });

    const ffmpegBtn = card.querySelector('.ffmpeg-btn');
    ffmpegBtn?.addEventListener('click', () => {
      const cmd = `ffmpeg -i "${video.url}" -c copy -bsf:a aac_adtstoasc "video.mp4"`;
      copyToClipboard(cmd);
      showToast('ffmpeg command copied! Run in terminal to save full MP4.');
    });

    const ytdlpBtn = card.querySelector('.ytdlp-btn');
    ytdlpBtn?.addEventListener('click', () => {
      const cmd = `yt-dlp "${video.url}"`;
      copyToClipboard(cmd);
      showToast('yt-dlp command copied! Run in terminal to download.');
    });

    const probeBtn = card.querySelector('.probe-btn');
    probeBtn?.addEventListener('click', () => {
      openProbeModal(video.url);
    });

    const playOverlayBtn = card.querySelector('.play-overlay-btn');
    playOverlayBtn?.addEventListener('click', () => {
      startVideoPlayback(mediaContainerId, video);
    });

    return card;
  }

  function createMediaPreviewHtml(video, index) {
    if (video.thumbnail) {
      return `
        <img src="${escapeHtml(video.thumbnail)}" alt="Preview" class="video-thumbnail-placeholder" onerror="this.style.display='none'">
        <button class="play-overlay-btn" title="Play Video" aria-label="Play Video">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
      `;
    }

    if (video.format === 'embed' && video.embedInfo?.embedUrl) {
      return `
        <iframe src="${escapeHtml(video.embedInfo.embedUrl)}"
                class="video-iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>
      `;
    }

    // Default playable card
    return `
      <div style="color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="7" y1="2" x2="7" y2="22"></line>
          <line x1="17" y1="2" x2="17" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="2" y1="7" x2="7" y2="7"></line>
          <line x1="2" y1="17" x2="7" y2="17"></line>
          <line x1="17" y1="17" x2="22" y2="17"></line>
          <line x1="17" y1="7" x2="22" y2="7"></line>
        </svg>
        <button class="btn btn-secondary play-overlay-btn" style="position: static; width: auto; height: auto; border-radius: var(--radius-md); padding: 0.4rem 0.85rem; font-size: 0.8rem;">
          Load Video Player
        </button>
      </div>
    `;
  }

  // 9. Interactive Video Player Launcher
  function startVideoPlayback(containerId, video) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Check if it's an iframe embed
    if (video.format === 'embed' && video.embedInfo?.embedUrl) {
      container.innerHTML = `
        <iframe src="${escapeHtml(video.embedInfo.embedUrl)}"
                class="video-iframe"
                allow="autoplay; encrypted-media; fullscreen"
                allowfullscreen></iframe>
      `;
      return;
    }

    // Direct proxy stream URL to avoid CORS/Referer issues
    const referer = currentExtractionData?.metadata?.finalUrl || '';
    const streamUrl = `/api/proxy?url=${encodeURIComponent(video.url)}&referer=${encodeURIComponent(referer)}`;

    const videoEl = document.createElement('video');
    videoEl.className = 'video-player';
    videoEl.controls = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;

    container.innerHTML = '';
    container.appendChild(videoEl);

    // HLS.js streaming support
    if (video.format === 'm3u8') {
      if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        const hls = new window.Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoEl);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        videoEl.src = streamUrl;
        videoEl.play().catch(() => {});
      } else {
        videoEl.src = streamUrl;
      }
    } else {
      // Standard MP4 / WebM
      videoEl.src = streamUrl;
      videoEl.play().catch(() => {});
    }
  }

  // 10. Raw Inspector Renderer
  function renderInspectorContent() {
    if (!currentExtractionData || !currentExtractionData.rawInspector) return;
    const inspector = currentExtractionData.rawInspector;

    let displayData = null;
    if (activeInspectorSubtab === 'videos') {
      displayData = inspector.videoElements || [];
    } else if (activeInspectorSubtab === 'meta') {
      displayData = inspector.metaTags || [];
    } else if (activeInspectorSubtab === 'jsonld') {
      displayData = inspector.jsonLdObjects || [];
    } else if (activeInspectorSubtab === 'scripts') {
      displayData = inspector.scriptMatches || [];
    } else if (activeInspectorSubtab === 'iframes') {
      displayData = inspector.iframes || [];
    }

    inspectorCode.textContent = JSON.stringify(displayData, null, 2);
  }

  // 11. Stream Diagnostics Modal (/api/probe)
  async function openProbeModal(url) {
    probeModal.style.display = 'flex';
    probeLoading.style.display = 'flex';
    probeResults.style.display = 'none';

    try {
      const referer = currentExtractionData?.metadata?.finalUrl || '';
      if (modalDownloadBtn) {
        modalDownloadBtn.href = `/api/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&download=1`;
      }

      const res = await fetch(`/api/probe?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`);
      const data = await res.json();

      probeLoading.style.display = 'none';
      probeResults.style.display = 'block';

      probeStatus.textContent = `${data.status} ${data.statusText || ''}`;
      probeStatus.style.color = data.status >= 200 && data.status < 400 ? 'var(--success)' : 'var(--danger)';

      probeContentType.textContent = data.contentType || 'unknown';
      probeSize.textContent = data.formattedSize || 'Unknown size';
      probeRanges.textContent = data.acceptRanges ? 'Supported (Bytes)' : 'Not Advertised';
      probeRanges.style.color = data.acceptRanges ? 'var(--success)' : 'var(--text-muted)';

      if (modalDownloadBtn && data.contentType) {
        const ext = data.contentType.includes('mpegurl') ? 'm3u8' : (data.contentType.includes('webm') ? 'webm' : 'mp4');
        modalDownloadBtn.download = `video.${ext}`;
      }

      probeHeadersCode.textContent = JSON.stringify(data.headers || {}, null, 2);
    } catch (err) {
      probeLoading.style.display = 'none';
      probeResults.style.display = 'block';
      probeStatus.textContent = 'Failed';
      probeStatus.style.color = 'var(--danger)';
      probeHeadersCode.textContent = String(err);
    }
  }

  function handleExportAllUrls() {
    if (!currentExtractionData || !currentExtractionData.videos.length) {
      showToast('No videos available to export.');
      return;
    }
    const meta = currentExtractionData.metadata;
    const lines = [
      `# VideoFetcher URL Export`,
      `# Page Title: ${meta.title || 'Untitled'}`,
      `# Page URL: ${meta.finalUrl || meta.requestedUrl}`,
      `# Extracted At: ${new Date().toISOString()}`,
      `# Total Discovered Videos: ${currentExtractionData.videos.length}`,
      ``,
      `# List of Video Stream URLs (importable into IDM / JDownloader / aria2):`,
      ``
    ];

    currentExtractionData.videos.forEach((v, i) => {
      lines.push(`${i + 1}. [${(v.format || 'unknown').toUpperCase()}] ${v.title || 'Video'}`);
      lines.push(`   URL: ${v.url}`);
      lines.push(`   Source: ${v.sourceType} (${v.confidence}% confidence)`);
      if (v.resolution) lines.push(`   Resolution: ${v.resolution}`);
      lines.push(``);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `videofetcher_links_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    showToast(`Exported ${currentExtractionData.videos.length} video URLs to .txt!`);
  }

  function closeModal() {
    probeModal.style.display = 'none';
  }

  // 12. History Storage
  function initHistory() {
    renderHistory();
  }

  function getHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveToHistory(url, title) {
    const list = getHistory().filter((item) => item.url !== url);
    list.unshift({ url, title: title || url, timestamp: Date.now() });
    if (list.length > 8) list.pop();
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
    renderHistory();
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    renderHistory();
  }

  function renderHistory() {
    const items = getHistory();
    if (items.length === 0) {
      historySection.style.display = 'none';
      return;
    }

    historySection.style.display = 'block';
    historyList.innerHTML = '';

    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.title = `${item.title} (${item.url})`;
      el.textContent = item.title;
      el.addEventListener('click', () => {
        urlInput.value = item.url;
        fetchVideos(item.url);
      });
      historyList.appendChild(el);
    });
  }

  // 13. Helpers
  function showLoading(show) {
    loadingState.style.display = show ? 'block' : 'none';
    submitBtn.disabled = show;
    submitBtn.querySelector('.btn-text').style.display = show ? 'none' : 'inline';
    submitBtn.querySelector('.spinner').style.display = show ? 'inline-block' : 'none';
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorState.style.display = 'flex';
  }

  function hideError() {
    errorState.style.display = 'none';
  }

  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Video URL copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy URL');
    });
  }

  function formatSourceLabel(sourceType) {
    switch (sourceType) {
      case 'html5_video': return 'HTML5 <video>';
      case 'html5_source': return 'HTML5 <source>';
      case 'opengraph': return 'OpenGraph';
      case 'twitter_card': return 'Twitter Card';
      case 'schema_jsonld': return 'Schema.org';
      case 'script_manifest': return 'Script Stream';
      case 'iframe_embed': return 'Iframe Embed';
      case 'anchor_link': return 'Direct Link';
      default: return 'Web Extractor';
    }
  }

  function getFilenameForVideo(video) {
    if (!video) return 'video.mp4';
    const cleanTitle = (video.title || 'video')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 45);
    const ext = video.format === 'm3u8' ? 'm3u8' : (video.format === 'webm' ? 'webm' : (video.format === 'mov' ? 'mov' : 'mp4'));
    return `${cleanTitle || 'video'}.${ext}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start app
  init();
})();
