/**
 * YouTube Advanced Keyword Filter - Content Script
 *
 * Main filtering logic that runs on all YouTube pages.
 * Filters videos by title keywords using allowlist/blocklist.
 * Also handles DOM hiding features.
 * Cross-browser compatible (Chrome & Firefox).
 *
 * @author tojicb-fushiguro
 * @repository https://github.com/tojicb-fushiguro/YouTube-Filter
 * @license MIT
 */

const DEFAULT_SETTINGS = {
  keywords: "",
  blocklist: "",
  regex: false,
  enabled: true,
  wordBoundary: false,
  softHide: false,
  dateFilter: "any",

  // Core
  hideShorts: false,
  hideHomepageFeed: false,
  hideAllComments: false,

  // Feeds
  hideSponsoredCards: false,
  hideSubscriptionCard: false,
  hideSubscriptionButton: false,
  hideMembersOnlyVideos: false,
  hidePlaylistCards: false,
  hideMixRadioPlaylists: false,

  // Watch Page
  hideVideoSidebar: false,
  hideLiveChat: false,
  hideWatchPlaylistPanel: false,

  // Navigation
  hideTopHeader: false,
  hideNotificationBell: false,
  hideExploreAndTrending: false,
  disableAutoplay: false
};

let currentSettings = {
  ...DEFAULT_SETTINGS,
  parsedAllowlist: [],
  parsedBlocklist: [],
  compiledAllowlistRegex: [],
  compiledBlocklistRegex: []
};

let filterTimeout = null;

// ─────────────────────────────────────────────
// CSS Injection
// Using !important CSS is far more reliable than
// setting element.style.display because YouTube's
// own JS constantly resets inline styles.
// ─────────────────────────────────────────────

const STYLE_TAG_ID = 'yt-filter-injected-styles';

