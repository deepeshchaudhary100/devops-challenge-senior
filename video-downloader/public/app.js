/* ==========================================================================
   StreamTube — YouTube-Inspired Client Application Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const videoGrid = document.getElementById('videoGrid');
  const feedContainer = document.getElementById('feedContainer');
  const feedTitle = document.getElementById('feedTitle');
  const feedSubtitle = document.getElementById('feedSubtitle');
  const chipsBar = document.getElementById('chipsBar');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const homeLogo = document.getElementById('homeLogo');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const toastContainer = document.getElementById('toastContainer');

  // Watch View Elements
  const watchView = document.getElementById('watchView');
  const playerContainer = document.getElementById('playerContainer');
  const playerQuickDlBtn = document.getElementById('playerQuickDlBtn');
  const watchTitle = document.getElementById('watchTitle');
  const watchChannel = document.getElementById('watchChannel');
  const watchAvatar = document.getElementById('watchAvatar');
  const watchViews = document.getElementById('watchViews');
  const watchDesc = document.getElementById('watchDesc');
  const formatList = document.getElementById('formatList');
  const relatedList = document.getElementById('relatedList');
  const closeWatchBtn = document.getElementById('closeWatchBtn');
  const scrollToDownloadBtn = document.getElementById('scrollToDownloadBtn');
  const shareBtn = document.getElementById('shareBtn');

  // Browser View Elements
  const browserView = document.getElementById('browserView');
  const browserCloseBtn = document.getElementById('browserCloseBtn');
  const browserUrlInput = document.getElementById('browserUrlInput');
  const proxyFrame = document.getElementById('proxyFrame');
  const browserLoading = document.getElementById('browserLoading');


  // App State
  let currentCategory = 'all';
  let cachedVideos = [];
  let currentVideo = null;
  let activeFormatTab = 'video';
  let currentFormats = [];

  // ==========================================================================
  // Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
  }

  // ==========================================================================
  // In-App Browser & Video Detector Integration
  // ==========================================================================
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'STREAMTUBE_DOWNLOAD') {
      const { url, title } = event.data;
      showToast('Video detected! Opening download options...');
      
      browserView.classList.add('hidden');
      
      openWatchView({
        url: url,
        title: title || 'Detected Web Video',
        channel: { name: 'Web Extract' },
        views: 'External Site',
        duration: 'Media',
        thumbnail: '',
        platform: 'web'
      });
    }

    if (event.data && event.data.type === 'STREAMTUBE_NAVIGATE') {
      const { url } = event.data;
      if (url) {
        console.log('[App] Navigating in-app browser to:', url);
        // If clicking a video watch page, route directly to Player & Downloader
        if (/view_video\.php|watch\?v=|youtu\.be|tiktok\.com|reel\/|instagram\.com\/p\//i.test(url)) {
          browserView.classList.add('hidden');
          showToast('Extracting video for playback & download...', 'info');
          openWatchView({
            url: url,
            title: 'Selected Video',
            channel: { name: 'Web Source' },
            views: 'Online',
            duration: 'Media',
            thumbnail: '',
            platform: /pornhub/i.test(url) ? 'pornhub' : (/instagram/i.test(url) ? 'instagram' : 'youtube')
          });
          return;
        }
        openBrowser(url);
      }
    }
  });

  function openBrowser(url) {
    feedContainer.classList.add('hidden');
    chipsBar.classList.add('hidden');
    watchView.classList.add('hidden');
    browserView.classList.remove('hidden');
    
    browserUrlInput.value = url;
    browserLoading.style.display = 'flex';
    
    proxyFrame.src = `/api/proxy?url=${encodeURIComponent(url)}`;
    
    proxyFrame.onload = () => {
      browserLoading.style.display = 'none';
    };
  }

  if (browserCloseBtn) {
    browserCloseBtn.addEventListener('click', () => {
      browserView.classList.add('hidden');
      feedContainer.classList.remove('hidden');
      chipsBar.classList.remove('hidden');
      proxyFrame.src = '';
    });
  }

  const browserGoBtn = document.getElementById('browserGoBtn');
  const browserExtractBtn = document.getElementById('browserExtractBtn');
  const browserNewTabBtn = document.getElementById('browserNewTabBtn');

  function handleBrowserNavigate() {
    let url = (browserUrlInput ? browserUrlInput.value : '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    
    // If it's a known video platform, route directly to the player & downloader!
    if (/youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|twitter\.com|x\.com|vimeo\.com|pornhub\.com|view_video\.php/i.test(url)) {
      browserView.classList.add('hidden');
      showToast('Extracting video for playback & download...', 'info');
      openWatchView({
        url: url,
        title: 'Video Stream',
        channel: { name: 'Online Source' },
        views: 'Direct Link',
        duration: 'Media',
        thumbnail: '',
        platform: /pornhub/i.test(url) ? 'pornhub' : (/instagram\.com/i.test(url) ? 'instagram' : 'youtube')
      });
      return;
    }

    openBrowser(url);
  }

  if (browserUrlInput) {
    browserUrlInput.removeAttribute('readonly');
    browserUrlInput.disabled = false;
    browserUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleBrowserNavigate();
    });
  }

  if (browserGoBtn) {
    browserGoBtn.addEventListener('click', handleBrowserNavigate);
  }

  if (browserExtractBtn) {
    browserExtractBtn.addEventListener('click', () => {
      const url = browserUrlInput ? browserUrlInput.value.trim() : '';
      if (!url) {
        showToast('Please enter a webpage URL first', 'error');
        return;
      }
      showToast('Extracting video from page...', 'info');
      browserView.classList.add('hidden');
      openWatchView({
        url: url,
        title: 'Extracted Webpage Video',
        channel: { name: 'Web Source' },
        views: 'Web Extract',
        duration: 'Media',
        thumbnail: '',
        platform: 'web'
      });
    });
  }

  if (browserNewTabBtn) {
    browserNewTabBtn.addEventListener('click', () => {
      let url = browserUrlInput ? browserUrlInput.value.trim() : '';
      if (!url) url = 'https://www.bing.com';
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast('Opened in regular browser tab');
    });
  }


  // ==========================================================================
  // 1. Fetch & Render Feed (Trending, Reels & Categories)
  // ==========================================================================
  async function loadFeed(category = 'all') {
    showLoadingSkeleton();
    feedTitle.textContent = getCategoryTitle(category);
    feedSubtitle.textContent = category === 'reels' ? 'Watch and download public Instagram Reels instantly' : 'Explore popular videos to watch & download';

    try {
      const endpoint = category === 'reels' ? '/api/reels' : `/api/trending?category=${encodeURIComponent(category)}`;
      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.success && data.videos && data.videos.length > 0) {
        cachedVideos = data.videos;
        renderVideoCards(data.videos);
      } else {
        videoGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary);">
            <h3>No videos found</h3>
            <p>Try selecting another category or searching for a topic.</p>
          </div>
        `;
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
      videoGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--accent-red);">
          <h3>Error loading videos</h3>
          <p>Please ensure the local server is running.</p>
        </div>
      `;
    }
  }

  function getCategoryTitle(category) {
    switch (category) {
      case 'trending': return '🔥 Trending Videos';
      case 'reels': return '📸 Instagram Reels & Public Clips';
      case 'music': return '🎵 Trending Music';
      case 'gaming': return '🎮 Gaming Highlights';
      case 'tech': return '⚡ Technology & AI';
      case 'news': return '📰 World News & Reports';
      case 'podcasts': return '🎙 Popular Podcasts';
      case 'shorts': return '📱 Viral Shorts';
      default: return 'Trending Videos';
    }
  }

  function showLoadingSkeleton() {
    let skeletons = '';
    for (let i = 0; i < 8; i++) {
      skeletons += `
        <div class="video-card" style="opacity: 0.6; pointer-events: none;">
          <div class="card-thumb-wrapper" style="background: var(--bg-tertiary);"></div>
          <div class="card-details">
            <div class="card-avatar" style="background: var(--bg-tertiary);"></div>
            <div class="card-meta" style="display:flex; flex-direction:column; gap:8px;">
              <div style="height: 14px; background: var(--bg-tertiary); border-radius: 4px; width: 90%;"></div>
              <div style="height: 12px; background: var(--bg-tertiary); border-radius: 4px; width: 60%;"></div>
            </div>
          </div>
        </div>
      `;
    }
    videoGrid.innerHTML = skeletons;
  }

  function renderVideoCards(videos) {
    videoGrid.innerHTML = '';
    videos.forEach(video => {
      const card = document.createElement('div');
      card.className = 'video-card';
      const isInstagram = video.platform === 'instagram';

      card.innerHTML = `
        <div class="card-thumb-wrapper">
          <img class="card-thumb" src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy" />
          <span class="card-duration">${video.duration}</span>
          ${isInstagram ? '<span style="position:absolute; top:8px; left:8px; background:var(--ig-gradient); color:white; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px;">Reel</span>' : ''}
          <div class="card-play-overlay">
            <div class="card-play-btn">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
        </div>
        <div class="card-details">
          <div class="card-avatar" style="${isInstagram ? 'background:var(--ig-gradient); color:white;' : ''}">
            ${video.channel.icon ? `<img src="${video.channel.icon}" alt="" />` : (video.channel.name ? video.channel.name.charAt(0).toUpperCase() : 'C')}
          </div>
          <div class="card-meta">
            <h3 class="card-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</h3>
            <div class="card-channel">
              <span>${escapeHtml(video.channel.name)}</span>
              ${video.channel.verified ? `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="var(--text-muted)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              ` : ''}
            </div>
            <div class="card-stats">
              <span>${video.views}</span> • <span>${video.uploadedAt}</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn play-action">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Play</span>
          </button>
          <button class="card-action-btn dl-action">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          </button>
        </div>
      `;

      // Entire card or Play button click opens watch view
      card.addEventListener('click', () => {
        openWatchView(video);
      });

      // Download button on card opens player and scrolls to download studio
      const dlBtn = card.querySelector('.dl-action');
      if (dlBtn) {
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openWatchView(video);
          setTimeout(() => {
            const studio = document.getElementById('downloadStudio');
            if (studio) studio.scrollIntoView({ behavior: 'smooth' });
          }, 350);
        });
      }

      videoGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // 2. Search & Direct Link Handler
  // ==========================================================================
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    // Check if it's a direct URL (YouTube, Instagram, Facebook, Pornhub)
    if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|pornhub\.com)\/.+/i.test(query) || /view_video\.php/i.test(query)) {
      const isIg = /instagram\.com/i.test(query);
      const isPh = /pornhub\.com|view_video\.php/i.test(query);
      showToast(isIg ? 'Analyzing Instagram Reel / Video link...' : (isPh ? 'Analyzing video link...' : 'Analyzing video link...'), 'info');
      
      openWatchView({
        url: query,
        title: isIg ? 'Instagram Reel / Video' : (isPh ? 'Web Video' : 'Direct Video Link'),
        channel: { name: isIg ? 'Instagram Creator' : (isPh ? 'Pornhub Creator' : 'Online Video') },
        views: 'Direct Link',
        duration: 'Media',
        thumbnail: '',
        platform: isIg ? 'instagram' : (isPh ? 'pornhub' : 'youtube')
      });
      return;
    }

    // Check if it's a generic link — try to extract video first, then fall back to browser
    if (/^https?:\/\//i.test(query)) {
      showToast('🔍 Scanning webpage for videos...', 'info');
      showLoadingSkeleton();
      feedTitle.textContent = 'Extracting video from webpage...';
      feedSubtitle.textContent = query;
      closeWatchView();
      if (browserView) browserView.classList.add('hidden');
      feedContainer.classList.remove('hidden');
      chipsBar.classList.add('hidden');

      try {
        const extractRes = await fetch(`/api/extract?url=${encodeURIComponent(query)}`);
        const extractData = await extractRes.json();

        if (extractData.success) {
          // Found video — show it in the watch view
          showToast('✅ Video found! Opening player...');
          feedContainer.classList.add('hidden');
          openWatchView({
            url: extractData.originalUrl,
            title: extractData.title || 'Web Video',
            channel: { name: extractData.uploader || 'Web Source' },
            views: extractData.duration || '',
            duration: extractData.duration || '',
            thumbnail: extractData.thumbnail || '',
            platform: 'web',
            directFormats: extractData.formats
          });
        } else {
          // Could not extract — open the in-app browser instead
          showToast('No video found automatically. Opening in browser...', 'info');
          feedContainer.classList.add('hidden');
          openBrowser(query);
        }
      } catch (extractErr) {
        showToast('Opening in browser instead...', 'info');
        feedContainer.classList.add('hidden');
        openBrowser(query);
      }
      return;
    }

    // Otherwise, perform topic search
    showLoadingSkeleton();
    feedTitle.textContent = `Search results for "${query}"`;
    feedSubtitle.textContent = 'Select a video to stream or download';
    closeWatchView();

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.success && data.videos && data.videos.length > 0) {
        cachedVideos = data.videos;
        renderVideoCards(data.videos);
      } else {
        videoGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary);">
            <h3>No results found for "${escapeHtml(query)}"</h3>
            <p>Try searching for a different keyword or paste a direct video link.</p>
          </div>
        `;
      }
    } catch (err) {
      console.error('Search error:', err);
      showToast('Search request failed', 'error');
    }
  });

  // Paste Button Helper
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        searchInput.value = text;
        searchForm.dispatchEvent(new Event('submit'));
      }
    } catch (err) {
      showToast('Clipboard access denied. Please paste manually.', 'error');
    }
  });

  // ==========================================================================
  // 3. Watch & Video Player Experience (FIXED)
  // ==========================================================================
  async function openWatchView(video) {
    currentVideo = video;

    // Explicitly toggle views
    feedContainer.classList.add('hidden');
    chipsBar.classList.add('hidden');
    watchView.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Video metadata placeholders
    watchTitle.textContent = video.title || 'Loading video...';
    watchChannel.textContent = video.channel ? video.channel.name : 'Creator';
    watchViews.textContent = `${video.views || ''} • ${video.uploadedAt || ''}`;
    watchAvatar.textContent = video.channel && video.channel.name ? video.channel.name.charAt(0).toUpperCase() : 'V';
    watchDesc.textContent = 'Loading video stream and high-definition formats...';

    // Inject Player
    if (video.id && video.platform !== 'instagram' && video.platform !== 'web') {
      // YouTube embed player with autoplay
      playerContainer.innerHTML = `
        <iframe 
          src="https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    } else if (video.directFormats && video.directFormats.length > 0) {
      // Web-extracted video: play with HTML5 player
      const bestVideo = video.directFormats.find(f => f.type === 'video') || video.directFormats[0];
      playerContainer.innerHTML = `
        <video controls autoplay playsinline style="width:100%; height:100%; object-fit:contain; background:#000;">
          <source src="${bestVideo.url}" type="video/${bestVideo.ext || 'mp4'}">
          Your browser does not support HTML5 video.
        </video>
      `;
    } else {
      playerContainer.innerHTML = `
        <div class="loading-formats" style="position: absolute; inset: 0;">
          <div class="spinner"></div>
          <span>Loading video player &amp; resolving media...</span>
        </div>
      `;
    }

    // In-player Quick Download click handler
    playerQuickDlBtn.onclick = () => {
      const targetUrl = currentVideo.url || `https://www.youtube.com/watch?v=${currentVideo.id}`;
      showToast('Starting quick download (1080p / Best Quality)...');
      triggerDownload(targetUrl, '1080', 'video', watchTitle.textContent);
    };

    // Populate Related Videos Queue
    renderRelatedVideos();

    // If we already have formats from extraction, show them; otherwise fetch
    if (video.directFormats && video.directFormats.length > 0) {
      currentFormats = video.directFormats.map(f => ({
        quality: f.quality || 'Source',
        ext: f.ext || 'mp4',
        type: f.type || 'video',
        height: f.quality ? parseInt(f.quality) || 720 : 720,
        size: f.filesize || '',
        downloadUrl: f.url
      }));
      renderFormatsList();
      watchDesc.textContent = 'Video extracted from webpage. Select a format below to download.';
    } else {
      // Fetch Full Metadata & Format Streams from Backend
      fetchDownloadFormats(video.url || `https://www.youtube.com/watch?v=${video.id}`);
    }
  }

  function closeWatchView() {
    watchView.classList.add('hidden');
    feedContainer.classList.remove('hidden');
    chipsBar.classList.remove('hidden');
    playerContainer.innerHTML = '';
    currentVideo = null;
  }

  closeWatchBtn.addEventListener('click', closeWatchView);
  homeLogo.addEventListener('click', (e) => {
    e.preventDefault();
    closeWatchView();
    searchInput.value = '';
    loadFeed('all');
  });

  // Scroll to download section
  scrollToDownloadBtn.addEventListener('click', () => {
    const studio = document.getElementById('downloadStudio');
    if (studio) studio.scrollIntoView({ behavior: 'smooth' });
  });

  // Share Button
  shareBtn.addEventListener('click', () => {
    if (currentVideo && currentVideo.url) {
      navigator.clipboard.writeText(currentVideo.url);
      showToast('Video URL copied to clipboard!');
    }
  });

  // Render Related Videos
  function renderRelatedVideos() {
    relatedList.innerHTML = '';
    const otherVideos = cachedVideos.filter(v => currentVideo && v.id !== currentVideo.id).slice(0, 10);
    
    otherVideos.forEach(v => {
      const item = document.createElement('div');
      item.className = 'related-card';
      item.innerHTML = `
        <div class="related-thumb-wrapper">
          <img class="related-thumb" src="${v.thumbnail}" alt="" loading="lazy" />
          <span class="related-duration">${v.duration}</span>
        </div>
        <div class="related-meta">
          <h4 class="related-title">${escapeHtml(v.title)}</h4>
          <span class="related-channel">${escapeHtml(v.channel.name)}</span>
          <span class="related-stats">${v.views}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        openWatchView(v);
      });
      relatedList.appendChild(item);
    });
  }

  // ==========================================================================
  // 4. Download Formats & Streaming
  // ==========================================================================
  async function fetchDownloadFormats(url) {
    formatList.innerHTML = `
      <div class="loading-formats">
        <div class="spinner"></div>
        <span>Extracting available video resolutions and audio streams...</span>
      </div>
    `;

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        if (json.isPrivateAccount) {
          openIgModal();
        }
        throw new Error(json.error || 'Failed to extract video information');
      }

      const data = json.data;
      currentFormats = data.formats || [];

      // Update full title and details
      if (data.title) watchTitle.textContent = data.title;
      if (data.channel) watchChannel.textContent = data.channel;
      if (data.views) watchViews.textContent = `${data.views} • ${data.published || 'Online'}`;
      if (data.description) watchDesc.textContent = data.description;

      // Handle Instagram / Direct HTML5 playback
      if (data.directMediaUrl) {
        playerContainer.innerHTML = `
          <video controls autoplay playsinline style="width:100%; height:100%; object-fit:contain; background:#000;">
            <source src="${data.directMediaUrl}" type="video/mp4">
            Your browser does not support HTML5 video.
          </video>
        `;
      }

      renderFormatsList();
    } catch (err) {
      console.error('Format fetch error:', err);
      formatList.innerHTML = `
        <div style="text-align:center; padding: 24px; color: var(--text-secondary);">
          <p style="margin-bottom:12px; color:#f87171;">${escapeHtml(err.message)}</p>
          <div>
            <button class="download-link-btn" onclick="triggerDownload('${encodeURIComponent(url)}', '720', 'video', '${encodeURIComponent(watchTitle.textContent)}')">
              ⬇ Download Standard Quality MP4
            </button>
          </div>
        </div>
      `;
    }
  }

  // Format Tabs switching (Video vs Audio)
  document.querySelectorAll('.format-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFormatTab = btn.dataset.tab;
      renderFormatsList();
    });
  });

  function renderFormatsList() {
    const filtered = currentFormats.filter(f => f.type === activeFormatTab);

    if (filtered.length === 0) {
      formatList.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding:20px;">No formats found for ${activeFormatTab}.</p>`;
      return;
    }

    let html = '<div class="format-grid">';
    filtered.forEach(f => {
      const isHD = f.height >= 720;
      html += `
        <div class="format-card">
          <div class="format-info">
            <span class="format-quality">
              ${f.quality}
              ${isHD ? `<span class="badge-hd">HD</span>` : ''}
            </span>
            <span class="format-meta">${f.ext.toUpperCase()} ${f.size ? `• ${f.size}` : ''}</span>
          </div>
          <button 
            class="download-link-btn" 
            data-quality="${f.height || 'audio'}" 
            data-type="${f.type}"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          </button>
        </div>
      `;
    });
    html += '</div>';
    formatList.innerHTML = html;

    // Attach click listeners to download buttons
    formatList.querySelectorAll('.download-link-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const quality = btn.dataset.quality;
        const type = btn.dataset.type;
        const title = watchTitle.textContent;

        btn.classList.add('loading');
        btn.innerHTML = `<span>Starting...</span>`;

        // Check if the current format has a direct download URL (from /api/extract)
        const currentFmt = currentFormats[idx];
        if (currentFmt && currentFmt.downloadUrl) {
          // Direct download for web-extracted videos
          showToast(`Downloading from source...`);
          const a = document.createElement('a');
          a.href = currentFmt.downloadUrl;
          a.download = title + '.' + (currentFmt.ext || 'mp4');
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Standard yt-dlp-backed download
          const url = currentVideo.url || `https://www.youtube.com/watch?v=${currentVideo.id}`;
          showToast(`Preparing ${quality} download stream...`);
          triggerDownload(url, quality, type, title);
        }

        setTimeout(() => {
          btn.classList.remove('loading');
          btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          `;
        }, 3000);
      });
    });
  }

  // Trigger browser download by redirecting to streaming endpoint
  window.triggerDownload = function(url, quality, type, title) {
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(quality)}&type=${encodeURIComponent(type)}&title=${encodeURIComponent(title)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };


  // ==========================================================================
  // 6. Sidebar & Category Navigation
  // ==========================================================================
  document.querySelectorAll('.chips-bar .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chips-bar .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentCategory = chip.dataset.category;
      
      document.querySelectorAll('.sidebar .nav-item').forEach(nav => {
        nav.classList.toggle('active', nav.dataset.category === currentCategory);
      });

      closeWatchView();
      loadFeed(currentCategory);
    });
  });

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const cat = item.dataset.category;

      if (['gmail', 'facebook', 'instagram-app', 'settings'].includes(cat)) {
        if (cat === 'settings') {
          document.getElementById('settingsModal').classList.remove('hidden');
          return;
        }
        let url = 'https://mail.google.com/';
        let name = 'Gmail';
        if (cat === 'facebook') { url = 'https://www.facebook.com/'; name = 'Facebook'; }
        else if (cat === 'instagram-app') { url = 'https://www.instagram.com/'; name = 'Instagram'; }
        
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast(`Opening ${name} in a new tab...`);
        return;
      }

      if (cat === 'web-browser') {
        openBrowser('https://www.bing.com');
        return;
      }

      document.querySelectorAll('.chips-bar .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === cat);
      });

      closeWatchView();
      if(browserView) browserView.classList.add('hidden');
      loadFeed(cat);
    });
  });

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================================================
  // Proxy / VPN Settings Logic
  // ==========================================================================
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsModalBtn = document.getElementById('closeSettingsModal');
  const proxyForm = document.getElementById('proxyForm');
  const proxyUrlInput = document.getElementById('proxyUrlInput');
  const clearProxyBtn = document.getElementById('clearProxyBtn');
  
  if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });
  }

  if (proxyForm) {
    proxyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const proxyUrl = proxyUrlInput.value.trim();
      try {
        const res = await fetch('/api/config/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl })
        });
        if (res.ok) {
          showToast('Proxy configuration saved securely!');
          settingsModal.classList.add('hidden');
        }
      } catch (err) {
        showToast('Error saving proxy: ' + err.message, 'error');
      }
    });
  }

  if (clearProxyBtn) {
    clearProxyBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/config/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxyUrl: '' })
        });
        if (res.ok) {
          proxyUrlInput.value = '';
          showToast('Proxy configuration cleared!');
          settingsModal.classList.add('hidden');
        }
      } catch (err) {
        showToast('Error clearing proxy: ' + err.message, 'error');
      }
    });
  }

  // Fetch current proxy on load
  async function loadProxyConfig() {
    try {
      const res = await fetch('/api/config/proxy');
      if (res.ok) {
        const data = await res.json();
        if (data.proxyUrl) {
          if (proxyUrlInput) proxyUrlInput.value = data.proxyUrl;
        }
      }
    } catch (err) {
      console.error('Failed to load proxy config:', err);
    }
  }
  loadProxyConfig();

  // Init
  loadFeed('all');
});
