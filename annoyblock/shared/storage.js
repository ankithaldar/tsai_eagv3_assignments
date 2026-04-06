/**
 * AnnoyBlock - Storage Abstraction Layer
 *
 * Unified interface for chrome.storage.local and chrome.storage.sync.
 * Handles default-value merging, error recovery, and change notifications.
 * All other modules interact with storage exclusively through this layer.
 */

/* global AnnoyBlockConstants */

const AnnoyBlockStorage = (() => {
  'use strict';

  const { STORAGE, DEFAULTS } = AnnoyBlockConstants;

  // ── Internal helpers ────────────────────────────────────────────

  /**
   * Deep clone a plain object (JSON round-trip).
   * Ensures callers never get a reference to internal defaults.
   */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Merge user-provided values over defaults. Only copies keys that
   * exist in the defaults object, so stray storage keys are ignored.
   */
  function mergeDefaults(stored, defaults) {
    const merged = clone(defaults);
    if (stored && typeof stored === 'object') {
      for (const key of Object.keys(defaults)) {
        if (key in stored) {
          merged[key] = stored[key];
        }
      }
    }
    return merged;
  }

  // ── Retry wrapper ───────────────────────────────────────────────

  async function withRetry(fn, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        console.warn(`[AnnoyBlock] Storage attempt ${attempt}/${maxAttempts} failed:`, err.message);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, attempt * 100));
        }
      }
    }
    throw lastError;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Read a value from chrome.storage.local, merging with defaults
   * if the key is missing.
   */
  async function getLocal(key) {
    const result = await withRetry(() => chrome.storage.local.get(key));
    const stored = result[key];
    return mergeDefaults(stored, DEFAULTS[key]);
  }

  /**
   * Read a value from chrome.storage.sync, merging with defaults
   * if the key is missing.
   */
  async function getSync(key) {
    const result = await withRetry(() => chrome.storage.sync.get(key));
    const stored = result[key];
    return mergeDefaults(stored, DEFAULTS[key]);
  }

  /**
   * Write to chrome.storage.local.
   */
  async function setLocal(key, value) {
    await withRetry(() => chrome.storage.local.set({ [key]: clone(value) }));
  }

  /**
   * Write to chrome.storage.sync.
   */
  async function setSync(key, value) {
    await withRetry(() => chrome.storage.sync.set({ [key]: clone(value) }));
  }

  /**
   * Get bytes-in-use for monitoring storage quota.
   */
  async function getBytesInUse(keys) {
    return chrome.storage.local.getBytesInUse(keys);
  }

  /**
   * Register a listener for storage changes.
   * Returns an unsubscribe function.
   */
  function onChange(callback) {
    const listener = (changes, areaName) => {
      try {
        callback(changes, areaName);
      } catch (err) {
        console.error('[AnnoyBlock] Storage change handler error:', err);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  /**
   * Initialize default values on first install.
   * Only writes keys that don't already exist.
   */
  async function initDefaults() {
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      try {
        const result = await chrome.storage.local.get(key);
        if (result[key] === undefined) {
          await chrome.storage.local.set({ [key]: clone(defaultVal) });
          console.log(`[AnnoyBlock] Initialized default for: ${key}`);
        }
      } catch (err) {
        console.error(`[AnnoyBlock] Failed to init default for ${key}:`, err);
      }
    }
  }

  /**
   * Clear all AnnoyBlock data from storage (for reset/debug).
   */
  async function clearAll() {
    await Promise.all([
      chrome.storage.local.clear(),
      chrome.storage.sync.clear(),
    ]);
    await initDefaults();
  }

  return {
    getLocal,
    getSync,
    setLocal,
    setSync,
    getBytesInUse,
    onChange,
    initDefaults,
    clearAll,
  };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.AnnoyBlockStorage = AnnoyBlockStorage;
}
