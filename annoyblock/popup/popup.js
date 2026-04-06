/**
 * AnnoyBlock - Popup Logic
 *
 * Manages the popup UI state and synchronizes with chrome.storage.
 * All state is read from storage on open; writes happen immediately
 * on user interaction. No local state is maintained.
 */

/* global
  AnnoyBlockConstants, AnnoyBlockStorage, AnnoyBlockUtils
*/

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // ── DOM References ─────────────────────────────────────────
  const globalToggle  = document.getElementById('global-toggle');
  const domainName    = document.getElementById('domain-name');
  const whitelistBtn  = document.getElementById('whitelist-btn');
  const whitelistIcon = document.getElementById('whitelist-icon');
  const whitelistText = document.getElementById('whitelist-text');
  const levelSection  = document.getElementById('level-section');
  const levelSlider   = document.getElementById('level-slider');
  const levelValue    = document.getElementById('level-value');
  const levelHint     = document.getElementById('level-hint');
  const focusIndicator= document.getElementById('focus-indicator');
  const optionsBtn    = document.getElementById('options-btn');

  const { STORAGE, LEVEL } = AnnoyBlockConstants;

  // ── State ──────────────────────────────────────────────────
  let currentDomain = '';
  let domainConfig  = null;

  // ── Level descriptions for the hint text ───────────────────
  const LEVEL_HINTS = {
    0: 'No effects applied.',
    1: 'Slight color desaturation.',
    2: 'Reduced colors + minor click delay.',
    3: 'Bolder text + tilted images + click delay.',
    4: 'Blurred text + heavier fonts + rotation.',
    5: 'Full friction: all effects active.',
    6: 'High friction: slow clicks + heavy blur.',
    7: 'Very frustrating experience.',
    8: 'Severe: nearly unusable.',
    9: 'Maximum annoyance. Good luck!',
  };

  // ── Helpers ────────────────────────────────────────────────

  function updateLevelDisplay(level) {
    const name = AnnoyBlockUtils.getLevelName(level);
    levelValue.textContent = name;
    levelHint.textContent = LEVEL_HINTS[level] || LEVEL_HINTS[0];

    // Color the level value based on intensity
    if (level <= 2) {
      levelValue.style.color = '#38a169'; // green
    } else if (level <= 4) {
      levelValue.style.color = '#d69e2e'; // yellow
    } else if (level <= 6) {
      levelValue.style.color = '#dd6b20'; // orange
    } else {
      levelValue.style.color = '#e53e3e'; // red
    }
  }

  function updateWhitelistUI() {
    if (!domainConfig) return;
    const isWhitelisted = domainConfig.whitelisted === true;
    whitelistBtn.classList.toggle('active', isWhitelisted);
    whitelistIcon.innerHTML = isWhitelisted ? '&#x2713;' : '&#x2715;';
    whitelistText.textContent = isWhitelisted
      ? 'Site whitelisted (no effects)'
      : 'Whitelist this site';
  }

  function setDisabledState(disabled) {
    const overlay = document.getElementById('level-section');
    const wlRow = document.getElementById('whitelist-row');
    if (disabled) {
      overlay.classList.add('disabled-overlay');
      wlRow.classList.add('disabled-overlay');
    } else {
      overlay.classList.remove('disabled-overlay');
      wlRow.classList.remove('disabled-overlay');
    }
  }

  // ── Load state from storage ────────────────────────────────

  async function loadState() {
    try {
      // Get current tab URL
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const url = tab?.url || '';
      currentDomain = AnnoyBlockUtils.extractDomain(url);
      domainName.textContent = currentDomain || 'No valid URL';

      if (!currentDomain) {
        setDisabledState(true);
        return;
      }

      // Load all relevant state in parallel
      const [configs, settings, focusMode] = await Promise.all([
        AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS),
        AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS),
        AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE),
      ]);

      // Global toggle
      globalToggle.checked = settings.extensionEnabled;
      setDisabledState(!settings.extensionEnabled);

      // Domain config
      domainConfig = configs[currentDomain] || { level: 0, whitelisted: false };
      const level = AnnoyBlockUtils.clampLevel(domainConfig.level || 0);

      levelSlider.value = level;
      updateLevelDisplay(level);
      updateWhitelistUI();

      // Focus Mode indicator
      if (focusMode.enabled && focusMode.activeLevel !== null) {
        focusIndicator.style.display = 'flex';
      } else {
        focusIndicator.style.display = 'none';
      }

    } catch (err) {
      console.error('[AnnoyBlock] Popup load error:', err);
      domainName.textContent = 'Error loading';
    }
  }

  // ── Event Handlers ─────────────────────────────────────────

  // Global enable/disable toggle
  globalToggle.addEventListener('change', async () => {
    const enabled = globalToggle.checked;
    setDisabledState(!enabled);

    try {
      const settings = await AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS);
      await AnnoyBlockStorage.setLocal(STORAGE.GLOBAL_SETTINGS, {
        ...settings,
        extensionEnabled: enabled,
      });
    } catch (err) {
      console.error('[AnnoyBlock] Failed to update settings:', err);
    }
  });

  // Level slider change
  let sliderDebounce = null;
  levelSlider.addEventListener('input', async () => {
    const level = AnnoyBlockUtils.clampLevel(parseInt(levelSlider.value, 10));
    updateLevelDisplay(level);

    // Debounce storage writes (150ms)
    clearTimeout(sliderDebounce);
    sliderDebounce = setTimeout(async () => {
      try {
        const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
        if (!configs[currentDomain]) {
          configs[currentDomain] = { level: 0, whitelisted: false };
        }
        configs[currentDomain].level = level;
        await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);
      } catch (err) {
        console.error('[AnnoyBlock] Failed to save level:', err);
      }
    }, 150);
  });

  // Whitelist toggle
  whitelistBtn.addEventListener('click', async () => {
    if (!currentDomain || !domainConfig) return;

    const wasWhitelisted = domainConfig.whitelisted === true;
    const newWhitelisted = !wasWhitelisted;

    try {
      const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
      if (!configs[currentDomain]) {
        configs[currentDomain] = { level: 0, whitelisted: false };
      }
      configs[currentDomain].whitelisted = newWhitelisted;
      await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);

      domainConfig.whitelisted = newWhitelisted;
      updateWhitelistUI();

      // If whitelisting, reset slider display
      if (newWhitelisted) {
        levelSlider.value = 0;
        updateLevelDisplay(0);
      }
    } catch (err) {
      console.error('[AnnoyBlock] Failed to update whitelist:', err);
    }
  });

  // Open options page
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ── Initialize ─────────────────────────────────────────────
  await loadState();
});
