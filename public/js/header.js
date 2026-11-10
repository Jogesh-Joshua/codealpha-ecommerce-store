/**
 * Deskline — Shared Header & Mobile Drawer Controller (Phase 7 / Section E0)
 *
 * Implements:
 * - Sticky header scroll threshold (8px)
 * - Categories dropdown disclosure (accessible keyboard + click outside)
 * - Accessible mobile navigation drawer using native <dialog>
 * - Reactive cart badge synchronization & aria-live announcements
 * - Session state lookup (/api/auth/me) with zero layout flash
 * - STRICTLY NO raw HTML string injection (STAT-01)
 */

import { getCartCount, subscribeCart } from './cart-store.js';
import { api } from './api.js';

export function initHeader() {
  const header = document.querySelector('.site-header');
  const categoriesTrigger = document.getElementById('categories-trigger');
  const categoriesPanel = document.getElementById('categories-panel');
  const menuToggle = document.getElementById('menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close');
  const cartBadge = document.querySelector('.cart-badge');
  const cartLink = document.querySelector('.cart-link');
  const cartAnnouncer = document.getElementById('cart-announcer');

  // 1. Sticky header scroll listener
  if (header) {
    const handleScroll = () => {
      if (window.scrollY > 8) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // 2. Categories dropdown disclosure (desktop)
  if (categoriesTrigger && categoriesPanel) {
    const toggleCategories = (open) => {
      const isOpen = open !== undefined ? open : categoriesPanel.hasAttribute('hidden');
      if (isOpen) {
        categoriesPanel.removeAttribute('hidden');
        categoriesTrigger.setAttribute('aria-expanded', 'true');
      } else {
        categoriesPanel.setAttribute('hidden', '');
        categoriesTrigger.setAttribute('aria-expanded', 'false');
      }
    };

    categoriesTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = categoriesPanel.hasAttribute('hidden');
      toggleCategories(willOpen);
    });

    // Close on Escape & return focus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !categoriesPanel.hasAttribute('hidden')) {
        toggleCategories(false);
        categoriesTrigger.focus();
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!categoriesPanel.hasAttribute('hidden') &&
          !categoriesTrigger.contains(e.target) &&
          !categoriesPanel.contains(e.target)) {
        toggleCategories(false);
      }
    });
  }

  // 3. Mobile Navigation Drawer
  if (menuToggle && drawer) {
    const openDrawer = () => {
      if (typeof drawer.showModal === 'function') {
        drawer.showModal();
      } else {
        drawer.setAttribute('open', '');
      }
      menuToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
      if (drawerClose) {
        drawerClose.focus();
      }
    };

    const closeDrawer = () => {
      if (typeof drawer.close === 'function') {
        drawer.close();
      } else {
        drawer.removeAttribute('open');
      }
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
      menuToggle.focus();
    };

    menuToggle.addEventListener('click', openDrawer);

    if (drawerClose) {
      drawerClose.addEventListener('click', closeDrawer);
    }

    // Backdrop click on native dialog
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) {
        closeDrawer();
      }
    });

    // Handle Escape key via dialog cancel event
    drawer.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeDrawer();
    });
  }

  // 4. Cart badge updates and accessibility announcements
  function updateCartUI(countOrItems) {
    let safeCount = 0;
    if (Array.isArray(countOrItems)) {
      safeCount = countOrItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    } else if (Number.isSafeInteger(countOrItems) && countOrItems >= 0) {
      safeCount = countOrItems;
    } else {
      safeCount = getCartCount();
    }

    if (cartBadge) {
      cartBadge.textContent = safeCount > 0 ? String(safeCount) : '';
      cartBadge.setAttribute('data-count', String(safeCount));

      // Trigger bump animation on change
      if (safeCount > 0) {
        cartBadge.classList.remove('bump');
        void cartBadge.offsetWidth; // Force reflow
        cartBadge.classList.add('bump');
      }
    }

    if (cartLink) {
      const label = safeCount > 0
        ? `Cart, ${safeCount} ${safeCount === 1 ? 'item' : 'items'}`
        : 'Cart';
      cartLink.setAttribute('aria-label', label);
    }

    if (cartAnnouncer) {
      cartAnnouncer.textContent = safeCount > 0
        ? `${safeCount} ${safeCount === 1 ? 'item' : 'items'} in cart`
        : 'Cart is empty';
    }
  }

  // Subscribe to live cart store changes
  subscribeCart(updateCartUI);
  updateCartUI(getCartCount());

  // 5. Session state check
  checkSession();
}

async function checkSession() {
  try {
    const res = await api.get('/api/auth/me');
    if (res && res.data && res.data.user) {
      const user = res.data.user;
      renderLoggedInHeader(user);
    }
  } catch {
    // Session check failure or 401: remain logged out
  }
}

function renderLoggedInHeader(user) {
  // Update desktop account link to show user name / orders
  const headerActions = document.querySelector('.header-actions');
  if (!headerActions) return;

  const signInLink = headerActions.querySelector('a[href="/login"]');
  if (signInLink) {
    signInLink.remove();

    const firstName = user.name ? user.name.split(' ')[0] : 'Account';

    const accountBtn = document.createElement('a');
    accountBtn.href = '/orders';
    accountBtn.className = 'nav-link';
    accountBtn.textContent = firstName;
    accountBtn.setAttribute('aria-label', `Account menu for ${user.name || firstName}`);

    // Insert before cart link
    const cartLink = headerActions.querySelector('.cart-link');
    if (cartLink) {
      headerActions.insertBefore(accountBtn, cartLink);
    } else {
      headerActions.appendChild(accountBtn);
    }
  }

  // Update drawer account block
  const drawerAccount = document.getElementById('drawer-account-block');
  if (drawerAccount) {
    while (drawerAccount.firstChild) {
      drawerAccount.removeChild(drawerAccount.firstChild);
    }

    const userInfo = document.createElement('div');
    userInfo.className = 'drawer-user-info';

    const userName = document.createElement('p');
    userName.className = 'ui-strong';
    userName.textContent = user.name || 'Account';
    userInfo.appendChild(userName);

    const userEmail = document.createElement('p');
    userEmail.className = 'small text-muted';
    userEmail.textContent = user.email || '';
    userInfo.appendChild(userEmail);

    drawerAccount.appendChild(userInfo);

    const ordersLink = document.createElement('a');
    ordersLink.href = '/orders';
    ordersLink.className = 'button button-primary button-full';
    ordersLink.textContent = 'Your orders';
    drawerAccount.appendChild(ordersLink);

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'button button-secondary button-full';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', async () => {
      try {
        await api.post('/api/auth/logout');
      } finally {
        window.location.href = '/';
      }
    });
    drawerAccount.appendChild(signOutBtn);
  }
}

// Auto-initialize when loaded in browser
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
}
