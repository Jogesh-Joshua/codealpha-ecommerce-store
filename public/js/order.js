/**
 * public/js/order.js
 *
 * Deskline — Order Detail & Confirmation Controller (Phase 8 / Section E8)
 *
 * Implements:
 * - Protected route check against /api/auth/me
 * - Fetches order by ID from GET /api/orders/:id
 * - Confirmation mode when arriving with sessionStorage marker
 * - Detail mode when navigated to from order history
 * - Snapshotted item rendering, shipping address, and status pill
 * - Focus management: moves focus to h1 on order confirmation
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { el, clearChildren, icon, createErrorPanel } from './dom.js';

export async function initOrderPage() {
  const container = document.getElementById('order-content');
  if (!container) return;

  const currentPath = window.location.pathname + window.location.search;

  // 1. Session check (Protected route)
  let currentUser = null;
  try {
    const meRes = await api.get('/api/auth/me');
    currentUser = meRes?.data?.user;
    if (!currentUser) {
      window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
      return;
    }
  } catch {
    window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
    return;
  }

  // 2. Parse ID from URL
  const params = new URLSearchParams(window.location.search);
  const orderId = (params.get('id') || '').trim();

  if (!orderId) {
    renderOrderNotFound(container);
    return;
  }

  // 3. Fetch Order
  try {
    const res = await api.get(`/api/orders/${encodeURIComponent(orderId)}`);
    const order = res?.data?.order;

    if (!order) {
      renderOrderNotFound(container);
      return;
    }

    renderOrderView(container, order, currentUser);
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      renderOrderNotFound(container);
    } else {
      clearChildren(container);
      container.appendChild(createErrorPanel(
        "We couldn't load this order. Check your connection and try again.",
        () => initOrderPage()
      ));
    }
  }
}

/**
 * Render the order view in Confirmation or Detail mode.
 */
