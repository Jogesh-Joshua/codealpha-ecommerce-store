/**
 * public/js/cart.js
 *
 * Deskline — Cart Page Controller (Phase 8 / Section E4)
 *
 * Implements:
 * - Reads stored cart IDs & quantities from cart-store.js
 * - Calls POST /api/cart/validate for live server prices & stock check
 * - Renders line items with stepper, line totals, and remove button
 * - Undo toast (6s) on item removal restoring quantity
 * - Summary panel with Subtotal, Flat-rate shipping (₹99), and Total
 * - Issues block for capped or unavailable items with inline resolution
 * - Empty cart state
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { getItems, updateQuantity, removeItem, addItem, subscribeCart } from './cart-store.js';
import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { showToast } from './toast.js';
import { el, clearChildren, icon, createErrorPanel, createEmptyState, createQuantityStepper, createInlineAlert } from './dom.js';

export async function initCartPage() {
  const contentEl = document.getElementById('cart-content');
  if (!contentEl) return;

  const items = getItems();
  if (!items || items.length === 0) {
    renderEmptyCart(contentEl);
    return;
  }

  await validateAndRender(contentEl);

  // Subscribe to changes from other tabs or actions
  subscribeCart(() => {
    const freshItems = getItems();
    if (freshItems.length === 0) {
      renderEmptyCart(contentEl);
    } else {
      validateAndRender(contentEl);
    }
  });
}

/**
 * Validate cart lines against POST /api/cart/validate and render view.
 */
async function validateAndRender(container) {
  const items = getItems();
  if (items.length === 0) {
    renderEmptyCart(container);
    return;
  }

  // Show loading skeleton
  renderCartSkeleton(container);

  try {
    const res = await api.post('/api/cart/validate', { items });
    const data = res?.data;

    if (!data) throw new Error('No validation data returned');

    renderCartView(container, data);
  } catch {
    clearChildren(container);
    container.appendChild(createErrorPanel(
      "We couldn't check current prices. Try again.",
      () => validateAndRender(container)
    ));
  }
}

/**
 * Render complete cart layout with lines, summary, and issues.
 */
