const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

let globalProxyUrl = '';

function getAgent(urlStr) {
  if (!urlStr) return undefined;
  if (urlStr.startsWith('socks')) return new SocksProxyAgent(urlStr);
  return new HttpsProxyAgent(urlStr);
}

function getAxiosConfig(extraOpts = {}) {
  const opts = { ...extraOpts };
  if (globalProxyUrl) {
    opts.httpsAgent = getAgent(globalProxyUrl);
    opts.httpAgent = getAgent(globalProxyUrl);
    opts.proxy = false;
  }
  return opts;
}

function getYtdlpArgs(baseArgs) {
  const args = [...baseArgs];
  if (globalProxyUrl) {
    args.push('--proxy', globalProxyUrl);
  }
  return args;
}

const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Kubernetes
app.get('/health', (req, res) => res.status(200).send('OK'));

// Path to portable yt-dlp binary & cookies file
const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

const ytDlpPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const cookiesPath = path.join(binDir, 'cookies.txt');

// In-memory Instagram/Facebook Auth State
let authState = {
  loggedIn: false,
  username: '',
  authType: '' // 'cookie' or 'credentials'
};

// Check if cookies file exists on startup
if (fs.existsSync(cookiesPath)) {
  authState.loggedIn = true;
  authState.username = 'Saved Session';
  authState.authType = 'cookie';
}


// Format file sizes
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format duration
function formatDuration(sec) {
  if (!sec && sec !== 0) return 'Live';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper: Check if string is a direct video/reel URL
function isMediaUrl(str) {
  if (!str) return false;
  const trimmed = str.trim();
  return (
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch)\/.+/i.test(trimmed)
  );
}

// ---------------------------------------------------------------------------
// Native YouTube Search Engine (Fast & Resilient)
// ---------------------------------------------------------------------------
async function searchYouTube(query) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await axios.get(searchUrl, getAxiosConfig({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000
    }));

    const match = res.data.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

    const videos = [];
    for (const section of sections) {
      const items = section.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item.videoRenderer) {
          const vr = item.videoRenderer;
          const vidId = vr.videoId;
          if (!vidId) continue;

          const title = vr.title?.runs?.map(r => r.text).join('') || 'Video';
          const channelName = vr.ownerText?.runs?.[0]?.text || 'Creator';
          const channelIcon = vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || '';
          const views = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || 'Trending';
          const duration = vr.lengthText?.simpleText || 'Video';
          const uploadedAt = vr.publishedTimeText?.simpleText || 'Recent';
          const thumbnail = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

          videos.push({
            id: vidId,
            title,
            thumbnail,
            channel: {
              name: channelName,
              icon: channelIcon,
              verified: vr.ownerBadges?.some(b => b.metadataBadgeRenderer?.tooltip === 'Verified') || false
            },
            views,
            uploadedAt,
            duration,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            platform: 'youtube'
          });
        }
      }
    }

    if (videos.length > 0) return videos;
  } catch (err) {
    console.error('searchYouTube error:', err.message);
  }

  // Fallback to yt-dlp flat-playlist search
  return new Promise((resolve) => {
    if (!fs.existsSync(ytDlpPath)) return resolve([]);

    const args = [
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch12:${query}`
    ];

    const proc = spawn(ytDlpPath, getYtdlpArgs(args), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.on('close', () => {
      const lines = stdout.trim().split('\n').filter(Boolean);
      const fallbackVideos = lines.map(line => {
        try {
          const item = JSON.parse(line);
          return {
            id: item.id,
            title: item.title,
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            channel: { name: item.uploader || 'Creator', icon: '', verified: false },
            views: item.view_count ? `${(item.view_count / 1000).toFixed(1)}K views` : 'Trending',
            uploadedAt: 'Recent',
            duration: item.duration ? formatDuration(item.duration) : 'Video',
            url: `https://www.youtube.com/watch?v=${item.id}`,
            platform: 'youtube'
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      resolve(fallbackVideos);
    });
    proc.on('error', () => resolve([]));
  });
}

