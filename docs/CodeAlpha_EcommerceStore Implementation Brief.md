# CodeAlpha\_EcommerceStore: Implementation Brief

Spec for CodeAlpha Full Stack Internship, Task 1 (Simple E-commerce Store). Written to be handed to a coding agent. No code yet.

**Source tags:** **\[CA\]** = stated in the CodeAlpha PDF, **\[YOU\]** = stated in the project brief, **\[REC\]** = recommendation (unspecified by either, can be overruled).

**Heads-up:** the certificate needs 2 or 3 completed tasks, and a single task counts as incomplete \[CA\]. Plan a second task alongside this one.

## 1. Requirements checklist

### Functional (from CodeAlpha)

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | Basic e-commerce site with product listings | CA |
| R2 | Product details page | CA |
| R3 | Shopping cart | CA |
| R4 | Order processing | CA |
| R5 | User registration and login | CA |
| R6 | Database storing products, users, and orders | CA |
| R7 | Frontend in HTML, CSS, JavaScript | CA |
| R8 | Backend in Express.js (Django alternative not used) | CA + YOU |

### Process (non-code, easy to forget)

| ID | Requirement | Source |
| --- | --- | --- |
| P1 | Public GitHub repo named `CodeAlpha_ProjectName`, here `CodeAlpha_EcommerceStore` | CA |
| P2 | LinkedIn video explaining the project, with the repo link | CA |
| P3 | LinkedIn post about internship status, tagging @CodeAlpha | CA |
| P4 | Submit through the form shared in the WhatsApp group | CA |
| P5 | Finish within the assigned time frame (the PDF gives no dates, so confirm the deadline in the WhatsApp group) | CA |
| P6 | Complete 2 or 3 tasks in total | CA |

### Project constraints \[YOU\]

Vanilla JS only (no frameworks), Node + Express, PostgreSQL on Neon, Vercel hosting, npm. Checkout is a demo that persists a real order, with no payment integration of any kind.

## 2. Scope tiers

### Tier A: Mandatory (assignment)

Product listing, product detail, cart, order processing, register/login, and PostgreSQL storage for products, users, and orders.

### Tier B: Useful enhancements (all requested, all in the MVP)

- Product search
- Category filter and sort
- Responsive mobile navigation
- Persistent cart
- Checkout page and order confirmation
- Order history
- Validation with useful error messages
- Empty, loading, success, and failure states

### Tier C: Optional, only after Tier A and B pass every acceptance criterion \[REC\]

