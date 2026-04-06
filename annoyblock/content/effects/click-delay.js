/**
 * AnnoyBlock Effect: Click Delay
 *
 * Intercepts click events during the capture phase and delays them.
 * Only intercepts clicks on interactive elements (links, buttons, inputs).
 * Re-dispatches clicks at the original coordinates after the delay.
 */

/* global AnnoyBlockConstants, AnnoyBlockUtils */

const ClickDelayEffect = (() => {
  'use strict';

  const EFFECT_KEY = 'CLICK_DELAY';
  let active = false;
  let handler = null;
  const pendingTimeouts = new Set();

  // Selectors for interactive elements to intercept
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input[type="button"]',
    'input[type="submit"]',
    '[role="button"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    'select',
    'summary',
    '[contenteditable="true"]',
  ].join(', ');

  function handleClick(e) {
    // Only primary mouse button
    if (e.button !== undefined && e.button !== 0) return;

    // Check if the click is on an interactive element
    const target = e.target.closest(INTERACTIVE_SELECTOR);
    if (!target) return;

    // Don't delay AnnoyBlock's own UI elements
    if (target.id && target.id.startsWith('annoyblock')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const level = window.__annoyblock_currentLevel || 0;
    const delay = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (delay === null) return;

    const coords = { x: e.clientX, y: e.clientY };

    const timeout = setTimeout(() => {
      pendingTimeouts.delete(timeout);
      const el = document.elementFromPoint(coords.x, coords.y);
      if (el) {
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: coords.x,
          clientY: coords.y,
          button: 0,
          view: window,
        }));
      }
    }, delay);

    pendingTimeouts.add(timeout);
  }

  function apply(level) {
    remove();
    const intensity = AnnoyBlockUtils.getEffectIntensity(EFFECT_KEY, level);
    if (intensity === null) return;

    active = true;
    handler = handleClick;
    document.addEventListener('click', handler, true);
  }

  function remove() {
    if (!active) return;
    active = false;

    if (handler) {
      document.removeEventListener('click', handler, true);
      handler = null;
    }

    for (const timeout of pendingTimeouts) {
      clearTimeout(timeout);
    }
    pendingTimeouts.clear();
  }

  return { name: EFFECT_KEY, apply, remove };
})();

if (typeof window !== 'undefined') {
  window.AnnoyBlockEffects = window.AnnoyBlockEffects || {};
  window.AnnoyBlockEffects.CLICK_DELAY = ClickDelayEffect;
}
