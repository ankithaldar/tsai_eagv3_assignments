/**
 * AnnoyBlock - Service Worker (background.js)
 *
 * Minimal MV3 service worker with zero persistent state.
 * Responsibilities:
 *  1. Initialize defaults on extension install/update
 *  2. Manage Focus Mode alarm (periodic 1-minute check)
 *  3. Update action badge based on active tab domain
 *
 * All state lives in chrome.storage — the SW can be killed at
 * any time without data loss.
 */

// ── Load shared modules via importScripts ─────────────────────
importScripts(
  'shared/constants.js',
  'shared/storage.js',
  'shared/utils.js'
);

const { STORAGE, ALARM, DEFAULTS } = AnnoyBlockConstants;

// ══════════════════════════════════════════════════════════════
// 1. Extension Lifecycle
// ══════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AnnoyBlock] Installed:', details.reason);

  // Initialize all default values
  await AnnoyBlockStorage.initDefaults();

  // Create the periodic Focus Mode check alarm
  chrome.alarms.create(ALARM.FOCUS_CHECK, {
    periodInMinutes: 1,
  });

  console.log('[AnnoyBlock] Alarm registered:', ALARM.FOCUS_CHECK);
});

// ══════════════════════════════════════════════════════════════
// 2. Focus Mode Alarm Handler
// ══════════════════════════════════════════════════════════════

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM.FOCUS_CHECK) return;

  try {
    const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);

    // If Focus Mode is disabled, ensure activeLevel is null
    if (!focusMode.enabled) {
      if (focusMode.activeLevel !== null) {
        await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, {
          ...focusMode,
          activeLevel: null,
        });
        console.log('[AnnoyBlock] Focus Mode disabled — deactivated');
      }
      return;
    }

    // Check if current time is within any schedule
    const activeSchedule = AnnoyBlockUtils.getActiveSchedule(focusMode.schedules);
    const newActiveLevel = activeSchedule
      ? AnnoyBlockUtils.clampLevel(activeSchedule.level || 5)
      : null;

    // Only write if state changed (minimize storage writes)
    if (focusMode.activeLevel !== newActiveLevel) {
      await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, {
        ...focusMode,
        activeLevel: newActiveLevel,
      });
      console.log(
        `[AnnoyBlock] Focus Mode level changed: ${focusMode.activeLevel} → ${newActiveLevel}`
      );
    }
  } catch (err) {
    console.error('[AnnoyBlock] Alarm handler error:', err);
  }
});

// ══════════════════════════════════════════════════════════════
// 3. Badge Management
// ══════════════════════════════════════════════════════════════

/**
 * Update the extension badge on the given tab to show the
 * current domain's annoyance level.
 */
async function updateBadgeForTab(tabId, url) {
  try {
    const domain = AnnoyBlockUtils.extractDomain(url);
    if (!domain) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
    const settings = await AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS);
    const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);

    // Determine effective level for badge display
    let level = 0;

    if (settings.extensionEnabled) {
      const config = configs[domain];
      if (config && !config.whitelisted) {
        level = config.level || 0;
      }

      // Focus Mode override
      if (focusMode.enabled && focusMode.activeLevel !== null) {
        level = focusMode.activeLevel;
      }
    }

    if (level > 0) {
      chrome.action.setBadgeText({
        text: String(level),
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#2B5797',
        tabId,
      });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (err) {
    // Silently ignore for non-http tabs (chrome://, etc.)
  }
}

// Update badge when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateBadgeForTab(activeInfo.tabId, tab.url);
  } catch (err) {
    // Tab may have been closed
  }
});

// Update badge when tab finishes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateBadgeForTab(tabId, tab.url);
  }
});

// ══════════════════════════════════════════════════════════════
// 4. Message Handling (Popup/Options communication)
// ══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_DOMAIN_CONFIG') {
    AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS)
      .then(configs => sendResponse({ configs }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'GET_FOCUS_MODE') {
    AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE)
      .then(focusMode => sendResponse({ focusMode }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS)
      .then(settings => sendResponse({ settings }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// ══════════════════════════════════════════════════════════════
// 5. Startup: Re-register alarm (in case it was cleared)
// ══════════════════════════════════════════════════════════════

chrome.alarms.get(ALARM.FOCUS_CHECK, (alarm) => {
  if (!alarm) {
    chrome.alarms.create(ALARM.FOCUS_CHECK, {
      periodInMinutes: 1,
    });
    console.log('[AnnoyBlock] Re-registered alarm on startup');
  }
});

console.log('[AnnoyBlock] Service worker started');