- Product image gallery (2 to 3 images)
- Server-side cart synced across devices
- Guest checkout
- Free-shipping threshold
- "Cancel order" action
- Dark mode
- Basic automated API tests (Node's built-in test runner)

### Tier D: Explicitly out of scope

- Real or mock payment gateways
- Admin dashboard (products are seeded by script)
- Reviews and ratings, wishlists, coupons
- Email sending and password reset by email
- OAuth or social login
- Inventory management UI
- Multi-currency and tax calculation
- Real-time features

## 3. Target user and journeys

### Users

- **Primary:** a remote/hybrid worker, student, or developer improving their desk setup. Browses on mobile and desktop, buys 1 to 3 items, and wants clear prices, honest stock info, and a short checkout.
- **Secondary (design for this person too):** the CodeAlpha reviewer. They want to confirm every checklist item works within a few minutes, so the main flows must be obvious and the seed data must demonstrate the edge cases.

### Journeys

| # | Journey | Path |
| --- | --- | --- |
| J1 | Happy path purchase | Home, Shop, Product, Add to cart, Cart, (redirect to Register), Checkout, Confirmation |
| J2 | Search and narrow | Shop, search "stand", filter category, sort by price, open product |
| J3 | Returning customer | Login, Orders, open past order |
| J4 | Cart persistence | Add items, close tab, reopen, cart intact (also across login/logout) |
| J5 | Failure recovery | Invalid form input, out-of-stock item at checkout, expired session, server down: each gives a clear message and a way forward |
| J6 | Gated checkout | Logged-out user clicks Checkout, logs in, returns to Checkout with the cart intact |

## 4. Pages

| Path \[REC\] | Purpose | Auth | Key content and states |
| --- | --- | --- | --- |
| `/` | Home: establish identity, route into the catalog | No | Hero, category tiles, featured products, short honest value props, footer |
| `/shop` | Product listing | No | Product grid, search box, category filter, sort, pagination. States: loading skeleton, no results, error with retry |
| `/product?slug=...` | Product detail | No | Image, name, price, description, specs, stock status, quantity selector, add to cart. States: not found, out of stock, loading |
| `/cart` | Review and edit cart | No | Line items, quantity +/-, remove, subtotal, shipping, total, checkout CTA. States: empty, item became unavailable, price changed |
| `/register` | Create account | Guest only | Name, email, password, confirm password, inline validation |
| `/login` | Sign in | Guest only | Email, password, generic failure message, link to register |
| `/checkout` | Collect shipping details and place demo order | Yes | Order summary, shipping form, "demo order, no payment taken" notice, place order button. States: submitting, stock conflict, failure |
| `/order?id=...` | Order detail, also the confirmation page | Yes, owner only | Order number, items, totals, shipping details, status. Success banner when arriving from checkout |
| `/orders` | Order history | Yes | List newest first. States: empty, loading |
| 404 | Unknown route | No | Friendly message, links back to Shop |

**Shared on every page:** header (logo, nav, search, cart count badge, account/login link, mobile drawer), footer, a live region for toasts and errors, skip-to-content link, and a small persistent "Demo store, no real payments" notice.

Do not add About, Contact, or Terms pages as dead links. If a link exists, its page must exist.

## 5. Acceptance criteria (testable)

### Catalog

- **AC-1** `/shop` shows seeded products from PostgreSQL (name, image, price, category, stock status).
- **AC-2** Pagination: 12 per page, page number reflected in the URL, back button works.
- **AC-3** Search matches product name and description, case-insensitive, with a 300 ms debounce. An empty query shows all products.
- **AC-4** Category filter shows only that category's products. "All" resets the filter.
- **AC-5** Sort options (featured, price low to high, high to low, newest, name A to Z) reorder results correctly.
- **AC-6** Search, category, sort, and page state live in the URL, so a reload or shared link restores the same view.
- **AC-7** Zero results shows a "no products found" state with a clear-filters action.
- **AC-8** Out-of-stock products are visibly labelled and cannot be added to the cart.

### Product detail

- **AC-9** Opening a product by slug shows its full details from the database.
- **AC-10** An unknown or inactive slug shows a not-found state, not a crash or blank page.
- **AC-11** The quantity selector accepts 1 to min(stock, 10) only \[REC: cap of 10 per line\].
- **AC-12** Add to cart gives immediate visible feedback and updates the header count.
- **AC-13** Low stock (5 or fewer) shows an honest "Only N left" label.

### Cart

- **AC-14** Cart stores only product ID and quantity in `localStorage`. It never stores prices or names as trusted data \[REC\].
- **AC-15** The cart survives reload, tab close, and login/logout.
- **AC-16** Adding the same product twice increments quantity, not a duplicate line.
- **AC-17** Quantity can be changed or the line removed. Quantity below 1 removes the line or is blocked, consistently.
- **AC-18** The cart page displays current prices fetched from the server, with correct line totals, subtotal, shipping, and total.
- **AC-19** If an item is now out of stock or inactive, or requested quantity exceeds stock, the cart flags it and blocks checkout until fixed.
- **AC-20** If `localStorage` contains corrupt JSON or unknown product IDs, the app recovers to an empty or cleaned cart without throwing.
- **AC-21** The empty cart state shows a message and a "Continue shopping" action.

### Auth

- **AC-22** Registration requires name, valid email, and a password of at least 8 characters \[REC\]. Passwords must match.
- **AC-23** Duplicate email (case-insensitive) is rejected with a clear message.
- **AC-24** Passwords are stored only as salted hashes. The raw password is never stored or logged.
- **AC-25** Successful login sets an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie.
- **AC-26** Wrong email or wrong password gives the same generic message.
- **AC-27** `GET /api/auth/me` returns the current user, or 401 when logged out. The header reflects login state after a page reload.
- **AC-28** Logout clears the cookie and the UI updates. Back-navigating to `/orders` does not show data.
- **AC-29** Logged-in users visiting `/login` or `/register` are redirected away.
- **AC-30** Logged-out users visiting `/checkout`, `/orders`, or `/order` are redirected to `/login` with a safe return path, and are returned there after login.

### Checkout and orders

- **AC-31** Checkout requires login and a non-empty valid cart.
- **AC-32** The server recomputes all prices and totals from the database. Client-sent prices are ignored.
- **AC-33** Shipping form validates name, address line, city, postal code, and phone. Errors appear next to the fields.
- **AC-34** Placing an order creates one `orders` row and one `order_items` row per line, in a single transaction.
- **AC-35** Order items snapshot product name and unit price at purchase time, so later price changes do not alter past orders.
- **AC-36** Stock is decremented in the same transaction. If stock is insufficient, nothing is saved and the user gets a message naming the affected item.
- **AC-37** Double-clicking "Place order" or retrying after a timeout creates at most one order (idempotency key).
- **AC-38** On success the cart is cleared, and the user lands on the order page with a confirmation banner and a human-readable order number.
- **AC-39** Failure keeps the cart and form data and shows a retry-able error.
- **AC-40** The UI states clearly that this is a demo order and no payment was taken.

### Order history

- **AC-41** `/orders` lists only the logged-in user's orders, newest first, with number, date, item count, and total.
- **AC-42** Opening another user's order ID returns 404 (not 403, so existence isn't revealed).
- **AC-43** The empty state shows "No orders yet" with a link to Shop.

### UI, responsiveness, accessibility

- **AC-44** Layouts work at 360, 768, and 1280 px with no horizontal scroll.
- **AC-45** The mobile menu opens and closes with a button, closes on Escape and on link tap, traps focus while open, and returns focus on close.
- **AC-46** Every interactive element is keyboard reachable with a visible focus ring. Tap targets are at least 44 by 44 px on mobile.
- **AC-47** Form inputs have visible labels. Errors are associated with fields and announced (`aria-live`).
- **AC-48** Text contrast meets WCAG AA (4.5:1 body). Images have meaningful alt text.
- **AC-49** `prefers-reduced-motion` disables non-essential animation.
- **AC-50** Every async action has loading, success, and failure feedback. No silent failures.

### Delivery

- **AC-51** The app is deployed on Vercel against Neon, and works from the public URL.
- **AC-52** A fresh clone, `npm install`, a seed script, and `npm run dev` runs locally from the README alone.
- **AC-53** No secrets are in git. `.env.example` lists every variable.
- **AC-54** Seed script is idempotent (safe to re-run) and creates demo catalog data.
- **AC-55** Lighthouse mobile scores are 90 or higher for Accessibility and 85 or higher for Performance \[REC target\].
