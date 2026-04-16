/**
 * The Print Scrubber — Popup Controller
 *
 * Manages the popup UI state, communicates with the background
 * service worker for settings persistence, and sends commands
 * to the content script in the active tab.
 */

(() => {
  'use strict';

  /* ───── DOM References ───── */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const masterToggle = $('#masterToggle');
  const statusDot = $('#statusDot');
  const statusText = $('#statusText');
  const loading = $('#loading');
  const settingsPanel = $('#settingsPanel');
  const siteToggle = $('#siteToggle');
  const siteToggleBtn = $('#siteToggleBtn');
  const btnScrubAndPrint = $('#btnScrubAndPrint');
  const btnPreview = $('#btnPreview');
  const btnReset = $('#btnReset');
  const miniToggles = $$('.mini-toggle');

  /* ───── State ───── */

  let currentSettings = null;
  let currentTabId = null;

  /* ───── Initialise ───── */

  async function init() {
    loading.style.display = 'block';
    settingsPanel.style.display = 'none';

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) currentTabId = tab.id;

      // Load settings from storage
      currentSettings = await getSettings();

      // Check if site is whitelisted
      if (currentTabId) {
        const siteInfo = await isSiteWhitelisted(tab.url);
        updateSiteToggle(siteInfo.whitelisted);
      }

      // Update UI
      updateUI();
      loading.style.display = 'none';
      settingsPanel.style.display = 'block';

      // Bind events
      bindEvents();
    } catch (err) {
      console.error('[Print Scrubber Popup] Init error:', err);
      loading.querySelector('span').textContent = 'Error loading settings';
    }
  }

  /* ───── Settings I/O ───── */

  function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        resolve(response || getDefaults());
      });
    });
  }

  function saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'saveSettings', settings }, (response) => {
        resolve(response);
      });
    });
  }

  function getDefaults() {
    return {
      enabled: true,
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
      whitelist: []
    };
  }

  /* ───── Site Whitelist ───── */

  function isSiteWhitelisted(url) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(currentTabId, { action: 'getStatus' }, (response) => {
        // Fallback: check settings directly
        chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
          const s = settings || getDefaults();
          const hostname = new URL(url).hostname;
          const whitelisted = s.whitelist?.includes(hostname) || false;
          resolve({ whitelisted });
        });
      });
    });
  }

  function toggleSite(enabled) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(currentTabId, { action: 'toggleSite' }, (response) => {
        resolve(response);
      });
    });
  }

  /* ───── UI Update ───── */

  function updateUI() {
    if (!currentSettings) return;

    // Master toggle
    masterToggle.classList.toggle('active', currentSettings.enabled);
    statusDot.classList.toggle('disabled', !currentSettings.enabled);
    statusText.textContent = currentSettings.enabled ? 'Active' : 'Disabled';

    // Mini toggles
    miniToggles.forEach((toggle) => {
      const key = toggle.dataset.key;
      if (key && currentSettings[key] !== undefined) {
        toggle.classList.toggle('active', currentSettings[key]);
      }
    });
  }

  function updateSiteToggle(whitelisted) {
    if (whitelisted) {
      siteToggle.style.display = 'flex';
      siteToggle.querySelector('span').textContent = 'Scrubber disabled on this site';
      siteToggleBtn.textContent = 'Enable';
    } else {
      siteToggle.style.display = 'none';
    }
  }

  /* ───── Event Binding ───── */

  function bindEvents() {
    // Master toggle
    masterToggle.addEventListener('click', async () => {
      currentSettings.enabled = !currentSettings.enabled;
      await saveSettings(currentSettings);
      updateUI();
    });

    // Mini toggles
    miniToggles.forEach((toggle) => {
      toggle.addEventListener('click', async () => {
        const key = toggle.dataset.key;
        if (!key) return;
        currentSettings[key] = !currentSettings[key];
        await saveSettings(currentSettings);
        updateUI();
      });
    });

    // Site toggle
    siteToggleBtn.addEventListener('click', async () => {
      const result = await toggleSite();
      const siteInfo = await isSiteWhitelisted(
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url
      );
      updateSiteToggle(siteInfo.whitelisted);
    });

    // Scrub & Print button
    btnScrubAndPrint.addEventListener('click', async () => {
      if (!currentTabId) return;
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'scrubAndPrint' });
        window.close(); // Close popup after triggering
      } catch (err) {
        console.error('[Print Scrubber] Could not send scrubAndPrint:', err);
        // Content script not loaded — inject it first
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['content.js']
          });
          await chrome.tabs.sendMessage(currentTabId, { action: 'scrubAndPrint' });
          window.close();
        } catch (e2) {
          alert('Cannot access this page. Try refreshing and trying again.');
        }
      }
    });

    // Preview button (scrub without printing)
    btnPreview.addEventListener('click', async () => {
      if (!currentTabId) return;
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'scrubOnly' });
        window.close();
      } catch (err) {
        alert('Cannot access this page. Try refreshing and trying again.');
      }
    });

    // Restore button
    btnReset.addEventListener('click', async () => {
      if (!currentTabId) return;
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'restorePage' });
      } catch (err) {
        // Page might not be scrubbed — that's okay
      }
    });
  }

  /* ───── Start ───── */

  document.addEventListener('DOMContentLoaded', init);
})();
