/**
 * The Print Scrubber — Utility Helpers
 *
 * Shared utility functions used across the extension.
 */

/**
 * Check if a hostname is in the whitelist
 * @param {string} hostname - The site hostname to check
 * @param {string[]} whitelist - Array of whitelisted hostnames
 * @returns {boolean}
 */
function isWhitelisted(hostname, whitelist = []) {
  return whitelist.some((entry) => {
    if (entry === hostname) return true;
    if (entry.startsWith('*.')) {
      const root = entry.slice(2);
      return hostname === root || hostname.endsWith('.' + root);
    }
    return false;
  });
}

/**
 * Debounce a function call
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay = 100) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Safely parse a URL and return hostname
 * @param {string} url - URL string
 * @returns {string} Hostname or empty string
 */
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

if (typeof module !== 'undefined') {
  module.exports = { isWhitelisted, debounce, getHostname };
}
