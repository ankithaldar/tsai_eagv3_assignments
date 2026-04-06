/**
 * AnnoyBlock Effect: Saturation Reduce
 *
 * Desaturates the entire page using CSS filter.
 * Lowest threshold (Level 1+) — the most subtle effect.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const SaturationReduceEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'SATURATION_REDUCE';
  const STYLE_ID = 'annoyblock-saturation-style';
  let active = false;

  function apply(level) {
    remove();
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null || intensity >= 100) return;

    active = true;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `html { filter: saturate(${intensity}%) !important; }`;
    document.documentElement.appendChild(style);
  }

  function remove() {
    if (!active) return;
    active = false;
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    // Clear inline filter on html
    document.documentElement.style.removeProperty('filter');
  }

  return { name: EFFECT_KEY, apply, remove };
})();

// Register in global effects registry
if (typeof window !== 'undefined') {
  window.AnnoyBlockEffects = window.AnnoyBlockEffects || {};
  window.AnnoyBlockEffects.SATURATION_REDUCE = SaturationReduceEffect;
}
