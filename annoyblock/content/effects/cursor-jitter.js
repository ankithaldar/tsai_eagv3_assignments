/**
 * AnnoyBlock Effect: Cursor Jitter
 *
 * Creates a subtle page vibration by applying random
 * CSS translate offsets on mousemove. Changes cursor
 * to crosshair for added unease.
 *
 * IMPORTANT: Respects prefers-reduced-motion media query.
 * If reduced motion is preferred, this effect is auto-disabled.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const CursorJitterEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'CURSOR_JITTER';
  const STYLE_ID = 'annoyblock-cursor-jitter-style';
  let active = false;
  let boundHandler = null;
  let rafId = null;

  function onMouseMove(e) {
    if (!active) return;
    const level = window.__annoyblock_currentLevel || 0;
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null) return;

    // Throttle to ~60fps using rAF
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const dx = (Math.random() - 0.5) * intensity * 2;
      const dy = (Math.random() - 0.5) * intensity * 2;
      document.documentElement.style.transform =
        `translate(${dx}px, ${dy}px)`;
    });
  }

  function apply(level) {
    remove();

    // Auto-disable if user prefers reduced motion
    if (AnnoyBlockUtils.prefersReducedMotion()) {
      console.log('[AnnoyBlock] Cursor jitter skipped: prefers-reduced-motion');
      return;
    }

    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null || intensity === 0) return;

    active = true;

    // Inject cursor style
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html * { cursor: crosshair !important; }
      /* Prevent layout shift from translate */
      html { overflow: hidden; }
    `;
    document.documentElement.appendChild(style);

    boundHandler = onMouseMove;
    document.addEventListener('mousemove', boundHandler, { passive: true });
  }

  function remove() {
    if (!active) return;
    active = false;

    if (boundHandler) {
      document.removeEventListener('mousemove', boundHandler);
      boundHandler = null;
    }

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    document.documentElement.style.removeProperty('transform');
  }

  return { name: EFFECT_KEY, apply, remove };
})();

if (typeof window !== 'undefined') {
  window.AnnoyBlockEffects = window.AnnoyBlockEffects || {};
  window.AnnoyBlockEffects.CURSOR_JITTER = CursorJitterEffect;
}
