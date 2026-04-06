/**
 * AnnoyBlock Effect: Text Blur
 *
 * Applies CSS blur filter to text-containing elements.
 * Uses will-change hint for performance.
 * Headers and navigation get lighter blur to maintain orientation.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const TextBlurEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'TEXT_BLUR';
  const STYLE_ID = 'annoyblock-text-blur-style';
  let active = false;

  // Elements that get full blur
  const TEXT_ELEMENTS = [
    'html p', 'html span', 'html div', 'html li',
    'html td', 'html th', 'html blockquote', 'html pre',
    'html dd', 'html dt', 'html figcaption',
  ].join(', ');

  // Elements that get reduced blur (navigation, headings)
  const NAV_ELEMENTS = [
    'html h1', 'html h2', 'html h3', 'html h4',
    'html h5', 'html h6', 'html nav', 'html header',
    'html [role="navigation"]', 'html [role="banner"]',
  ].join(', ');

  function apply(level) {
    remove();
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null || intensity === 0) return;

    active = true;
    const style = document.createElement('style');
    style.id = STYLE_ID;

    // Use reduced blur for navigation elements (50% of main blur)
    const navBlur = Math.max(0, intensity * 0.4);

    style.textContent = `
      ${TEXT_ELEMENTS} {
        filter: blur(${intensity}px) !important;
        will-change: filter !important;
        transition: filter 0.3s ease !important;
      }
      ${NAV_ELEMENTS} {
        filter: blur(${navBlur}px) !important;
        will-change: filter !important;
        transition: filter 0.3s ease !important;
      }
      /* Override for AnnoyBlock's own elements */
      #annoyblock-badge, #annoyblock-badge * {
        filter: none !important;
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
  window.AnnoyBlockEffects.TEXT_BLUR = TextBlurEffect;
}
