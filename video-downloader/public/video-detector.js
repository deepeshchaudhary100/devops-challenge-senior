(function() {
  console.log('[StreamTube] Video Detector Script Injected');

  const processedVideos = new WeakSet();

  function createDownloadOverlay(video) {
    if (processedVideos.has(video)) return;
    processedVideos.add(video);

    const overlay = document.createElement('div');
    overlay.className = 'streamtube-dl-overlay';
    overlay.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.25);
      letter-spacing: 0.3px;
      transition: transform 0.15s ease, background 0.15s ease;
      user-select: none;
    `;
    
    overlay.onmouseenter = () => { overlay.style.transform = 'scale(1.06)'; };
    overlay.onmouseleave = () => { overlay.style.transform = 'scale(1)'; };

    const updatePosition = () => {
      const rect = video.getBoundingClientRect();
      if (rect.width > 60 && rect.height > 60) {
        overlay.style.top = `${rect.top + window.scrollY + 12}px`;
        overlay.style.left = `${rect.left + window.scrollX + rect.width - 150}px`;
        overlay.style.display = 'flex';
      } else {
        overlay.style.display = 'none';
      }
    };

    overlay.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Download</span>
    `;

    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const src = video.src || video.querySelector('source')?.src || window.location.href;
      
      window.parent.postMessage({
        type: 'STREAMTUBE_DOWNLOAD',
        url: src,
        title: document.title
      }, '*');
      
      overlay.style.background = '#22c55e';
      overlay.innerHTML = '<span>Opening...</span>';
      setTimeout(() => {
        overlay.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        overlay.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Download</span>
        `;
      }, 2000);
    });

    document.body.appendChild(overlay);
    updatePosition();
    
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(updatePosition);
      resizeObserver.observe(video);
    }
  }

  function scanForVideos() {
    document.querySelectorAll('video').forEach(video => {
      createDownloadOverlay(video);
    });
  }

  scanForVideos();

  const observer = new MutationObserver(() => {
    scanForVideos();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Periodic scan to catch dynamically instantiated players (e.g. videojs, custom players)
  setInterval(scanForVideos, 1500);

})();
