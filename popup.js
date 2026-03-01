/**
 * YouTube Advanced Keyword Filter - Popup Script (minimal)
 *
 * Shows master on/off toggle and quick stats.
 * Full settings are in the Options page.
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
  hideShorts: false,
  hideHomepageFeed: false,
  hideAllComments: false,
  hideSponsoredCards: false,
  hideSubscriptionCard: false,   // ✅ ADDED — fixes Hide Subscription Section
  hideSubscriptionButton: false, // ✅ ADDED — fixes Hide Subscription Button
  hidePlaylistCards: false,
  hideMembersOnlyVideos: false,
  hideMixRadioPlaylists: false,
  hideVideoSidebar: false,
  hideLiveChat: false,
  hideWatchPlaylistPanel: false,
  hideTopHeader: false,
  hideNotificationBell: false,
  hideExploreAndTrending: false,
  disableAutoplay: false
};

async function loadPopup() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    document.getElementById('enabled').checked = settings.enabled !== false;
    updateStats(settings);
  } catch (e) {
    console.error('[YouTube Filter] Popup load error:', e);
  }
}

function updateStats(settings) {
  const domToggles = [
    'hideShorts', 'hideHomepageFeed', 'hideAllComments',
    'hideSponsoredCards', 'hideSubscriptionCard', 'hideSubscriptionButton', // ✅ ADDED both here
    'hidePlaylistCards', 'hideMembersOnlyVideos',
    'hideMixRadioPlaylists', 'hideVideoSidebar', 'hideLiveChat',
    'hideWatchPlaylistPanel', 'hideTopHeader', 'hideNotificationBell',
    'hideExploreAndTrending', 'disableAutoplay'
  ];
  const activeToggles = domToggles.filter((k) => settings[k]).length;
  const hasAllowlist = settings.keywords?.trim().length > 0;
  const hasBlocklist = settings.blocklist?.trim().length > 0;
  const hasDateFilter = settings.dateFilter && settings.dateFilter !== 'any';

  const parts = [];
  if (activeToggles > 0) parts.push(`<span>${activeToggles}</span> hide rule${activeToggles !== 1 ? 's' : ''} active`);
  if (hasAllowlist) parts.push('allowlist on');
  if (hasBlocklist) parts.push('blocklist on');
  if (hasDateFilter) parts.push(`date: ${settings.dateFilter}`);

  document.getElementById('stats').innerHTML =
    parts.length > 0 ? parts.join(' · ') : 'No active filters';
}

document.getElementById('enabled').addEventListener('change', async (e) => {
  try {
    await browser.storage.sync.set({ enabled: e.target.checked });
    const tabs = await browser.tabs.query({ url: 'https://www.youtube.com/*' });
    tabs.forEach((tab) =>
      browser.tabs.sendMessage(tab.id, { action: 'refilter' }).catch(() => {})
    );
  } catch (err) {
    console.error('[YouTube Filter] Error saving enabled state:', err);
  }
});

document.getElementById('openSettings').addEventListener('click', () => {
  // Opens the options page in a new tab
  if (chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    browser.runtime.openOptionsPage?.();
  }
});

document.addEventListener('DOMContentLoaded', loadPopup);
