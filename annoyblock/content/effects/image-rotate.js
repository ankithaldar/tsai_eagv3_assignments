/**
 * AnnoyBlock Effect: Image Rotate
 *
 * Applies a subtle rotation to all images using CSS transforms.
 * Images return to normal on hover to maintain basic usability.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const ImageRotateEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'IMAGE_ROTATE';
  const STYLE_ID = 'annoyblock-image-rotate-style';
  let active = false;

  function apply(level) {
    remove();
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null || intensity === 0) return;

    active = true;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html img, html video, html svg, html [role="img"] {
        transform: rotate(${intensity}deg) scale(0.97) !important;
        transition: transform 0.4s ease !important;
        pointer-events: auto !important;
      }
      html img:hover, html video:hover, html svg:hover, html [role="img"]:hover {
        transform: rotate(0deg) scale(1.01) !important;
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
  window.AnnoyBlockEffects.IMAGE_ROTATE = ImageRotateEffect;
}
