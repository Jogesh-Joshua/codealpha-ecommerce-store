/**
 * Deskline — Cart Store (Phase 7 / UT-12 / STAT-09 / SEC-35)
 *
 * Persists the client-side cart under the single authorized storage key: 'deskline.cart.v1'.
 * The cart stores ONLY { productId: number, quantity: number }.
 * Server-side validation is the single source of truth for prices, names, stock, and totals.
 *
 * Invariants:
 * - Quantities are clamped to [1, 10]
 * - Line count cannot exceed 50 items
 * - Corrupted or malformed storage data safely drops back to empty array []
 * - Storage backend can be injected for headless unit testing
 */

export const CART_STORAGE_KEY = 'deskline.cart.v1';
export const MAX_CART_LINES = 50;
export const MIN_LINE_QTY = 1;
export const MAX_LINE_QTY = 10;

/**
 * Fallback in-memory storage mock when localStorage is unavailable.
 */
class MemoryStorage {
  constructor() {
    this._data = new Map();
  }
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }
  setItem(key, value) {
    this._data.set(key, String(value));
  }
  removeItem(key) {
    this._data.delete(key);
  }
  clear() {
    this._data.clear();
  }
}

function getDefaultStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return new MemoryStorage();
}

/**
 * Validates and sanitizes raw cart items array.
 *
 * @param {unknown} rawItems
 * @returns {Array<{productId: number, quantity: number}>}
 */
export function sanitizeCartItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const seen = new Map();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const pid = Number(item.productId);
    const qty = Number(item.quantity);

    // productId must be a positive integer
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    // quantity must be a finite number
    if (!Number.isFinite(qty)) continue;

    const intQty = Math.floor(qty);
    if (intQty <= 0) continue;

    // Clamp quantity to [1, 10]
    const clampedQty = Math.min(Math.max(intQty, MIN_LINE_QTY), MAX_LINE_QTY);

    if (seen.has(pid)) {
      // Sum and re-clamp if duplicate productId encountered
      const existing = seen.get(pid);
      const combined = Math.min(existing + clampedQty, MAX_LINE_QTY);
      seen.set(pid, combined);
    } else {
      if (seen.size >= MAX_CART_LINES) {
        // Enforce maximum 50 distinct lines
        break;
      }
      seen.set(pid, clampedQty);
    }
  }

  const result = [];
  for (const [productId, quantity] of seen.entries()) {
    result.push({ productId, quantity });
  }

  return result;
}

/**
 * Creates an isolated cart store bound to a specific storage backend.
 *
 * @param {Storage|MemoryStorage} [storage]
 */
export function createCartStore(storage = getDefaultStorage()) {
  const listeners = new Set();

  function notify(items) {
    for (const listener of listeners) {
      try {
        listener(items);
      } catch (err) {
        console.error('Cart listener error:', err);
      }
    }
  }

  // Cross-tab synchronization via window storage event
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key === CART_STORAGE_KEY) {
        notify(getItems());
      }
    });
  }

  function getItems() {
    try {
      const raw = storage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return sanitizeCartItems(parsed);
    } catch {
      return [];
    }
  }

  function saveItems(items) {
    const sanitized = sanitizeCartItems(items);
    try {
      storage.setItem(CART_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Storage quota or disabled: ignore or handle gracefully
    }
    notify(sanitized);
    return sanitized;
  }

  function addItem(productId, quantity = 1) {
    const pid = Number(productId);
    const addQty = Number(quantity);

    if (!Number.isSafeInteger(pid) || pid <= 0) {
      return getItems();
    }

    const current = getItems();
    const existingIndex = current.findIndex(i => i.productId === pid);

    if (existingIndex >= 0) {
      const currentQty = current[existingIndex].quantity;
      const newQty = Math.min(currentQty + Math.max(1, Math.floor(addQty || 1)), MAX_LINE_QTY);
      if (newQty === currentQty) {
        return current;
      }
      current[existingIndex].quantity = newQty;
    } else {
      if (current.length >= MAX_CART_LINES) {
        return current;
      }
      const initialQty = Math.min(Math.max(Math.floor(addQty || 1), MIN_LINE_QTY), MAX_LINE_QTY);
      current.push({ productId: pid, quantity: initialQty });
    }

    return saveItems(current);
  }

  function updateQuantity(productId, quantity) {
    const pid = Number(productId);
    const newQty = Math.floor(Number(quantity));

    const current = getItems();
    if (newQty <= 0) {
      // Quantity <= 0 removes the item
      const filtered = current.filter(i => i.productId !== pid);
      if (filtered.length === current.length) {
        return current;
      }
      return saveItems(filtered);
    }

    const existingIndex = current.findIndex(i => i.productId === pid);
    if (existingIndex >= 0) {
      const clamped = Math.min(Math.max(newQty, MIN_LINE_QTY), MAX_LINE_QTY);
      if (current[existingIndex].quantity === clamped) {
        return current;
      }
      current[existingIndex].quantity = clamped;
      return saveItems(current);
    }

    return current;
  }

  function removeItem(productId) {
    const pid = Number(productId);
    const current = getItems();
    const filtered = current.filter(i => i.productId !== pid);
    if (filtered.length === current.length) {
      return current;
    }
    return saveItems(filtered);
  }

  function clearCart() {
    const current = getItems();
    if (current.length === 0) {
      return current;
    }
    try {
      storage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Ignore
    }
    const empty = [];
    notify(empty);
    return empty;
  }

  function getCount() {
    const items = getItems();
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  function subscribe(listener) {
    if (typeof listener === 'function') {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    return () => {};
  }

  return {
    getItems,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    getCount,
    subscribe,
    storage
  };
}

// Default singleton store instance using default storage
const defaultStore = createCartStore();

export const getCartItems = (storage) => storage ? createCartStore(storage).getItems() : defaultStore.getItems();
export const addToCart = (productId, qty, storage) => storage ? createCartStore(storage).addItem(productId, qty) : defaultStore.addItem(productId, qty);
export const updateCartQuantity = (productId, qty, storage) => storage ? createCartStore(storage).updateQuantity(productId, qty) : defaultStore.updateQuantity(productId, qty);
export const removeCartItem = (productId, storage) => storage ? createCartStore(storage).removeItem(productId) : defaultStore.removeItem(productId);
export const clearCart = (storage) => storage ? createCartStore(storage).clearCart() : defaultStore.clearCart();
export const getCartCount = (storage) => storage ? createCartStore(storage).getCount() : defaultStore.getCount();
export const subscribeCart = (listener) => defaultStore.subscribe(listener);

// Direct function aliases for controller convenience
export const addItem = addToCart;
export const getItems = getCartItems;
export const updateQuantity = updateCartQuantity;
export const removeItem = removeCartItem;

