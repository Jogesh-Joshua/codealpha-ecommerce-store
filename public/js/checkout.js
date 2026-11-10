/**
 * public/js/checkout.js
 *
 * Deskline — Checkout Controller (Phase 8 / Section E7)
 *
 * Implements:
 * - Protected route check against /api/auth/me
 * - Cart validation check against POST /api/cart/validate
 * - In-memory UUID v4 idempotency key retention
 * - Shipping address form validation and schema formatting
 * - Demo order notice with zero payment gateways/inputs
 * - Submission with spinner, aria-busy, and stock conflict handling
 * - Redirect to /order?id=... on 201 with sessionStorage confirmation marker
 * - Strict DOM safety: Zero HTML string injection (STAT-01)
 */

import { api } from './api.js';
import { getItems, clearCart } from './cart-store.js';
import { formatMinor } from './format-minor.js';
import { el, clearChildren, icon, createInlineAlert, createErrorPanel } from './dom.js';

let idempotencyKey = '';

export async function initCheckoutPage() {
  const contentEl = document.getElementById('checkout-content');
  if (!contentEl) return;

  // 1. Session check (Protected route)
  let currentUser = null;
  try {
    const meRes = await api.get('/api/auth/me');
    currentUser = meRes?.data?.user;
    if (!currentUser) {
      window.location.href = '/login?next=/checkout';
      return;
    }
  } catch {
    window.location.href = '/login?next=/checkout';
    return;
  }

  // 2. Cart verification
  const items = getItems();
  if (!items || items.length === 0) {
    window.location.href = '/cart';
    return;
  }

  // 3. Validate cart prices and availability
  let cartData = null;
  try {
    const valRes = await api.post('/api/cart/validate', { items });
    cartData = valRes?.data;
    if (!cartData || !cartData.lines || cartData.lines.length === 0 || cartData.hasBlockingIssues || cartData.valid === false) {
      window.location.href = '/cart';
      return;
    }
  } catch {
    clearChildren(contentEl);
    contentEl.appendChild(createErrorPanel(
      "We couldn't verify your cart items. Try again.",
      () => initCheckoutPage()
    ));
    return;
  }

  // 4. Generate or retain Idempotency Key in page memory
  if (!idempotencyKey) {
    idempotencyKey = crypto.randomUUID();
  }

  renderCheckoutView(contentEl, currentUser, cartData);
}

/**
 * Render the complete checkout view.
 */
