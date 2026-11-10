/**
 * public/js/product.js
 *
 * Deskline — Product Detail Page Controller (Phase 8 / Section E3)
 *
 * Implements:
 * - Dynamic product loading via GET /api/products/:slug
 * - Accessible image gallery with interactive thumbnail selection
 * - Live price display via formatMinor
 * - Availability pill (In stock, Only N left, Sold out)
 * - Quantity stepper bounded to 1..min(stock, 10)
 * - Add to cart integration with cart-store, badge bump, and live announcements
 * - Native <details> accordions for Details, Specifications, Shipping
 * - Accessible breadcrumb and 404 state
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { addItem, getCartCount } from './cart-store.js';
import { el, clearChildren, icon, createErrorPanel, createEmptyState, createQuantityStepper } from './dom.js';

export async function initProductPage() {
  const container = document.getElementById('pdp-container');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('slug') || '').trim();

  if (!slug) {
    renderNotFound(container);
    return;
  }

  try {
    const res = await api.get(`/api/products/${encodeURIComponent(slug)}`);
    const product = res?.data?.product;

    if (!product || product.active === false) {
      renderNotFound(container);
      return;
    }

    renderProductDetail(container, product);
  } catch (err) {
    if (err.status === 404) {
      renderNotFound(container);
    } else {
      clearChildren(container);
      container.appendChild(createErrorPanel(
        "We couldn't load this product. Check your connection and try again.",
        () => initProductPage()
      ));
    }
  }
}

/**
 * Render complete product detail layout into container.
 */
