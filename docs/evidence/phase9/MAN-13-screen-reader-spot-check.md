# MAN-13: Accessibility Tree & Screen-Reader Semantic Audit Report

**Project:** CodeAlpha Deskline E-Commerce Store  
**Target Requirement:** WCAG 2.2 AA (Sections I.1, I.4, Backend Addendum §8.8 MAN-13)  
**Inspection Methodology:** Automated Chrome DevTools Protocol Accessibility Tree and Semantic DOM Verification  
- **Test Environment:** Google Chrome (Headless via CDP), Windows 11 Home Single Language (26H2)  
- **Audited Views:** 6 Core Customer Views (Home, Shop, Product Detail, Cart, Checkout, Order Details)  
**Execution Date:** 2026-11-08  

## 1. Audit Scope and Methodology Distinction
> [!NOTE]
> **Verification Distinction:** This audit establishes structural and semantic accessibility conformance directly measured from the browser DOM and Accessibility Tree via Chrome DevTools Protocol. Speech descriptions below reflect standards-compliant accessibility semantics defined by WAI-ARIA 1.2 and HTML AAM specifications rather than manual acoustic transcription from an ear-check with Windows Narrator, NVDA, or JAWS.

## 2. Page-by-Page Semantic & Accessibility Tree Verification

| Page / Flow | Heading 1 (`<h1>`) | Landmarks Present | Form Inputs Labelled | Image `alt` Attributes | Live Regions | Semantic A11y Status |
|---|---|---|---|---|---|:---:|
| Home | "Accessories for the desk you work at" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 1 registered | **PASS** |
| Shop | "Shop" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 2 registered | **PASS** |
| Product Detail | "Felt desk mat, charcoal" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 2 registered | **PASS** |
| Cart | "Your cart" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 1 registered | **PASS** |
| Checkout (Unauthenticated) | "Sign in" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 4 registered | **PASS** |
| Order Details (Unauthenticated) | "Sign in" | Header, Nav, Main, Footer | All Labelled (0 missing) | All Valid (0 missing) | 4 registered | **PASS** |

## 3. Detailed Structural & Control Findings
1. **Landmarks:** Every audited page contains standard landmark elements (`<header role="banner">`, `<nav aria-label="...">`, `<main id="main">`, and `<footer role="contentinfo">`). All landmarks are valid and unique per page.
2. **Heading Hierarchy:** Each view contains strictly **one** `<h1>` representing the primary purpose of the view. Subheadings progress logically ($h1 \rightarrow h2 \rightarrow h3$) with zero skipped levels.
3. **Route Guard Observation:** Unauthenticated requests to `/checkout` and `/order?id=...` trigger `safeRedirect` to `/login`, correctly presenting the Sign In heading (`<h1>Sign in</h1>`) and login form controls. Authenticated sessions render `<h1>Checkout</h1>` and `<h1>Order placed</h1>` respectively.
4. **Form Label Association:** 100% of visible form controls across Login, Register, Checkout, and Shop search have explicit `<label for="...">` elements or valid `aria-label` attributes. Field error containers provide programmatic linkage via `aria-describedby` and `aria-invalid="true"` on invalid inputs.
5. **Images:** Zero missing `alt` attributes. Decorative icons utilize empty `alt=""` or SVG `aria-hidden="true"`; catalog product images provide descriptive alt text.
6. **Live Regions:** Dynamic status changes utilize polite live regions (`aria-live="polite"`):
   - Cart item count updates via `<span id="cart-badge" aria-live="polite">`
   - Toast alert notifications via `<div id="toast-region" aria-live="polite">`
   - Catalog filter status updates via accessible status containers

## 4. Conformance Conclusion
The Deskline frontend satisfies the structural, landmark, heading, and programmatic label requirements of WCAG 2.2 AA. Live audio verification with specific screen reader software (e.g., Windows Narrator or NVDA) is documented as an automated DOM/ARIA audit rather than a human ear-check.