// Helper: Scrape Pornhub video metadata and HLS streams directly
async function extractPornhubMetadata(url) {
  const res = await axios.get(url, getAxiosConfig({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cookie': 'accessAgeDisclaimerPH=1; hasVisited=1; age_verified=1; platform=pc; bs=1; il=1',
      'Referer': 'https://www.pornhub.com/'
    },
    timeout: 15000
  }));
  const html = res.data.toString();
  const match = html.match(/var\s+CLIPS_DATA\s*=\s*({[\s\S]*?});/);
  if (!match) throw new Error('Could not find CLIPS_DATA on Pornhub page');

  const data = JSON.parse(match[1]);
  const streams = data.mediaDefinition || [];

  const formats = streams.filter(s => s.videoUrl && s.format === 'hls').map(s => ({
    format_id: s.videoUrl,
    quality: `${s.quality}p`,
    height: parseInt(s.quality, 10) || 720,
    ext: 'mp4',
    vcodec: 'h264',
    url: s.videoUrl,
    filesize: 0,
    type: 'video'
  }));

  const directMp4 = streams.find(s => s.format === 'mp4' && s.videoUrl);
  if (directMp4) {
    formats.push({
      format_id: directMp4.videoUrl,
      quality: '720p Direct',
      height: 720,
      ext: 'mp4',
      vcodec: 'h264',
      url: directMp4.videoUrl,
      filesize: 0,
      type: 'video'
    });
  }

  const bestStream = formats[0] || {};

  return {
    id: data.videoId ? String(data.videoId) : 'ph_' + Date.now(),
    title: data.videoTitle || 'Pornhub Video',
    thumbnail: data.posterUrl || '',
    uploader: 'Pornhub Creator',
    channel: 'Pornhub',
    duration: data.videoDuration || 0,
    url: bestStream.url || '',
    formats: formats
  };
}

// Helper: Run yt-dlp to extract JSON metadata
async function extractMetadata(url) {
  if (/pornhub\.com/i.test(url)) {
    try {
      const phData = await extractPornhubMetadata(url);
      return phData;
    } catch (phErr) {
      console.log('[EXTRACT] Dedicated Pornhub extractor error, falling back to yt-dlp:', phErr.message);
    }
  }

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ytDlpPath)) {
      return reject(new Error('yt-dlp binary not found at ' + ytDlpPath));
    }

    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '--add-header', 'Cookie: accessAgeDisclaimerPH=1; hasVisited=1; age_verified=1; platform=pc; bs=1; il=1',
      '--referer', url
    ];

    // If cookies exist, pass them for private Instagram/Facebook content
    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath);
    } else if (authState.username && authState.password) {
      args.push('--username', authState.username, '--password', authState.password);
    }

    args.push(url);

    const proc = spawn(ytDlpPath, getYtdlpArgs(args), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp metadata: ' + e.message));
      }
    });

    proc.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// AUTH ENDPOINTS (Instagram & Facebook Private Access)
// ---------------------------------------------------------------------------
app.get('/api/auth/status', (req, res) => {
  res.json({
    success: true,
    loggedIn: authState.loggedIn,
    username: authState.username,
    authType: authState.authType
  });
});

app.post('/api/auth/instagram', (req, res) => {
  const { sessionid, username, password } = req.body;

  if (sessionid && sessionid.trim()) {
    // Write Netscape cookies format for yt-dlp
    const cleanSession = sessionid.trim();
    const cookieContent = [
      '# Netscape HTTP Cookie File',
      '# http://curl.haxx.se/rfc/cookie_spec.html',
      '# This file was generated by StreamTube for Instagram authentication',
      `.instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t${cleanSession}`,
      `.instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t${username || 'user'}`
    ].join('\n');

    fs.writeFileSync(cookiesPath, cookieContent, 'utf8');

    authState.loggedIn = true;
    authState.username = username ? `@${username}` : 'Instagram User';
    authState.authType = 'cookie';

    return res.json({
      success: true,
      message: 'Instagram session connected successfully! Private reels and videos are now unlocked.',
      username: authState.username
    });
  }

  if (username && password) {
    authState.loggedIn = true;
    authState.username = `@${username.trim()}`;
    authState.password = password.trim();
    authState.authType = 'credentials';

    return res.json({
      success: true,
      message: 'Instagram credentials saved for this session! Private reels and videos are now unlocked.',
      username: authState.username
    });
  }

  res.status(400).json({ success: false, error: 'Please provide either a sessionid cookie or username & password.' });
});

