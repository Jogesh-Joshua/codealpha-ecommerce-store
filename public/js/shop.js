/**
 * public/js/shop.js
 *
 * Deskline — Shop Catalogue Controller (Phase 8 / Section E2)
 *
 * Implements:
 * - URL-driven state: ?search=&category=&sort=&page=
 * - Debounced search input (300ms) with clear button and Escape handling
 * - Sort selection (featured, price_asc, price_desc, newest, name_asc)
 * - Category filter chips with aria-pressed synchronization
 * - 12 per page pagination with Back/Forward popstate history support
 * - Loading skeleton with 200ms delay and 400ms minimum display
 * - Empty states for no search matches and empty categories
 * - Error retry state
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { formatMinor } from './format-minor.js';
import { el, clearChildren, createErrorPanel, createEmptyState } from './dom.js';
import { createProductCard } from './home.js';

const CATEGORIES = [
  { slug: '', name: 'All' },
  { slug: 'desk-mats', name: 'Desk mats' },
  { slug: 'charging-cables', name: 'Charging & cables' },
  { slug: 'stands-risers', name: 'Stands & risers' },
  { slug: 'lighting', name: 'Lighting' },
  { slug: 'organizers', name: 'Organizers' },
];

let searchDebounceTimer = null;
let currentAbortController = null;

export function initShopPage() {
  const searchInput = document.getElementById('search');
  const sortSelect = document.getElementById('sort-select');
  const chipContainer = document.querySelector('.shop-chips');

  // 1. Initial State from URL
  const state = getStateFromUrl();

  // Populate controls from initial state
  if (searchInput) {
    searchInput.value = state.search;
    setupSearchInput(searchInput);
  }

  if (sortSelect) {
    sortSelect.value = state.sort;
    sortSelect.addEventListener('change', () => {
      updateUrlState({ sort: sortSelect.value, page: 1 }, true);
    });
  }

  setupCategoryChips(chipContainer);

  // 2. Listen to popstate (Back/Forward)
  window.addEventListener('popstate', () => {
    const poppedState = getStateFromUrl();
    if (searchInput) searchInput.value = poppedState.search;
    if (sortSelect) sortSelect.value = poppedState.sort;
    updateChipsUI(poppedState.category);
    fetchAndRender(poppedState, false);
  });

  // 3. Initial fetch
  fetchAndRender(state, false);
}

/**
 * Parse current search params from window.location.
 */
function getStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: (params.get('search') || '').trim(),
    category: (params.get('category') || '').trim(),
    sort: params.get('sort') || 'featured',
    page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
  };
}

/**
 * Update the URL search params and trigger a fetch.
 */
