/**
 * Deskline — Unified API Client Wrapper (Phase 7 / STAT-03)
 *
 * Uses only relative '/api/...' paths (per STAT-03: no http:// or https:// URLs).
 * Uses credentials: 'same-origin' for secure cookie-based session authentication.
 * Handles 204 No Content, defensive JSON parsing, and normalized error envelopes.
 */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} code
   * @param {unknown} [details]
   */
  constructor(message, status, code = 'API_ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Executes a relative fetch request to the Deskline API.
 *
 * @param {string} endpoint - Relative API path starting with /api/
 * @param {RequestInit} [options={}] - Standard Fetch options
 * @returns {Promise<any>} Parsed response data
 */
export async function apiRequest(endpoint, options = {}) {
  if (!endpoint.startsWith('/api/')) {
    throw new Error('API endpoints must begin with relative path /api/');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const fetchOptions = {
    ...options,
    headers,
    body,
    credentials: 'same-origin'
  };

  const response = await fetch(endpoint, fetchOptions);

  // 204 No Content
  if (response.status === 204) {
    return null;
  }

  // Attempt to parse JSON defensively
  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (!('data' in payload)) {
      Object.defineProperty(payload, 'data', {
        value: payload,
        enumerable: false,
        writable: true,
        configurable: true
      });
    }
    if (!('status' in payload)) {
      Object.defineProperty(payload, 'status', {
        value: response.status,
        enumerable: false,
        writable: true,
        configurable: true
      });
    }
  }

  if (!response.ok) {
    const errorObj = payload && typeof payload === 'object' && payload.error ? payload.error : {};
    const code = errorObj.code || (response.status >= 500 ? 'SERVER_ERROR' : 'REQUEST_FAILED');
    const message = errorObj.message || (response.status >= 500 ? 'A server error occurred. Please try again.' : 'Request failed.');
    const details = errorObj.details;

    throw new ApiError(message, response.status, code, details);
  }

  return payload;
}

export const api = {
  get: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'DELETE' })
};

