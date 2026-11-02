# CodeAlpha Ecommerce Store — Antigravity handoff

This bundle contains the complete specification set for CodeAlpha Task 1. It combines the original source documents with the final addenda and correction review. No application code is included. No tests, deployment checks, or security checks have been run by packaging these documents.

## Read in this order

1. `docs/reference/Full Stack Development Tasks & Instructions — CodeAlpha M1.pdf` — original CodeAlpha assignment source.
2. `docs/CodeAlpha_EcommerceStore Implementation Brief.md` — project requirements and AC-1 through AC-55.
3. `docs/CodeAlpha_Spec_Reconciliation.md` — controlling decisions and document precedence. When anything conflicts, follow the precedence stated there; the CodeAlpha PDF's requirements remain authoritative.
4. `docs/Deskline Design System and Page Specifications.md` — original design system, sections A-D.
5. `docs/Deskline_Design_Spec_Addendum.md` — design specification, sections E-L.
6. `docs/CodeAlpha_EcommerceStore Backend Implementation Contract.md` — original backend contract, sections 0-4.9.
7. `docs/CodeAlpha_Backend_Contract_Addendum.md` — backend amendments and sections 5-11, including section 4A.
8. `docs/CodeAlpha_Final_Review.md` — summary of the final correction pass; this is a review aid, not a replacement for the specifications.

## Governing constraints

- Frontend: HTML, CSS, vanilla JavaScript only. No React, Next.js, Vue, Angular, or other frontend framework.
- Backend: Node.js 22.x and Express 5.
- Database: PostgreSQL on Neon; pooled connection for runtime, direct connection for migrations/seeding/tests.
- Hosting: Vercel.
- Money: INR, integer paise internally, `Minor`/`_minor` field naming, whole-rupee display.
- Checkout: persist a real order, but no payment integration, mock payment screen, payment fields, or payment collection of any kind.
- Secrets: environment variables only; never place real database credentials in source files, prompts, screenshots, or Git.

## Implementation discipline

The backend addendum defines 13 implementation phases. Start with **Phase 0 only**. Do not generate the whole application in one pass. Each phase has test gates; tests and deployment checks must remain `NOT RUN` until actually executed and evidenced. Do not mark a feature complete merely because source files were generated.

The original design and backend documents are included because the addenda complete them; the addenda are not standalone replacements for their earlier sections.

## Before starting

Create/open a clean folder named `CodeAlpha_EcommerceStore` in Antigravity. Add this bundle's `docs/` directory to that project. Do not add `.env`, real connection strings, or production credentials. A local `.env` and disposable `.env.test` should only be created by following the backend addendum's safety rules.