function renderOrderView(container, order, user) {
  clearChildren(container);

  // Check confirmation marker
  let confirmedMarker = null;
  try {
    confirmedMarker = sessionStorage.getItem('deskline.order.confirmed');
  } catch {
    // Restricted storage environment; proceed in detail mode
  }
  const isConfirmationMode = confirmedMarker && confirmedMarker === order.orderNumber;

  if (isConfirmationMode) {
    try {
      sessionStorage.removeItem('deskline.order.confirmed');
    } catch {
      // Ignore storage cleanup error
    }
  }

  document.title = `Order ${order.orderNumber} — Deskline`;

  // ── Header / Banner ──
  const headerWrap = el('div', { className: isConfirmationMode ? 'order-confirmation-header' : 'order-detail-header' });

  if (isConfirmationMode) {
    const checkCircle = el('div', { className: 'confirmation-check-circle', 'aria-hidden': 'true' },
      icon('check', { width: 28, height: 28 })
    );

    const h1 = el('h1', {
      className: 'heading-1',
      tabIndex: -1,
      text: 'Order placed'
    });

    const firstName = user.name ? user.name.split(' ')[0] : 'there';
    const supportP = el('p', { className: 'body-lg' },
      document.createTextNode(`Thanks, ${firstName}. We've saved order `),
      el('strong', { text: order.orderNumber }),
      document.createTextNode('. Nothing was charged and nothing will ship.')
    );

    const orderNumH3 = el('h3', { className: 'heading-3', text: order.orderNumber });

    headerWrap.appendChild(checkCircle);
    headerWrap.appendChild(h1);
    headerWrap.appendChild(orderNumH3);
    headerWrap.appendChild(supportP);
    container.appendChild(headerWrap);

    // Focus h1 on load and announce
    h1.focus();
    const announcer = document.getElementById('order-announcer');
    if (announcer) {
      announcer.textContent = `Order placed. Order ${order.orderNumber}.`;
    }
  } else {
    // Detail Mode: Breadcrumb and heading
    const breadcrumb = el('nav', { className: 'product-breadcrumb', 'aria-label': 'Breadcrumb' });
    breadcrumb.appendChild(el('a', { href: '/orders', text: 'Your orders' }));
    breadcrumb.appendChild(el('span', { className: 'breadcrumb-separator', 'aria-hidden': 'true', text: '/' }));
    breadcrumb.appendChild(el('span', { 'aria-current': 'page', text: order.orderNumber }));
    container.appendChild(breadcrumb);

    const h1 = el('h1', { className: 'heading-1', text: `Order ${order.orderNumber}` });
    headerWrap.appendChild(h1);

    if (order.createdAt) {
      const dateFormatted = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(order.createdAt));
      const dateP = el('p', { className: 'small text-secondary', text: `Placed on ${dateFormatted}` });
      headerWrap.appendChild(dateP);
    }
    container.appendChild(headerWrap);
  }

  // ── Layout Grid ──
  const layout = el('div', { className: 'order-detail-layout' });
  const itemsPanel = el('div', { className: 'order-items-panel' });
  const metaPanel = el('div', { className: 'order-meta-panel' });

  // 1. Items Panel
  const itemsHeading = el('h2', { className: 'heading-2', text: 'Items' });
  itemsPanel.appendChild(itemsHeading);

  const linesList = el('div', { className: 'order-lines-list' });
  for (const item of order.items || []) {
    const row = el('div', { className: 'cart-item-row' });
    const placeholderSrc = `/images/placeholders/${item.categorySlug || 'desk-mats'}.svg`;

    // Thumbnail
    const thumb = el('div', { className: 'cart-item-thumb' });
    const img = el('img', {
      src: item.imageUrl || placeholderSrc,
      alt: item.productName || item.name || '',
      width: '96',
      height: '120',
      loading: 'lazy',
      decoding: 'async',
      on: {
        error: (e) => {
          e.target.onerror = null;
          e.target.src = placeholderSrc;
        }
      }
    });
    thumb.appendChild(img);
    row.appendChild(thumb);

    // Details
    const info = el('div', { className: 'cart-item-info' });
    const nameP = el('p', { className: 'ui-strong', text: item.productName || item.name });
    const qtySpan = el('span', { className: 'small text-secondary', text: `Quantity: ${item.quantity}` });
    const unitPrice = el('span', { className: 'price-md', text: formatMinor(item.unitPriceMinor) });
    info.appendChild(nameP);
    info.appendChild(qtySpan);
    info.appendChild(unitPrice);
    row.appendChild(info);

    // Line Total
    const totalWrap = el('div', { className: 'cart-item-total' });
    const lineTotal = el('span', { className: 'price-md', text: formatMinor(item.lineTotalMinor) });
    totalWrap.appendChild(lineTotal);
    row.appendChild(totalWrap);

    linesList.appendChild(row);
  }
  itemsPanel.appendChild(linesList);

  // Totals
  const sumRows = el('div', { className: 'summary-rows' });
  sumRows.appendChild(el('div', { className: 'summary-row' },
    el('span', { text: 'Subtotal' }),
    el('span', { className: 'ui-strong', text: formatMinor(order.subtotalMinor || 0) })
  ));
  sumRows.appendChild(el('div', { className: 'summary-row' },
    el('span', { text: 'Shipping' }),
    el('span', { className: 'ui-strong', text: formatMinor(order.shippingMinor || 0) })
  ));
  sumRows.appendChild(el('div', { className: 'summary-divider' }));
  sumRows.appendChild(el('div', { className: 'summary-row summary-row-total' },
    el('span', { text: 'Total' }),
    el('span', { className: 'price-lg', text: formatMinor(order.totalMinor || 0) })
  ));
  itemsPanel.appendChild(sumRows);
  layout.appendChild(itemsPanel);

  // 2. Shipping & Meta Panel
  const shipHeading = el('h2', { className: 'heading-2', text: 'Shipping to' });
  metaPanel.appendChild(shipHeading);

  const shipAddr = order.shippingAddress || {};
  const addrBox = el('div', { className: 'shipping-address-box' });
  addrBox.appendChild(el('p', { className: 'ui-strong', text: shipAddr.fullName || '' }));
  addrBox.appendChild(el('p', { text: shipAddr.addressLine1 || '' }));
  if (shipAddr.addressLine2) {
    addrBox.appendChild(el('p', { text: shipAddr.addressLine2 }));
  }
  addrBox.appendChild(el('p', { text: `${shipAddr.city || ''}, ${shipAddr.postalCode || ''}` }));
  if (shipAddr.phone) {
    addrBox.appendChild(el('p', { className: 'small text-secondary', text: `Phone: ${shipAddr.phone}` }));
  }
  metaPanel.appendChild(addrBox);

  // Status Chip
  const statusBox = el('div', { className: 'order-status-block' });
  statusBox.appendChild(el('p', { className: 'small ui-strong', text: 'Status' }));
  const statusChip = el('div', { className: 'chip active', 'aria-label': `Status: ${order.status}` },
    icon('package', { width: 16, height: 16 }),
    document.createTextNode(' ' + capitalize(order.status || 'Placed'))
  );
  statusBox.appendChild(statusChip);
  metaPanel.appendChild(statusBox);

  layout.appendChild(metaPanel);
  container.appendChild(layout);

  // ── Actions Row ──
  const actionsRow = el('div', { className: 'section-header', style: 'margin-top: var(--space-8);' });
  actionsRow.removeAttribute('style');
  actionsRow.classList.add('not-found-actions');

  const contShopBtn = el('a', {
    href: '/shop',
    className: 'button button-primary',
    text: 'Continue shopping'
  });
  const viewOrdersLink = el('a', {
    href: '/orders',
    className: 'button button-secondary',
    text: 'View all orders'
  });

  actionsRow.appendChild(contShopBtn);
  actionsRow.appendChild(viewOrdersLink);
  container.appendChild(actionsRow);
}

function renderOrderNotFound(container) {
  clearChildren(container);
  document.title = 'Order Not Found — Deskline';

  const wrap = el('div', { className: 'empty-state not-found-state' });
  const h1 = el('h1', { className: 'heading-1', text: "We couldn't find that order." });
  const p = el('p', { className: 'body-text text-secondary', text: 'The order link may be incorrect, or the order does not belong to your account.' });

  const actions = el('div', { className: 'not-found-actions' },
    el('a', { href: '/', className: 'button button-primary', text: 'Back to home' }),
    el('a', { href: '/shop', className: 'button button-secondary', text: 'Browse products' })
  );

  wrap.appendChild(h1);
  wrap.appendChild(p);
  wrap.appendChild(actions);
  container.appendChild(wrap);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderPage);
  } else {
    initOrderPage();
  }
}

