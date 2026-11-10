# Deskline — Master Evidence Index

This document provides a consolidated, verifiable index of all automated test logs, manual browser verification artifacts, accessibility reports, security scans, and deployment audits for the **CodeAlpha Deskline** e-commerce store project.

All evidence is preserved directly within the repository under [`docs/evidence/`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence) and corresponds to authentic test runs and browser inspections. Zero secrets, credentials, database passwords, or personal user data are stored in any evidence file.

---

## 1. Automated Test Execution Evidence

| Evidence File | Phase | Date | Scope / Command | Result |
|---|---|---|---|---|
| [`phase8-npm-test-run.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-npm-test-run.log) | Phase 8 Post-Audit | 2026-11-08 | Full suite (`npm test`: `npm run test:db:reset && node --env-file=.env.test --test --test-concurrency=1 --test-reporter=spec "tests/**/*.test.js"`) | **PASS: 481/481 tests across 96 suites** (Unit: 259/259, Static: 40/40, Integration/DB/API/Storefront: 182/182; 0 failed, 0 skipped; 57,063 bytes) |

---

## 2. Manual Browser Verification Evidence (Phase 8)

All Phase 8 manual checks were executed via Chrome DevTools Protocol against the local test server connected to the isolated Neon test database.

| Gate ID | Evidence Artifact | Verified Behavior | Status |
|---|---|---|---|
| **MAN-01** | [`MAN-01-desktop-purchase.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-01-desktop-purchase.png) | End-to-end desktop purchase journey: browse, add to cart, registration redirect, address submission, double-click protection (`aria-busy`), order confirmation (`DL-100001`, ₹3,097), and order history listing. | **PASS** |
| **MAN-02** | [`MAN-02-mobile-360.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-02-mobile-360.png) | Mobile 360px viewport: zero horizontal overflow (`scrollWidth <= innerWidth` across Home, Shop, Product, Cart); drawer navigation `<dialog>` functionality; compliant touch targets. | **PASS** |
| **MAN-03** | [`MAN-03-tablet-768.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-03-tablet-768.png) | Tablet 768px viewport: responsive 3-column catalog grid (`grid-template-columns: 219px 219px 219px`) with zero horizontal overflow. | **PASS** |
| **MAN-04** | [`MAN-04-shop-url-state.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-04-shop-url-state.png) | URL state synchronization: search query (`stand`), category filter chip (`lighting`), sort order (`price_asc`), and Back/Forward popstate history restoration. | **PASS** |
| **MAN-05** | [`MAN-05-cart-persistence.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-05-cart-persistence.png) | Cart persistence in `deskline.cart.v1` across page reloads; corrupt JSON storage safely resets to clean empty cart without uncaught exceptions. | **PASS** |
| **MAN-06** | [`MAN-06-cart-two-tabs.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-06-cart-two-tabs.png) | Multi-tab cart synchronization: browser `storage` event dynamically updates cart badge across concurrent tabs (`badge count: 2`). | **PASS** |
| **MAN-07** | [`MAN-07-stock-display.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-07-stock-display.png) | Stock indicator states: in-stock (`"In stock"`), low-stock warning (`"Only 3 left"`), and out-of-stock disabling (`"Sold out"`). | **PASS** |
| **MAN-08** | [`MAN-08-empty-states.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-08-empty-states.png) | Actionable empty states: zero search results (`"No products match..."` with Clear CTA) and empty cart (`"Your cart is empty"` with Browse CTA). | **PASS** |
| **MAN-09** | [`MAN-09-form-validation.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-09-form-validation.png) | Form field validation errors: exact inline error messages on registration, password length bounds, and password mismatch notification. | **PASS** |
| **MAN-10** | [`MAN-10-loading-skeleton.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-10-loading-skeleton.png) | Loading state skeleton timing: 200ms delay threshold prevents skeleton flicker on fast networks; skeletons cleanly displayed on extended network latency. | **PASS** |
| **MAN-11** | [`MAN-11-offline-retry.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-11-offline-retry.png) | Network failure resilience: offline condition displays accessible error panel; network restoration permits in-page retry without full reload. | **PASS** |
| **MAN-20** | [`MAN-20-2026-11-07.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/MAN-20-2026-11-07.png) | Browser font rendering: self-hosted *Bricolage Grotesque* and *Geist* fonts render Indian Rupee symbol `₹` (U+20B9) in latin-ext at weights 400 and 600. | **PASS** |
| **MAN-21** | [`MAN-21-hero-hotspots.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-21-hero-hotspots.png) | Hero flatlay hotspots: 4 focusable semantic links with accessible `aria-label`, visible `:focus-visible` indicators, and direct navigation. | **PASS** |
| **MAN-22** | [`MAN-22-demo-notices.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-22-demo-notices.png) | Prominent demo store notice (`"Demo store, no real orders."`) visible across header announcement bar and footer of all storefront views. | **PASS** |
| **MAN-24** | [`MAN-24-protected-redirects.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual/MAN-24-protected-redirects.png) | Protected routes: unauthenticated visits to `/checkout` and `/orders` redirect to `/login?next=...`; malicious open redirects safely rejected. | **PASS** |

