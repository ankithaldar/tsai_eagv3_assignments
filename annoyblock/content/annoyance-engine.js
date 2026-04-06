/**
 * AnnoyBlock - Main Content Script Engine
 *
 * Core orchestrator that runs on every matching page.
 * Responsibilities:
 *  - Determine effective annoyance level for current domain
 *  - Apply/remove effects based on level and Focus Mode state
 *  - Handle storage change events for real-time updates
 *  - Manage the badge indicator overlay
 *
 * This script must be loaded LAST in the content_scripts array
 * because it depends on all shared modules and effect modules.
 */

/* global
  AnnoyBlockConstants, AnnoyBlockStorage, AnnoyBlockUtils,
  AnnoyBlockDOMObserver
*/

const AnnoyBlockEngine = (() => {
  'use strict';

  const { STORAGE, DOM, LEVEL, EFFECTS, DEFAULTS } = AnnoyBlockConstants;

  // ── Internal state ──────────────────────────────────────────────
  let currentLevel = -1;  // -1 = not yet initialized
  let badgeElement = null;
  let storageUnsubscribe = null;
  let initialized = false;

  // ── Level computation ───────────────────────────────────────────

  /**
   * Compute the effective annoyance level for the current domain.
   * Priority: Focus Mode active > per-domain config > global default (0).
   */
  async function computeEffectiveLevel(domainConfigs, focusMode) {
    // Focus Mode override
    if (focusMode.enabled && focusMode.activeLevel !== null) {
      return AnnoyBlockUtils.clampLevel(focusMode.activeLevel);
    }

    // Per-domain config
    const domain = AnnoyBlockUtils.getCurrentDomain();
    if (!domain) return LEVEL.NONE;

    const config = domainConfigs[domain];
    if (!config) return LEVEL.NONE;

    // Check whitelist
    if (config.whitelisted) return LEVEL.NONE;

    return AnnoyBlockUtils.clampLevel(config.level || LEVEL.NONE);
  }

  // ── Badge overlay ───────────────────────────────────────────────

  function showBadge(level) {
    removeBadge();

    if (level <= 0) return;

    badgeElement = document.createElement('div');
    badgeElement.id = DOM.BADGE_TAG_ID;
    badgeElement.className = 'annoyblock-badge';
    badgeElement.textContent = `AnnoyBlock: ${AnnoyBlockUtils.getLevelName(level)}`;
    document.documentElement.appendChild(badgeElement);

    // Auto-fade after 3 seconds
    setTimeout(() => {
      if (badgeElement) {
        badgeElement.style.opacity = '0';
        setTimeout(() => removeBadge(), 500);
      }
    }, 3000);
  }

  function removeBadge() {
    if (badgeElement) {
      badgeElement.remove();
      badgeElement = null;
    }
  }

  // ── Effect management ───────────────────────────────────────────

  /**
   * Apply all effects for the given level.
   * Uses the registered effects from window.AnnoyBlockEffects.
   */
  function applyEffects(level) {
    if (level === currentLevel) return; // No change

    // Remove old effects first
    removeAllEffects();

    currentLevel = level;

    // Store level globally for effect modules to read
    window.__annoyblock_currentLevel = level;

    if (level <= 0) {
      showBadge(0);
      return;
    }

    // Apply each registered effect
    const effects = window.AnnoyBlockEffects || {};
    for (const [key, effect] of Object.entries(effects)) {
      try {
        effect.apply(level);
      } catch (err) {
        console.error(`[AnnoyBlock] Error applying effect ${key}:`, err);
      }
    }

    // Show badge
    showBadge(level);

    // Start/resume DOM observer for SPA support
    AnnoyBlockDOMObserver.start();
  }

  /**
   * Remove all active effects.
   */
  function removeAllEffects() {
    const effects = window.AnnoyBlockEffects || {};
    for (const [key, effect] of Object.entries(effects)) {
      try {
        effect.remove();
      } catch (err) {
        console.error(`[AnnoyBlock] Error removing effect ${key}:`, err);
      }
    }
    removeBadge();
  }

  // ── Storage change handler ──────────────────────────────────────

  function handleStorageChange(changes, areaName) {
    // Re-read relevant data and recompute
    Promise.all([
      AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS),
      AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE),
      AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS),
    ]).then(([domainConfigs, focusMode, settings]) => {
      // Check if extension is globally disabled
      if (!settings.extensionEnabled) {
        applyEffects(LEVEL.NONE);
        AnnoyBlockDOMObserver.stop();
        return;
      }

      computeEffectiveLevel(domainConfigs, focusMode).then(level => {
        applyEffects(level);
      });
    }).catch(err => {
      console.error('[AnnoyBlock] Error handling storage change:', err);
    });
  }

  // ── Initialization ──────────────────────────────────────────────

  async function init() {
    if (initialized) return;
    initialized = true;

    try {
      // Load all relevant state in parallel
      const [domainConfigs, focusMode, settings] = await Promise.all([
        AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS),
        AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE),
        AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS),
      ]);

      // If extension is globally disabled, do nothing
      if (!settings.extensionEnabled) {
        console.log('[AnnoyBlock] Extension is globally disabled');
        return;
      }

      // Compute and apply effective level
      const effectiveLevel = await computeEffectiveLevel(domainConfigs, focusMode);
      applyEffects(effectiveLevel);

      // Listen for storage changes
      storageUnsubscribe = AnnoyBlockStorage.onChange(handleStorageChange);

      console.log(`[AnnoyBlock] Initialized on ${AnnoyBlockUtils.getCurrentDomain()} with level ${effectiveLevel}`);
    } catch (err) {
      console.error('[AnnoyBlock] Initialization error:', err);
    }
  }

  /**
   * Clean shutdown (called before page unload).
   */
  function destroy() {
    removeAllEffects();
    AnnoyBlockDOMObserver.stop();
    if (storageUnsubscribe) {
      storageUnsubscribe();
      storageUnsubscribe = null;
    }
    window.__annoyblock_currentLevel = 0;
    initialized = false;
  }

  // ── Boot ────────────────────────────────────────────────────────
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

  // Cleanup on page unload
  window.addEventListener('unload', destroy);

  // Expose for debugging and testing
  return { init, destroy, applyEffects, removeAllEffects };
})();

if (typeof window !== 'undefined') {
  window.AnnoyBlockEngine = AnnoyBlockEngine;
}
