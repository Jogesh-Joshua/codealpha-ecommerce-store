/**
 * public/js/login.js
 *
 * Deskline — Login Controller (Phase 8 / Section E6)
 *
 * Implements:
 * - Guest-only guard checking /api/auth/me
 * - Contextual notice banner from URL query or redirect source
 * - Password Show/Hide toggle with aria-pressed
 * - In-flight submission state with spinner & aria-busy
 * - Generic 401 error message without leaking user existence
 * - Rate limiting 429 handling
 * - Safe return to next path or /
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { safeRedirect } from './safe-redirect.js';
import { showToast } from './toast.js';
import { el, clearChildren, icon, createInlineAlert } from './dom.js';

export async function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  const urlParams = new URLSearchParams(window.location.search);
  const nextTarget = urlParams.get('next');
  const noticeParam = urlParams.get('notice');
  const emailParam = urlParams.get('email');

  // 1. Guest-only check
  try {
    const meRes = await api.get('/api/auth/me');
    if (meRes?.data?.user) {
      window.location.href = safeRedirect(nextTarget, '/');
      return;
    }
  } catch {
    // Unauthenticated, proceed
  }

  // 2. Contextual notices (Section E6)
  const noticeContainer = document.getElementById('login-notice-container');
  if (noticeContainer) {
    let noticeMsg = '';
    if (noticeParam === 'checkout' || nextTarget === '/checkout') {
      noticeMsg = 'Sign in to continue to checkout.';
    } else if (noticeParam === 'orders' || nextTarget === '/orders' || nextTarget?.startsWith('/order')) {
      noticeMsg = 'Sign in to see your orders.';
    } else if (noticeParam === 'expired') {
      noticeMsg = 'Your session expired. Sign in to continue.';
    }

    if (noticeMsg) {
      const noticeAlert = createInlineAlert({
        type: 'info',
        message: noticeMsg
      });
      noticeContainer.appendChild(noticeAlert);
    }
  }

  // 3. Pre-fill email or next link
  const emailInput = document.getElementById('login-email');
  if (emailInput && emailParam) {
    emailInput.value = emailParam.trim();
  }

  const createAccountLink = document.getElementById('create-account-link');
  if (createAccountLink && nextTarget) {
    createAccountLink.href = `/register?next=${encodeURIComponent(nextTarget)}`;
  }

  // 4. Password Toggle
  setupPasswordToggle('login-password', 'login-password-toggle');

  // 5. Form submission
  const passwordInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertContainer = document.getElementById('login-alert-container');
  const emailError = document.getElementById('login-email-error');
  const passwordError = document.getElementById('login-password-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearChildren(alertContainer);
    clearChildren(emailError);
    clearChildren(passwordError);

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    let hasClientError = false;
    if (!email) {
      renderFieldError(emailError, emailInput, 'Enter your email address.');
      hasClientError = true;
    }
    if (!password) {
      renderFieldError(passwordError, passwordInput, 'Enter your password.');
      hasClientError = true;
    }

    if (hasClientError) return;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in…';

    try {
      const res = await api.post('/api/auth/login', { email, password });

      if (res && res.status === 200) {
        showToast("You're signed in.", { duration: 5000 });
        const destination = safeRedirect(nextTarget, '/');
        window.location.href = destination;
        return;
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = originalText;

      let msg = "We couldn't reach the server. Try again.";
      if (err.status === 401) {
        msg = 'Email or password is incorrect. Check both and try again.';
      } else if (err.status === 429) {
        msg = 'Too many sign-in attempts. Wait a few minutes and try again.';
      }

      const alert = createInlineAlert({
        type: 'error',
        message: msg
      });
      alertContainer.appendChild(alert);
    }
  });
}

function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (!input || !toggle) return;

  toggle.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
    toggle.textContent = isPassword ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });
}

function renderFieldError(slot, input, msg) {
  if (!slot) return;
  clearChildren(slot);
  input.setAttribute('aria-invalid', 'true');
  input.classList.add('field-invalid');

  const p = el('p', { className: 'field-error-msg' },
    icon('alert', { width: 14, height: 14 }),
    document.createTextNode(' ' + msg)
  );
  slot.appendChild(p);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginPage);
  } else {
    initLoginPage();
  }
}

