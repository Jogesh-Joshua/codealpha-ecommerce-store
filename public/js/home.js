/**
 * public/js/home.js
 *
 * Deskline — Home Page Controller (Phase 8 / Section E1)
 *
 * Implements:
 * - Dynamic category product counts from GET /api/categories
 * - Dynamic hero hotspots populated by first four featured products
 * - Dynamic featured products grid from GET /api/products
 * - Dynamic product spotlight panel for monitor-light-bar
 * - Graceful degradation: keeps markup functional if API fails
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { el, clearChildren, createErrorPanel } from './dom.js';

const SPOTLIGHT_SLUG = 'monitor-light-bar';

export async function initHomePage() {
  await Promise.allSettled([
    loadCategories(),
    loadFeaturedAndHotspots(),
    loadSpotlight()
  ]);
}

/**
 * Load categories and update category row counts.
 */
async function loadCategories() {
  try {
    const res = await api.get('/api/categories');
    if (!res || !res.data || !Array.isArray(res.data.items)) return;

    const categories = res.data.items;
    const categoryRows = document.querySelectorAll('.category-list .category-row');

    for (const row of categoryRows) {
      const href = row.getAttribute('href') || '';
      const match = href.match(/category=([a-z0-9-]+)/);
      if (match) {
        const slug = match[1];
        const cat = categories.find(c => c.slug === slug);
        if (cat) {
          const metaSpan = row.querySelector('.category-meta .small');
          if (metaSpan) {
            const count = cat.productCount || 0;
            metaSpan.textContent = `${count} ${count === 1 ? 'product' : 'products'}`;
          }
        }
      }
    }
  } catch {
    // Fail silently: static counts remain visible
  }
}

/**
 * Load featured products, bind first 4 to hotspots, and render featured cards.
 */
async function loadFeaturedAndHotspots() {
  const featuredGrid = document.querySelector('.featured-grid');

  try {
    const res = await api.get('/api/products?featured=true&limit=4');
    let products = res?.data?.items || [];

    // Fallback if featured filter returned fewer than 4
    if (products.length < 4) {
      const fallbackRes = await api.get('/api/products?limit=4');
      products = fallbackRes?.data?.items || products;
    }

    if (!products.length) return;

    // 1. Update Hotspots
    const hotspots = document.querySelectorAll('.hero-panel .hotspot');
    hotspots.forEach((spot, idx) => {
      const p = products[idx];
      if (!p) {
        spot.style.display = 'none';
        return;
      }

      spot.href = `/product?slug=${encodeURIComponent(p.slug)}`;
      const priceText = formatMinor(p.priceMinor);
      spot.setAttribute('aria-label', `${p.name}, ${priceText}`);

      const label = spot.querySelector('.hotspot-label');
      if (label) {
        clearChildren(label);
        const nameSpan = el('span', { text: p.name });
        const priceSpan = el('span', { className: 'hotspot-price', text: priceText });
        label.appendChild(nameSpan);
        label.appendChild(priceSpan);
      }
    });

    // 2. Render Featured Cards
    if (featuredGrid) {
      clearChildren(featuredGrid);
      for (const p of products.slice(0, 4)) {
        featuredGrid.appendChild(createProductCard(p));
      }
    }
  } catch {
    // Keep static fallback cards if network error occurs
  }
}

/**
 * Load spotlight product details.
 */
async function loadSpotlight() {
  const panel = document.querySelector('.spotlight-panel');
  if (!panel) return;

  try {
    const res = await api.get(`/api/products/${SPOTLIGHT_SLUG}`);
    const product = res?.data?.product;
    if (!product) return;

    const titleEl = panel.querySelector('.heading-2');
    if (titleEl) titleEl.textContent = product.name;

    const summaryEl = panel.querySelector('.spotlight-summary');
    if (summaryEl) summaryEl.textContent = product.summary || '';

    const priceEl = panel.querySelector('.spotlight-price');
    if (priceEl) priceEl.textContent = formatMinor(product.priceMinor);

    const btnEl = panel.querySelector('.spotlight-actions a');
    if (btnEl) btnEl.href = `/product?slug=${encodeURIComponent(product.slug)}`;

    const imgEl = panel.querySelector('.spotlight-image-well img');
    if (imgEl && product.primaryImageUrl) {
      imgEl.src = product.primaryImageUrl;
      imgEl.alt = `${product.name} spotlight`;
      imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = `/images/placeholders/${product.categorySlug || 'lighting'}.svg`;
      };
    }
  } catch {
    // Keep static spotlight card
  }
}

/**
 * Helper to construct an accessible product card.
 */
export function createProductCard(product) {
  const card = el('article', { className: 'product-card' });

  const productUrl = `/product?slug=${encodeURIComponent(product.slug)}`;
  const priceFormatted = formatMinor(product.priceMinor);

  // Image well (decorative link wrapper, name link handles navigation per Section F)
  const imgWell = el('div', {
    className: 'card-image-well',
    'aria-hidden': 'true'
  });

  const placeholderSrc = `/images/placeholders/${product.categorySlug || 'desk-mats'}.svg`;
  const imgSrc = product.primaryImageUrl || placeholderSrc;

  const img = el('img', {
    src: imgSrc,
    alt: product.name,
    className: 'card-image',
    width: '400',
    height: '500',
    loading: 'lazy',
    decoding: 'async',
    on: {
      error: (e) => {
        e.target.onerror = null;
        e.target.src = placeholderSrc;
      }
    }
  });
  imgWell.appendChild(img);

  // Stock badge if low stock or sold out
  if (product.stockStatus === 'low_stock') {
    const badge = el('span', { className: 'badge badge-low-stock', text: 'Low stock' });
    imgWell.appendChild(badge);
  } else if (product.stockStatus === 'out_of_stock' || product.stock === 0) {
    const badge = el('span', { className: 'badge badge-sold-out', text: 'Sold out' });
    imgWell.appendChild(badge);
    card.classList.add('sold-out');
  }

  // Details
  const details = el('div', { className: 'card-details' });
  const heading = el('h3', { className: 'card-name' });
  const nameLink = el('a', { href: productUrl, text: product.name });
  heading.appendChild(nameLink);

  const catP = el('p', { className: 'card-category', text: product.categoryName || '' });
  const priceP = el('p', { className: 'card-price', text: priceFormatted });

  details.appendChild(heading);
  details.appendChild(catP);
  details.appendChild(priceP);

  card.appendChild(imgWell);
  card.appendChild(details);

  return card;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
  } else {
    initHomePage();
  }
}
