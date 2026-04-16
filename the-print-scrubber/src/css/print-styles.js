/**
 * The Print Scrubber — Web-Accessible Print Styles Module
 *
 * This file is declared in web_accessible_resources so that
 * the content script (or any page-level code) can import it
 * if needed.  In the current architecture, the CSS is injected
 * directly by content.js, but this module serves as:
 *
 *  1. A standalone CSS-only fallback that can be applied via
 *     a <link> or @import if the full content script cannot load.
 *  2. A reference document for all the CSS rules the extension uses.
 *  3. A testable artifact for QA and Chrome Web Store review.
 *
 * Usage (standalone):
 *   Inject this as a <style> tag or link it in a page to apply
 *   print-optimised styles without the DOM scrubber.
 */

const PRINT_SCRUBBER_CSS = `
/* ============================================================
   THE PRINT SCRUBBER — Print-Optimised CSS
   ============================================================
   These styles are injected at print time to ensure:
     • White backgrounds everywhere (saves ink on dark themes)
     • Black text on white (maximum readability)
     • No shadows, gradients, or decorative backgrounds
     • Optimised layout for A4/Letter paper sizes
     • Proper page-break handling
   ============================================================ */

@media print {

  /* ── Global colour reset ── */
  html {
    color-scheme: light !important;
    forced-color-adjust: none !important;
  }

  *, *::before, *::after {
    color: black !important;
    background-color: white !important;
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
    filter: none !important;
    -webkit-filter: none !important;
  }

  /* ── Preserve media transparency ── */
  img, video, canvas, svg, picture {
    background-color: transparent !important;
  }

  /* ── Link styling ── */
  a {
    color: #0000EE !important;
    text-decoration: underline !important;
  }
  a:visited {
    color: #551A8B !important;
  }
  a[href]::after {
    content: " (" attr(href) ")" !important;
    font-size: 0.85em !important;
    color: #555 !important;
  }
  a[href^="#"]::after,
  a[href^="javascript"]::after {
    content: "" !important;
  }

  /* ── Typography ── */
  body {
    font-family: Georgia, 'Times New Roman', serif !important;
    font-size: 12pt !important;
    line-height: 1.5 !important;
    color: black !important;
    background: white !important;
    margin: 0 !important;
    padding: 0.5in !important;
    max-width: 100% !important;
    overflow: visible !important;
  }

  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid !important;
    font-family: 'Helvetica Neue', Arial, sans-serif !important;
    color: black !important;
  }

  /* ── Code blocks ── */
  pre, code, kbd, samp {
    font-family: 'Courier New', Courier, monospace !important;
    font-size: 10pt !important;
    background-color: #F5F5F5 !important;
    color: #1A1A1A !important;
    border: 1px solid #DDD !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
  }

  pre {
    page-break-inside: avoid !important;
    padding: 0.25in !important;
  }

  /* ── Tables ── */
  table {
    border-collapse: collapse !important;
    page-break-inside: avoid !important;
  }
  th, td {
    border: 1px solid #CCC !important;
    padding: 4pt 8pt !important;
    color: black !important;
    background: white !important;
  }
  thead { display: table-header-group !important; }
  tfoot { display: table-footer-group !important; }
  tr { page-break-inside: avoid !important; }

  /* ── Blockquotes ── */
  blockquote {
    border-left: 3px solid #CCC !important;
    padding-left: 12pt !important;
    margin-left: 0 !important;
    color: #333 !important;
    page-break-inside: avoid !important;
  }

  /* ── Images ── */
  img {
    max-width: 100% !important;
    height: auto !important;
    page-break-inside: avoid !important;
  }
  figure {
    page-break-inside: avoid !important;
    margin: 0.25in 0 !important;
  }
  figcaption {
    font-size: 9pt !important;
    color: #555 !important;
    font-style: italic !important;
  }

  /* ── Layout ── */
  * {
    position: static !important;
    float: none !important;
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
  }

  main, article, [role="main"], .content, .post-content,
  .entry-content, .article-content, .story-body,
  .article__body, .post-body, .container, .wrapper, .page,
  .main-content {
    max-width: 100% !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* ── Orphan / widow control ── */
  p, li {
    orphans: 3 !important;
    widows: 3 !important;
  }

  /* ── Hidden utility ── */
  [data-print-scrubber-hidden] {
    display: none !important;
  }
  .no-print, .screen-only {
    display: none !important;
  }
  .print-only {
    display: block !important;
  }

  /* ── Form elements ── */
  input, textarea, select, button {
    border: 1px solid #CCC !important;
    background: white !important;
    color: black !important;
  }

  /* ── Dark mode aggressive overrides ── */
  .dark, .dark-mode, .theme-dark, [data-theme="dark"],
  [data-color-scheme="dark"], .dark-surface, .dark-bg {
    background-color: white !important;
    color: black !important;
  }

  [style*="background-color: rgb(0"],
  [style*="background-color: rgb(1"],
  [style*="background-color: rgb(2"],
  [style*="background-color: rgb(3"],
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

  /* ── Remove decorative elements ── */
  .ad, .ads, .advertisement, .sponsored,
  nav, header, footer, aside,
  [role="navigation"], [role="banner"], [role="contentinfo"],
  [role="complementary"],
  .sidebar, .side-bar, .comment, .comments,
  .social-share, .share-buttons, .share-bar,
  .cookie-banner, .popup, .modal,
  .newsletter-popup, .subscribe-form,
  .floating-share, .sticky-share {
    display: none !important;
  }
}
`;

// Export for use as a module
if (typeof module !== 'undefined') {
  module.exports = { PRINT_SCRUBBER_CSS };
}
