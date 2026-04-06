/**
 * AnnoyBlock - DOM Observer
 *
 * MutationObserver-based system for handling SPA navigations
 * and dynamic content injection (infinite scroll, React/Vue updates).
 * Debounces rapid mutations to avoid performance impact.
 */

/* global AnnoyBlockConstants */

const AnnoyBlockDOMObserver = (() => {
  'use strict';

  const { DOM } = AnnoyBlockConstants;
  let observer = null;
  let pendingWork = false;
  let debounceTimer = null;
  const DEBOUNCE_MS = 150;

  /**
   * Process a batch of DOM mutations.
   * Applies AnnoyBlock classes to newly added elements.
   */
  function processMutations(mutations) {
    if (pendingWork) return;

    // Debounce rapid mutation bursts
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pendingWork = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          applyEffectClasses(node);

          // Process descendants
          const descendants = node.querySelectorAll('*');
          for (const child of descendants) {
            applyEffectClasses(child);
          }
        }
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Apply AnnoyBlock CSS classes to a single element
   * based on the current level (read from global state).
   */
  function applyEffectClasses(el) {
    const level = window.__annoyblock_currentLevel || 0;
    if (level <= 0) return;

    const tag = el.tagName;

    // Image rotation classes
    if (level >= AnnoyBlockConstants.THRESHOLD.IMAGE_ROTATE) {
      if (['IMG', 'VIDEO', 'SVG'].includes(tag) ||
          el.getAttribute('role') === 'img') {
        el.classList.add('annoyblock-img-rotate');
      }
    }

    // Text blur classes
    if (level >= AnnoyBlockConstants.THRESHOLD.TEXT_BLUR) {
      const textTags = ['P', 'SPAN', 'DIV', 'LI', 'TD', 'TH',
                        'BLOCKQUOTE', 'DD', 'DT', 'FIGCAPTION'];
      if (textTags.includes(tag)) {
        el.classList.add('annoyblock-text-blur');
      }
    }
  }

  /**
   * Start observing DOM mutations for the entire document.
   */
  function start() {
    if (observer) return; // Already observing

    observer = new MutationObserver(processMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    console.log('[AnnoyBlock] DOM observer started');
  }

  /**
   * Stop observing and clean up.
   */
  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(debounceTimer);
    pendingWork = false;
    console.log('[AnnoyBlock] DOM observer stopped');
  }

  /**
   * Force a full rescan of the current DOM.
   * Useful after level changes to catch missed elements.
   */
  function rescan() {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      applyEffectClasses(el);
    }
  }

  return { start, stop, rescan };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.AnnoyBlockDOMObserver = AnnoyBlockDOMObserver;
}
