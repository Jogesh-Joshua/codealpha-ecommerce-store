/**
 * Deskline — Safe Local Redirect Target Validator (Phase 7 / UT-10 / MAN-24)
 *
 * Validates that a redirect URL is a safe, relative path on this origin.
 * Prevents Open Redirect vulnerabilities (CWE-601).
 * Rejects protocol-relative URLs (//evil.com), backslashes (/\evil),
 * external protocols (https:, javascript:), control characters, and unknown routes.
 */

const ALLOWED_ROOT_PATHS = new Set([
  '/',
  '/shop',
  '/product',
  '/cart',
  '/checkout',
  '/order',
  '/orders',
  '/login',
  '/register',
  '/confirmation'
]);

/**
 * Checks whether a target URL string is a safe local redirect target.
 *
 * @param {unknown} target - The redirect candidate
 * @returns {boolean} True if target is a safe local path
 */
export function isSafeRedirect(target) {
  if (typeof target !== 'string' || target.length === 0 || target.length > 2000) {
    return false;
  }

  // Must start with exactly one forward slash; cannot start with // or /\ or \\
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return false;
  }

  // Reject backslashes anywhere in the target to avoid browser path normalization tricks
  if (target.includes('\\')) {
    return false;
  }

  // Reject control characters (0x00-0x1F, 0x7F) and whitespace
  if (/[\x00-\x20\x7F]/.test(target)) {
    return false;
  }

  // Extract path component before query string (?) or hash (#)
  const [beforeHash] = target.split('#');
  const [pathname] = beforeHash.split('?');

  // Reject any protocol/scheme delimiters before the query string
  if (pathname.includes(':')) {
    return false;
  }

  if (ALLOWED_ROOT_PATHS.has(pathname)) {
    return true;
  }

  if (/^\/orders\/[A-Za-z0-9_-]+$/.test(pathname)) {
    return true;
  }

  return false;
}

/**
 * Returns a validated local redirect target or the fallback path.
 *
 * @param {unknown} target - The redirect candidate
 * @param {string} [fallback='/'] - Fallback path if target is unsafe
 * @returns {string} Safe redirect destination
 */
export function safeRedirect(target, fallback = '/') {
  const safeFallback = (typeof fallback === 'string' && isSafeRedirect(fallback)) ? fallback : '/';
  if (isSafeRedirect(target)) {
    return target;
  }
  return safeFallback;
}