---

## 3. Accessibility, Responsive & Visual Audit Evidence (Phase 9)

| Gate ID | Evidence Artifact | Audit Scope & Findings | Status |
|---|---|---|---|
| **MAN-12** | [`MAN-12-keyboard-navigation.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-12-keyboard-navigation.png) | Keyboard accessibility audit across all 10 views (`/`, `/shop`, `/product`, `/cart`, `/checkout`, `/order`, `/orders`, `/login`, `/register`, `404.html`): skip-link moves focus to `<main id="main">` (`tabindex="-1"`), visible `:focus-visible` outlines, modal focus trap, Escape key handling, 0 keyboard traps. | **PASS** |
| **MAN-13** | [`MAN-13-screen-reader-spot-check.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-13-screen-reader-spot-check.md) | Accessibility tree and semantic DOM verification on 6 core customer views: landmarks, unique `<h1>`, heading hierarchy, form `aria-describedby` associations, image `alt` text, and polite live regions. Acoustic simulation limitations fully documented. | **PASS** |
| **MAN-14** | [`MAN-14-zoom-reflow.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-14-zoom-reflow.png) | 200% browser zoom reflow and 320px viewport testing across all 10 views: zero horizontal scroll (`scrollWidth <= innerWidth`), no overlapping or clipped text, form controls $\ge 16\text{px}$ to prevent iOS auto-zoom. | **PASS** |
| **MAN-15** | [`MAN-15-reduced-motion.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-15-reduced-motion.png) | `prefers-reduced-motion: reduce` compliance: skeleton pulse animation disabled (`opacity: 1 !important`), hero hotspot pulse stopped, transitions $\le 100\text{ms}$ or `none`, zero `transition: all`. | **PASS** |
| **MAN-16** | [`MAN-16-contrast-results.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-16-contrast-results.md) | WCAG 2.2 AA color contrast mathematical audit: 100% of approved text tokens meet WCAG 2.2 AA ($\ge 4.5:1$ for body text, $\ge 3.0:1$ for UI boundaries and large text); Pine on Fog (12.2:1), Paper on Pine (13.4:1), Text-2 on Fog (6.2:1), Text-3 on Fog (4.85:1). Prohibited low-contrast pairings verified absent. | **PASS** |
| **MAN-17** | [`MAN-17-touch-targets.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9/MAN-17-touch-targets.md) | Touch target audit on 360x800 mobile viewport: 100% of 291 interactive controls (buttons, links, chips, header menu toggle, cart link, stepper, pagination, and product card overlay) meet or exceed $44 \times 44\text{px}$. | **PASS** |

---

## 4. Hardening, Security & Portability Evidence (Phase 10)

