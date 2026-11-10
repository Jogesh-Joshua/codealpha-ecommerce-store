/**
 * src/lib/escapeLike.js
 *
 * Escapes PostgreSQL LIKE/ILIKE wildcards (%, _, \) for parameterized searches (§4.5, UT-07, API-09).
 *
 * To be used with an explicit ESCAPE '\\' clause in SQL:
 * WHERE column ILIKE $1 ESCAPE '\\'
 *
 * Normal text remains unchanged. Wildcard characters %, _, and the escape character \
 * are escaped with a preceding backslash.
 */

/**
 * Escape %, _, and \ characters for PostgreSQL LIKE/ILIKE expressions.
 *
 * @param {string} str - Raw input search query
 * @returns {string} - Safely escaped string for LIKE pattern
 */
export function escapeLike(str) {
  if (typeof str !== 'string') {
    return '';
  }
  // Must escape backslash first to prevent double-escaping!
  return str
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