function renderProductDetail(container, product) {
  clearChildren(container);

  // Update Page Title
  document.title = `${product.name} — Deskline`;

  // 1. Breadcrumb (Section E3)
  const breadcrumb = el('nav', { className: 'product-breadcrumb', 'aria-label': 'Breadcrumb' });
  const shopLink = el('a', { href: '/shop', text: 'Shop' });
  const sep1 = el('span', { className: 'breadcrumb-separator', 'aria-hidden': 'true', text: '/' });
  const catLink = el('a', {
    href: `/shop?category=${encodeURIComponent(product.categorySlug || '')}`,
    text: product.categoryName || 'Category'
  });
  const sep2 = el('span', { className: 'breadcrumb-separator', 'aria-hidden': 'true', text: '/' });
  const currentCrumb = el('span', { 'aria-current': 'page', text: product.name });

  breadcrumb.appendChild(shopLink);
  breadcrumb.appendChild(sep1);
  breadcrumb.appendChild(catLink);
  breadcrumb.appendChild(sep2);
  breadcrumb.appendChild(currentCrumb);
  container.appendChild(breadcrumb);

  // 2. Product Layout Grid
  const layout = el('div', { className: 'product-layout' });

  // ── Gallery Column (Columns 1-7) ──
  const galleryCol = el('div', { className: 'product-gallery' });
  const placeholderSrc = `/images/placeholders/${product.category?.slug || product.categorySlug || 'desk-mats'}.svg`;

  const imagesList = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : [{ url: product.primaryImageUrl || placeholderSrc, alt: product.name }];

  const mainWell = el('div', { className: 'product-main-image-well' });
  const mainImg = el('img', {
    src: imagesList[0].url || placeholderSrc,
    alt: imagesList[0].alt || product.name,
    className: 'product-main-image',
    width: '800',
    height: '1000',
    fetchpriority: 'high',
    loading: 'eager',
    decoding: 'async',
    on: {
      error: (e) => {
        e.target.onerror = null;
        e.target.src = placeholderSrc;
      }
    }
  });
  mainWell.appendChild(mainImg);
  galleryCol.appendChild(mainWell);

  // Thumbnails row if more than 1 image
  if (imagesList.length > 1) {
    const thumbsRow = el('div', { className: 'product-thumbnails', role: 'group', 'aria-label': 'Product images' });

    imagesList.forEach((imgObj, idx) => {
      const isCurrent = idx === 0;
      const thumbBtn = el('button', {
        type: 'button',
        className: 'product-thumb-btn',
        'aria-label': `Show image ${idx + 1} of ${imagesList.length}`,
        'aria-current': isCurrent ? 'true' : 'false',
        on: {
          click: () => {
            mainImg.src = imgObj.url || placeholderSrc;
            mainImg.alt = imgObj.alt || `${product.name} view ${idx + 1}`;
            thumbsRow.querySelectorAll('.product-thumb-btn').forEach((b, bIdx) => {
              b.setAttribute('aria-current', bIdx === idx ? 'true' : 'false');
            });
          }
        }
      });

      const thumbImg = el('img', {
        src: imgObj.url || placeholderSrc,
        alt: '',
        width: '64',
        height: '80',
        loading: 'lazy',
        decoding: 'async',
        on: {
          error: (e) => {
            e.target.onerror = null;
            e.target.src = placeholderSrc;
          }
        }
      });
      thumbBtn.appendChild(thumbImg);
      thumbsRow.appendChild(thumbBtn);
    });

    galleryCol.appendChild(thumbsRow);
  }

  // ── Accordions (Section E3) in gallery column ──
  const accordionGroup = el('div', { className: 'accordion-group' });

  // Details Accordion (open by default)
  const detailsAcc = el('details', { className: 'accordion-item', open: true });
  const detailsSummary = el('summary', { className: 'accordion-summary' },
    el('span', { text: 'Details' }),
    icon('chevron-down', { className: 'accordion-chevron', width: 20, height: 20 })
  );
  const detailsContent = el('div', { className: 'accordion-content' },
    el('p', { text: product.description || product.summary || '' })
  );
  detailsAcc.appendChild(detailsSummary);
  detailsAcc.appendChild(detailsContent);
  accordionGroup.appendChild(detailsAcc);

  // Specifications Accordion
  const rawSpecs = product.specs;
  let specEntries = [];
  if (Array.isArray(rawSpecs)) {
    specEntries = rawSpecs.map(s => ({ label: s.label || s.key || '', value: String(s.value || '') }));
  } else if (rawSpecs && typeof rawSpecs === 'object') {
    specEntries = Object.entries(rawSpecs).map(([label, value]) => ({ label, value: String(value) }));
  }

  if (specEntries.length > 0) {
    const specsAcc = el('details', { className: 'accordion-item' });
    const specsSummary = el('summary', { className: 'accordion-summary' },
      el('span', { text: 'Specifications' }),
      icon('chevron-down', { className: 'accordion-chevron', width: 20, height: 20 })
    );
    const specsContent = el('div', { className: 'accordion-content' });
    const dl = el('dl', { className: 'specs-table' });

    for (const item of specEntries) {
      const row = el('div', { className: 'specs-row' },
        el('dt', { text: item.label }),
        el('dd', { text: item.value })
      );
      dl.appendChild(row);
    }
    specsContent.appendChild(dl);
    specsAcc.appendChild(specsSummary);
    specsAcc.appendChild(specsContent);
    accordionGroup.appendChild(specsAcc);
  }

  // Shipping Accordion
  const shippingAcc = el('details', { className: 'accordion-item' });
  const shippingSummary = el('summary', { className: 'accordion-summary' },
    el('span', { text: 'Shipping' }),
    icon('chevron-down', { className: 'accordion-chevron', width: 20, height: 20 })
  );
  const shippingContent = el('div', { className: 'accordion-content' },
    el('p', { text: 'A flat shipping fee is added at checkout. This is a demo store, so nothing is actually shipped.' })
  );
  shippingAcc.appendChild(shippingSummary);
  shippingAcc.appendChild(shippingContent);
  accordionGroup.appendChild(shippingAcc);

  galleryCol.appendChild(accordionGroup);

  // ── Purchase Panel (Columns 8-12) ──
  const panelCol = el('div', { className: 'product-panel' });

  // Category link
  const catLink2 = el('a', {
    href: `/shop?category=${encodeURIComponent(product.category?.slug || product.categorySlug || '')}`,
    className: 'product-category-link',
    text: product.category?.name || product.categoryName || ''
  });
  panelCol.appendChild(catLink2);

  // Title (h1)
  const title = el('h1', { className: 'product-title', text: product.name });
  panelCol.appendChild(title);

  // Price
  const price = el('p', { className: 'price-lg', text: formatMinor(product.priceMinor) });
  panelCol.appendChild(price);

  // Availability Pill
  const isSoldOut = product.stockStatus === 'out_of_stock' || product.stock === 0;
  const isLowStock = product.stockStatus === 'low_stock';
  const remainingCount = product.lowStockRemaining ?? product.maxPurchasableQuantity ?? product.stock ?? 0;

  const availPill = el('div', {
    className: `availability-pill ${isSoldOut ? 'availability-sold-out' : isLowStock ? 'availability-low-stock' : 'availability-in-stock'}`
  });

  if (isSoldOut) {
    availPill.appendChild(icon('x', { width: 16, height: 16 }));
    availPill.appendChild(el('span', { text: 'Sold out' }));
  } else if (isLowStock) {
    availPill.appendChild(icon('alert', { width: 16, height: 16 }));
    availPill.appendChild(el('span', { text: `Only ${remainingCount} left` }));
  } else {
    availPill.appendChild(icon('check', { width: 16, height: 16 }));
    availPill.appendChild(el('span', { text: 'In stock' }));
  }
  panelCol.appendChild(availPill);

  // Short summary
  if (product.summary) {
    const summaryP = el('p', { className: 'product-summary', text: product.summary });
    panelCol.appendChild(summaryP);
  }

  // Quantity and Add row
  const maxPurchasable = Math.min(product.maxPurchasableQuantity ?? product.stock ?? 10, 10);
  let selectedQty = 1;

  const addRow = el('div', { className: 'product-add-row' });

  const helperText = el('p', { className: 'product-helper-text' });

  const addBtn = el('button', {
    type: 'button',
    className: 'button button-primary button-lg',
    style: 'flex: 1;', // We'll move to class
    disabled: isSoldOut,
    text: isSoldOut ? 'Sold out' : 'Add to cart',
    on: {
      click: () => {
        if (isSoldOut) return;
        handleAddToCart(product, selectedQty, addBtn, helperContainer);
      }
    }
  });
  // Clean style attribute
  addBtn.removeAttribute('style');
  addBtn.classList.add('button-grow');

  const stepper = createQuantityStepper({
    value: 1,
    min: 1,
    max: Math.max(1, maxPurchasable),
    onChange: (newQty) => {
      selectedQty = newQty;
      if (selectedQty >= maxPurchasable && maxPurchasable > 0) {
        helperText.textContent = maxPurchasable === 10
          ? 'You can add up to 10 of this item.'
          : `Only ${maxPurchasable} are available.`;
      } else {
        helperText.textContent = '';
      }
    }
  });

  if (isSoldOut) {
    stepper.querySelectorAll('button, input').forEach(el => el.disabled = true);
  }

  addRow.appendChild(stepper);
  addRow.appendChild(addBtn);
  panelCol.appendChild(addRow);

  const helperContainer = el('div', { className: 'product-helper-wrap' });
  helperContainer.appendChild(helperText);

  if (isSoldOut) {
    const soldOutMsg = el('p', { className: 'product-helper-text', text: 'This item is out of stock. ' });
    const similarLink = el('a', {
      href: `/shop?category=${encodeURIComponent(product.categorySlug || '')}`,
      className: 'button button-text button-sm',
      text: 'Browse similar products'
    });
    soldOutMsg.appendChild(similarLink);
    helperContainer.appendChild(soldOutMsg);
  }

  panelCol.appendChild(helperContainer);

  // Demo note
  const demoNote = el('div', { className: 'product-note' },
    icon('info', { width: 16, height: 16 }),
    el('span', { text: 'Demo store: orders are saved but nothing ships.' })
  );
  panelCol.appendChild(demoNote);

  layout.appendChild(galleryCol);
  layout.appendChild(panelCol);
  container.appendChild(layout);
}