function renderCheckoutView(container, user, cartData) {
  clearChildren(container);

  const alertSlot = el('div', { id: 'checkout-alert-slot', className: 'checkout-alerts' });
  container.appendChild(alertSlot);

  const layout = el('div', { className: 'checkout-layout' });
  const formCol = el('div', { className: 'checkout-form-panel' });
  const summaryCol = el('div', { className: 'checkout-summary-panel' });

  // ── Contact Section ──
  const contactSection = el('section', { className: 'checkout-section-block', 'aria-labelledby': 'contact-heading' });
  const contactHeading = el('h2', { id: 'contact-heading', className: 'heading-2', text: 'Contact' });
  const contactEmail = el('p', { className: 'body-text text-secondary', text: `Signed in as ${user.email}` });
  contactSection.appendChild(contactHeading);
  contactSection.appendChild(contactEmail);
  formCol.appendChild(contactSection);

  // ── Shipping Address Form ──
  const shippingSection = el('section', { className: 'checkout-section-block', 'aria-labelledby': 'shipping-heading' });
  const shippingHeading = el('h2', { id: 'shipping-heading', className: 'heading-2', text: 'Shipping address' });
  shippingSection.appendChild(shippingHeading);

  const form = el('form', { id: 'shipping-form', novalidate: true });

  // Full Name
  const nameGroup = el('div', { className: 'field-group' });
  const nameLabel = el('label', { for: 'ship-name', className: 'field-label', text: 'Full name' });
  const nameInput = el('input', {
    type: 'text',
    id: 'ship-name',
    name: 'fullName',
    className: 'field-input',
    autocomplete: 'name',
    value: user.name || '',
    required: true
  });
  const nameError = el('div', { id: 'name-error', className: 'field-error-slot', 'aria-live': 'polite' });
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  nameGroup.appendChild(nameError);
  form.appendChild(nameGroup);

  // Phone
  const phoneGroup = el('div', { className: 'field-group' });
  const phoneLabel = el('label', { for: 'ship-phone', className: 'field-label', text: 'Phone' });
  const phoneInput = el('input', {
    type: 'tel',
    id: 'ship-phone',
    name: 'phone',
    className: 'field-input',
    inputmode: 'tel',
    autocomplete: 'tel',
    placeholder: '9876543210…',
    required: true
  });
  const phoneError = el('div', { id: 'phone-error', className: 'field-error-slot', 'aria-live': 'polite' });
  phoneGroup.appendChild(phoneLabel);
  phoneGroup.appendChild(phoneInput);
  phoneGroup.appendChild(phoneError);
  form.appendChild(phoneGroup);

  // Address Line 1
  const addr1Group = el('div', { className: 'field-group' });
  const addr1Label = el('label', { for: 'ship-addr1', className: 'field-label', text: 'Address line 1' });
  const addr1Input = el('input', {
    type: 'text',
    id: 'ship-addr1',
    name: 'addressLine1',
    className: 'field-input',
    autocomplete: 'address-line1',
    placeholder: '12 Example Street…',
    required: true
  });
  const addr1Error = el('div', { id: 'addr1-error', className: 'field-error-slot', 'aria-live': 'polite' });
  addr1Group.appendChild(addr1Label);
  addr1Group.appendChild(addr1Input);
  addr1Group.appendChild(addr1Error);
  form.appendChild(addr1Group);

  // Address Line 2 (Optional)
  const addr2Group = el('div', { className: 'field-group' });
  const addr2Label = el('label', { for: 'ship-addr2', className: 'field-label', text: 'Address line 2 (optional)' });
  const addr2Input = el('input', {
    type: 'text',
    id: 'ship-addr2',
    name: 'addressLine2',
    className: 'field-input',
    autocomplete: 'address-line2',
    placeholder: 'Apartment, suite, unit…'
  });
  const addr2Error = el('div', { id: 'addr2-error', className: 'field-error-slot', 'aria-live': 'polite' });
  addr2Group.appendChild(addr2Label);
  addr2Group.appendChild(addr2Input);
  addr2Group.appendChild(addr2Error);
  form.appendChild(addr2Group);

  // City & Region (2 cols)
  const cityRegionRow = el('div', { className: 'form-grid-2' });

  const cityGroup = el('div', { className: 'field-group' });
  const cityLabel = el('label', { for: 'ship-city', className: 'field-label', text: 'City' });
  const cityInput = el('input', {
    type: 'text',
    id: 'ship-city',
    name: 'city',
    className: 'field-input',
    autocomplete: 'address-level2',
    placeholder: 'Mumbai…',
    required: true
  });
  const cityError = el('div', { id: 'city-error', className: 'field-error-slot', 'aria-live': 'polite' });
  cityGroup.appendChild(cityLabel);
  cityGroup.appendChild(cityInput);
  cityGroup.appendChild(cityError);

  const regionGroup = el('div', { className: 'field-group' });
  const regionLabel = el('label', { for: 'ship-region', className: 'field-label', text: 'State or region' });
  const regionInput = el('input', {
    type: 'text',
    id: 'ship-region',
    name: 'region',
    className: 'field-input',
    autocomplete: 'address-level1',
    placeholder: 'Maharashtra…',
    required: true
  });
  const regionError = el('div', { id: 'region-error', className: 'field-error-slot', 'aria-live': 'polite' });
  regionGroup.appendChild(regionLabel);
  regionGroup.appendChild(regionInput);
  regionGroup.appendChild(regionError);

  cityRegionRow.appendChild(cityGroup);
  cityRegionRow.appendChild(regionGroup);
  form.appendChild(cityRegionRow);

  // Postal code
  const postGroup = el('div', { className: 'field-group' });
  const postLabel = el('label', { for: 'ship-postcode', className: 'field-label', text: 'Postal code' });
  const postInput = el('input', {
    type: 'text',
    id: 'ship-postcode',
    name: 'postalCode',
    className: 'field-input',
    autocomplete: 'postal-code',
    placeholder: '400001…',
    required: true
  });
  const postError = el('div', { id: 'post-error', className: 'field-error-slot', 'aria-live': 'polite' });
  postGroup.appendChild(postLabel);
  postGroup.appendChild(postInput);
  postGroup.appendChild(postError);
  form.appendChild(postGroup);

  // Delivery Section (Read only)
  const deliveryGroup = el('div', { className: 'field-group' });
  const delivLabel = el('span', { className: 'field-label', text: 'Delivery' });
  const delivBox = el('div', { className: 'summary-row' },
    el('span', { text: 'Flat-rate shipping' }),
    el('span', { className: 'ui-strong', text: formatMinor(cartData.summary?.shippingMinor || 9900) })
  );
  deliveryGroup.appendChild(delivLabel);
  deliveryGroup.appendChild(delivBox);
  form.appendChild(deliveryGroup);

  // Demo Order Notice Panel (Section E7)
  const demoPanel = el('div', { className: 'alert alert-info', role: 'region', 'aria-label': 'Demo notice' },
    icon('info', { width: 20, height: 20 }),
    el('div', {},
      el('p', { className: 'ui-strong', text: 'Demo order, no payment' }),
      el('p', { className: 'small text-secondary', text: "Placing this order saves it to the store's database so it appears in your order history. You won't be charged and nothing will ship. Use fictional details only." })
    )
  );
  form.appendChild(demoPanel);

  shippingSection.appendChild(form);
  formCol.appendChild(shippingSection);

  // ── Summary Column ──
  const summaryHeader = el('div', { className: 'section-header' },
    el('h2', { className: 'heading-2', text: 'Order summary' }),
    el('a', { href: '/cart', className: 'button button-text button-sm', text: 'Edit cart' })
  );
  summaryCol.appendChild(summaryHeader);

  // Lines preview
  const linesList = el('div', { className: 'checkout-lines' });
  for (const line of cartData.lines || []) {
    const itemRow = el('div', { className: 'checkout-line-item' });
    const thumbWrap = el('div', { className: 'checkout-item-thumb-wrap' });
    const thumbImg = el('img', {
      src: line.imageUrl || `/images/placeholders/${line.categorySlug || 'desk-mats'}.svg`,
      alt: line.name || '',
      width: '56',
      height: '70',
      loading: 'lazy',
      decoding: 'async'
    });
    const lineQty = line.allowedQuantity ?? line.requestedQuantity ?? line.quantity ?? 1;
    const badge = el('span', { className: 'checkout-item-badge', text: String(lineQty) });
    thumbWrap.appendChild(thumbImg);
    thumbWrap.appendChild(badge);

    const nameSpan = el('span', { className: 'small ui-strong', style: 'flex: 1;', text: line.name });
    nameSpan.removeAttribute('style');
    nameSpan.classList.add('item-name-grow');

    const priceSpan = el('span', { className: 'price-md', text: formatMinor(line.lineTotalMinor) });

    itemRow.appendChild(thumbWrap);
    itemRow.appendChild(nameSpan);
    itemRow.appendChild(priceSpan);
    linesList.appendChild(itemRow);
  }
  summaryCol.appendChild(linesList);

  const sumRows = el('div', { className: 'summary-rows' });
  sumRows.appendChild(el('div', { className: 'summary-row' },
    el('span', { text: 'Subtotal' }),
    el('span', { className: 'ui-strong', text: formatMinor(cartData.summary?.subtotalMinor || 0) })
  ));
  sumRows.appendChild(el('div', { className: 'summary-row' },
    el('span', { text: 'Shipping' }),
    el('span', { className: 'ui-strong', text: formatMinor(cartData.summary?.shippingMinor || 0) })
  ));
  sumRows.appendChild(el('div', { className: 'summary-divider' }));
  sumRows.appendChild(el('div', { className: 'summary-row summary-row-total' },
    el('span', { text: 'Total' }),
    el('span', { className: 'price-lg', text: formatMinor(cartData.summary?.totalMinor || 0) })
  ));
  summaryCol.appendChild(sumRows);

  // Submit button
  const placeBtn = el('button', {
    type: 'button',
    id: 'place-order-btn',
    className: 'button button-primary button-lg button-full',
    text: 'Place demo order',
    on: {
      click: () => submitOrder()
    }
  });
  summaryCol.appendChild(placeBtn);

  const noPayNote = el('p', { className: 'caption text-secondary text-center', text: 'No payment is taken.' });
  summaryCol.appendChild(noPayNote);

  layout.appendChild(formCol);
  layout.appendChild(summaryCol);
  container.appendChild(layout);

  // Blur validations
  nameInput.addEventListener('blur', () => validateFullName(nameInput, nameError));
  phoneInput.addEventListener('blur', () => validatePhone(phoneInput, phoneError));
  addr1Input.addEventListener('blur', () => validateAddr1(addr1Input, addr1Error));
  addr2Input.addEventListener('blur', () => validateAddr2(addr2Input, addr2Error));
  cityInput.addEventListener('blur', () => validateCity(cityInput, cityError));
  regionInput.addEventListener('blur', () => validateRegion(regionInput, regionError));
  postInput.addEventListener('blur', () => validatePostcode(postInput, postError));

  async function submitOrder() {
    clearChildren(alertSlot);

    const isNameOk = validateFullName(nameInput, nameError);
    const isPhoneOk = validatePhone(phoneInput, phoneError);
    const isAddr1Ok = validateAddr1(addr1Input, addr1Error);
    const isAddr2Ok = validateAddr2(addr2Input, addr2Error);
    const isCityOk = validateCity(cityInput, cityError);
    const isRegionOk = validateRegion(regionInput, regionError);
    const isPostOk = validatePostcode(postInput, postError);

    if (!isNameOk || !isPhoneOk || !isAddr1Ok || !isAddr2Ok || !isCityOk || !isRegionOk || !isPostOk) {
      if (!isNameOk) nameInput.focus();
      else if (!isPhoneOk) phoneInput.focus();
      else if (!isAddr1Ok) addr1Input.focus();
      else if (!isAddr2Ok) addr2Input.focus();
      else if (!isCityOk) cityInput.focus();
      else if (!isRegionOk) regionInput.focus();
      else if (!isPostOk) postInput.focus();
      return;
    }

    // Set submitting state
    placeBtn.disabled = true;
    placeBtn.setAttribute('aria-busy', 'true');
    const originalText = placeBtn.textContent;
    placeBtn.textContent = 'Placing order…';

    // Disable form fields during flight
    form.querySelectorAll('input').forEach(i => i.disabled = true);

    try {
      const orderPayload = {
        items: cartData.lines.map(l => ({
          productId: l.productId,
          quantity: l.allowedQuantity ?? l.requestedQuantity ?? l.quantity ?? 1
        })),
        shipping: {
          fullName: nameInput.value.trim(),
          phone: phoneInput.value.replace(/\D/g, ''),
          addressLine1: addr1Input.value.trim(),
          addressLine2: addr2Input.value.trim() || null,
          city: cityInput.value.trim(),
          region: regionInput.value.trim(),
          postalCode: postInput.value.trim()
        }
      };

      const res = await api.post('/api/orders', orderPayload, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });

      if (res && (res.status === 201 || res.status === 200) && res.data?.order) {
        const order = res.data.order;
        clearCart();
        try {
          sessionStorage.setItem('deskline.order.confirmed', order.orderNumber);
        } catch {
          // Failure to write optional confirmation marker cannot prevent navigation
        }
        window.location.href = `/order?id=${encodeURIComponent(order.id)}`;
        return;
      }
    } catch (err) {
      placeBtn.disabled = false;
      placeBtn.removeAttribute('aria-busy');
      placeBtn.textContent = originalText;
      form.querySelectorAll('input').forEach(i => i.disabled = false);

      if (err.status === 409) {
        // Stock conflict or key reused
        idempotencyKey = crypto.randomUUID(); // Fresh key for next try

        const conflictAlert = createInlineAlert({
          type: 'warning',
          message: 'Some items changed while you were checking out.',
          actionText: 'Review cart',
          onAction: () => {
            window.location.href = '/cart';
          }
        });
        alertSlot.appendChild(conflictAlert);
        conflictAlert.scrollIntoView({ behavior: 'smooth', block: 'start' });
        conflictAlert.focus();
      } else if (err.status === 401) {
        window.location.href = '/login?next=/checkout&notice=expired';
      } else {
        const errorAlert = createInlineAlert({
          type: 'error',
          message: "We couldn't place your order. Your cart and details are still here. Try again.",
          actionText: 'Try again',
          onAction: () => submitOrder()
        });
        alertSlot.appendChild(errorAlert);
        errorAlert.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
}

function validateFullName(input, slot) {
  const val = input.value.trim();
  if (!val) {
    renderFieldError(slot, input, "Enter the recipient's name.");
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validatePhone(input, slot) {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    renderFieldError(slot, input, 'Enter a phone number with 10 to 15 digits.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validateAddr1(input, slot) {
  const val = input.value.trim();
  if (!val) {
    renderFieldError(slot, input, 'Enter a street address.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validateAddr2(input, slot) {
  const val = input.value.trim();
  if (val.length > 150) {
    renderFieldError(slot, input, 'Use 150 characters or fewer.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validateCity(input, slot) {
  const val = input.value.trim();
  if (!val) {
    renderFieldError(slot, input, 'Enter a city.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validateRegion(input, slot) {
  const val = input.value.trim();
  if (!val) {
    renderFieldError(slot, input, 'Enter a state or region.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function validatePostcode(input, slot) {
  const val = input.value.trim();
  if (!val || val.length < 3 || val.length > 10) {
    renderFieldError(slot, input, 'Enter a valid postal code.');
    return false;
  }
  clearFieldError(slot, input);
  return true;
}

function renderFieldError(slot, input, msg) {
  if (!slot) return;
  clearChildren(slot);
  input.setAttribute('aria-invalid', 'true');
  input.classList.add('field-invalid');

  const p = el('p', { className: 'field-error-msg' },
    icon('alert', { width: 14, height: 14 }),
    document.createTextNode(' ' + msg)
  );
  slot.appendChild(p);
}

function clearFieldError(slot, input) {
  if (!slot) return;
  clearChildren(slot);
  input.removeAttribute('aria-invalid');
  input.classList.remove('field-invalid');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutPage);
  } else {
    initCheckoutPage();
  }
}