| Gate ID | Evidence Artifact | Verification Scope | Status |
|---|---|---|---|
| **STAT-04** | [`STAT-04-secret-scan.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase10/STAT-04-secret-scan.log) | Comprehensive secret scan across all 66 tracked git files and full commit history: verified 0 real credentials, passwords, session tokens, or API keys; `.env` and `.env.test` verified untracked; `.env.example` verified containing placeholders only. | **PASS** |
| **STAT-06** | [`STAT-06-npm-audit.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase10/STAT-06-npm-audit.log) | Dependency audit via `npm audit --omit=dev`: verified 4 high findings in transitive dependency chain (`@vercel/functions` $\rightarrow$ `@vercel/oidc` $\rightarrow$ `@vercel/cli-config` $\rightarrow$ `zod < 4.6.6`). Direct `zod@3.24.4` unaffected. Accepted risk documented per KI-01 without breaking force-upgrade. | **PASS** (Accepted Risk) |
| **MAN-19** | [`MAN-19-fresh-clone.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase10/MAN-19-fresh-clone.log) | Fresh clone test in isolated temporary directory: clean `npm ci` install (109 packages); all 32 static tests and 116 unit tests passed with 0 errors without copying secrets or accessing database. | **PASS** |
| **MAN-25** | [`MAN-25-portability.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase10/MAN-25-portability.md) | Platform portability verification: verified native execution on Windows PowerShell and cmd.exe; POSIX compatibility verified via code inspections, path handling (`path.join`/URL), and STAT-05 package assertions. | **PASS** |

---

## 5. Production Deployment & Live Verification Evidence (Phase 11 & Final Master Audit)

