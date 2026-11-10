/**
 * tests/unit/cart-store.test.js
 *
 * UT-12: public/js/cart-store.js (with injected storage)
 * Verifies:
 * - Corrupt JSON gives an empty cart
 * - Wrong shapes and non-integer values dropped
 * - Quantities clamped to 1 to 10
 * - Adding the same product increments
 * - At most 50 lines
 * - Only the key 'deskline.cart.v1' is used
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCartStore, CART_STORAGE_KEY } from '../../public/js/cart-store.js';

class MockStorage {
  constructor() {
    this.map = new Map();
    this.accessLog = [];
  }
  getItem(key) {
    this.accessLog.push({ op: 'get', key });
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.accessLog.push({ op: 'set', key, value });
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.accessLog.push({ op: 'remove', key });
    this.map.delete(key);
  }
  clear() {
    this.accessLog.push({ op: 'clear' });
    this.map.clear();
  }
}

describe('UT-12: cart-store.js with injected storage', () => {
  it('uses ONLY the authorized storage key "deskline.cart.v1"', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    cart.addItem(1, 2);
    cart.getItems();
    cart.removeItem(1);
    cart.clearCart();

    const usedKeys = new Set(storage.accessLog.map(a => a.key).filter(Boolean));
    assert.deepStrictEqual([...usedKeys], [CART_STORAGE_KEY]);
    assert.strictEqual(CART_STORAGE_KEY, 'deskline.cart.v1');
  });

  it('corrupt JSON in storage safely falls back to an empty cart', () => {
    const storage = new MockStorage();
    storage.map.set(CART_STORAGE_KEY, '{invalid json');

    const cart = createCartStore(storage);
    const items = cart.getItems();

    assert.deepStrictEqual(items, []);
  });

  it('drops wrong shapes, non-objects, and non-integer values', () => {
    const storage = new MockStorage();
    storage.map.set(CART_STORAGE_KEY, JSON.stringify([
      null,
      123,
      'a string',
      {},
      { productId: -5, quantity: 2 },
      { productId: 'not-a-number', quantity: 2 },
      { productId: 1, quantity: 'abc' },
      { productId: 2, quantity: 0 },
      { productId: 3, quantity: -1 },
      { productId: 4, quantity: 3 } // valid
    ]));

    const cart = createCartStore(storage);
    const items = cart.getItems();

    assert.deepStrictEqual(items, [
      { productId: 4, quantity: 3 }
    ]);
  });

  it('clamps quantities to bounds [1, 10]', () => {
    const storage = new MockStorage();
    storage.map.set(CART_STORAGE_KEY, JSON.stringify([
      { productId: 1, quantity: 50 }, // clamps to 10
      { productId: 2, quantity: 0.5 }, // floor is 0 -> dropped
      { productId: 3, quantity: 1 }    // retains 1
    ]));

    const cart = createCartStore(storage);
    const items = cart.getItems();

    assert.deepStrictEqual(items, [
      { productId: 1, quantity: 10 },
      { productId: 3, quantity: 1 }
    ]);
  });

  it('adding the same product increments its quantity up to 10', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    cart.addItem(1, 3);
    assert.deepStrictEqual(cart.getItems(), [{ productId: 1, quantity: 3 }]);

    cart.addItem(1, 4);
    assert.deepStrictEqual(cart.getItems(), [{ productId: 1, quantity: 7 }]);

    // Adding more clamps at 10
    cart.addItem(1, 5);
    assert.deepStrictEqual(cart.getItems(), [{ productId: 1, quantity: 10 }]);
  });

  it('caps cart at a maximum of 50 distinct lines', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    // Add 50 distinct products
    for (let id = 1; id <= 50; id++) {
      cart.addItem(id, 1);
    }
    assert.strictEqual(cart.getItems().length, 50);

    // Attempting to add the 51st distinct product is rejected
    cart.addItem(51, 1);
    assert.strictEqual(cart.getItems().length, 50);
    assert.strictEqual(cart.getItems().some(i => i.productId === 51), false);

    // But updating existing products is still permitted
    cart.addItem(1, 1);
    assert.strictEqual(cart.getItems().find(i => i.productId === 1).quantity, 2);
  });

  it('updates quantity and removes line when quantity is set to 0', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    cart.addItem(1, 5);
    cart.addItem(2, 3);

    cart.updateQuantity(1, 8);
    assert.strictEqual(cart.getItems().find(i => i.productId === 1).quantity, 8);

    cart.updateQuantity(1, 0); // sets to 0 -> removes line
    assert.deepStrictEqual(cart.getItems(), [{ productId: 2, quantity: 3 }]);
  });

  it('computes total item count accurately', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    assert.strictEqual(cart.getCount(), 0);

    cart.addItem(1, 2);
    cart.addItem(2, 5);

    assert.strictEqual(cart.getCount(), 7);
  });

  it('handles storage errors (e.g. QuotaExceededError or private mode) gracefully without crashing', () => {
    const throwingStorage = {
      getItem() {
        throw new Error('SecurityError: localStorage is disabled');
      },
      setItem() {
        throw new Error('QuotaExceededError: storage full');
      },
      removeItem() {
        throw new Error('SecurityError: storage disabled');
      }
    };

    const cart = createCartStore(throwingStorage);

    // None of these should throw
    assert.doesNotThrow(() => {
      const items = cart.getItems();
      assert.deepStrictEqual(items, []);
    });

    assert.doesNotThrow(() => {
      cart.addItem(1, 2);
    });

    assert.doesNotThrow(() => {
      cart.updateQuantity(1, 5);
    });

    assert.doesNotThrow(() => {
      cart.removeItem(1);
    });

    assert.doesNotThrow(() => {
      cart.clearCart();
    });
  });

  it('avoids unnecessary storage writes when state has not changed', () => {
    const storage = new MockStorage();
    const cart = createCartStore(storage);

    // Initial addition
    cart.addItem(1, 10);
    const initialSets = storage.accessLog.filter(a => a.op === 'set').length;
    assert.strictEqual(initialSets, 1);

    // Adding more to an item already capped at 10 does not write again
    cart.addItem(1, 5);
    const setsAfterAdd = storage.accessLog.filter(a => a.op === 'set').length;
    assert.strictEqual(setsAfterAdd, initialSets, 'Should not write when quantity is already at maximum 10');

    // Updating quantity to the same value does not write again
    cart.updateQuantity(1, 10);
    const setsAfterUpdate = storage.accessLog.filter(a => a.op === 'set').length;
    assert.strictEqual(setsAfterUpdate, initialSets, 'Should not write when updating to identical quantity');

    // Removing a non-existent item does not write
    cart.removeItem(999);
    const setsAfterRemove = storage.accessLog.filter(a => a.op === 'set').length;
    assert.strictEqual(setsAfterRemove, initialSets, 'Should not write when removing non-existent product');

    // Clearing an empty cart does not write/remove
    const emptyStorage = new MockStorage();
    const emptyCart = createCartStore(emptyStorage);
    emptyCart.clearCart();
    const removeCount = emptyStorage.accessLog.filter(a => a.op === 'remove').length;
    assert.strictEqual(removeCount, 0, 'Should not remove when cart is already empty');
  });

  it('updates cart listeners when a window storage event occurs', () => {
    const storage = new MockStorage();
    let listenerCalled = false;
    let listenerItems = null;

    // Mock window with addEventListener
    const storageListeners = [];
    globalThis.window = {
      addEventListener: (type, handler) => {
        if (type === 'storage') storageListeners.push(handler);
      }
    };

    try {
      const cart = createCartStore(storage);
      cart.subscribe((items) => {
        listenerCalled = true;
        listenerItems = items;
      });

      // External tab updates storage directly
      storage.map.set(CART_STORAGE_KEY, JSON.stringify([{ productId: 7, quantity: 3 }]));

      // Dispatch storage event
      for (const handler of storageListeners) {
        handler({ key: CART_STORAGE_KEY });
      }

      assert.strictEqual(listenerCalled, true);
      assert.deepStrictEqual(listenerItems, [{ productId: 7, quantity: 3 }]);
    } finally {
      delete globalThis.window;
    }
  });
});