function renderCartView(container, { lines = [], summary = {}, issues = [], valid = true }) {
  clearChildren(container);

  const cartLayout = el('div', { className: 'cart-layout' });
  const itemsCol = el('div', { className: 'cart-items-panel' });
  const summaryCol = el('div', { className: 'cart-summary-panel' });

  // 1. Issues Alert Block if any lines are not ok
  const blockingIssues = lines.filter(l => l.status !== 'ok');
  if (blockingIssues.length > 0 || !valid) {
    const issuesWrap = el('div', { className: 'cart-issues', role: 'alert' });

    for (const issueLine of blockingIssues) {
      let msg = '';
      let actionText = '';
      let onAction = null;

      if (issueLine.status === 'quantity_reduced') {
        msg = `Only ${issueLine.allowedQuantity} ${issueLine.name} is available. Your cart has ${issueLine.requestedQuantity}.`;
        actionText = `Set to ${issueLine.allowedQuantity}`;
        onAction = () => {
          updateQuantity(issueLine.productId, issueLine.allowedQuantity);
        };
      } else if (issueLine.status === 'out_of_stock') {
        msg = `${issueLine.name} is currently out of stock.`;
        actionText = 'Remove';
        onAction = () => {
          removeItem(issueLine.productId);
        };
      } else {
        msg = `${issueLine.name || 'An item'} is no longer available.`;
        actionText = 'Remove';
        onAction = () => {
          removeItem(issueLine.productId);
        };
      }

      const alert = createInlineAlert({
        type: 'warning',
        message: msg,
        actionText,
        onAction
      });
      issuesWrap.appendChild(alert);
    }

    itemsCol.appendChild(issuesWrap);
  }

  // 2. Render Line Items
  const linesWrap = el('div', { className: 'cart-items-list' });

  lines.forEach((line, idx) => {
    const row = el('div', { className: `cart-item-row ${line.status !== 'ok' ? 'cart-item-issue' : ''}` });
    const productUrl = `/product?slug=${encodeURIComponent(line.slug || '')}`;
    const placeholderSrc = `/images/placeholders/${line.categorySlug || 'desk-mats'}.svg`;

    // Thumbnail
    const thumb = el('div', { className: 'cart-item-thumb' });
    const img = el('img', {
      src: line.image?.url || line.imageUrl || placeholderSrc,
      alt: line.name || 'Product',
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

    // Info & Stepper
    const info = el('div', { className: 'cart-item-info' });
    const nameLink = el('a', {
      href: productUrl,
      className: 'ui-strong',
      text: line.name || 'Product'
    });
    const catSpan = el('span', { className: 'small text-secondary', text: line.categoryName || '' });
    const unitPrice = el('span', { className: 'price-md', text: formatMinor(line.unitPriceMinor) });

    const actions = el('div', { className: 'cart-item-actions' });

    // Stepper
    const lineQty = line.allowedQuantity ?? line.requestedQuantity ?? line.quantity ?? 1;
    const maxQty = Math.min(line.stock || 10, 10);
    const stepper = createQuantityStepper({
      value: lineQty,
      min: 1,
      max: maxQty,
      onChange: (newQty) => {
        updateQuantity(line.productId, newQty);
      }
    });

    // Remove Button
    const removeBtn = el('button', {
      type: 'button',
      className: 'button button-text button-sm remove-item-btn',
      'aria-label': `Remove ${line.name} from cart`,
      on: {
        click: () => {
          removeItem(line.productId);
          showToast(`Removed ${line.name}.`, {
            actionText: 'Undo',
            duration: 6000,
            onAction: () => {
              addItem(line.productId, lineQty);
            }
          });

          // Focus next line or heading
          const nextRow = row.nextElementSibling;
          if (nextRow) {
            const nextLink = nextRow.querySelector('a');
            if (nextLink) nextLink.focus();
          } else {
            const heading = document.getElementById('cart-title');
            if (heading) heading.focus();
          }
        }
      }
    },
      icon('trash', { width: 16, height: 16 }),
      document.createTextNode(' Remove')
    );

    actions.appendChild(stepper);
    actions.appendChild(removeBtn);

    info.appendChild(nameLink);
    info.appendChild(catSpan);
    info.appendChild(unitPrice);
    info.appendChild(actions);
    row.appendChild(info);

    // Line Total
    const totalWrap = el('div', { className: 'cart-item-total' });
    const totalVal = el('span', { className: 'price-md', text: formatMinor(line.lineTotalMinor) });
    totalWrap.appendChild(totalVal);
    row.appendChild(totalWrap);

    linesWrap.appendChild(row);
  });

  itemsCol.appendChild(linesWrap);

  // 3. Render Summary Panel (Section E4)
  const summaryHeading = el('h2', { className: 'heading-2', text: 'Order summary' });
  summaryCol.appendChild(summaryHeading);

  const summaryRows = el('div', { className: 'summary-rows' });

  // Subtotal
  const subtotalRow = el('div', { className: 'summary-row' },
    el('span', { text: 'Subtotal' }),
    el('span', { className: 'ui-strong', text: formatMinor(summary.subtotalMinor || 0) })
  );
  summaryRows.appendChild(subtotalRow);

  // Flat rate Shipping
  const shippingRow = el('div', { className: 'summary-row' },
    el('span', { text: 'Flat-rate shipping' }),
    el('span', { className: 'ui-strong', text: formatMinor(summary.shippingMinor || 0) })
  );
  summaryRows.appendChild(shippingRow);

  summaryRows.appendChild(el('div', { className: 'summary-divider' }));

  // Total
  const totalRow = el('div', { className: 'summary-row summary-row-total' },
    el('span', { text: 'Total' }),
    el('span', { className: 'price-lg', text: formatMinor(summary.totalMinor || 0) })
  );
  summaryRows.appendChild(totalRow);
  summaryCol.appendChild(summaryRows);

  // Checkout Button
  const hasIssues = blockingIssues.length > 0;
  const checkoutBtn = el('a', {
    href: hasIssues ? '#' : '/checkout',
    className: `button button-primary button-lg button-full ${hasIssues ? 'disabled' : ''}`,
    'aria-disabled': hasIssues ? 'true' : 'false',
    text: 'Checkout',
    on: {
      click: (e) => {
        if (hasIssues) {
          e.preventDefault();
        }
      }
    }
  });
  summaryCol.appendChild(checkoutBtn);

  if (hasIssues) {
    const issueHelper = el('p', {
      className: 'small text-secondary text-center',
      text: 'Fix the items above to continue.'
    });
    summaryCol.appendChild(issueHelper);
  }

  // Continue shopping text link
  const contLink = el('a', {
    href: '/shop',
    className: 'button button-text button-sm',
    text: 'Continue shopping'
  });
  summaryCol.appendChild(contLink);

  // Demo note
  const demoNote = el('p', {
    className: 'caption text-secondary text-center',
    text: 'Demo store: no payment is taken.'
  });
  summaryCol.appendChild(demoNote);

  cartLayout.appendChild(itemsCol);
  cartLayout.appendChild(summaryCol);
  container.appendChild(cartLayout);
}

/**
 * Render empty cart state.
 */
function renderEmptyCart(container) {
  clearChildren(container);
  container.appendChild(createEmptyState({
    title: 'Your cart is empty',
    message: 'Add something from the shop and it will show up here.',
    actionText: 'Shop all products',
    actionHref: '/shop'
  }));
}

/**
 * Render loading skeleton for cart lines and summary.
 */
function renderCartSkeleton(container) {
  clearChildren(container);
  const layout = el('div', { className: 'cart-layout' });
  const itemsCol = el('div', { className: 'cart-items-panel' });
  const summaryCol = el('div', { className: 'cart-summary-panel' });

  for (let i = 0; i < 2; i++) {
    const row = el('div', { className: 'cart-item-row' },
      el('div', { className: 'cart-item-thumb skeleton' }),
      el('div', { className: 'cart-item-info' },
        el('div', { className: 'skeleton skeleton-text skeleton-title' }),
        el('div', { className: 'skeleton skeleton-text skeleton-sub' })
      )
    );
    itemsCol.appendChild(row);
  }

  summaryCol.appendChild(el('div', { className: 'skeleton skeleton-text skeleton-title' }));
  summaryCol.appendChild(el('div', { className: 'skeleton skeleton-text skeleton-price' }));

  layout.appendChild(itemsCol);
  layout.appendChild(summaryCol);
  container.appendChild(layout);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartPage);
  } else {
    initCartPage();
  }
}

