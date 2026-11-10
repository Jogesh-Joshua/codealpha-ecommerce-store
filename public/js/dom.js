/**
 * public/js/dom.js
 *
 * Safe DOM creation and UI helpers for Deskline (Phase 8).
 * Adheres strictly to:
 * - STAT-01: Zero raw HTML injection, dynamic code evaluation, or dangerous sinks.
 * - STAT-02: Zero inline on*= event handlers or inline style attributes.
 * - STAT-03: Zero external URLs.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create a DOM element with properties, event listeners, and children.
 *
 * @param {string} tag
 * @param {object} [props={}]
 * @param {...(Node|string|number|Array)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;

      if (key === 'className' || key === 'class') {
        element.className = value;
      } else if (key === 'textContent' || key === 'text') {
        element.textContent = String(value);
      } else if (key === 'on' && typeof value === 'object') {
        for (const [event, handler] of Object.entries(value)) {
          if (typeof handler === 'function') {
            element.addEventListener(event, handler);
          }
        }
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [dataKey, dataVal] of Object.entries(value)) {
          if (dataVal !== undefined && dataVal !== null) {
            element.dataset[dataKey] = String(dataVal);
          }
        }
      } else if (key === 'value') {
        element.value = String(value);
        element.setAttribute(key, String(value));
      } else if (key === 'disabled') {
        element.disabled = Boolean(value);
        if (value) {
          element.setAttribute('disabled', '');
        } else {
          element.removeAttribute('disabled');
        }
      } else if (key === 'checked') {
        element.checked = Boolean(value);
        if (value) element.setAttribute('checked', '');
        else element.removeAttribute('checked');
      } else if (typeof value === 'boolean') {
        if (value) {
          element.setAttribute(key, '');
        }
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(element, children);
  return element;
}

/**
 * Recursively append child nodes or text to an element.
 */
function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

/**
 * Remove all child nodes from a container element.
 *
 * @param {HTMLElement} element
 */
export function clearChildren(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Create an accessible SVG icon using SVG DOM methods.
 *
 * @param {string} name
 * @param {object} [options={}]
 * @returns {SVGElement}
 */
export function icon(name, { className = 'icon', width = 20, height = 20, ariaHidden = true } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);
  if (ariaHidden) {
    svg.setAttribute('aria-hidden', 'true');
  } else {
    svg.setAttribute('role', 'img');
  }

  switch (name) {
    case 'check': {
      const polyline = document.createElementNS(SVG_NS, 'polyline');
      polyline.setAttribute('points', '20 6 9 17 4 12');
      svg.appendChild(polyline);
      break;
    }
    case 'x': {
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '18'); l1.setAttribute('y1', '6'); l1.setAttribute('x2', '6'); l1.setAttribute('y2', '18');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '6'); l2.setAttribute('y1', '6'); l2.setAttribute('x2', '18'); l2.setAttribute('y2', '18');
      svg.appendChild(l1);
      svg.appendChild(l2);
      break;
    }
    case 'alert':
    case 'alert-circle': {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '8'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '12');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '16'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '16');
      svg.appendChild(circle);
      svg.appendChild(l1);
      svg.appendChild(l2);
      break;
    }
    case 'info': {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '16'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '12');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '8'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '8');
      svg.appendChild(circle);
      svg.appendChild(l1);
      svg.appendChild(l2);
      break;
    }
    case 'chevron-right': {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('points', '9 18 15 12 9 6');
      svg.appendChild(poly);
      break;
    }
    case 'chevron-left': {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('points', '15 18 9 12 15 6');
      svg.appendChild(poly);
      break;
    }
    case 'chevron-down': {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('points', '6 9 12 15 18 9');
      svg.appendChild(poly);
      break;
    }
    case 'trash': {
      const poly = document.createElementNS(SVG_NS, 'polyline');
      poly.setAttribute('points', '3 6 5 6 21 6');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
      svg.appendChild(poly);
      svg.appendChild(path);
      break;
    }
    case 'plus': {
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '5'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '19');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '5'); l2.setAttribute('y1', '12'); l2.setAttribute('x2', '19'); l2.setAttribute('y2', '12');
      svg.appendChild(l1);
      svg.appendChild(l2);
      break;
    }
    case 'minus': {
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '5'); l1.setAttribute('y1', '12'); l1.setAttribute('x2', '19'); l1.setAttribute('y2', '12');
      svg.appendChild(l1);
      break;
    }
    case 'cart': {
      const p1 = document.createElementNS(SVG_NS, 'path');
      p1.setAttribute('d', 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z');
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '3'); l1.setAttribute('y1', '6'); l1.setAttribute('x2', '21'); l1.setAttribute('y2', '6');
      const p2 = document.createElementNS(SVG_NS, 'path');
      p2.setAttribute('d', 'M16 10a4 4 0 0 1-8 0');
      svg.appendChild(p1);
      svg.appendChild(l1);
      svg.appendChild(p2);
      break;
    }
    case 'package': {
      const p1 = document.createElementNS(SVG_NS, 'line');
      p1.setAttribute('x1', '16.5'); p1.setAttribute('y1', '9.4'); p1.setAttribute('x2', '7.5'); p1.setAttribute('y2', '4.21');
      const p2 = document.createElementNS(SVG_NS, 'path');
      p2.setAttribute('d', 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z');
      const p3 = document.createElementNS(SVG_NS, 'polyline');
      p3.setAttribute('points', '3.27 6.96 12 12.01 20.73 6.96');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '22.08'); l2.setAttribute('x2', '12'); l2.setAttribute('y2', '12');
      svg.appendChild(p1);
      svg.appendChild(p2);
      svg.appendChild(p3);
      svg.appendChild(l2);
      break;
    }
    default:
      break;
  }

  return svg;
}

