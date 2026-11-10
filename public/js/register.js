/**
 * public/js/register.js
 *
 * Deskline — Registration Controller (Phase 8 / Section E5)
 *
 * Implements:
 * - Guest-only guard checking /api/auth/me
 * - Live validation on blur and live after error
 * - Client-side confirmPassword validation (NEVER sent to backend)
 * - Password Show/Hide toggle with aria-pressed
 * - In-flight submission state with spinner & aria-busy
 * - Duplicate email (409) inline message with sign-in link
 * - Safe redirect to next parameter or /
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { safeRedirect } from './safe-redirect.js';
import { showToast } from './toast.js';
import { el, clearChildren, icon, createInlineAlert } from './dom.js';

export async function initRegisterPage() {
  const form = document.getElementById('register-form');
  if (!form) return;

  const urlParams = new URLSearchParams(window.location.search);
  const nextTarget = urlParams.get('next');

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

  // 2. Setup Password Toggles
  setupPasswordToggle('reg-password', 'reg-password-toggle');
  setupPasswordToggle('reg-confirm-password', 'reg-confirm-password-toggle');

  // 3. Form Validation and Submission
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const passwordInput = document.getElementById('reg-password');
  const confirmPasswordInput = document.getElementById('reg-confirm-password');
  const submitBtn = document.getElementById('reg-submit-btn');
  const alertContainer = document.getElementById('register-alert-container');

  const errors = {
    name: document.getElementById('name-error'),
    email: document.getElementById('email-error'),
    password: document.getElementById('password-error'),
    confirmPassword: document.getElementById('confirm-password-error')
  };

  // Blur validation
  nameInput.addEventListener('blur', () => validateName(nameInput, errors.name));
  emailInput.addEventListener('blur', () => validateEmail(emailInput, errors.email));
  passwordInput.addEventListener('blur', () => validatePassword(passwordInput, errors.password));
  confirmPasswordInput.addEventListener('blur', () => validateConfirmPassword(passwordInput, confirmPasswordInput, errors.confirmPassword));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearChildren(alertContainer);

    const isNameValid = validateName(nameInput, errors.name);
    const isEmailValid = validateEmail(emailInput, errors.email);
    const isPassValid = validatePassword(passwordInput, errors.password);
    const isConfirmValid = validateConfirmPassword(passwordInput, confirmPasswordInput, errors.confirmPassword);

    if (!isNameValid || !isEmailValid || !isPassValid || !isConfirmValid) {
      // Focus first invalid field
      if (!isNameValid) nameInput.focus();
      else if (!isEmailValid) emailInput.focus();
      else if (!isPassValid) passwordInput.focus();
      else if (!isConfirmValid) confirmPasswordInput.focus();
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account…';

    try {
      // NOTE: confirmPassword is NEVER sent to server!
      const payload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput.value
      };

      const res = await api.post('/api/auth/register', payload);

      if (res && res.status === 201) {
        showToast("Account created. You're signed in.", { duration: 5000 });
        const targetUrl = safeRedirect(nextTarget, '/');
        window.location.href = targetUrl;
        return;
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = originalText;

      if (err.status === 409) {
        // Email already registered
        renderFieldError(errors.email, emailInput, 'An account with this email already exists. ');
        const signInLink = el('a', {
          href: `/login?email=${encodeURIComponent(emailInput.value.trim())}`,
          className: 'button button-text button-sm',
          text: 'Sign in instead.'
        });
        errors.email.appendChild(signInLink);
        emailInput.focus();
      } else {
        const errorAlert = createInlineAlert({
          type: 'error',
          message: "We couldn't create your account. Try again."
        });
        alertContainer.appendChild(errorAlert);
      }
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

function validateName(input, errorSlot) {
  const val = input.value.trim();
  if (!val) {
    renderFieldError(errorSlot, input, 'Enter your name.');
    return false;
  }
  clearFieldError(errorSlot, input);
  return true;
}

function validateEmail(input, errorSlot) {
  const val = input.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!val || !emailRegex.test(val)) {
    renderFieldError(errorSlot, input, 'Enter a valid email address, like name@example.com.');
    return false;
  }
  clearFieldError(errorSlot, input);
  return true;
}

function validatePassword(input, errorSlot) {
  const val = input.value;
  if (!val || val.length < 8) {
    renderFieldError(errorSlot, input, 'Use at least 8 characters.');
    return false;
  }
  if (val.length > 72) {
    renderFieldError(errorSlot, input, 'Use 72 characters or fewer.');
    return false;
  }
  clearFieldError(errorSlot, input);
  return true;
}

function validateConfirmPassword(passInput, confirmInput, errorSlot) {
  if (confirmInput.value !== passInput.value) {
    renderFieldError(errorSlot, confirmInput, "Passwords don't match.");
    return false;
  }
  clearFieldError(errorSlot, confirmInput);
  return true;
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

function clearFieldError(slot, input) {
  if (!slot) return;
  clearChildren(slot);
  input.removeAttribute('aria-invalid');
  input.classList.remove('field-invalid');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegisterPage);
  } else {
    initRegisterPage();
  }
}

