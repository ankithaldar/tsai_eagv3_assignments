/**
 * AnnoyBlock - Shared Constants
 *
 * Centralizes all magic numbers, enums, and configuration mappings.
 * Used by content scripts, popup, options page, and service worker.
 */

/* global AnnoyBlockConstants:true */

const AnnoyBlockConstants = (() => {
  'use strict';

  // ── Annoyance Levels (0-9 scale) ────────────────────────────────
  const LEVEL = Object.freeze({
    NONE:        0,
    MINIMAL:     1,
    LIGHT:       2,
    MODERATE:    3,
    NOTICEABLE:  4,
    DISTRACTING: 5,
    FRUSTRATING: 6,
    HIGH:        7,
    SEVERE:      8,
    MAXIMUM:     9,
  });

  const LEVEL_NAMES = Object.freeze([
    'Off', 'Minimal', 'Light', 'Moderate', 'Noticeable',
    'Distracting', 'Frustrating', 'High', 'Severe', 'Maximum',
  ]);

  // ── Effect minimum activation thresholds ────────────────────────
  const THRESHOLD = Object.freeze({
    SATURATION_REDUCE: 1,
    CLICK_DELAY:       2,
    FONT_WEIGHT:       3,
    IMAGE_ROTATE:      3,
    TEXT_BLUR:         4,
    CURSOR_JITTER:     5,
  });

  // ── Per-effect intensity maps (level → value) ──────────────────
  const EFFECTS = Object.freeze({
    SATURATION_REDUCE: {
      minLevel: THRESHOLD.SATURATION_REDUCE,
      // Percentage of original saturation (100 = no change)
      levels: { 1: 85, 2: 70, 3: 55, 4: 45, 5: 35, 6: 25, 7: 15, 8: 5, 9: 0 },
    },
    CLICK_DELAY: {
      minLevel: THRESHOLD.CLICK_DELAY,
      // Milliseconds of artificial delay
      levels: { 2: 100, 3: 200, 4: 300, 5: 500, 6: 700, 7: 900, 8: 1200, 9: 1500 },
    },
    FONT_WEIGHT: {
      minLevel: THRESHOLD.FONT_WEIGHT,
      // CSS font-weight value
      levels: { 3: 200, 4: 300, 5: 500, 6: 700, 7: 800, 8: 900, 9: 950 },
    },
    IMAGE_ROTATE: {
      minLevel: THRESHOLD.IMAGE_ROTATE,
      // Degrees of rotation
      levels: { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 7, 9: 10 },
    },
    TEXT_BLUR: {
      minLevel: THRESHOLD.TEXT_BLUR,
      // Pixels of blur
      levels: { 4: 0.5, 5: 1.0, 6: 1.5, 7: 2.0, 8: 3.0, 9: 4.0 },
    },
    CURSOR_JITTER: {
      minLevel: THRESHOLD.CURSOR_JITTER,
      // Pixels of random offset
      levels: { 5: 2, 6: 4, 7: 6, 8: 9, 9: 12 },
    },
  });

  // ── Storage keys ────────────────────────────────────────────────
  const STORAGE = Object.freeze({
    DOMAIN_CONFIGS: 'annoyblock_domain_configs',
    FOCUS_MODE:     'annoyblock_focus_mode',
    GLOBAL_SETTINGS:'annoyblock_global_settings',
  });

  // ── CSS / DOM identifiers ──────────────────────────────────────
  const DOM = Object.freeze({
    STYLE_TAG_ID:     'annoyblock-dynamic-styles',
    BADGE_TAG_ID:     'annoyblock-badge',
    CSS_PREFIX:       'annoyblock',
    CURSOR_STYLE_ID:  'annoyblock-jitter-style',
  });

  // ── Alarm names ─────────────────────────────────────────────────
  const ALARM = Object.freeze({
    FOCUS_CHECK: 'annoyblock-focus-check',
  });

  // ── Defaults ────────────────────────────────────────────────────
  const DEFAULTS = Object.freeze({
    DOMAIN_CONFIGS: {},
    FOCUS_MODE: {
      enabled: false,
      schedules: [],
      activeLevel: null,
    },
    GLOBAL_SETTINGS: {
      extensionEnabled: true,
      showBadge: true,
      respectReducedMotion: true,
    },
  });

  return { LEVEL, LEVEL_NAMES, THRESHOLD, EFFECTS, STORAGE, DOM, ALARM, DEFAULTS };
})();

// Make available globally for non-module contexts
if (typeof window !== 'undefined') {
  window.AnnoyBlockConstants = AnnoyBlockConstants;
}
