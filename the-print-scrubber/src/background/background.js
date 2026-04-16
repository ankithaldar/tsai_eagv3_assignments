/**
 * The Print Scrubber — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 *  1. Listen for the keyboard shortcut command and relay it to the active tab.
 *  2. Manage per-site enable / disable preferences via chrome.storage.
 *  3. Relay messages between popup, content script, and offscreen documents
 *     when deeper page introspection is needed (e.g. shadow DOM).
 */

/* ─────────── Default Settings ─────────── */

const DEFAULT_SETTINGS = {
  enabled: true,               // Master on/off
  removeAds: true,
  removeNav: true,
  removeSidebar: true,
  removeComments: true,
  removeSocialWidgets: true,
  removeFooter: true,
  removePopups: true,
  forceLightMode: true,
  removeBackgrounds: true,
  removeShadows: true,
  whitelist: []                // Array of hostnames where scrubber is disabled
};

/* ─────────── Initialise Defaults ─────────── */

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

/* ─────────── Command Handler ─────────── */

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'activate-print-scrub') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'scrubAndPrint' }).catch(() => {
      // Content script may not be injected yet — inject it first
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, () => {
        chrome.tabs.sendMessage(tab.id, { action: 'scrubAndPrint' }).catch(console.error);
      });
    });
  }
});

/* ─────────── Message Router ─────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    chrome.storage.local.get('settings', (result) => {
      sendResponse(result.settings || DEFAULT_SETTINGS);
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'isSiteEnabled') {
    const hostname = new URL(sender.tab?.url || sender.url || '').hostname;
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || DEFAULT_SETTINGS;
      const disabled = settings.whitelist?.includes(hostname);
      sendResponse({ enabled: settings.enabled && !disabled });
    });
    return true;
  }

  if (message.action === 'toggleSite') {
    const hostname = new URL(sender.tab?.url || sender.url || '').hostname;
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || DEFAULT_SETTINGS;
      if (!settings.whitelist) settings.whitelist = [];
      const idx = settings.whitelist.indexOf(hostname);
      if (idx === -1) {
        settings.whitelist.push(hostname);
      } else {
        settings.whitelist.splice(idx, 1);
      }
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ whitelisted: idx === -1 });
      });
    });
    return true;
  }
});

/* ─────────── Tab Update — Re-inject on navigation ─────────── */

// Content scripts with run_at "document_idle" are auto-injected on navigation,
// so no special handling is needed here.  The service worker stays dormant
// until a command or message wakes it up, keeping resource usage minimal.