| Gate ID | Evidence Artifact | Verification Scope & Live Metrics | Status |
|---|---|---|---|
| **DEP-01, DEP-02, DEP-05..07, DEP-10, DEP-12..15, DEP-17** | [`DEP-deployment-audit.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase11/DEP-deployment-audit.log) | Live deployment audit against [`https://codealpha-ecommerce-store-sable.vercel.app`](https://codealpha-ecommerce-store-sable.vercel.app): verified zero startup crash (DEP-01); static asset cache headers (DEP-02); database pool active with `/api/health?deep=1` returning `database: "up"` (DEP-05, DEP-17); 404 HTML vs JSON boundaries (DEP-06); security headers nosniff, no-referrer, CSP, helmet, X-Powered-By disabled (DEP-07); zero secrets in client assets (DEP-10); client IP handling (DEP-12); request ID tracking (DEP-13); 30/30 rapid requests 200 OK with p50=310ms and zero connection drops (DEP-14); zero CSP violations (DEP-15). | **PASS** |
| **DEP-03, DEP-04, DEP-08, DEP-09, DEP-18, DEP-19, MAN-23** | [`DEP-live-verification-final.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase11/DEP-live-verification-final.log) | Final production verification of commit `03e15b8` deployed live: all 8 cleanUrls views return 200 (DEP-03); catalog API returns 20 products (DEP-04); `__Host-deskline_session` cookie issued on HTTPS with HttpOnly, Secure, SameSite=Lax (DEP-08); order DL-100001 placed with exact paise math (DEP-09); idempotency replay returns 200 with Idempotent-Replay header (DEP-18); login limiter returns 429 on 6th attempt (DEP-19); order persisted in Neon production DB (MAN-23). | **PASS** |
| **DEP-16 / MAN-18 (Home)** | [`lighthouse-home.json`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase11/lighthouse-home.json) | Mobile Lighthouse audit on live Home page (`/`): **Performance: 100**, **Accessibility: 100**, **Best Practices: 100**, **SEO: 100**. | **PASS** |
| **DEP-16 / MAN-18 (Shop)** | [`lighthouse-shop.json`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase11/lighthouse-shop.json) | Mobile Lighthouse audit on live Shop catalog (`/shop`): **Performance: 100**, **Accessibility: 94**, **Best Practices: 100**, **SEO: 100**. | **PASS** |

---

## 6. Independent Live Real-Browser Verification Artifacts

All artifacts generated during the automated Chromium browser audit against `https://codealpha-ecommerce-store-sable.vercel.app` (commit `03e15b8`) on 10 November 2026:

| Evidence File | Viewport | Scope / Verified Feature | Status |
|---|:---:|---|:---:|
| [`audit-run.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/audit-run.log) | CLI | Execution trace of automated CDP audit script across 13 routes | **PASS** |
| [`audit-summary.json`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/audit-summary.json) | Data | Machine-readable verification results, route counts, and network events | **PASS** |
| [`route-home-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-home-desktop.png) | Desktop `1280px` | Home page layout, hero, 4 hotspots, 5 categories, 4 featured products | **PASS** |
| [`route-home-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-home-mobile.png) | Mobile `360px` | Mobile stacked hero, value propositions, and navigation drawer trigger | **PASS** |
| [`route-shop-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-desktop.png) | Desktop `1280px` | Shop catalog page 1 (12 products displayed), toolbar, search, filter chips | **PASS** |
| [`route-shop-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-mobile.png) | Mobile `360px` | Responsive 2-column mobile catalog grid | **PASS** |
| [`route-shop-search.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-search.png) | Desktop `1280px` | Real-time catalog search for `"stand"` (3 matching products) | **PASS** |
| [`route-shop-sort-price-desc.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-sort-price-desc.png) | Desktop `1280px` | Catalog sort high-to-low (*Ultra-slim monitor light bar*, ₹3,999 first) | **PASS** |
| [`route-shop-filter-desk-mats.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-filter-desk-mats.png) | Desktop `1280px` | Filter category: Desk mats (exactly 4 products, chip active) | **PASS** |
| [`route-shop-filter-charging-cables.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-filter-charging-cables.png) | Desktop `1280px` | Filter category: Charging & cables (exactly 4 products, chip active) | **PASS** |
| [`route-shop-filter-stands-risers.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-filter-stands-risers.png) | Desktop `1280px` | Filter category: Stands & risers (exactly 4 products, chip active) | **PASS** |
| [`route-shop-filter-lighting.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-filter-lighting.png) | Desktop `1280px` | Filter category: Lighting (exactly 4 products, chip active) | **PASS** |
| [`route-shop-filter-organizers.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-filter-organizers.png) | Desktop `1280px` | Filter category: Organizers (exactly 4 products, chip active) | **PASS** |
| [`route-shop-page2.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-shop-page2.png) | Desktop `1280px` | Shop catalog page 2 (remaining 8 products, zero overlap with page 1) | **PASS** |
| [`route-product-detail-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-product-detail-desktop.png) | Desktop `1280px` | PDP hydration from skeleton, title, price, stock badge, Add to cart feedback | **PASS** |
| [`route-product-detail-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-product-detail-mobile.png) | Mobile `360px` | Mobile stacked PDP gallery and purchase panel | **PASS** |
| [`route-cart-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-cart-desktop.png) | Desktop `1280px` | Cart view: line item, stepper, subtotal (₹1,499), shipping (₹99), total (₹1,598) | **PASS** |
| [`route-cart-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-cart-mobile.png) | Mobile `360px` | Mobile cart view with responsive item rows and summary panel | **PASS** |
| [`route-login-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-login-desktop.png) | Desktop `1280px` | Sign in view with invalid credential notification banner | **PASS** |
| [`route-login-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-login-mobile.png) | Mobile `360px` | Mobile sign in form with password show/hide toggle | **PASS** |
| [`route-register-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-register-desktop.png) | Desktop `1280px` | Account registration view with split media panel | **PASS** |
| [`route-register-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-register-mobile.png) | Mobile `360px` | Mobile registration form with full-width inputs | **PASS** |
| [`route-checkout-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-checkout-desktop.png) | Desktop `1280px` | Checkout view with shipping address form and demo order notice | **PASS** |
| [`route-checkout-confirmation.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-checkout-confirmation.png) | Desktop `1280px` | Order placement receipt (`DL-100002`) with order breakdown and items | **PASS** |
| [`route-orders-desktop.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-orders-desktop.png) | Desktop `1280px` | Order history page with user authentication metadata and sign out button | **PASS** |
| [`route-orders-mobile.png`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/live-verification/route-orders-mobile.png) | Mobile `360px` | Mobile order history page | **PASS** |

---

## 7. Master Status Ledger & Architectural Audit

- Master Status Ledger: [`docs/STATUS.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/STATUS.md)
- Architectural & Code Review: [`docs/AUDIT.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/AUDIT.md)
- Image Provenance & Attribution: [`public/images/CREDITS.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/public/images/CREDITS.md)
- Font Assets & OFL Licenses: [`public/fonts/README.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/public/fonts/README.md)