function buildCSS(settings) {
  const rules = [];

  // ── Core ──────────────────────────────────

  if (!settings.enabled) {
    rules.push('[data-filtered="hard"] { display: revert !important; }');
    rules.push('[data-filtered="soft"] { opacity: revert !important; filter: revert !important; pointer-events: revert !important; }');
  }

  // ── FIX: Hide Shorts ──────────────────────
  // YouTube uses THREE different element structures for Shorts depending
  // on the page: reel-shelf-renderer, rich-shelf-renderer[is-shorts],
  // and individual rich-item-renderer wrapping short links.
  if (settings.hideShorts) {
    // Shorts shelf carousel on home/subscriptions (most common)
    rules.push('ytd-reel-shelf-renderer { display: none !important; }');
    // Alternative shelf used in some layouts
    rules.push('ytd-rich-shelf-renderer[is-shorts] { display: none !important; }');
    // Rich section wrapper that contains either shelf type
    rules.push('ytd-rich-section-renderer:has(ytd-reel-shelf-renderer) { display: none !important; }');
    rules.push('ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]) { display: none !important; }');
    // Individual short cards inside feeds (has() checks the link href)
    rules.push('ytd-rich-item-renderer:has(a[href*="/shorts/"]) { display: none !important; }');
    rules.push('ytd-video-renderer:has(a[href*="/shorts/"]) { display: none !important; }');
    // Shorts section in search results
    rules.push('ytd-reel-item-renderer { display: none !important; }');
    // Shorts in the left-sidebar guide nav
    rules.push('ytd-guide-entry-renderer:has(a[title="Shorts"]) { display: none !important; }');
    rules.push('ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]) { display: none !important; }');
  }

  // Hide Homepage Feed
  if (settings.hideHomepageFeed) {
    rules.push('ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer { display: none !important; }');
    rules.push('body[data-yt-filter-home="true"] ytd-two-column-browse-results-renderer { display: none !important; }');
  }

  // Hide All Comments
  if (settings.hideAllComments) {
    rules.push('ytd-comments#comments { display: none !important; }');
  }

  // ── Feeds ──────────────────────────────────

  // Hide Sponsored / Ad Cards
  if (settings.hideSponsoredCards) {
    rules.push('ytd-promoted-sparkles-web-renderer { display: none !important; }');
    rules.push('ytd-promoted-video-renderer { display: none !important; }');
    rules.push('ytd-display-ad-renderer { display: none !important; }');
    rules.push('ytd-rich-item-renderer:has(ytd-ad-slot-renderer) { display: none !important; }');
    rules.push('ytd-ad-slot-renderer { display: none !important; }');
    rules.push('#masthead-ad { display: none !important; }');
    rules.push('ytd-statement-banner-renderer { display: none !important; }');
    rules.push('ytd-in-feed-ad-layout-renderer { display: none !important; }');
    rules.push('ytd-banner-promo-renderer { display: none !important; }');
  }
  // Hide Subscription Card
  // Hides the Subscriptions section in both the full expanded guide sidebar
  // AND the collapsed mini-guide (icon-only bar) that appears when the
  // sidebar panel is closed — as seen in the mini nav with Home/Shorts/Subscriptions/You icons.
  if (settings.hideSubscriptionCard) {
    // Full expanded sidebar: dedicated subscriptions section renderer
    rules.push('ytd-guide-subscriptions-section-renderer { display: none !important; }');
    // Full expanded sidebar: guide section identified by /feed/subscriptions link
    rules.push('ytd-guide-section-renderer:has(ytd-guide-entry-renderer a[href^="/feed/subscriptions"]) { display: none !important; }');
    // Collapsed mini-guide (icon-only bar): the Subscriptions icon entry
    rules.push('ytd-mini-guide-entry-renderer:has(a[href^="/feed/subscriptions"]) { display: none !important; }');
    // Collapsed mini-guide: also target by title attribute as a fallback
    rules.push('ytd-mini-guide-entry-renderer:has(a[title="Subscriptions"]) { display: none !important; }');
  }

  // Hide Subscription Button
  if (settings.hideSubscriptionButton) {
    // Subscribe button on video watch page (below player)
    rules.push('ytd-subscribe-button-renderer { display: none !important; }');
    // Subscribe button inside channel headers
    rules.push('yt-subscribe-button-view-model { display: none !important; }');
    // Compact subscribe button in top bar
    rules.push('#subscribe-button { display: none !important; }');
    // Subscribe button in the masthead / channel page
    rules.push('#subscribe-button-shape { display: none !important; }');
  }

  // ── FIX: Hide Members-only Videos ─────────
  // YouTube renders members-only badges differently depending on context:
  // - Feeds/search: overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY" attribute
  // - Channel page grid/list: ytd-badge-supported-renderer with CSS class
  // - Channel Members tab: page-subtype="memberships" browse page
  // - Shelf/section on channel page: item-section-renderer containing badges
  if (settings.hideMembersOnlyVideos) {
    // ── Main feed, subscriptions, search results ──
    rules.push('ytd-video-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    rules.push('ytd-rich-item-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    // ── Watch page sidebar ──
    rules.push('ytd-compact-video-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    // ── Channel page grid view (overlay-style attribute variant) ──
    rules.push('ytd-grid-video-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    // ── Channel page grid view (badge-style attribute variant) ──
    rules.push('ytd-grid-video-renderer:has([badge-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    // ── Channel page list/grid (CSS class variant inside badge renderer) ──
    rules.push('ytd-video-renderer:has(ytd-badge-supported-renderer .badge-style-type-members-only) { display: none !important; }');
    rules.push('ytd-grid-video-renderer:has(ytd-badge-supported-renderer .badge-style-type-members-only) { display: none !important; }');
    rules.push('ytd-rich-item-renderer:has(ytd-badge-supported-renderer .badge-style-type-members-only) { display: none !important; }');
    // ── Channel Members tab — hide entire content section ──
    rules.push('ytd-browse[page-subtype="memberships"] #contents { display: none !important; }');
    // ── Members-only shelf/section anywhere on channel pages ──
    rules.push('ytd-item-section-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    rules.push('ytd-shelf-renderer:has([overlay-style="BADGE_STYLE_TYPE_MEMBERS_ONLY"]) { display: none !important; }');
    // ── yt-lockup elements (newer YouTube layout on channel pages) ──
    rules.push('yt-lockup-view-model:has([badge-style="MEMBERS_ONLY"]) { display: none !important; }');
    rules.push('ytd-rich-item-renderer:has(yt-lockup-view-model[members-only]) { display: none !important; }');
  }

  // ── FIX: Hide Mix / Radio Playlists ───────
  // YouTube renders mixes in 3 different ways depending on context:
  // 1. ytd-compact-radio-renderer  — sidebar "Up next" / compact views
  // 2. ytd-radio-renderer          — search results
  // 3. ytd-rich-item-renderer with a link containing start_radio=1 — home feed
  if (settings.hideMixRadioPlaylists) {
    // Sidebar compact mixes
    rules.push('ytd-compact-radio-renderer { display: none !important; }');
    // Search result mixes
    rules.push('ytd-radio-renderer { display: none !important; }');
    // Home feed mixes — identified by the start_radio=1 query param in the href
    rules.push('ytd-rich-item-renderer:has(a[href*="start_radio=1"]) { display: none !important; }');
    // Also catch list-based mixes (e.g. from a channel page)
    rules.push('ytd-playlist-renderer:has(a[href*="start_radio=1"]) { display: none !important; }');
    // Grid view mixes
    rules.push('ytd-grid-radio-renderer { display: none !important; }');
  }

  // ── Watch Page ─────────────────────────────

  if (settings.hideVideoSidebar) {
    rules.push('#secondary { display: none !important; }');
    rules.push('#secondary-inner { display: none !important; }');
    rules.push('#primary { max-width: 100% !important; }');
  }

  if (settings.hideLiveChat) {
    rules.push('ytd-live-chat-frame { display: none !important; }');
    rules.push('#chat { display: none !important; }');
  }

  if (settings.hideWatchPlaylistPanel) {
    rules.push('#playlist { display: none !important; }');
    rules.push('ytd-playlist-panel-renderer { display: none !important; }');
  }

  // ── Navigation ─────────────────────────────

  if (settings.hideTopHeader) {
    rules.push('#masthead-container { display: none !important; }');
    rules.push('ytd-app { --ytd-masthead-height: 0px !important; }');
  }

  if (settings.hideNotificationBell) {
    rules.push('ytd-notification-topbar-button-renderer { display: none !important; }');
    rules.push('#notification-button { display: none !important; }');
  }

  if (settings.hideExploreAndTrending) {
    rules.push('ytd-guide-entry-renderer a[href="/feed/explore"] { display: none !important; }');
    rules.push('ytd-guide-entry-renderer a[href*="trending"] { display: none !important; }');
    rules.push('ytd-guide-section-renderer:has(a[href="/feed/explore"]) { display: none !important; }');
    rules.push('ytd-guide-section-renderer:has(a[href*="trending"]) { display: none !important; }');
  }

  return rules.join('\n');
}

function injectStyles(settings) {
  let styleTag = document.getElementById(STYLE_TAG_ID);
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = STYLE_TAG_ID;
    (document.head || document.documentElement).appendChild(styleTag);
  }
  styleTag.textContent = buildCSS(settings);
}

// ───────────────────────────────────  ─────────
// Homepage detection
// ─────────────────────────────────────────────

function markPageType() {
  const path = location.pathname;
  if (path === '/' || path === '/feed/subscriptions') {
    document.body.setAttribute('data-yt-filter-home', 'true');
  } else {
    document.body.removeAttribute('data-yt-filter-home');
  }
}

// ─────────────────────────────────────────────
// FIX: Disable Autoplay
// The autoplay button loads AFTER the player initialises,
// which can be 1–3 seconds after page load on a watch page.
// We use a retry loop with a max attempt cap instead of a
// one-shot querySelector so we reliably catch it.
// We also listen to YouTube's own SPA navigation event
// so it re-runs every time the user navigates to a new video.
// ─────────────────────────────────────────────

let autoplayRetryTimer = null;
let autoplayRetryCount = 0;
const AUTOPLAY_MAX_RETRIES = 20;    // 20 × 500ms = 10 seconds max wait
const AUTOPLAY_RETRY_INTERVAL = 500;

function tryDisableAutoplay() {
  // The toggle button is aria-checked="true" when autoplay is ON
  const btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
  if (btn) {
    btn.click();
    console.log('[YouTube Filter] ✅ Autoplay disabled');
    autoplayRetryCount = 0;
    clearTimeout(autoplayRetryTimer);
    return;
  }

  autoplayRetryCount++;
  if (autoplayRetryCount < AUTOPLAY_MAX_RETRIES) {
    autoplayRetryTimer = setTimeout(tryDisableAutoplay, AUTOPLAY_RETRY_INTERVAL);
  } else {
    // Max retries reached — reset counter for next navigation
    autoplayRetryCount = 0;
  }
}

function applyDisableAutoplay(settings) {
  clearTimeout(autoplayRetryTimer);
  autoplayRetryCount = 0;

  if (!settings.disableAutoplay) return;

  // Only relevant on watch pages
  if (!location.pathname.startsWith('/watch')) return;

  // Start the retry loop
  tryDisableAutoplay();
}

// Listen to YouTube's SPA navigation events so autoplay
// gets disabled every time the user opens a new video
window.addEventListener('yt-navigate-finish', () => {
  if (currentSettings.disableAutoplay) {
    applyDisableAutoplay(currentSettings);
  }
});

window.addEventListener('yt-player-updated', () => {
  if (currentSettings.disableAutoplay) {
    applyDisableAutoplay(currentSettings);
  }
});

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function getObserverTarget() {
  return (
    document.querySelector('ytd-page-manager') ||
    document.querySelector('#content') ||
    document.querySelector('ytd-app') ||
    document.body
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileRegexPatterns(keywords, useWordBoundary = false) {
  if (!keywords || keywords.length === 0) return [];
  return keywords
    .map((keyword) => {
      if (!keyword) return null;
      try {
        const pattern = useWordBoundary
          ? `\\b${escapeRegex(keyword)}\\b`
          : keyword;
        return new RegExp(pattern, 'i');
      } catch (e) {
        console.warn(`[YouTube Filter] Invalid regex pattern: ${keyword}`, e);
        return null;
      }
    })
    .filter(Boolean);
}

function prepareSettings(settings) {
  settings.parsedAllowlist = parseKeywords(settings.keywords);
  settings.parsedBlocklist = parseKeywords(settings.blocklist);

  if (settings.regex) {
    settings.compiledAllowlistRegex = compileRegexPatterns(settings.parsedAllowlist, false);
    settings.compiledBlocklistRegex = compileRegexPatterns(settings.parsedBlocklist, false);
  } else if (settings.wordBoundary) {
    settings.compiledAllowlistRegex = compileRegexPatterns(settings.parsedAllowlist, true);
    settings.compiledBlocklistRegex = compileRegexPatterns(settings.parsedBlocklist, true);
  } else {
    settings.compiledAllowlistRegex = [];
    settings.compiledBlocklistRegex = [];
  }
}

function matches(text, list, compiledRegexList, useRegex, useWordBoundary) {
  if (!list || list.length === 0) return false;
  if (compiledRegexList && compiledRegexList.length > 0) {
    return compiledRegexList.some((regex) => regex.test(text));
  }
  if (!useRegex && !useWordBoundary) {
    return list.some((keyword) => keyword && text.includes(keyword));
  }
  return list.some((keyword) => {
    if (!keyword) return false;
    try {
      if (useRegex) return new RegExp(keyword, 'i').test(text);
      if (useWordBoundary) return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text);
      return text.includes(keyword);
    } catch (e) {
      return text.includes(keyword);
    }
  });
}

function parseKeywords(str) {
  if (!str) return [];
  return str.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
}

function shouldShowContent(title, settings) {
  const allowlist = settings.parsedAllowlist || [];
  const blocklist = settings.parsedBlocklist || [];

  const isAllowed =
    allowlist.length === 0 ||
    matches(title, allowlist, settings.compiledAllowlistRegex, settings.regex, settings.wordBoundary);

  const isBlocked = matches(
    title,
    blocklist,
    settings.compiledBlocklistRegex,
    settings.regex,
    settings.wordBoundary
  );

  return isAllowed && !isBlocked;
}

function applyFilterStyle(container, shouldShow, settings) {
  if (!shouldShow) {
    if (settings.softHide) {
      container.style.display = '';
      container.style.opacity = '0.3';
      container.style.filter = 'blur(8px)';
      container.style.pointerEvents = 'none';
      container.setAttribute('data-filtered', 'soft');
    } else {
      container.style.display = 'none';
      container.style.opacity = '';
      container.style.filter = '';
      container.style.pointerEvents = '';
      container.setAttribute('data-filtered', 'hard');
      container.setAttribute('aria-hidden', 'true');
    }
  } else {
    container.style.display = '';
    container.style.opacity = '';
    container.style.filter = '';
    container.style.pointerEvents = '';
    container.removeAttribute('data-filtered');
    container.removeAttribute('aria-label');
    container.removeAttribute('aria-hidden');
  }
}

// ─────────────────────────────────────────────
// Date Filter
// ─────────────────────────────────────────────

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 24 * 7;
const HOURS_PER_MONTH = 24 * 30;
const HOURS_PER_YEAR = 24 * 365;
const STREAMED_CONTENT_DEFAULT_HOURS = HOURS_PER_DAY / 2;

function getUploadTimeText(container) {
  const selectors = [
    '#metadata-line span.inline-metadata-item:last-child',
    'ytd-video-meta-block #metadata-line span:last-child',
    '#metadata-line span',
    'ytd-video-meta-block span',
    '.metadata-line span',
    'yt-formatted-string.style-scope.ytd-video-meta-block',
    'span'
  ];
  for (const selector of selectors) {
    const spans = container.querySelectorAll(selector);
    for (const span of spans) {
      const text = span.textContent.trim().toLowerCase();
      if (
        text.match(/\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i) ||
        text.includes('streamed') ||
        text === 'live'
      ) {
        return text;
      }
    }
  }
  return null;
}

function parseRelativeTime(timeText) {
  if (!timeText) return null;
  timeText = timeText.toLowerCase().trim();
  if (timeText === 'live' || timeText.includes('watching now')) return 0;
  if (timeText.includes('streamed') && !timeText.match(/\d+/))
    return STREAMED_CONTENT_DEFAULT_HOURS;

  const match = timeText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const conversions = {
    second: value / 3600,
    minute: value / 60,
    hour: value,
    day: value * HOURS_PER_DAY,
    week: value * HOURS_PER_WEEK,
    month: value * HOURS_PER_MONTH,
    year: value * HOURS_PER_YEAR
  };
  return conversions[unit] ?? null;
}

function passesDateFilter(container, settings) {
  if (!settings.dateFilter || settings.dateFilter === 'any') return true;
  const timeText = getUploadTimeText(container);
  if (!timeText) return true;
  const hours = parseRelativeTime(timeText);
  if (hours === null) return true;

  const thresholds = {
    today: HOURS_PER_DAY,
    week: HOURS_PER_WEEK,
    month: HOURS_PER_MONTH,
    year: HOURS_PER_YEAR
  };
  const maxHours = thresholds[settings.dateFilter];
  if (!maxHours) return true;
  return hours <= maxHours;
}

// ─────────────────────────────────────────────
// Keyword Filters
// ─────────────────────────────────────────────

function filterVideos(settings) {
  if (!settings.enabled) return;
  const videos = document.querySelectorAll(
    'ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer'
  );
  videos.forEach((video) => {
    if (video.querySelector('a[href*="/shorts/"]')) return;
    let titleEl = video.querySelector('#video-title');
    if (!titleEl && video.tagName === 'YTD-RICH-ITEM-RENDERER') {
      titleEl = video.querySelector('ytd-video-renderer #video-title');
    }
    if (!titleEl) {
      titleEl =
        video.querySelector('a#video-title-link yt-formatted-string') ||
        video.querySelector('h3 a') ||
        video.querySelector('yt-formatted-string#video-title') ||
        video.querySelector('a[id*="video-title"]');
    }
    const title = (
      titleEl?.title ||
      titleEl?.getAttribute('aria-label') ||
      titleEl?.innerText ||
      titleEl?.textContent ||
      ''
    );
    const normalizedTitle = title.toLowerCase().trim();
    if (!normalizedTitle || normalizedTitle.length < 5) return;
    const shouldShow =
      shouldShowContent(normalizedTitle, settings) && passesDateFilter(video, settings);
    applyFilterStyle(video, shouldShow, settings);
  });
}

function filterShorts(settings) {
  if (!settings.enabled) return;
  const shorts = document.querySelectorAll('a[href*="/shorts/"]');
  shorts.forEach((link) => {
    const container = link.closest(
      'ytd-video-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer'
    );
    if (!container) return;
    let titleEl = container.querySelector('#video-title');
    if (!titleEl && container.tagName === 'YTD-RICH-ITEM-RENDERER') {
      titleEl = container.querySelector('ytd-video-renderer #video-title');
    }
    const title = titleEl?.title || titleEl?.innerText || '';
    const normalizedTitle = title.toLowerCase().trim();
    if (!normalizedTitle) return;
    const shouldShow =
      shouldShowContent(normalizedTitle, settings) && passesDateFilter(container, settings);
    applyFilterStyle(container, shouldShow, settings);
  });
}

function filterSidebarVideos(settings) {
  if (!settings.enabled) return;
  const sidebar = document.querySelector('#related');
  if (!sidebar) return;
  const processed = new Set();
  const links = sidebar.querySelectorAll('a[href*="/watch?v="]');
  links.forEach((link) => {
    const container =
      link.closest('ytd-compact-video-renderer') ||
      link.closest('ytd-compact-radio-renderer') ||
      link.closest('ytd-compact-playlist-renderer') ||
      link.closest('[class*="video"]') ||
      link.parentElement?.parentElement;
    if (!container || processed.has(container)) return;
    processed.add(container);
    let title = link.title || link.getAttribute('aria-label') || link.innerText || '';
    if (!title || title.length < 10) {
      const titleEl = container.querySelector('#video-title, span, h3');
      if (titleEl) title = titleEl.innerText || '';
    }
    const normalizedTitle = title.trim().toLowerCase();
    if (!normalizedTitle || normalizedTitle.length < 5) return;
    const shouldShow =
      shouldShowContent(normalizedTitle, settings) && passesDateFilter(container, settings);
    applyFilterStyle(container, shouldShow, settings);
  });
}

// ─────────────────────────────────────────────
// Master runner
// ─────────────────────────────────────────────

function runAllFilters() {
  observer.disconnect();
  if (urlObserver) urlObserver.disconnect();

  try {
    markPageType();
    injectStyles(currentSettings);

    filterVideos(currentSettings);
    filterShorts(currentSettings);
    filterSidebarVideos(currentSettings);

    // Autoplay uses its own retry loop — just kick it off here
    applyDisableAutoplay(currentSettings);

  } catch (error) {
    console.error('[YouTube Filter] Error during filtering:', error);
  } finally {
    const target = getObserverTarget();
    if (target) observer.observe(target, { childList: true, subtree: true });
    if (urlObserver) {
      const urlTarget =
        document.querySelector('title') || document.head || document.documentElement;
      if (urlTarget) {
        urlObserver.observe(urlTarget, { childList: true, subtree: true });
      }
    }
  }
}

function scheduleFilter() {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(runAllFilters, 500);
}

// ─────────────────────────────────────────────
// Init & Observers
// ─────────────────────────────────────────────

async function initialize() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    currentSettings = { ...currentSettings, ...settings };
    prepareSettings(currentSettings);
    runAllFilters();
    setTimeout(runAllFilters, 1500);
  } catch (error) {
    console.error('[YouTube Filter] Error loading settings:', error);
  }
}

const observer = new MutationObserver(() => scheduleFilter());

if (document.body) {
  const target = getObserverTarget();
  observer.observe(target, { childList: true, subtree: true });
}

let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(runAllFilters, 1000);
  }
});

const urlObserverTarget =
  document.querySelector('title') || document.head || document.documentElement;
if (urlObserverTarget) {
  urlObserver.observe(urlObserverTarget, { childList: true, subtree: true });
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'refilter') {
    return (async () => {
      try {
        const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
        currentSettings = { ...currentSettings, ...settings };
        prepareSettings(currentSettings);
        runAllFilters();
      } catch (error) {
        console.error('[YouTube Filter] Error reloading settings:', error);
      }
    })();
  }
});

browser.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync') {
    try {
      const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
      currentSettings = { ...currentSettings, ...settings };
      prepareSettings(currentSettings);
      runAllFilters();
    } catch (error) {
      console.error('[YouTube Filter] Error handling storage change:', error);
    }
  }
});

initialize();