app.post('/api/auth/logout', (req, res) => {
  if (fs.existsSync(cookiesPath)) {
    try { fs.unlinkSync(cookiesPath); } catch {}
  }
  authState = { loggedIn: false, username: '', authType: '' };
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ---------------------------------------------------------------------------
// PUBLIC INSTAGRAM REELS ENDPOINT
// ---------------------------------------------------------------------------
app.get('/api/reels', async (req, res) => {
  // Curated popular public Instagram reels & shorts that play and download instantly
  const reels = [
    {
      id: 'ig_reel_1',
      title: 'Amazing cinematic nature drone shot through misty mountains',
      thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'wanderlust_travel', icon: '', verified: true },
      views: '1.8M views',
      duration: '0:34',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4', // high-def sample stream for seamless playback
      platform: 'instagram'
    },
    {
      id: 'ig_reel_2',
      title: 'Satisfying coffee brewing art - morning espresso routine',
      thumbnail: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'coffeeculture.daily', icon: '', verified: true },
      views: '940K views',
      duration: '0:45',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
      platform: 'instagram'
    },
    {
      id: 'ig_reel_3',
      title: 'Futuristic AI coding setup & desk setup tour 2026',
      thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'techflow.dev', icon: '', verified: true },
      views: '2.4M views',
      duration: '0:58',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      platform: 'instagram'
    },
    {
      id: 'ig_reel_4',
      title: 'Hyperlapse city lights of Tokyo night skyline at 60fps',
      thumbnail: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'urban.tokyo.vibes', icon: '', verified: false },
      views: '3.1M views',
      duration: '0:28',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
      platform: 'instagram'
    },
    {
      id: 'ig_reel_5',
      title: 'Insane supercar launch control sound & acceleration',
      thumbnail: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'apex.automotive', icon: '', verified: true },
      views: '820K views',
      duration: '0:42',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=uMzUB89uSxU',
      platform: 'instagram'
    },
    {
      id: 'ig_reel_6',
      title: 'Street food chef master wok cooking in Bangkok',
      thumbnail: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80',
      channel: { name: 'foodie.explorer', icon: '', verified: true },
      views: '1.5M views',
      duration: '0:50',
      uploadedAt: 'Public Reel',
      url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
      platform: 'instagram'
    }
  ];

  res.json({ success: true, category: 'reels', videos: reels });
});

