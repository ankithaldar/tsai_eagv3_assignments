/**
 * The Print Scrubber — Content Script
 *
 * This is the core engine that:
 *  1. Intercepts window.print() calls and Ctrl+P / Cmd+P keyboard shortcuts.
 *  2. Runs a DOM scrubber that removes ads, nav, sidebars, comments, etc.
 *  3. Injects print-optimized CSS to fix dark mode / fancy styles.
 *  4. Restores the original page state after the print dialog closes.
 *  5. Handles edge cases: iframes, shadow DOM, dynamically loaded content.
 *
 * Architecture Notes:
 *  • We hook into window.print by overriding the native function.
 *  • Keyboard shortcut interception uses a capturing-phase keydown listener
 *    placed BEFORE Chrome's own print handler fires.
 *  • We listen for 'afterprint' and 'beforeprint' events to detect when the
 *    user finishes (or cancels) the native print dialog.
 *  • For iframes, we recursively inject ourselves into same-origin frames.
 *  • For shadow DOM, we walk the composed tree to find and scrub elements.
 */

(() => {
  'use strict';

  /* ───────────── Guard: don't double-inject ───────────── */
  if (window.__printScrubberInjected) return;
  window.__printScrubberInjected = true;

  /* ───────────── Constants ───────────── */

  const NAMESPACE = 'print-scrubber';
  const SCRUB_STYLE_ID = `${NAMESPACE}-style`;
  const HIDDEN_ATTR = `data-${NAMESPACE}-hidden`;
  const CLONE_CONTAINER_ID = `${NAMESPACE}-clone-container`;

  /* ───────────── State ───────────── */

  let isScrubbed = false;
  let savedScrollPosition = { x: 0, y: 0 };
  let originalTitle = document.title;
  let hiddenElements = [];      // Track elements we hide (for restoration)
  let injectedStyleEl = null;   // Reference to our injected <style>
  let settings = null;

  /* ═══════════════════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════════════════ */

  async function loadSettings() {
    try {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
          resolve(response || getFallbackSettings());
        });
      });
    } catch {
      return getFallbackSettings();
    }
  }

  function getFallbackSettings() {
    return {
      enabled: true,
      removeAds: true,
      removeNav: true,
      removeSidebar: true,
      removeComments: true,
      removeSocialWidgets: true,
      removeFooter: true,
      removePopups: true,
      forceLightMode: true,
      removeBackgrounds: true,
      removeShadows: true
    };
  }

  /* ═══════════════════════════════════════════════════════
     PRINT INTERCEPTION MECHANISM
     ═══════════════════════════════════════════════════════

     How interception works in Manifest V3:

     1. window.print() override:
        We save the native window.print and replace it with our wrapper.
        This catches programmatic calls (e.g., "Print this page" buttons).

     2. Ctrl+P / Cmd+P keyboard interception:
        Chrome processes Ctrl+P internally *after* the page's capturing
        listeners.  We register a capturing-phase keydown listener that
        calls preventDefault() to stop Chrome from opening the print
        dialog, then run our scrubber, and finally call nativePrint()
        ourselves.

     3. afterprint / beforeprint events:
        These fire when the native print dialog opens ('beforeprint')
        and when it closes ('afterprint' — regardless of whether the
        user printed or cancelled).  We use 'afterprint' to restore.

     Why this works with Manifest V3:
        • Content scripts run in the page's JS context (isolated world)
          but share the DOM.  Overriding window.print works because
          the native function is a property of the shared window object.
        • Service workers in MV3 are separate from content scripts,
          so all interception logic lives in the content script where
          we have direct DOM access.
        • No webRequest blocking is needed — we intercept at the
          page level, not the network level.
     ═══════════════════════════════════════════════════════ */

  const nativePrint = window.print.bind(window);

  function installPrintInterceptor() {
    /* 1. Override window.print() */
    window.print = function scrubbedPrint() {
      scrubAndPrint();
    };

    /* 2. Intercept Ctrl+P / Cmd+P in the capturing phase */
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
          // Only intercept if the target is the document body or html
          // (avoid breaking input fields where Ctrl+P might paste)
          const tag = (e.target || e.srcElement)?.tagName?.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return; // Let default behaviour happen for form elements
          }

          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          scrubAndPrint();
        }
      },
      true // CAPTURING phase — fires before Chrome's own handler
    );

    /* 3. Listen for afterprint to restore the page */
    window.addEventListener('afterprint', restorePage);
    window.addEventListener('beforeprint', () => {
      // Some browsers fire this — we can use it as a backup signal
    });
  }

  /* ═══════════════════════════════════════════════════════
     MAIN ORCHESTRATOR
     ═══════════════════════════════════════════════════════ */

  async function scrubAndPrint() {
    if (isScrubbed) return; // Already scrubbed, don't double-process

    settings = await loadSettings();
    if (!settings.enabled) {
      nativePrint();
      return;
    }

    // Check per-site whitelist
    try {
      const isSiteEnabled = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'isSiteEnabled' }, (r) => resolve(r?.enabled ?? true));
      });
      if (!isSiteEnabled) {
        nativePrint();
        return;
      }
    } catch {
      // If messaging fails, proceed with scrubbing (safer default)
    }

    isScrubbed = true;

    try {
      // Save current scroll position and title
      savedScrollPosition = { x: window.scrollX, y: window.scrollY };
      originalTitle = document.title;

      // Phase 1: Scrub the DOM
      scrubDOM();

      // Phase 2: Inject print-optimized CSS
      injectPrintStyles();

      // Phase 3: Handle iframes (same-origin only)
      scrubIframes();

      // Phase 4: Small delay to let styles settle, then print
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nativePrint();
        });
      });
    } catch (error) {
      console.error('[Print Scrubber] Error during scrub:', error);
      // Fallback: just print normally
      restorePage();
      nativePrint();
    }
  }

  /* ═══════════════════════════════════════════════════════
     DOM SCRUBBER
     ═══════════════════════════════════════════════════════ */

  /**
   * Comprehensive selector lists for detecting print-unfriendly elements.
   * These are built from analysing common CMS frameworks, ad networks,
   * and site patterns across thousands of websites.
   */
  const SELECTORS = {
    ads: [
      /* Generic ad containers */
      '[id*="ad-"]', '[id*="ad_"]', '[id*="advert"]',
      '[id*="google_ads"]', '[id*="AdSlot"]', '[id*="ad-slot"]',
      '[class*="ad-"]', '[class*="ad_"]', '[class*="advert"]',
      '[class*="adsbygoogle"]', '[class*="ad-container"]',
      '[class*="ad-wrapper"]', '[class*="ad-banner"]',
      '[data-ad]', '[data-ad-slot]', '[data-ad-unit]',
      '[data-google-query-id]',
      'ins.adsbygoogle',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="amazon-adsystem"]',
      'div[id^="div-gpt-ad"]',
      'div[class*="AdSense"]',
      'amp-ad', '.ad-placement', '.sponsored-content',
      '[aria-label*="Advertisement"]', '[aria-label*="Sponsored"]',
      '[role="complementary"][class*="ad"]'
    ],

    navigation: [
      'nav', '[role="navigation"]',
      'header', '[role="banner"]',
      '[class*="nav"]', '[class*="header"]',
      '[class*="topbar"]', '[class*="top-bar"]',
      '[class*="navbar"]', '[class*="menubar"]',
      '[class*="breadcrumb"]',
      '[id*="navigation"]', '[id*="nav-"]', '[id*="nav_"]',
      '[id*="menu"]', '[id*="header"]',
      '[class*="mega-menu"]',
      'ul[class*="nav-list"]'
    ],

    sidebar: [
      'aside', '[role="complementary"]',
      '[class*="sidebar"]', '[class*="side-bar"]',
      '[class*="side_panel"]', '[class*="sidepanel"]',
      '[id*="sidebar"]', '[id*="side-bar"]',
      '[class*="widget-area"]', '[class*="widget-area"]',
      '[class*="related-posts"]', '[class*="related-articles"]',
      '[class*="trending"]'
    ],

    comments: [
      '[class*="comment"]', '[id*="comment"]',
      '[class*="Comments"]', '[id*="Comments"]',
      '[class*="discussion"]', '[class*="reply"]',
      '#comments', '.comments-area', '.comment-list',
      '[class*="disqus"]', '[id*="disqus"]',
      '#comment-form', '.comment-form',
      '[class*="fb-comments"]', '[class*="g-comments"]'
    ],

    socialWidgets: [
      '[class*="social"]', '[class*="share"]',
      '[class*="follow"]', '[class*="like"]',
      '[id*="social"]', '[id*="share"]',
      '[class*="facebook"]', '[class*="twitter"]',
      '[class*="tweet"]', '[class*="pinterest"]',
      '[class*="linkedin"]', '[class*="reddit"]',
      '[class*="share-bar"]', '[class*="share-buttons"]',
      '[class*="floating-share"]', '[class*="sticky-share"]',
      'iframe[src*="platform.twitter.com"]',
      'iframe[src*="facebook.com/plugins"]',
      'iframe[src*="disqus.com"]'
    ],

    footer: [
      'footer', '[role="contentinfo"]',
      '[class*="footer"]', '[id*="footer"]',
      '[class*="site-footer"]', '[class*="page-footer"]',
      '[class*="bottom-bar"]', '[class*="bottombar"]'
    ],

    popups: [
      '[class*="popup"]', '[class*="pop-up"]',
      '[class*="modal"]', '[class*="overlay"]',
      '[class*="lightbox"]', '[class*="interstitial"]',
      '[class*="newsletter-popup"]', '[class*="subscribe-popup"]',
      '[class*="cookie"]', '[class*="consent"]',
      '[class*="banner-bottom"]', '[class*="notification"]',
      '[id*="popup"]', '[id*="modal"]',
      '[class*="sticky-bar"]', '[class*="nag"]',
      '[aria-modal="true"]'
    ]
  };

  function scrubDOM() {
    const selectorMap = [
      { key: 'removeAds', selectors: SELECTORS.ads },
      { key: 'removeNav', selectors: SELECTORS.navigation },
      { key: 'removeSidebar', selectors: SELECTORS.sidebar },
      { key: 'removeComments', selectors: SELECTORS.comments },
      { key: 'removeSocialWidgets', selectors: SELECTORS.socialWidgets },
      { key: 'removeFooter', selectors: SELECTORS.footer },
      { key: 'removePopups', selectors: SELECTORS.popups }
    ];

    for (const { key, selectors } of selectorMap) {
      if (!settings[key]) continue;
      const combined = selectors.join(', ');
      try {
        const elements = document.querySelectorAll(combined);
        elements.forEach((el) => hideElement(el));
      } catch (err) {
        console.warn(`[Print Scrubber] Error with selector group "${key}":`, err);
      }
    }

    // Also scrub shadow DOM
    scrubShadowDOM();
  }

  /**
   * Hide an element without removing it from the DOM.
   * We set a data attribute so we can find and restore it later.
   */
  function hideElement(el) {
    if (el.getAttribute(HIDDEN_ATTR)) return; // Already hidden by us
    el.setAttribute(HIDDEN_ATTR, 'true');

    // Store original styles so we can restore them exactly
    hiddenElements.push({
      element: el,
      originalDisplay: el.style.getPropertyValue('display'),
      originalVisibility: el.style.getPropertyValue('visibility'),
      originalOpacity: el.style.getPropertyValue('opacity'),
      originalPosition: el.style.getPropertyValue('position')
    });

    el.style.setProperty('display', 'none', 'important');
  }

  /**
   * Walk the composed tree (including shadow roots) and hide
   * elements matching our heuristics inside shadow DOMs.
   */
  function scrubShadowDOM() {
    if (!settings.removeAds) return;

    const walkShadowRoots = (root) => {
      const allElements = root.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el.shadowRoot) {
          // Check inside the shadow root
          const shadowEls = el.shadowRoot.querySelectorAll(
            SELECTORS.ads.join(', ')
          );
          shadowEls.forEach((shadowEl) => hideElement(shadowEl));
          // Recurse into nested shadow DOMs
          walkShadowRoots(el.shadowRoot);
        }
      });
    };

    walkShadowRoots(document);
  }

  /**
   * Recursively scrub same-origin iframes.
   * Cross-origin iframes are inaccessible due to browser security.
   */
  function scrubIframes() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return; // Cross-origin — skip silently

        // Check if our script is already injected
        if (iframe.contentWindow.__printScrubberInjected) return;

        // Apply same hiding logic inside the iframe
        const selectorMap = [
          { key: 'removeAds', selectors: SELECTORS.ads },
          { key: 'removeNav', selectors: SELECTORS.navigation },
          { key: 'removeSidebar', selectors: SELECTORS.sidebar }
        ];

        for (const { key, selectors } of selectorMap) {
          if (!settings[key]) continue;
          const combined = selectors.join(', ');
          try {
            const elements = iframeDoc.querySelectorAll(combined);
            elements.forEach((el) => {
              el.style.setProperty('display', 'none', 'important');
            });
          } catch (err) {
            // Ignore errors in cross-origin contexts
          }
        }

        // Recurse into nested iframes
        const nestedIframes = iframeDoc.querySelectorAll('iframe');
        nestedIframes.forEach((nested) => {
          try {
            scrubIframes.call({ contentDocument: nested.contentDocument });
          } catch {
            // Cross-origin — skip
          }
        });
      } catch {
        // Cross-origin iframe — silently skip (expected behaviour)
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
     PRINT-OPTIMIZED CSS INJECTION
     ═══════════════════════════════════════════════════════ */

  function injectPrintStyles() {
    if (injectedStyleEl) return; // Already injected

    const css = buildPrintCSS();

    injectedStyleEl = document.createElement('style');
    injectedStyleEl.id = SCRUB_STYLE_ID;
    injectedStyleEl.setAttribute('type', 'text/css');
    injectedStyleEl.textContent = css;

    // Insert as the LAST element in <head> for maximum specificity
    (document.head || document.documentElement).appendChild(injectedStyleEl);
  }

  function buildPrintCSS() {
    const rules = [];

    /* ── Force light backgrounds ── */
    if (settings.forceLightMode) {
      rules.push(`
        /* Force white background on all elements */
        *, *::before, *::after {
          background-color: white !important;
          color: black !important;
          background-image: none !important;
        }

        /* Ensure links are visible but distinguishable */
        a {
          color: #0000EE !important;
          text-decoration: underline !important;
        }
        a:visited {
          color: #551A8B !important;
        }

        /* Fix images with transparent/white backgrounds */
        img, svg, video, canvas {
          background-color: transparent !important;
        }

        /* Code blocks */
        pre, code, kbd, samp {
          background-color: #F5F5F5 !important;
          color: #1A1A1A !important;
          border: 1px solid #DDD !important;
        }

        /* Table styling */
        table, th, td {
          background-color: white !important;
          color: black !important;
          border: 1px solid #CCC !important;
        }

        /* Blockquote styling */
        blockquote {
          border-left: 3px solid #CCC !important;
          background-color: #FAFAFA !important;
          color: #333 !important;
        }
      `);
    }

    /* ── Remove decorative backgrounds ── */
    if (settings.removeBackgrounds) {
      rules.push(`
        /* Strip background images and gradients from all elements */
        body, div, section, article, main, header, footer,
        aside, nav, span, p, h1, h2, h3, h4, h5, h6,
        ul, ol, li, form, input, textarea, select, button {
          background-image: none !important;
          background: white !important;
        }

        /* Preserve transparent backgrounds on media */
        img, video, canvas, svg, picture {
          background: transparent !important;
        }
      `);
    }

    /* ── Remove shadows ── */
    if (settings.removeShadows) {
      rules.push(`
        *, *::before, *::after {
          box-shadow: none !important;
          text-shadow: none !important;
          filter: none !important;
          -webkit-filter: none !important;
        }
      `);
    }

    /* ── Print layout optimisation ── */
    rules.push(`
      /* Ensure full-width content */
      body {
        margin: 0 !important;
        padding: 0 !important;
        font-family: Georgia, 'Times New Roman', serif !important;
        font-size: 12pt !important;
        line-height: 1.5 !important;
        color: black !important;
        background: white !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      /* Make main content full width */
      main, article, [role="main"], .content, .post-content,
      .entry-content, .article-content, .story-body,
      .article__body, .post-body {
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0.5in !important;
        float: none !important;
        position: static !important;
        overflow: visible !important;
      }

      /* Force all containers to full width */
      .container, .wrapper, .page, .main-content {
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Fix fixed / sticky positioning that would overlap content */
      * {
        position: static !important;
      }

      /* Ensure images fit within page width */
      img {
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid !important;
      }

      /* Avoid page breaks inside these elements */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid !important;
      }
      p, li, blockquote, pre, figure, table {
        orphans: 3 !important;
        widows: 3 !important;
      }
      tr, pre, blockquote, figure {
        page-break-inside: avoid !important;
      }

      /* Remove overflow hidden that clips content */
      * {
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
      }

      /* Ensure hidden elements stay hidden (our hidden elements) */
      [${HIDDEN_ATTR}] {
        display: none !important;
      }

      /* Show elements that might be hidden on screen but relevant for print */
      .print-only, [aria-hidden="true"] {
        display: block !important;
      }

      /* @media print override — ensure our rules always apply */
      @media print {
        body {
          background: white !important;
          color: black !important;
        }
      }
    `);

    /* ── Dark mode overrides (aggressive) ── */
    if (settings.forceLightMode) {
      rules.push(`
        /* Force override dark mode classes */
        .dark, .dark-mode, .theme-dark, [data-theme="dark"],
        [data-color-scheme="dark"], .dark-surface, .dark-bg {
          background-color: white !important;
          color: black !important;
          background-image: none !important;
        }

        /* Override CSS custom properties for dark themes */
        :root {
          color-scheme: light !important;
        }

        /* Override inline dark mode styles */
        [style*="background-color: rgb(0"],
        [style*="background-color: rgb(1"],
        [style*="background-color: rgb(2"],
        [style*="background-color:#0"],
        [style*="background-color: #0"],
        [style*="background-color:#1"],
        [style*="background-color: #1"],
        [style*="background-color:#2"],
        [style*="background-color: #2"],
        [style*="background-color:#3"],
        [style*="background-color: #3"] {
          background-color: white !important;
        }

        /* Force light color-scheme */
        html {
          color-scheme: light !important;
          forced-color-adjust: none !important;
        }

        /* YouTube-specific dark mode override */
        [style*="background-color: var(--yt-spec-"] {
          background-color: white !important;
        }
      `);
    }

    return rules.join('\n');
  }

  /* ═══════════════════════════════════════════════════════
     PAGE RESTORATION
     ═══════════════════════════════════════════════════════ */

  function restorePage() {
    if (!isScrubbed) return;

    // Restore hidden elements
    for (const entry of hiddenElements) {
      if (entry.originalDisplay) {
        entry.element.style.setProperty('display', entry.originalDisplay);
      } else {
        entry.element.style.removeProperty('display');
      }
      if (entry.originalVisibility) {
        entry.element.style.setProperty('visibility', entry.originalVisibility);
      } else {
        entry.element.style.removeProperty('visibility');
      }
      if (entry.originalOpacity) {
        entry.element.style.setProperty('opacity', entry.originalOpacity);
      } else {
        entry.element.style.removeProperty('opacity');
      }
      if (entry.originalPosition) {
        entry.element.style.setProperty('position', entry.originalPosition);
      } else {
        entry.element.style.removeProperty('position');
      }

      entry.element.removeAttribute(HIDDEN_ATTR);
    }

    hiddenElements = [];

    // Remove injected style
    if (injectedStyleEl && injectedStyleEl.parentNode) {
      injectedStyleEl.parentNode.removeChild(injectedStyleEl);
      injectedStyleEl = null;
    }

    // Restore scroll position
    window.scrollTo(savedScrollPosition.x, savedScrollPosition.y);

    // Restore title (in case anything changed it)
    document.title = originalTitle;

    isScrubbed = false;
  }

  /* ═══════════════════════════════════════════════════════
     MESSAGE HANDLER (from popup / background)
     ═══════════════════════════════════════════════════════ */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scrubAndPrint') {
      scrubAndPrint();
      sendResponse({ success: true });
      return false;
    }

    if (message.action === 'restorePage') {
      restorePage();
      sendResponse({ success: true });
      return false;
    }

    if (message.action === 'getStatus') {
      sendResponse({
        injected: true,
        isScrubbed,
        url: window.location.href
      });
      return false;
    }

    if (message.action === 'scrubOnly') {
      // Scrub without triggering print (for preview)
      if (!isScrubbed) {
        loadSettings().then((s) => {
          settings = s;
          isScrubbed = true;
          scrubDOM();
          injectPrintStyles();
          scrubIframes();
          sendResponse({ success: true, scrubbed: true });
        });
        return true; // Async response
      }
      sendResponse({ success: true, scrubbed: false, message: 'Already scrubbed' });
      return false;
    }
  });

  /* ═══════════════════════════════════════════════════════
     DYNAMIC CONTENT HANDLER
     ═══════════════════════════════════════════════════════

     Some sites lazily load ads or elements after the initial
     page paint.  We use a MutationObserver to catch elements
     added DURING print preview.  The observer is only active
     when the page is in a scrubbed state.
     ═══════════════════════════════════════════════════════ */

  const dynamicContentObserver = new MutationObserver((mutations) => {
    if (!isScrubbed || !settings) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the newly added element matches any of our selectors
        const element = node;

        const checks = [
          { key: 'removeAds', selectors: SELECTORS.ads },
          { key: 'removePopups', selectors: SELECTORS.popups },
          { key: 'removeSocialWidgets', selectors: SELECTORS.socialWidgets }
        ];

        for (const { key, selectors } of checks) {
          if (!settings[key]) continue;
          const combined = selectors.join(', ');
          try {
            if (element.matches?.(combined)) {
              hideElement(element);
            }
            // Also check children of the added node
            const children = element.querySelectorAll?.(combined);
            if (children) {
              children.forEach((child) => hideElement(child));
            }
          } catch {
            // Invalid selector or other error — skip
          }
        }
      }
    }
  });

  // Start observing after the DOM is ready
  dynamicContentObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  /* ═══════════════════════════════════════════════════════
     VISIBILITY CHANGE HANDLER
     ═══════════════════════════════════════════════════════

     Some browsers (especially on macOS) handle the print dialog
     differently.  We listen for visibility changes as a backup
     restoration mechanism — if the page becomes visible again
     and we're still in scrubbed state, restore it.

     The 'afterprint' event is the primary restoration trigger,
     but this serves as a safety net.
     ═══════════════════════════════════════════════════════ */

  let printDialogOpen = false;

  window.addEventListener('beforeprint', () => {
    printDialogOpen = true;
  });

  window.addEventListener('afterprint', () => {
    printDialogOpen = false;
    // Use a small timeout to let the dialog fully close
    setTimeout(() => {
      if (isScrubbed) {
        restorePage();
      }
    }, 100);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && printDialogOpen) {
      // This is a backup — afterprint should fire first in most browsers
      setTimeout(() => {
        if (isScrubbed && !printDialogOpen) {
          restorePage();
        }
      }, 500);
    }
  });

  /* ═══════════════════════════════════════════════════════
     CLEANUP ON PAGE UNLOAD
     ═══════════════════════════════════════════════════════ */

  window.addEventListener('beforeunload', () => {
    dynamicContentObserver.disconnect();
    if (isScrubbed) {
      restorePage();
    }
  });

  /* ═══════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════ */

  // Install the print interceptor immediately
  installPrintInterceptor();

  // Log for debugging (only visible in dev tools console)
  console.log('[Print Scrubber] Content script loaded. Ready to scrub.', {
    url: window.location.href,
    frameId: window.frameId || 'top'
  });
})();