function updateUrlState(partialState, pushHistory = true) {
  const current = getStateFromUrl();
  const next = { ...current, ...partialState };

  const params = new URLSearchParams();
  if (next.search) params.set('search', next.search);
  if (next.category) params.set('category', next.category);
  if (next.sort && next.sort !== 'featured') params.set('sort', next.sort);
  if (next.page && next.page > 1) params.set('page', String(next.page));

  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? '?' + newQuery : ''}`;

  if (pushHistory) {
    window.history.pushState({}, '', newUrl);
  } else {
    window.history.replaceState({}, '', newUrl);
  }

  updateChipsUI(next.category);
  fetchAndRender(next, true);
}

/**
 * Setup search input events: debounced typing, Escape to clear, Enter to submit immediately.
 */
function setupSearchInput(input) {
  const container = input.parentElement;

  // Clear button
  let clearBtn = container.querySelector('.search-clear-btn');
  if (!clearBtn) {
    clearBtn = el('button', {
      type: 'button',
      className: 'search-clear-btn icon-button',
      'aria-label': 'Clear search',
      hidden: !input.value,
      on: {
        click: () => {
          input.value = '';
          clearBtn.hidden = true;
          input.focus();
          updateUrlState({ search: '', page: 1 }, false);
        }
      }
    });

    const xIcon = el('span', { 'aria-hidden': 'true', text: '✕' });
    clearBtn.appendChild(xIcon);
    container.appendChild(clearBtn);
  }

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      updateUrlState({ search: input.value.trim(), page: 1 }, false);
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      clearBtn.hidden = true;
      clearTimeout(searchDebounceTimer);
      updateUrlState({ search: '', page: 1 }, false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      updateUrlState({ search: input.value.trim(), page: 1 }, true);
    }
  });
}

/**
 * Category Chips rendering and click handling.
 */
function setupCategoryChips(container) {
  if (!container) return;
  clearChildren(container);

  const currentState = getStateFromUrl();

  for (const cat of CATEGORIES) {
    const isSelected = (!cat.slug && !currentState.category) || (cat.slug === currentState.category);
    const chip = el('button', {
      type: 'button',
      className: `chip ${isSelected ? 'active' : ''}`,
      'aria-pressed': isSelected ? 'true' : 'false',
      'data-category': cat.slug,
      text: cat.name,
      on: {
        click: () => {
          updateUrlState({ category: cat.slug, page: 1 }, true);
        }
      }
    });
    container.appendChild(chip);
  }
}

/**
 * Update chip active states without re-creating DOM buttons.
 */
function updateChipsUI(selectedCategory) {
  const chipContainer = document.querySelector('.shop-chips');
  if (!chipContainer) return;

  const buttons = chipContainer.querySelectorAll('.chip');
  buttons.forEach((btn, idx) => {
    const cat = CATEGORIES[idx];
    if (!cat) return;
    const isSelected = (!cat.slug && !selectedCategory) || (cat.slug === selectedCategory);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    if (isSelected) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Fetch products from the API and render catalogue.
 */
async function fetchAndRender(state, scrollToResults = false) {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  const titleEl = document.getElementById('shop-title');
  const countEl = document.getElementById('result-count');
  const gridEl = document.getElementById('product-grid');
  const paginationEl = document.querySelector('.pagination');

  // Active filter label line
  renderActiveFilterLine(state);

  // Update Page Title and Heading
  const selectedCat = CATEGORIES.find(c => c.slug === state.category);
  const catTitle = selectedCat && selectedCat.slug ? selectedCat.name : 'Shop';
  if (titleEl) titleEl.textContent = catTitle;
  document.title = `${catTitle} — Deskline`;

  // Start skeleton after 200ms delay
  let skeletonShown = false;
  let skeletonStartTime = 0;
  window.__skeletonRenderedAt = null;
  window.__skeletonClearedAt = null;
  window.__skeletonDuration = null;

  const skeletonTimeout = setTimeout(() => {
    skeletonShown = true;
    skeletonStartTime = Date.now();
    window.__skeletonRenderedAt = Date.now();
    if (countEl) countEl.textContent = 'Loading…';
    if (gridEl) renderSkeletons(gridEl, 12);
  }, 200);

  const fetchStartTime = Date.now();
  window.__fetchStartTime = fetchStartTime;

  try {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.category) params.set('category', state.category);
    if (state.sort) params.set('sort', state.sort);
    params.set('page', String(state.page));
    params.set('limit', '12');

    const res = await api.get(`/api/products?${params.toString()}`);
    const data = res?.data;
    window.__fetchEndTime = Date.now();

    // Ensure skeleton holds at least 400ms if shown
    clearTimeout(skeletonTimeout);
    if (skeletonShown) {
      const visibleElapsed = Date.now() - skeletonStartTime;
      if (visibleElapsed < 400) {
        await new Promise(r => setTimeout(r, 400 - visibleElapsed));
      }
      window.__skeletonClearedAt = Date.now();
      window.__skeletonDuration = window.__skeletonClearedAt - window.__skeletonRenderedAt;
    } else {
      window.__skeletonDuration = 0;
    }

    if (!data) throw new Error('No data received');

    const items = data.items || [];
    const total = data.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / 12));

    // Page beyond last valid page handling (E2 rule)
    if (state.page > totalPages && total > 0) {
      updateUrlState({ page: totalPages }, false);
      return;
    }

    // Update result count
    if (countEl) {
      const countText = total === 0 ? 'No products' : `${total} ${total === 1 ? 'product' : 'products'}`;
      countEl.textContent = countText;
    }

    // Render results or empty state
    if (gridEl) {
      clearChildren(gridEl);

      if (items.length === 0) {
        if (state.search) {
          gridEl.appendChild(createEmptyState({
            title: `No products match “${state.search}”`,
            message: 'Check the spelling or try a broader search.',
            actionText: 'Clear search',
            onAction: () => {
              const input = document.getElementById('search');
              if (input) input.value = '';
              updateUrlState({ search: '', page: 1 }, true);
            }
          }));
        } else if (state.category) {
          gridEl.appendChild(createEmptyState({
            title: 'No products in this category yet',
            message: 'Check back soon or explore other categories.',
            actionText: 'View all products',
            onAction: () => {
              updateUrlState({ category: '', page: 1 }, true);
            }
          }));
        } else {
          gridEl.appendChild(createEmptyState({
            title: 'No products found',
            message: 'The catalogue is currently empty.',
            actionText: 'Return to home',
            actionHref: '/'
          }));
        }
      } else {
        for (const p of items) {
          gridEl.appendChild(createProductCard(p));
        }
      }
    }

    // Render pagination
    if (paginationEl) {
      renderPagination(paginationEl, state.page, totalPages);
    }

    if (scrollToResults && titleEl) {
      titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleEl.focus();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;

    clearTimeout(skeletonTimeout);
    if (countEl) countEl.textContent = 'Error';
    if (gridEl) {
      clearChildren(gridEl);
      gridEl.appendChild(createErrorPanel(
        "We couldn't load products. Check your connection and try again.",
        () => fetchAndRender(state, false)
      ));
    }
  }
}

/**
 * Render active filter line: "Showing X results for “stand” in Stands & risers. Clear all"
 */
function renderActiveFilterLine(state) {
  let line = document.getElementById('active-filter-line');
  if (!state.search && !state.category) {
    if (line) line.remove();
    return;
  }

  if (!line) {
    line = el('div', { id: 'active-filter-line', className: 'active-filter-line small' });
    const toolbar = document.querySelector('.shop-toolbar');
    if (toolbar && toolbar.nextSibling) {
      toolbar.parentNode.insertBefore(line, toolbar.nextSibling);
    }
  }

  clearChildren(line);

  let labelText = 'Showing results';
  if (state.search) labelText += ` for “${state.search}”`;
  if (state.category) {
    const cat = CATEGORIES.find(c => c.slug === state.category);
    if (cat) labelText += ` in ${cat.name}`;
  }
  labelText += '. ';

  const textSpan = el('span', { text: labelText });
  const clearBtn = el('button', {
    type: 'button',
    className: 'button button-text button-sm',
    text: 'Clear all',
    on: {
      click: () => {
        const input = document.getElementById('search');
        if (input) input.value = '';
        updateUrlState({ search: '', category: '', page: 1 }, true);
      }
    }
  });

  line.appendChild(textSpan);
  line.appendChild(clearBtn);
}

/**
 * Render pagination controls.
 */
function renderPagination(container, currentPage, totalPages) {
  clearChildren(container);
  if (totalPages <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  // Previous
  if (currentPage > 1) {
    const prev = el('a', {
      href: `/shop?page=${currentPage - 1}`,
      className: 'pagination-item',
      'aria-label': 'Previous page',
      text: '←',
      on: {
        click: (e) => {
          e.preventDefault();
          updateUrlState({ page: currentPage - 1 }, true);
        }
      }
    });
    container.appendChild(prev);
  }

  // Page Numbers
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);

  for (let p = start; p <= end; p++) {
    const isCurrent = p === currentPage;
    const pageItem = el('a', {
      href: `/shop?page=${p}`,
      className: `pagination-item ${isCurrent ? 'active' : ''}`,
      'aria-current': isCurrent ? 'page' : undefined,
      text: String(p),
      on: {
        click: (e) => {
          e.preventDefault();
          if (!isCurrent) updateUrlState({ page: p }, true);
        }
      }
    });
    container.appendChild(pageItem);
  }

  // Next
  if (currentPage < totalPages) {
    const next = el('a', {
      href: `/shop?page=${currentPage + 1}`,
      className: 'pagination-item',
      'aria-label': 'Next page',
      text: '→',
      on: {
        click: (e) => {
          e.preventDefault();
          updateUrlState({ page: currentPage + 1 }, true);
        }
      }
    });
    container.appendChild(next);
  }
}

/**
 * Render 12 card skeletons.
 */
function renderSkeletons(container, count = 12) {
  clearChildren(container);
  for (let i = 0; i < count; i++) {
    const card = el('article', { className: 'product-card' });
    const well = el('div', { className: 'card-image-well skeleton' });
    const details = el('div', { className: 'card-details' });
    const nameSkel = el('div', { className: 'skeleton', style: 'height: 1.25rem; width: 80%;' });
    const catSkel = el('div', { className: 'skeleton', style: 'height: 0.875rem; width: 40%; margin-top: 4px;' });
    const priceSkel = el('div', { className: 'skeleton', style: 'height: 1.125rem; width: 30%; margin-top: 8px;' });

    // Note: To avoid STAT-02 inline style violation, we remove style and use classes!
    nameSkel.removeAttribute('style');
    nameSkel.className = 'skeleton skeleton-text skeleton-title';
    catSkel.removeAttribute('style');
    catSkel.className = 'skeleton skeleton-text skeleton-sub';
    priceSkel.removeAttribute('style');
    priceSkel.className = 'skeleton skeleton-text skeleton-price';

    details.appendChild(nameSkel);
    details.appendChild(catSkel);
    details.appendChild(priceSkel);
    card.appendChild(well);
    card.appendChild(details);
    container.appendChild(card);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShopPage);
  } else {
    initShopPage();
  }
}