// ---------------------------------------------------------------------------
// 1. GET /api/trending — Fetch trending or category videos
// ---------------------------------------------------------------------------
app.get('/api/trending', async (req, res) => {
  const category = (req.query.category || 'all').toLowerCase();
  
  if (category === 'reels') {
    return res.redirect('/api/reels');
  }

  let searchKeyword = 'Trending videos 2026';
  if (category === 'music') searchKeyword = 'Top Trending Music official video';
  else if (category === 'gaming') searchKeyword = 'Trending Gaming gameplay trailers';
  else if (category === 'tech') searchKeyword = 'Latest Tech reviews artificial intelligence gadget';
  else if (category === 'news') searchKeyword = 'World News Today Highlights';
  else if (category === 'podcasts') searchKeyword = 'Popular Podcast full episode';
  else if (category === 'shorts') searchKeyword = '#Shorts viral video';

  try {
    const videos = await searchYouTube(searchKeyword);
    res.json({ success: true, category, videos });
  } catch (err) {
    console.error('Error fetching trending videos:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch trending videos' });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/search — Search videos by topic or direct URL
// ---------------------------------------------------------------------------
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required' });
  }

  // Check if user entered a direct URL
  if (isMediaUrl(query)) {
    return res.json({
      success: true,
      isDirectUrl: true,
      url: query
    });
  }

  try {
    const videos = await searchYouTube(query);
    res.json({ success: true, isDirectUrl: false, query, videos });
  } catch (err) {
    console.error('Error searching videos:', err.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ---------------------------------------------------------------------------
// 3. POST /api/info — Extract video playback & download formats
// ---------------------------------------------------------------------------
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'Video URL is required' });
  }

  try {
    const meta = await extractMetadata(url);

    const isInstagram = /instagram\.com/i.test(url);
    const isYouTube = /youtu(\.be|be\.com)/i.test(url);
    const isFacebook = /facebook\.com|fb\.watch/i.test(url);

    // Extract available resolutions
    const formatMap = new Map();
    const formats = meta.formats || [];

    // Filter video resolutions
    const desiredHeights = [1080, 720, 480, 360];
    desiredHeights.forEach(h => {
      const matching = formats.filter(f => f.height && f.height <= h && f.vcodec !== 'none');
      if (matching.length > 0) {
        matching.sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
        const best = matching[0];
        if (!formatMap.has(h)) {
          formatMap.set(h, {
            quality: `${h}p`,
            height: h,
            format_id: best.format_id,
            ext: 'mp4',
            size: formatBytes(best.filesize || best.filesize_approx),
            type: 'video'
          });
        }
      }
    });

    // Fallback if no specific height match
    if (formatMap.size === 0) {
      formatMap.set(720, {
        quality: 'Best Quality (MP4)',
        height: 720,
        format_id: 'best',
        ext: 'mp4',
        size: formatBytes(meta.filesize || meta.filesize_approx),
        type: 'video'
      });
    }

    // Audio format
    const audioFormats = formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
    const bestAudio = audioFormats[0] || {};

    const availableFormats = Array.from(formatMap.values());
    availableFormats.push({
      quality: 'Audio Only (MP3 / M4A)',
      height: null,
      format_id: bestAudio.format_id || 'bestaudio',
      ext: 'm4a',
      size: formatBytes(bestAudio.filesize || bestAudio.filesize_approx),
      type: 'audio'
    });

    // Playback configuration
    let embedUrl = null;
    let directMediaUrl = null;

    if (isYouTube && meta.id) {
      embedUrl = `https://www.youtube-nocookie.com/embed/${meta.id}?autoplay=1&rel=0&modestbranding=1`;
    } else if (meta.url) {
      directMediaUrl = meta.url;
    }

    res.json({
      success: true,
      data: {
        id: meta.id,
        title: meta.title || 'Untitled Media',
        description: meta.description ? meta.description.slice(0, 500) : '',
        thumbnail: meta.thumbnail,
        channel: meta.uploader || meta.channel || 'Creator',
        duration: meta.duration ? formatDuration(meta.duration) : '',
        views: meta.view_count ? `${(meta.view_count / 1000000).toFixed(1)}M views` : 'Trending',
        published: meta.upload_date ? `${meta.upload_date.slice(0,4)}-${meta.upload_date.slice(4,6)}-${meta.upload_date.slice(6,8)}` : '',
        platform: isInstagram ? 'instagram' : (isFacebook ? 'facebook' : 'youtube'),
        embedUrl,
        directMediaUrl,
        formats: availableFormats
      }
    });
  } catch (err) {
    console.error('Metadata extraction error:', err.message);
    const isPrivateErr = err.message.includes('login') || err.message.includes('private') || err.message.includes('authentication');
    res.status(500).json({
      success: false,
      isPrivateAccount: isPrivateErr,
      error: isPrivateErr 
        ? 'This media is from a private account or requires authentication. Please click "Connect Instagram" in the top bar to log in.' 
        : ('Could not fetch video info: ' + err.message)
    });
  }
});

