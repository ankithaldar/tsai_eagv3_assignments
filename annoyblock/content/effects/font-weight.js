/**
 * AnnoyBlock Effect: Font Weight
 *
 * Overrides font-weight on body text, making pages feel
 * heavier and harder to skim. Links and buttons get
 * even bolder treatment.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const FontWeightEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'FONT_WEIGHT';
  const STYLE_ID = 'annoyblock-font-weight-style';
  let active = false;

  function apply(level) {
    remove();
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null) return;

    active = true;
    const style = document.createElement('style');
    style.id = STYLE_ID;

    // Make links extra bold for additional friction
    const linkWeight = Math.min(950, intensity + 100);

    style.textContent = `
      html body, html p, html span, html div, html li,
      html td, html th, html blockquote, html dd, html dt,
      html figcaption, html label, html summary {
        font-weight: ${intensity} !important;
        transition: font-weight 0.3s ease !important;
      }
      html a, html button, html [role="button"] {
        font-weight: ${linkWeight} !important;
        transition: font-weight 0.3s ease !important;
      }
      /* Don't affect AnnoyBlock's own UI */
      #annoyblock-badge, #annoyblock-badge * {
        font-weight: normal !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function remove() {
    if (!active) return;
    active = false;
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  return { name: EFFECT_KEY, apply, remove };
})();

if (typeof window !== 'undefined') {
  window.AnnoyBlockEffects = window.AnnoyBlockEffects || {};
  window.AnnoyBlockEffects.FONT_WEIGHT = FontWeightEffect;
}
