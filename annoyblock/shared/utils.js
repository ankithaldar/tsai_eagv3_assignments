/**
 * AnnoyBlock - Utility Functions
 *
 * Pure utility functions used across multiple modules.
 * No dependencies on Chrome APIs — safe for unit testing.
 */

/* global AnnoyBlockConstants */

const AnnoyBlockUtils = (() => {
  'use strict';

  const { LEVEL, LEVEL_NAMES, EFFECTS } = AnnoyBlockConstants;

  // ── Domain helpers ──────────────────────────────────────────────

  /**
   * Extract a clean domain from a URL string.
   * Strips "www." prefix and returns empty string for non-HTTP URLs.
   */
  function extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Get the current page's domain from location.href.
   */
  function getCurrentDomain() {
    return extractDomain(location.href);
  }

  // ── Level helpers ───────────────────────────────────────────────

  /**
   * Get the human-readable name for an annoyance level.
   */
  function getLevelName(level) {
    return LEVEL_NAMES[Math.max(0, Math.min(9, level))] || LEVEL_NAMES[0];
  }

  /**
   * Clamp a level value to the valid 0-9 range.
   */
  function clampLevel(level) {
    return Math.max(LEVEL.NONE, Math.min(LEVEL.MAXIMUM, level));
  }

  /**
   * Get the intensity value for a given effect at a given level.
   * Returns null if the level is below the effect's threshold.
   */
  function getEffectIntensity(effectKey, level) {
    const effect = EFFECTS[effectKey];
    if (!effect || level < effect.minLevel) return null;

    // Find the closest level that has a mapping
    const levelEntries = Object.keys(effect.levels).map(Number).sort((a, b) => a - b);
    let value = effect.levels[levelEntries[0]]; // fallback to lowest

    for (const l of levelEntries) {
      if (l <= level) {
        value = effect.levels[l];
      } else {
        break;
      }
    }
    return value;
  }

  // ── Time helpers ────────────────────────────────────────────────

  /**
   * Check if the current time falls within any of the given schedules.
   * Each schedule: { days: [0-6], startHour, startMin, endHour, endMin }
   */
  function isWithinSchedule(schedules) {
    if (!schedules || schedules.length === 0) return false;

    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const timeMin = now.getHours() * 60 + now.getMinutes();

    return schedules.some(schedule => {
      if (!schedule.days || !schedule.days.includes(day)) return false;
      const start = (schedule.startHour || 0) * 60 + (schedule.startMin || 0);
      const end = (schedule.endHour || 23) * 60 + (schedule.endMin || 59);
      return timeMin >= start && timeMin < end;
    });
  }

  /**
   * Get the active schedule that matches the current time, or null.
   */
  function getActiveSchedule(schedules) {
    if (!schedules || schedules.length === 0) return null;

    const now = new Date();
    const day = now.getDay();
    const timeMin = now.getHours() * 60 + now.getMinutes();

    return schedules.find(schedule => {
      if (!schedule.days || !schedule.days.includes(day)) return false;
      const start = (schedule.startHour || 0) * 60 + (schedule.startMin || 0);
      const end = (schedule.endHour || 23) * 60 + (schedule.endMin || 59);
      return timeMin >= start && timeMin < end;
    }) || null;
  }

  // ── Accessibility ───────────────────────────────────────────────

  /**
   * Detect if the user prefers reduced motion.
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── Misc ────────────────────────────────────────────────────────

  /**
   * Generate a simple hash for a string (for non-crypto purposes).
   */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  return {
    extractDomain,
    getCurrentDomain,
    getLevelName,
    clampLevel,
    getEffectIntensity,
    isWithinSchedule,
    getActiveSchedule,
    prefersReducedMotion,
    simpleHash,
  };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.AnnoyBlockUtils = AnnoyBlockUtils;
}
