/**
 * Deskline — Accessible Toast Notification Module (Phase 7 / E0 / STAT-01 / STAT-03)
 *
 * Requirements:
 * - Fixed toast region: bottom-center on mobile, bottom-left on desktop (max width 420px).
 * - Stacked max 3 toasts.
 * - Auto-dismiss after 5s (6s with action button).
 * - Pause timers on hover or keyboard focus.
 * - Success and info use role="status"; error and warning use role="alert".
 * - Close button 44x44 with accessible label.
 * - STRICTLY NO raw HTML string injection (STAT-01). Pure DOM methods only.
 * - SVG icons created with document.createElementNS.
 */

const TOAST_CONTAINER_ID = 'deskline-toast-region';
const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 5000;
const ACTION_DURATION_MS = 6000;
const EXIT_DURATION_MS = 140;

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgIcon(type) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toast__icon');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  if (type === 'success') {
    path.setAttribute('d', 'M4 10l4 4 8-8');
  } else if (type === 'error') {
    path.setAttribute('d', 'M10 6v5m0 3h.01M18 10a8 8 0 11-16 0 8 8 0 0116 0z');
  } else if (type === 'warning') {
    path.setAttribute('d', 'M10 7v4m0 3h.01M2.5 16.5l7.5-13 7.5 13H2.5z');
  } else {
    // info
    path.setAttribute('d', 'M10 9v5m0-8h.01M18 10a8 8 0 11-16 0 8 8 0 0116 0z');
  }

  svg.appendChild(path);
  return svg;
}

function createCloseIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toast__close-icon');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('d', 'M4 4l8 8M12 4l-8 8');

  svg.appendChild(path);
  return svg;
}

function getOrCreateContainer() {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'toast-region';
    container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Displays a toast notification.
 * Supports both signatures:
 * - showToast({ message, type, action, duration })
 * - showToast(message, options)
 *
 * @param {string|Object} arg1 - Toast message string or options object
 * @param {Object} [arg2={}] - Options object when arg1 is string
 * @returns {() => void} Dismiss callback
 */
export function showToast(arg1, arg2 = {}) {
  let message = '';
  let type = 'info';
  let action = null;
  let duration = null;

  if (typeof arg1 === 'string') {
    message = arg1;
    type = arg2.type || 'info';
    duration = arg2.duration || null;
    if (arg2.action && typeof arg2.action.label === 'string' && typeof arg2.action.onClick === 'function') {
      action = arg2.action;
    } else if (arg2.actionText && typeof arg2.onAction === 'function') {
      action = { label: String(arg2.actionText), onClick: arg2.onAction };
    }
  } else if (arg1 && typeof arg1 === 'object') {
    message = arg1.message || '';
    type = arg1.type || 'info';
    duration = arg1.duration || null;
    if (arg1.action && typeof arg1.action.label === 'string' && typeof arg1.action.onClick === 'function') {
      action = arg1.action;
    } else if (arg1.actionText && typeof arg1.onAction === 'function') {
      action = { label: String(arg1.actionText), onClick: arg1.onAction };
    }
  }
  const container = getOrCreateContainer();
  if (!container) return () => {};

  // Enforce max stacked toasts
  const activeToasts = container.querySelectorAll('.toast:not(.toast--exiting)');
  if (activeToasts.length >= MAX_TOASTS) {
    const oldest = activeToasts[0];
    dismissElement(oldest);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

  // Status icon
  const icon = createSvgIcon(type);
  toast.appendChild(icon);

  // Message content (text only, preventing XSS)
  const msgEl = document.createElement('span');
  msgEl.className = 'toast__message';
  msgEl.textContent = String(message || '');
  toast.appendChild(msgEl);

  // Optional Action Button
  if (action && typeof action.label === 'string' && typeof action.onClick === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast__action-btn';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', () => {
      try {
        action.onClick();
      } finally {
        dismissElement(toast);
      }
    });
    toast.appendChild(actionBtn);
  }

  // Close Button (44x44 minimum accessible tap target)
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast__close-btn';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.appendChild(createCloseIcon());
  closeBtn.addEventListener('click', () => dismissElement(toast));
  toast.appendChild(closeBtn);

  // Timing & Hover/Focus Pause
  const timeoutMs = duration || (action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
  let timerId = null;
  let remainingMs = timeoutMs;
  let startTime = Date.now();

  function startTimer() {
    startTime = Date.now();
    timerId = setTimeout(() => {
      dismissElement(toast);
    }, remainingMs);
  }

  function pauseTimer() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
      remainingMs -= (Date.now() - startTime);
      if (remainingMs < 500) remainingMs = 500;
    }
  }

  toast.addEventListener('mouseenter', pauseTimer);
  toast.addEventListener('mouseleave', startTimer);
  toast.addEventListener('focusin', pauseTimer);
  toast.addEventListener('focusout', startTimer);

  container.appendChild(toast);
  startTimer();

  function dismissElement(el) {
    if (!el || el.classList.contains('toast--exiting')) return;
    el.classList.add('toast--exiting');
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, EXIT_DURATION_MS);
  }

  return () => dismissElement(toast);
}

export const toast = {
  info: (message, options = {}) => showToast({ ...options, message, type: 'info' }),
  success: (message, options = {}) => showToast({ ...options, message, type: 'success' }),
  error: (message, options = {}) => showToast({ ...options, message, type: 'error' }),
  warning: (message, options = {}) => showToast({ ...options, message, type: 'warning' })
};