// ---------------------------------------------------------------------------
// 4. GET /api/download — Direct streaming download
// ---------------------------------------------------------------------------
app.get('/api/download', (req, res) => {
  const { url, quality, type, title } = req.query;

  if (!url) {
    return res.status(400).send('Missing video URL');
  }

  const safeTitle = (title || 'video')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .slice(0, 100) || 'download';

  const isAudio = type === 'audio';
  const fileExt = isAudio ? 'm4a' : 'mp4';
  const filename = `${safeTitle}.${fileExt}`;

  // Configure response headers for browser download
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', isAudio ? 'audio/mp4' : 'video/mp4');

  // Format selection for yt-dlp
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--add-header', 'Cookie: accessAgeDisclaimerPH=1; hasVisited=1; age_verified=1; platform=pc; bs=1; il=1',
    '--referer', 'https://www.pornhub.com/'
  ];

  // If url is not an HLS master playlist, use format selection
  if (!url.includes('.m3u8')) {
    let formatArg;
    if (isAudio) {
      formatArg = 'bestaudio[ext=m4a]/bestaudio/best';
    } else {
      const h = parseInt(quality, 10);
      if (!isNaN(h) && h > 0) {
        formatArg = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]/best`;
      } else {
        formatArg = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
      }
    }
    args.push('-f', formatArg);
  }

  // If cookies or credentials exist, pass to yt-dlp for private videos
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  } else if (authState.username && authState.password) {
    args.push('--username', authState.username, '--password', authState.password);
  }

  args.push('-o', '-', url);

  const proc = spawn(ytDlpPath, getYtdlpArgs(args), { stdio: ['ignore', 'pipe', 'pipe'] });

  // Stream binary output directly to client response
  proc.stdout.pipe(res);

  proc.stderr.on('data', chunk => {
    const msg = chunk.toString();
    if (!msg.includes('[download]')) {
      console.log(`[yt-dlp log]: ${msg.trim()}`);
    }
  });

  proc.on('close', code => {
    console.log(`[DOWNLOAD] Finished stream with code ${code} for "${filename}"`);
  });

  // If user cancels download / closes browser tab
  req.on('close', () => {
    console.log(`[DOWNLOAD] Client disconnected, killing process`);
    proc.kill('SIGKILL');
  });
});

// ---------------------------------------------------------------------------
// 4b. GET /api/extract — Auto-grab video URLs from any webpage
// ---------------------------------------------------------------------------
app.get('/api/extract', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ success: false, error: 'URL is required' });

  // First try yt-dlp — it supports hundreds of sites natively
  if (fs.existsSync(ytDlpPath)) {
    try {
      const result = await new Promise((resolve, reject) => {
        const args = [
          '--dump-single-json',
          '--no-warnings',
          '--no-playlist',
          '--skip-download',
          targetUrl
        ];
        if (fs.existsSync(cookiesPath)) args.push('--cookies', cookiesPath);

        const proc = spawn(ytDlpPath, getYtdlpArgs(args), { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', c => { stdout += c; });
        proc.stderr.on('data', c => { stderr += c; });
        proc.on('close', code => {
          if (code === 0 && stdout) {
            try { resolve(JSON.parse(stdout)); }
            catch { reject(new Error('Invalid JSON from yt-dlp')); }
          } else reject(new Error(stderr || 'yt-dlp failed'));
        });
        proc.on('error', reject);
      });

      const formats = (result.formats || [])
        .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
        .map(f => ({
          quality: f.format_note || f.height ? `${f.height}p` : f.format_id,
          ext: f.ext,
          url: f.url,
          filesize: formatBytes(f.filesize),
          type: f.vcodec !== 'none' ? 'video' : 'audio'
        }))
        .slice(0, 8);

      return res.json({
        success: true,
        title: result.title || 'Video',
        thumbnail: result.thumbnail || '',
        uploader: result.uploader || result.channel || 'Unknown',
        duration: result.duration ? formatDuration(result.duration) : 'Unknown',
        directUrl: result.url || (formats[0] && formats[0].url),
        formats,
        originalUrl: targetUrl
      });
    } catch (ytErr) {
      console.log('[EXTRACT] yt-dlp failed, trying HTML scrape:', ytErr.message);
    }
  }

  // Fallback: scrape HTML for <video> and <source> tags
  try {
    const response = await axios.get(targetUrl, getAxiosConfig({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      maxRedirects: 5
    }));

    const html = response.data.toString();
    const videoUrls = new Set();

    // Find <video src="..."> and <source src="...">
    const videoSrcRe = /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|ogg|m3u8|mkv|mov|avi)[^"']*)["']/gi;
    let match;
    while ((match = videoSrcRe.exec(html)) !== null) {
      let url = match[1];
      if (!url.startsWith('http')) {
        const base = new URL(targetUrl);
        url = new URL(url, base.origin).href;
      }
      videoUrls.add(url);
    }

    // Find OG video tags
    const ogVideoRe = /<meta[^>]+(?:property|name)=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/gi;
    while ((match = ogVideoRe.exec(html)) !== null) {
      videoUrls.add(match[1]);
    }

    const urls = [...videoUrls];
    if (urls.length === 0) {
      return res.json({ success: false, error: 'No video sources found on this page. Try the in-app browser for dynamic content.' });
    }

    return res.json({
      success: true,
      title: (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || 'Web Video',
      formats: urls.map((u, i) => ({
        quality: `Source ${i + 1}`,
        ext: u.split('.').pop().split('?')[0].substring(0, 5),
        url: u,
        type: 'video'
      })),
      directUrl: urls[0],
      originalUrl: targetUrl
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stream', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL is required');

  try {
    const isAdult = /phncdn\.com|pornhub\.com/i.test(targetUrl);
    const streamRes = await axios.get(targetUrl, getAxiosConfig({
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': isAdult ? 'https://www.pornhub.com/' : 'https://www.google.com/'
      }
    }));
    for (const [k, v] of Object.entries(streamRes.headers)) {
      res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    streamRes.data.pipe(res);
  } catch (err) {
    res.status(500).send('Stream error: ' + err.message);
  }
});

// ---------------------------------------------------------------------------
// 5. GET /api/proxy — In-App Browser (strips framing blocks, injects video detector)
// ---------------------------------------------------------------------------
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL is required');

  console.log('[PROXY] Fetching:', targetUrl);
  try {
    const isAdult = /pornhub\.com|phncdn\.com/i.test(targetUrl);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Referer': isAdult ? 'https://www.pornhub.com/' : 'https://www.google.com/'
    };
    if (isAdult) {
      headers['Cookie'] = 'accessAgeDisclaimerPH=1; hasVisited=1; age_verified=1; platform=pc; bs=1; il=1';
    }

    const response = await axios.get(targetUrl, getAxiosConfig({
      responseType: 'arraybuffer',
      timeout: 30000,
      headers,
      maxRedirects: 5,
      validateStatus: () => true
    }));
    console.log('[PROXY] Success:', targetUrl, 'Status:', response.status);

    // Strip headers that block iframe embedding
    const blockedHeaders = ['x-frame-options', 'content-security-policy', 'strict-transport-security',
                            'transfer-encoding', 'content-encoding', 'set-cookie'];
    for (const [key, value] of Object.entries(response.headers)) {
      if (!blockedHeaders.includes(key.toLowerCase())) res.setHeader(key, value);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      let html = response.data.toString('utf-8');
      let origin = '';
      try { origin = new URL(targetUrl).origin; } catch {}

      // 1. Neutralize anti-proxy guards, frame-busting scripts & forced redirects
      html = html.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?(?:Anti-proxy guard|location\.replace\(|top\.location|window\.top)(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '<!-- anti-proxy script neutralized -->');

      // 1b. Strip ad network & popunder scripts
      html = html.replace(/<script[^>]*src=["'][^"']*(?:excavatenearbywand|lucky-examination|freepush|monetag|popads|propellerads|adsterra|trafficjunky|juicyads|exoclick)[^"']*["'][^>]*>(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '<!-- ad script stripped -->');
      html = html.replace(/<script[^>]*>(?:(?!<\/script>)[\s\S])*?(?:lucky-examination|excavatenearbywand|decodeURI\("wd%60|popunder)(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '<!-- popunder script stripped -->');

      // 1c. CRITICAL: Strip all target attributes so links NEVER escape the proxy iframe
      html = html.replace(/\btarget=["'][^"']*["']/gi, '');

      // 2. Strip any meta tags enforcing CSP or frame restrictions
      html = html.replace(/<meta[^>]+http-equiv=["'](?:content-security-policy|x-frame-options)["'][^>]*>/gi, '');

      // 3. Inject base & high-priority navigation hook into <head>
      const baseTag = `<base href="${origin}/">`;
      const headNavScript = `
      <script>
      (function() {
        // Disarm popup/popunder calls & keep opened links inside the proxy
        window.open = function(url) {
          if (url && typeof url === 'string') {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'STREAMTUBE_NAVIGATE', url: url }, '*');
            } else {
              window.location.href = window.location.origin + '/api/proxy?url=' + encodeURIComponent(url);
            }
          }
          return null;
        };

        // Capture all clicks in capture mode to prevent escaping proxy
        document.addEventListener('click', function(e) {
          try {
            var target = e.target;
            if (target && target !== document.body && target !== document.documentElement) {
              var s = window.getComputedStyle(target);
              if (s && s.position === 'fixed' && parseInt(s.zIndex || 0) > 999 && !target.innerText.trim() && !target.querySelector('img, video, input, button')) {
                e.preventDefault();
                e.stopPropagation();
                target.remove();
                return;
              }
            }
          } catch(err) {}

          var a = e.target.closest('a');
          if (a && a.href && !a.href.startsWith('javascript:') && !a.href.startsWith('#')) {
            if (/candy\\.ai|lucky-examination|excavatenearbywand|trafficjunky|adsterra|monetag|popads/i.test(a.href)) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return;
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'STREAMTUBE_NAVIGATE', url: a.href }, '*');
            } else {
              window.location.href = window.location.origin + '/api/proxy?url=' + encodeURIComponent(a.href);
            }
          }
        }, true);
      })();
      </script>`;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n    ${baseTag}\n    ${headNavScript}`);
      } else {
        html = `${baseTag}\n${headNavScript}\n${html}`;
      }

      // 4. Inject Video Detector inline (so <base> does not misdirect its loading)
      let videoDetectorCode = '';
      try {
        videoDetectorCode = fs.readFileSync(path.join(__dirname, 'public', 'video-detector.js'), 'utf8');
      } catch(e) {}

      const injectedFooter = `<script>${videoDetectorCode}</script>`;
      if (html.includes('</body>')) html = html.replace('</body>', `\n${injectedFooter}\n</body>`);
      else html += `\n${injectedFooter}`;

      res.removeHeader('content-length');
      res.send(html);
    } else {
      res.send(response.data);
    }
  } catch (err) {
    console.error('Proxy Error:', err.message);
    const isTimeout = err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
    const safeUrl = JSON.stringify(targetUrl);
    res.status(500).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Could not load</title>
<style>
  body { font-family: sans-serif; padding: 3rem; color: #e2e8f0; background: #0f1523; text-align: center; }
  h3 { color: #f87171; margin-bottom: 0.5rem; font-size: 1.4rem; }
  p  { color: #94a3b8; margin-bottom: 2rem; font-size: 0.95rem; }
  .reason { background: #1e2a3a; border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem auto;
            max-width: 480px; font-size: 0.85rem; color: #64748b; text-align: left; }
  .reason strong { color: #94a3b8; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 0.75rem 1.5rem;
         background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none;
         font-weight: 600; font-size: 0.95rem; transition: background 0.2s; }
  .btn:hover { background: #1d4ed8; }
  svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; }
</style>
</head>
<body>
  <h3>${isTimeout ? '⏱ Connection Timed Out' : '❌ Could Not Load Page'}</h3>
  <p>${isTimeout
    ? 'This site blocks server-side requests. Open it directly in your browser instead.'
    : 'The server could not fetch this page.'
  }</p>
  <div class="reason">
    <strong>Why does this happen?</strong><br>
    Sites like Gmail, Facebook, Instagram, and many others block requests
    that come from servers (not browsers). The proxy can only work with sites
    that allow regular HTTP fetching.
  </div>
  <br>
  <a class="btn" href=${safeUrl} target="_blank" rel="noopener noreferrer">
    <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    Open in New Tab
  </a>
</body>
</html>`);
  }
});




// Start Server

// Proxy Configuration API
app.get('/api/config/proxy', (req, res) => {
  res.json({ proxyUrl: globalProxyUrl });
});

app.post('/api/config/proxy', (req, res) => {
  const { proxyUrl } = req.body;
  globalProxyUrl = proxyUrl || '';
  res.json({ success: true, proxyUrl: globalProxyUrl });
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`  StreamTube Video Player & Downloader Running`);
  console.log(`  Local URL: http://localhost:3000`);
  console.log(`  yt-dlp binary: ${ytDlpPath} (${fs.existsSync(ytDlpPath) ? 'Ready' : 'Missing'})`);
  console.log(`  Auth status: ${authState.loggedIn ? `Logged in (${authState.username})` : 'Guest Mode'}`);
  console.log(`=================================================`);
});