/**
 * Handle Add to cart button action.
 */
function handleAddToCart(product, quantity, button, helperContainer) {
  addItem(product.id, quantity);

  // Crossfade button feedback to "Added to cart" with check icon for 1.5s
  clearChildren(button);
  button.classList.add('button-added');
  button.appendChild(icon('check', { width: 20, height: 20 }));
  button.appendChild(document.createTextNode(' Added to cart'));

  setTimeout(() => {
    button.classList.remove('button-added');
    clearChildren(button);
    button.textContent = 'Add to cart';
  }, 1500);

  // Sub-link under button: "View cart (N items)"
  let viewCartLink = helperContainer.querySelector('.view-cart-sublink');
  const count = getCartCount();
  const linkText = `View cart (${count} ${count === 1 ? 'item' : 'items'})`;

  if (!viewCartLink) {
    viewCartLink = el('a', {
      href: '/cart',
      className: 'view-cart-sublink button button-text button-sm',
      text: linkText
    });
    helperContainer.appendChild(viewCartLink);
  } else {
    viewCartLink.textContent = linkText;
  }

  // Announce politely
  const announcer = document.getElementById('pdp-announcer');
  if (announcer) {
    announcer.textContent = `${product.name} added to cart. ${count} ${count === 1 ? 'item' : 'items'} in cart.`;
  }
}

/**
 * Render 404 state when slug is not found or inactive.
 */
function renderNotFound(container) {
  clearChildren(container);
  document.title = 'Product Not Found — Deskline';

  const wrap = el('div', { className: 'empty-state not-found-state' });
  const h1 = el('h1', { className: 'heading-1', text: "We couldn't find that product." });
  const p = el('p', { className: 'body-text text-secondary', text: 'The link may be out of date or the product is no longer active.' });

  const actions = el('div', { className: 'not-found-actions' },
    el('a', { href: '/', className: 'button button-primary', text: 'Back to home' }),
    el('a', { href: '/shop', className: 'button button-secondary', text: 'Browse products' })
  );

  wrap.appendChild(h1);
  wrap.appendChild(p);
  wrap.appendChild(actions);
  container.appendChild(wrap);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductPage);
  } else {
    initProductPage();
  }
}
