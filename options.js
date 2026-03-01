/**
 * YouTube Advanced Keyword Filter - Options Page Script
 *
 * Handles the full settings dashboard.
 * Manages all toggles, keyword inputs, and storage sync.
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
  hideSubscriptionCard: false,
  hideSubscriptionButton: false,
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

// All toggle/input IDs that map directly to storage keys
const TOGGLE_IDS = [
  'enabled', 'hideShorts', 'hideHomepageFeed', 'hideAllComments',
  'hideSponsoredCards', 'hideSubscriptionCard', 'hideSubscriptionButton',
  'hideMembersOnlyVideos', 'hideMixRadioPlaylists',
  'hideVideoSidebar', 'hideLiveChat', 'hideWatchPlaylistPanel',
  'hideTopHeader', 'hideNotificationBell', 'hideExploreAndTrending', 'disableAutoplay',
  'regex', 'wordBoundary', 'softHide'
];

const INPUT_IDS = ['keywords', 'blocklist', 'dateFilter'];

// ─────────────────────────────────────────────
// Sidebar navigation
// ─────────────────────────────────────────────

function initNav() {
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.settings-section');

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;

      links.forEach((l) => l.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));

      link.classList.add('active');
      const targetSection = document.getElementById(`section-${target}`);
      if (targetSection) targetSection.classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────
// Load settings into UI
// ─────────────────────────────────────────────

async function loadSettings() {
  try {
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);

    TOGGLE_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!settings[id];
    });

    INPUT_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        el.value = settings[id] || DEFAULT_SETTINGS[id];
      } else {
        el.value = settings[id] || '';
      }
    });
  } catch (err) {
    console.error('[YouTube Filter] Error loading settings:', err);
    showStatus('Error loading settings', true);
  }
}

// ─────────────────────────────────────────────
// Collect settings from UI
// ─────────────────────────────────────────────

function collectSettings() {
  const settings = {};

  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) settings[id] = el.checked;
  });

  INPUT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) settings[id] = el.value.trim ? el.value.trim() : el.value;
  });

  return settings;
}

// ─────────────────────────────────────────────
// Status message
// ─────────────────────────────────────────────

function showStatus(message, isError = false) {
  const el = document.getElementById('saveStatus');
  el.textContent = message;
  el.className = `save-status show${isError ? ' error' : ''}`;
  setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

// ─────────────────────────────────────────────
// Notify YouTube tabs to re-filter
// ─────────────────────────────────────────────

async function notifyTabs() {
  try {
    const tabs = await browser.tabs.query({ url: 'https://www.youtube.com/*' });
    tabs.forEach((tab) =>
      browser.tabs.sendMessage(tab.id, { action: 'refilter' }).catch(() => {})
    );
  } catch (e) {
    // Ignore
  }
}

// ─────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────

async function saveSettings() {
  try {
    const settings = collectSettings();
    await browser.storage.sync.set(settings);
    showStatus('✓ Settings saved');
    await notifyTabs();
  } catch (err) {
    console.error('[YouTube Filter] Error saving settings:', err);
    showStatus('Error saving settings', true);
  }
}

// ─────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────

async function resetSettings() {
  if (!confirm('Reset all settings to default?')) return;
  try {
    await browser.storage.sync.set(DEFAULT_SETTINGS);
    await loadSettings();
    showStatus('✓ Reset to defaults');
    await notifyTabs();
  } catch (err) {
    console.error('[YouTube Filter] Error resetting settings:', err);
    showStatus('Error resetting', true);
  }
}

// ─────────────────────────────────────────────
// Auto-save on any toggle change
// ─────────────────────────────────────────────

function initAutoSave() {
  TOGGLE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => saveSettings());
    }
  });

  let debounceTimer = null;
  INPUT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => saveSettings(), 600);
      });
      el.addEventListener('change', () => saveSettings());
    }
  });
}

// ─────────────────────────────────────────────
// Enter key saves in text inputs
// ─────────────────────────────────────────────

function initEnterKey() {
  document.querySelectorAll('input[type="text"]').forEach((input) => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveSettings();
    });
  });
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadSettings();
  initAutoSave();
  initEnterKey();

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
});