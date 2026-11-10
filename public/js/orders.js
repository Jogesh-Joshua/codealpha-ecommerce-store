/**
 * public/js/orders.js
 *
 * Deskline — Order History Controller (Phase 8 / Section E9)
 *
 * Implements:
 * - Protected route check against /api/auth/me
 * - Fetches user order history from GET /api/orders
 * - Order cards sorted newest first with thumbnail preview strip
 * - 10-per-page pagination with accessible "Show more orders" button
 * - Sign out button in header meta
 * - Empty state with "Browse products" button
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { showToast } from './toast.js';
import { el, clearChildren, icon, createErrorPanel, createEmptyState } from './dom.js';

let allOrders = [];
let visibleCount = 10;

export async function initOrdersPage() {
  const contentEl = document.getElementById('orders-content');
  const userMetaEl = document.getElementById('orders-user-meta');
  if (!contentEl) return;

  // 1. Session Check (Protected route)
  let currentUser = null;
  try {
    const meRes = await api.get('/api/auth/me');
    currentUser = meRes?.data?.user;
    if (!currentUser) {
      window.location.href = '/login?next=/orders&notice=orders';
      return;
    }
  } catch {
    window.location.href = '/login?next=/orders&notice=orders';
    return;
  }

  // 2. Render user meta & Sign out button
  if (userMetaEl) {
    clearChildren(userMetaEl);
    const emailSpan = el('span', { className: 'small text-secondary', text: `Signed in as ${currentUser.email}` });
    const signOutBtn = el('button', {
      type: 'button',
      className: 'button button-secondary button-sm',
      text: 'Sign out',
      on: {
        click: async () => {
          signOutBtn.disabled = true;
          signOutBtn.textContent = 'Signing out…';
          try {
            await api.post('/api/auth/logout');
          } finally {
            showToast("You're signed out.", { duration: 5000 });
            window.location.href = '/';
          }
        }
      }
    });
    userMetaEl.appendChild(emailSpan);
    userMetaEl.appendChild(signOutBtn);
  }

  // 3. Fetch Orders
  try {
    const res = await api.get('/api/orders');
    allOrders = res?.data?.items || res?.data?.orders || [];
    renderOrdersList(contentEl);
  } catch {
    clearChildren(contentEl);
    contentEl.appendChild(createErrorPanel(
      "We couldn't load your orders. Try again.",
      () => initOrdersPage()
    ));
  }
}

/**
 * Render orders list or empty state.
 */
function renderOrdersList(container) {
  clearChildren(container);

  if (allOrders.length === 0) {
    container.appendChild(createEmptyState({
      title: 'No orders yet',
      message: 'When you place an order, it will show up here.',
      actionText: 'Browse products',
      actionHref: '/shop'
    }));
    return;
  }

  const listWrap = el('div', { className: 'orders-list' });
  const slice = allOrders.slice(0, visibleCount);

  for (const order of slice) {
    listWrap.appendChild(createOrderCard(order));
  }
  container.appendChild(listWrap);

  // Show more orders button if more items remain
  if (visibleCount < allOrders.length) {
    const showMoreWrap = el('div', { className: 'show-more-wrap text-center', style: 'margin-top: var(--space-8);' });
    showMoreWrap.removeAttribute('style');
    showMoreWrap.classList.add('not-found-actions');

    const showMoreBtn = el('button', {
      type: 'button',
      className: 'button button-secondary',
      text: 'Show more orders',
      on: {
        click: () => {
          const prevCount = visibleCount;
          visibleCount += 10;
          renderOrdersList(container);

          // Focus first newly added row
          const cards = container.querySelectorAll('.order-card');
          if (cards[prevCount]) {
            const firstNewLink = cards[prevCount].querySelector('a');
            if (firstNewLink) firstNewLink.focus();
          }
        }
      }
    });
    showMoreWrap.appendChild(showMoreBtn);
    container.appendChild(showMoreWrap);
  }
}

/**
 * Construct an order card element.
 */
function createOrderCard(order) {
  const card = el('article', { className: 'order-card' });
  const orderUrl = `/order?id=${encodeURIComponent(order.id)}`;

  // Top line: order number link, status chip, date
  const topRow = el('div', { className: 'order-card-top' });

  const numH3 = el('h3', { className: 'heading-3' });
  const numLink = el('a', { href: orderUrl, text: order.orderNumber });
  numH3.appendChild(numLink);

  const statusChip = el('span', { className: 'chip active small', text: order.status ? order.status.toUpperCase() : 'PLACED' });

  let dateStr = '';
  if (order.createdAt) {
    dateStr = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(order.createdAt));
  }
  const dateSpan = el('span', { className: 'small text-secondary', text: dateStr });

  topRow.appendChild(numH3);
  topRow.appendChild(statusChip);
  topRow.appendChild(dateSpan);
  card.appendChild(topRow);

  // Bottom line: thumbnails strip, item count, total price, View order link
  const bottomRow = el('div', { className: 'order-card-bottom' });

  const leftGroup = el('div', { className: 'order-thumbs-strip' });
  const items = order.items || order.thumbnails || [];
  const previewItems = items.slice(0, 3);

  for (const it of previewItems) {
    const thumbBox = el('div', { className: 'order-thumb-mini' });
    const img = el('img', {
      src: it.url || it.imageUrl || it.image?.url || `/images/placeholders/${it.categorySlug || 'desk-mats'}.svg`,
      alt: it.alt || it.productName || it.name || '',
      width: '48',
      height: '60',
      loading: 'lazy',
      decoding: 'async',
      on: {
        error: (e) => {
          e.target.onerror = null;
          e.target.src = '/images/placeholders/desk-mats.svg';
        }
      }
    });
    thumbBox.appendChild(img);
    leftGroup.appendChild(thumbBox);
  }

  if (items.length > 3) {
    const extraSpan = el('span', { className: 'small text-secondary', text: `+${items.length - 3}` });
    leftGroup.appendChild(extraSpan);
  }

  const countSpan = el('span', { className: 'small text-secondary', text: `${items.length} ${items.length === 1 ? 'item' : 'items'}` });
  leftGroup.appendChild(countSpan);
  bottomRow.appendChild(leftGroup);

  const rightGroup = el('div', { className: 'order-card-actions' });
  const priceSpan = el('span', { className: 'price-md', text: formatMinor(order.totalMinor) });
  const viewLink = el('a', {
    href: orderUrl,
    className: 'button button-text button-sm',
    text: 'View order'
  });

  rightGroup.appendChild(priceSpan);
  rightGroup.appendChild(viewLink);
  bottomRow.appendChild(rightGroup);

  card.appendChild(bottomRow);
  return card;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrdersPage);
  } else {
    initOrdersPage();
  }
}

