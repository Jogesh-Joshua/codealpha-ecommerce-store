/**
 * tests/unit/frontend-controllers.test.js
 *
 * Unit tests for Phase 8 frontend utilities and controller exports.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(...classes) {
    classes.forEach(c => this._set.add(c));
  }
  remove(...classes) {
    classes.forEach(c => this._set.delete(c));
  }
  contains(c) {
    return this._set.has(c);
  }
  has(c) {
    return this._set.has(c);
  }
  clear() {
    this._set.clear();
  }
  [Symbol.iterator]() {
    return this._set[Symbol.iterator]();
  }
}

// Setup minimal DOM environment for Node.js
class MockNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.style = {};
    this.dataset = {};
    this.eventListeners = {};
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get nextElementSibling() {
    return null;
  }

  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
    }
    return child;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    this.setAttribute('id', val);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') {
      this.className = value;
    }
    if (name === 'id' && globalThis.document?._elementsById) {
      globalThis.document._elementsById.set(String(value), this);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(fn);
  }

  get className() {
    return Array.from(this.classList).join(' ');
  }

  set className(val) {
    this.classList.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  get textContent() {
    return this.childNodes.map(c => c.textContent || c.nodeValue || '').join('');
  }

  set textContent(val) {
    this.childNodes = [new MockTextNode(val)];
  }

  querySelector() {
    return null;
  }

  querySelectorAll(sel) {
    const matches = [];
    const walk = (node) => {
      for (const child of node.childNodes || []) {
        if (sel === '.toast:not(.toast--exiting)' && child.classList?.has('toast') && !child.classList?.has('toast--exiting')) {
          matches.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
  }
}

class MockTextNode extends MockNode {
  constructor(text) {
    super(3, '#text');
    this.nodeValue = String(text);
  }
  get textContent() {
    return this.nodeValue;
  }
}

class MockDocument {
  constructor() {
    this.readyState = 'loading';
    this.body = new MockElement('BODY');
    this._elementsById = new Map();
  }
  createElement(tag) {
    return new MockElement(tag);
  }
  createElementNS(ns, tag) {
    const el = new MockElement(tag);
    el.namespaceURI = ns;
    return el;
  }
  createTextNode(text) {
    return new MockTextNode(text);
  }
  getElementById(id) {
    if (this._elementsById.has(id)) return this._elementsById.get(id);
    const search = (node) => {
      if (node && node.getAttribute && node.getAttribute('id') === id) return node;
      for (const child of node.childNodes || []) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(this.body);
  }
  querySelector() {
    return null;
  }
  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel);
  }
  addEventListener() {}
}

describe('Phase 8: Frontend DOM & Controller Helpers', () => {
  let originalDocument;
  let originalNode;

  before(() => {
    originalDocument = globalThis.document;
    originalNode = globalThis.Node;

    globalThis.document = new MockDocument();
    globalThis.Node = MockNode;
  });

  after(() => {
    globalThis.document = originalDocument;
    globalThis.Node = originalNode;
  });

  it('el() creates elements with classes, attributes, dataset, and children', async () => {
    const { el } = await import('../../public/js/dom.js');

    const button = el('button', {
      className: 'button button-primary',
      id: 'test-btn',
      type: 'button',
      'aria-pressed': 'true',
      dataset: { slot: '1' }
    }, 'Click me');

    assert.equal(button.tagName, 'BUTTON');
    assert.ok(button.classList.has('button'));
    assert.ok(button.classList.has('button-primary'));
    assert.equal(button.getAttribute('id'), 'test-btn');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.dataset.slot, '1');
    assert.equal(button.textContent, 'Click me');
  });

  it('clearChildren() removes all child nodes', async () => {
    const { el, clearChildren } = await import('../../public/js/dom.js');

    const parent = el('div', {}, el('span', {}, 'Child 1'), el('span', {}, 'Child 2'));
    assert.equal(parent.childNodes.length, 2);

    clearChildren(parent);
    assert.equal(parent.childNodes.length, 0);
  });

  it('icon() constructs valid SVG with accessible attributes', async () => {
    const { icon } = await import('../../public/js/dom.js');

    const checkIcon = icon('check', { width: 24, height: 24 });
    assert.equal(checkIcon.tagName, 'SVG');
    assert.equal(checkIcon.getAttribute('width'), '24');
    assert.equal(checkIcon.getAttribute('height'), '24');
    assert.equal(checkIcon.getAttribute('aria-hidden'), 'true');
  });

  it('createInlineAlert() constructs alert with correct role and icon', async () => {
    const { createInlineAlert } = await import('../../public/js/dom.js');

    const alert = createInlineAlert({
      type: 'warning',
      message: 'Limited stock remaining'
    });

    assert.ok(alert.classList.has('alert'));
    assert.ok(alert.classList.has('alert-warning'));
    assert.equal(alert.getAttribute('role'), 'status');
    assert.ok(alert.textContent.includes('Limited stock remaining'));
  });

  it('createEmptyState() constructs empty state panel', async () => {
    const { createEmptyState } = await import('../../public/js/dom.js');

    const empty = createEmptyState({
      title: 'Cart is empty',
      message: 'Explore our catalog',
      actionText: 'Browse shop',
      actionHref: '/shop'
    });

    assert.ok(empty.classList.has('empty-state'));
    assert.ok(empty.textContent.includes('Cart is empty'));
    assert.ok(empty.textContent.includes('Explore our catalog'));
  });

  it('createProductCard() produces complete card structure', async () => {
    const { createProductCard } = await import('../../public/js/home.js');

    const product = {
      id: 1,
      slug: 'felt-desk-mat-charcoal',
      name: 'Felt desk mat, charcoal',
      priceMinor: 149900,
      categorySlug: 'desk-mats',
      categoryName: 'Desk mats',
      stockStatus: 'low_stock',
      stock: 3
    };

    const card = createProductCard(product);
    assert.ok(card.classList.has('product-card'));
    assert.ok(card.textContent.includes('Felt desk mat, charcoal'));
    assert.ok(card.textContent.includes('₹1,499'));
    assert.ok(card.textContent.includes('Low stock'));
  });

  it('all controller modules export their main initialization functions', async () => {
    const home = await import('../../public/js/home.js');
    assert.equal(typeof home.initHomePage, 'function');

    const shop = await import('../../public/js/shop.js');
    assert.equal(typeof shop.initShopPage, 'function');

    const product = await import('../../public/js/product.js');
    assert.equal(typeof product.initProductPage, 'function');

    const cart = await import('../../public/js/cart.js');
    assert.equal(typeof cart.initCartPage, 'function');

    const checkout = await import('../../public/js/checkout.js');
    assert.equal(typeof checkout.initCheckoutPage, 'function');

    const order = await import('../../public/js/order.js');
    assert.equal(typeof order.initOrderPage, 'function');

    const orders = await import('../../public/js/orders.js');
    assert.equal(typeof orders.initOrdersPage, 'function');

    const login = await import('../../public/js/login.js');
    assert.equal(typeof login.initLoginPage, 'function');

    const register = await import('../../public/js/register.js');
    assert.equal(typeof register.initRegisterPage, 'function');
  });

  it('showToast() supports action button for cart Undo and executes callback', async () => {
    let undone = false;
    const { showToast } = await import('../../public/js/toast.js');

    showToast('Removed Felt desk mat, charcoal.', {
      actionText: 'Undo',
      duration: 6000,
      onAction: () => {
        undone = true;
      }
    });

    const region = document.getElementById('deskline-toast-region');
    assert.ok(region, 'Toast region was created');
    assert.ok(region.childNodes.length > 0, 'Toast element was appended');

    const toastEl = region.childNodes[0];
    assert.ok(toastEl.textContent.includes('Removed Felt desk mat, charcoal.'));

    // Find action button
    const actionBtn = toastEl.childNodes.find(c => c.classList && c.classList.has('toast__action-btn'));
    assert.ok(actionBtn, 'Toast action button was rendered');
    assert.equal(actionBtn.textContent, 'Undo');

    // Trigger click on action button
    const clickListeners = actionBtn.eventListeners['click'] || [];
    assert.ok(clickListeners.length > 0, 'Click listener exists on Undo button');
    clickListeners[0]();
    assert.strictEqual(undone, true, 'Undo callback was executed');
  });
});