/**
 * Render an inline alert banner.
 *
 * @param {object} options
 * @param {'info'|'warning'|'error'|'success'} [options.type='info']
 * @param {string} options.message
 * @param {string} [options.actionText]
 * @param {Function} [options.onAction]
 * @param {boolean} [options.dismissible=false]
 * @param {Function} [options.onDismiss]
 * @returns {HTMLElement}
 */
export function createInlineAlert({ type = 'info', message, actionText, onAction, dismissible = false, onDismiss }) {
  const alert = el('div', {
    className: `alert alert-${type}`,
    role: type === 'error' ? 'alert' : 'status'
  });

  const iconName = type === 'error' ? 'alert' : type === 'warning' ? 'alert' : type === 'success' ? 'check' : 'info';
  alert.appendChild(icon(iconName, { className: 'alert-icon', width: 20, height: 20 }));

  const msgSpan = el('span', { className: 'alert-message', text: message });
  alert.appendChild(msgSpan);

  if (actionText && typeof onAction === 'function') {
    const actionBtn = el('button', {
      type: 'button',
      className: 'button button-text button-sm',
      text: actionText,
      on: { click: onAction }
    });
    alert.appendChild(actionBtn);
  }

  if (dismissible) {
    const closeBtn = el('button', {
      type: 'button',
      className: 'icon-button alert-close',
      'aria-label': 'Dismiss alert',
      on: {
        click: () => {
          alert.remove();
          if (typeof onDismiss === 'function') onDismiss();
        }
      }
    }, icon('x', { width: 16, height: 16 }));
    alert.appendChild(closeBtn);
  }

  return alert;
}

/**
 * Render a standard empty state panel.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.actionText]
 * @param {string} [options.actionHref]
 * @param {Function} [options.onAction]
 * @returns {HTMLElement}
 */
export function createEmptyState({ title, message, actionText, actionHref, onAction }) {
  const wrap = el('div', { className: 'empty-state' });

  const h2 = el('h2', { className: 'heading-2', text: title });
  const p = el('p', { className: 'body-text text-secondary', text: message });

  wrap.appendChild(h2);
  wrap.appendChild(p);

  if (actionText) {
    if (actionHref) {
      const link = el('a', {
        href: actionHref,
        className: 'button button-primary',
        text: actionText
      });
      wrap.appendChild(link);
    } else if (typeof onAction === 'function') {
      const btn = el('button', {
        type: 'button',
        className: 'button button-primary',
        text: actionText,
        on: { click: onAction }
      });
      wrap.appendChild(btn);
    }
  }

  return wrap;
}

/**
 * Render an error panel with a retry button.
 *
 * @param {string} message
 * @param {Function} [onRetry]
 * @returns {HTMLElement}
 */
export function createErrorPanel(message, onRetry) {
  const panel = el('div', { className: 'alert alert-error', role: 'alert' });
  panel.appendChild(icon('alert', { className: 'alert-icon', width: 20, height: 20 }));

  const msgSpan = el('span', { className: 'alert-message', text: message });
  panel.appendChild(msgSpan);

  if (typeof onRetry === 'function') {
    const retryBtn = el('button', {
      type: 'button',
      className: 'button button-secondary button-sm',
      text: 'Try again',
      on: { click: onRetry }
    });
    panel.appendChild(retryBtn);
  }

  return panel;
}

/**
 * Create a quantity stepper element.
 *
 * @param {object} options
 * @param {number} options.value
 * @param {number} options.min
 * @param {number} options.max
 * @param {Function} options.onChange
 * @returns {HTMLElement}
 */
export function createQuantityStepper({ value = 1, min = 1, max = 10, onChange }) {
  let current = Math.min(Math.max(value, min), max);

  const container = el('div', { className: 'stepper' });

  const minusBtn = el('button', {
    type: 'button',
    className: 'stepper-btn stepper-minus',
    'aria-label': 'Decrease quantity',
    disabled: current <= min,
    on: {
      click: () => {
        if (current > min) {
          current -= 1;
          updateState();
          if (onChange) onChange(current);
        }
      }
    }
  }, icon('minus', { width: 16, height: 16 }));

  const input = el('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    className: 'stepper-input',
    value: String(current),
    'aria-label': 'Quantity',
    on: {
      blur: (e) => {
        const val = parseInt(e.target.value.trim(), 10);
        if (Number.isInteger(val) && val >= min && val <= max) {
          current = val;
        } else {
          // snap back
          input.value = String(current);
        }
        updateState();
        if (onChange) onChange(current);
      },
      keydown: (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (current < max) {
            current += 1;
            updateState();
            if (onChange) onChange(current);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (current > min) {
            current -= 1;
            updateState();
            if (onChange) onChange(current);
          }
        }
      }
    }
  });

  const plusBtn = el('button', {
    type: 'button',
    className: 'stepper-btn stepper-plus',
    'aria-label': 'Increase quantity',
    disabled: current >= max,
    on: {
      click: () => {
        if (current < max) {
          current += 1;
          updateState();
          if (onChange) onChange(current);
        }
      }
    }
  }, icon('plus', { width: 16, height: 16 }));

  function updateState() {
    input.value = String(current);
    minusBtn.disabled = current <= min;
    plusBtn.disabled = current >= max;
  }

  container.appendChild(minusBtn);
  container.appendChild(input);
  container.appendChild(plusBtn);

  return container;
}
