# CodeAlpha Full Stack Development Internship — Task 1 Submission Summary

## 1. Project Identification
- **Project Name:** Deskline E-Commerce Store
- **Task Reference:** Task 1 — E-Commerce Store
- **Internship Organization:** CodeAlpha
- **Submission Date:** 10 November 2026 (Target Deadline: 19 November 2026)
- **Repository URL:** [https://github.com/Jogesh-Joshua/codealpha-ecommerce-store](https://github.com/Jogesh-Joshua/codealpha-ecommerce-store)
- **Live Production URL:** [https://codealpha-ecommerce-store-sable.vercel.app](https://codealpha-ecommerce-store-sable.vercel.app)
- **Evidence Directory:** [`docs/evidence/`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence) (Master Index: [`docs/EVIDENCE_INDEX.md`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/EVIDENCE_INDEX.md))

---

## 2. Project Description
**Deskline** is a modern, minimalist e-commerce storefront specializing in premium workspace accessories (desk mats, organizers, monitor risers, lighting, and cable management). Built adhering strictly to vanilla web standards (no frontend frameworks) coupled with an atomic, transactional Node.js and PostgreSQL backend, the application demonstrates production-grade full-stack architecture, strict data integrity, concurrency-safe inventory reservation, idempotent order processing, and WCAG 2.2 AA accessibility.

---

## 3. Main Features
- **Storefront & Catalog Browsing:** 5 categories, 21 seeded products (20 active, 1 archived), real-time search, category filtering, 5 deterministic sort orders, and interactive hero banner hotspots with URL state persistence.
- **Product Detail & Inventory Display:** Detailed specifications, dimension attributes, dynamic stock status badges ("In stock", "Only X left", "Sold out" disabling).
- **Client-Side Cart with Server Validation:** Persistent local storage cart (`deskline.cart.v1`), multi-tab sync via browser `storage` event, server-authoritative validation (`POST /api/cart/validate`), quantity caps (max 10 or stock limit), 6-second Undo toast notifications, and corruption recovery.
- **Secure Authentication & Session Management:** User registration, bcrypt password hashing, HttpOnly SameSite session cookies, database-backed sessions, rate-limiting brute-force defense (5 failed attempts per 15 minutes), and protected checkout/order redirects with open-redirect defenses.
- **Transactional Order Placement & Inventory Locking:** Atomic checkout (`POST /api/orders`) using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`), transaction rollback on stock conflict, sequence-generated order numbers (`DL-XXXXXX`), and UUID v4 idempotency keys preventing double-ordering or race-condition stock overselling.
- **Customer Order History:** Authenticated customer order history (`/orders`) and individual order inspection (`/order?id=...`) with strict IDOR prevention.
- **Accessibility & Responsive Design:** 100% semantic HTML5, self-hosted WOFF2 fonts (*Bricolage Grotesque* & *Geist*), WCAG 2.2 AA color contrast, full keyboard navigation with visible focus outlines and skip links, 200% zoom reflow, 320px mobile viewport compatibility, touch targets $\ge 44 \times 44\text{px}$, and `prefers-reduced-motion` support.

---

## 4. Technology Stack
- **Runtime & Language:** Node.js (v22.x LTS target; ECMAScript Modules `type: "module"`).
- **Backend Framework:** Express 5.3 (`express`).
- **Database & Pooling:** Neon Serverless PostgreSQL with connection pooling (`pg` 8.23.1, `@vercel/functions` 3.10.5).
- **Authentication & Validation:** `bcryptjs` 3.0.3, `cookie-parser` 1.4.7, `helmet` 8.3.0, `zod` 3.24.4.
- **Frontend Architecture:** Vanilla HTML5, CSS Custom Properties (Design Tokens), Vanilla JavaScript (ES2022). Zero frontend framework dependencies.
- **Hosting & Infrastructure:** Vercel Serverless Functions and Static Edge CDN.

---

## 5. Testing & Quality Assurance Summary
- **Automated Test Suite:** **481 passed tests across 96 suites** (0 failed, 0 skipped; execution log: [`docs/evidence/phase8-npm-test-run.log`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-npm-test-run.log)).
  - Unit Tests: 14 suites, 259 tests.
  - Static Code & Architecture Rules: 5 suites, 40 tests.
  - Integration, DB & API Tests: 77 suites, 182 tests.
- **Manual Browser Verification:** 14 manual browser gates (`MAN-01` through `MAN-11`, `MAN-21`, `MAN-22`, `MAN-24`) verified PASS with authentic PNG screenshots in [`docs/evidence/phase8-manual/`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase8-manual).
- **Accessibility & Visual Verification:** 6 manual gates (`MAN-12` through `MAN-17`) verified PASS with artifacts in [`docs/evidence/phase9/`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase9).
- **Security & Portability Verification:** 4 gates (`STAT-04`, `STAT-06`, `MAN-19`, `MAN-25`) verified PASS with artifacts in [`docs/evidence/phase10/`](file:///D:/College/Project/CodeAlpha_EcommerceStore/docs/evidence/phase10).
- **Lighthouse Performance & Accessibility:** Verified on live production deployment:
  - Homepage (`/`): **Performance: 100**, **Accessibility: 100**, **Best Practices: 100**, **SEO: 100**.
  - Shop (`/shop`): **Performance: 100**, **Accessibility: 94**, **Best Practices: 100**, **SEO: 100**.
- **Master Acceptance Criteria:** **55 PASS, 0 PARTIAL, 0 BLOCKED, 0 FAIL** (100% of 55 criteria fully verified).

---

## 6. Known Limitations and Accepted Risks
- **KI-01 (Transitive Dependency Advisory):** `npm audit --omit=dev` reports 4 high-severity advisories in `@vercel/functions` transitive dependencies (`@vercel/oidc` $\rightarrow$ `zod < 4.6.6`). Direct application dependency `zod@3.24.4` is unaffected. Accepted per security policy without breaking force-upgrade.
- **KI-02 (Node Engine Version):** Local environment runs Node 26.8.2; production targets Node 22.x LTS per `package.json` engines.
- **KI-03 (PostgreSQL SSL Mode Notice):** Upstream `pg` driver emits informational alias warning on connect; database queries execute cleanly.
- **KI-04 (Screen-Reader Acoustic Emulation):** Accessibility verified via automated CDP accessibility tree and semantic DOM structure; physical hardware speech synthesizer simulation was not performed.
- **Live Deployment Status (Commit `03e15b8`):** Live Vercel deployment fully synchronized with `origin/main` at commit `03e15b8`; all clean URL routes, dynamic APIs, Neon database pooling, authentication cookies, and order workflows verified operational on production.
- **Demo Store Scope:** Built for demonstration and internship evaluation; does not process real monetary transactions, payment cards, or transactional emails.

---

**Demo store, no real orders.**

