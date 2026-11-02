# Deskline Design Spec Addendum

Addendum to **Deskline Design System and Page Specifications** (sections A to D). It completes the specification with sections **E to L**. No application code is included.

**Status:** specification only. Nothing described here has been built, deployed, or tested.

**Precedence:** if this file and `CodeAlpha_Spec_Reconciliation.md` disagree, the reconciliation file wins. This file wins over sections E0 to E4 of the earlier Claude Doc version of the design spec (this file restates and completes them).

## 0. Scope, and what changes in sections A to D

Sections A (brand and principles), B (Pine / Fog / Marigold palette), C (Bricolage Grotesque and Geist typography), and D (spacing, radius, shadow, motion, z-index tokens) **are unchanged**. Where this addendum names a token (for example `--color-pine`, `--radius-md`, `--dur-fast`), it means the value defined in A to D.

Four corrections are required because of decisions made after A to D were written. Each is also recorded in the reconciliation file.

| # | Correction | Reason |
|---|---|---|
| DC-1 | Section C said to ship only the **latin** font subset. The font files MUST include **latin and latin-ext** (the rupee sign U+20B9 normally lives in latin-ext) and the glyph MUST be verified in both families (test MAN-20) | The store prices in INR |
| DC-2 | Price display is fixed: whole rupees, Indian digit grouping, no paise (rule in E0) | INR decision and whole-rupee pricing rule |
| DC-3 | Header breakpoint: the desktop header is used from **1024 px**. Below 1024 px (tablet and mobile) the header uses the drawer layout | Section E0 of the Doc version only defined "desktop" and "mobile" |
| DC-4 | Hero hotspots show the **first four featured products** (`featured_rank` 1 to 4), loaded by the same request as the featured grid. Positions are CSS classes keyed by slot number | The earlier text did not say where hotspot data comes from. Inline `style` attributes are forbidden by the CSP |

**Features that stay excluded:** dark mode, payment fields of any kind (real or mock), reviews, wishlists, coupons, newsletter, social login, forgot-password.

## E. Page-by-page specifications

Every page has exactly one `h1`, a unique `<title>` (`Page name | Deskline`), the landmarks `header`, `nav`, `main`, `footer`, `lang="en"`, and `<meta name="viewport" content="width=device-width, initial-scale=1">` (no `user-scalable=no`, no `maximum-scale`). URL-driven state is noted per page. Quoted text is the intended copy.

### Breakpoints used below

| Name | Range | Grid | Header |
|---|---|---|---|
| Mobile | 360 to 639 px | 4 columns, 16 px gutters | Drawer header (56 px) |
| Tablet | 640 to 1023 px | 8 columns, 24 px gutters | Drawer header (56 px) |
| Desktop | 1024 px and up | 12 columns, 40 px gutters, max 1280 px | Full header (72 px) |

### Price display rule (applies to every page)

Prices arrive from the API as integer `...Minor` fields (paise). The browser formats them with one shared function `formatMinor(minor)` that divides by 100 and calls `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`. Examples: `149900` shows as ₹1,499; `10000000` shows as ₹1,00,000. Every price in the catalogue and the shipping fee is a whole number of rupees (enforced by the database and config), so paise are never shown and nothing is rounded. Prices, quantities, totals, and order numbers use `font-variant-numeric: tabular-nums`. Do not format prices by string concatenation anywhere else.

### E0. Shared shell (every page)

**Skip link.** First focusable element, text "Skip to content", visually hidden until focused, then shown top-left on Pine with Paper text.

**Announcement bar.** Pine background, `--on-dark` text, 13/18, centred, 36 px tall (wraps to two lines on mobile): "Demo store. Orders are saved, nothing ships, and no payment is taken." Not dismissible.

**Header, desktop (1024 px and up, 72 px).**
- Left: wordmark "Deskline" (Bricolage 600, 24 px, -0.03em), a link to `/` with accessible name "Deskline home".
- Left of centre: link **Shop**, and **Categories**, a disclosure button.
- Right, in order: search icon button, account control, cart link.
- Background Fog. After the page scrolls 8 px it changes to Paper with `--shadow-xs` and a `--line-subtle` bottom border (150 ms colour/shadow transition).
- **Categories** (`aria-expanded`): opens a Paper panel (`--radius-md`, `--line-default` border, `--shadow-sm`, 280 px wide) with "All products" and the five categories. Opens on click, Enter, or Space only, never on hover. Escape closes and returns focus to the button. Click outside closes. Entrance 200 ms: opacity and `scale(0.96)` from the button's lower-left corner.
- **Search** icon button (`aria-label` "Search products") reveals a 320 px search field left of the icons (instant, or 150 ms opacity). Enter goes to `/shop?search=...`. Escape collapses it and returns focus to the icon.
- **Account control.** Logged out: text link "Sign in" (to `/login`). Logged in: a button with the first name and a chevron (`aria-expanded`) opening a Paper dropdown: name and email as plain text, link "Your orders", button "Sign out". Same open/close behaviour as Categories. On first paint, before the session check returns, reserve the control's width and show nothing (no flash of the wrong state).
- **Cart link.** Cart icon plus the word "Cart", dynamic `aria-label` "Cart, 3 items". A Marigold pill badge (min 20 by 20, Pine text, 13 px 600) shows the count and is hidden at 0. A change triggers a 160 ms bump (`scale` 1, 1.15, 1) and a visually hidden polite live region announces "3 items in cart".

**Header, tablet and mobile (below 1024 px, 56 px).** Left: menu button (44 by 44, `aria-label` "Open menu"). Centre: wordmark. Right: search icon (links to `/shop#search`, which scrolls to and focuses the search field) and cart link (icon plus badge). No inline account control; it lives in the drawer.

**Mobile drawer.** A native `<dialog>` opened with `showModal()`.
- Slides from the left, width `min(88vw, 360px)`, Paper background, `--radius-lg` on the right corners, `--shadow-lg`, `::backdrop` uses `--scrim`.
- Top to bottom: close button (44 by 44) with the wordmark; search field; nav list (Shop, then the five categories) with 56 px rows set at `h3` size; `--line-subtle` divider; account block. Logged out: primary "Sign in" and secondary "Create account". Logged in: name, email, link "Your orders", secondary "Sign out".
- Focus goes to the close button on open and returns to the menu button on close. Closes on Escape, backdrop tap, and any link tap.
- Enter 300 ms `--ease-drawer` (`translateX(-100%)` to 0, scrim fades in); exit 200 ms. `overscroll-behavior: contain`; page scroll locked while open.

**Toast region.** Fixed: bottom-centre on mobile (16 px above the safe area), bottom-left on desktop (24 px inset), max width 420. Each toast: Paper, `--line-default` border, `--radius-md`, `--shadow-sm`, status icon, message, optional text-button action (for example "Undo"), 44 by 44 close button. Auto-dismiss after 5 s (6 s with an action); pause while hovered or focused; maximum 3 stacked. Success and info use `role="status"`; errors use `role="alert"`. Enter 200 ms (opacity, `translateY(8px)`), exit 140 ms.

**Footer.** Pine background, `--on-dark` text, `--radius-lg` on the top corners (desktop only), padding 64 top and 40 bottom.
- Brand column: wordmark, "Accessories for the desk you work at.", and "This is a demo store built for the CodeAlpha Full Stack internship. Products are fictional."
- "Shop": All products and the five categories. "Account": Sign in, Create account, Your orders (logged in: replaced by Sign out). "About this project": link to the GitHub repository (new tab, `rel="noopener noreferrer"`, accessible name includes "opens in a new tab"; hidden until the repo URL exists, see UD-09).
- Bottom row with a `--line-on-dark` divider: "© 2026 Deskline. Demo store, no real orders."
- Every link must lead to a real page. No social icons, newsletter, or payment-method icons.
- Desktop 4 columns (brand column wider), tablet 2 columns, mobile brand block then 2 link columns.

### E1. Home `/`

**Purpose.** Establish identity in one screen, route into the catalogue, show a few products.

```
[announcement bar]
[Deskline   Shop  Categories             search  Sign in  Cart 2]
+------------------------------------------------------------------+
| Accessories for the        |  +---------------------------------+  |
| desk you work at           |  |  top-down desk image            |  |
|                            |  |   (o) Felt desk mat  ₹1,499     |  |
| body-lg, two lines         |  |            (o) Desk lamp        |  |
| [Shop all products]        |  |    (o) Laptop stand             |  |
| Browse categories          |  |  (o) Walnut tray                |  |
+------------------------------------------------------------------+
 Shop by category (h2)
 ------------------------------------------------------------------
 Desk mats                                   4 products  [img]  >
 ------------------------------------------------------------------
 Featured products (h2)                       View all products
 [card] [card] [card] [card]
 [ Pine spotlight panel: image | name, copy, price, button ]
[footer]
```

**Hero.**
- Desktop: text in columns 1 to 5, vertically centred, left-aligned. Image panel in columns 6 to 12, `--radius-lg`, minimum height 600, bleeding to the right edge up to 1440. Tablet: text above, image below at 4:3. Mobile: text above, image at 4:5 (separate art-directed crop).
- Headline (`display-xl`): "Accessories for the desk you work at". Support (`body-lg`, max 44ch): "Mats, stands, lamps, chargers and organizers. Chosen to look good and stay out of the way."
- CTAs: primary lg "Shop all products" (to `/shop`); text-button "Browse categories" (jumps to `#categories`; instant under reduced motion).
- **Hotspots** (the one bold moment). Four on desktop and tablet, three on mobile (slots 1 to 3). Each is a real `<a>` to a product page. Data: the first four featured products from the same request that fills the featured grid (DC-4); names and prices come from the API, never hard-coded. Visual: a 44 by 44 target holding a 14 px white dot with a 2 px Pine outline, plus an always-visible label chip (Paper, `--radius-sm`, `--shadow-sm`, name in `small` 600, price in `small`). Positions come from CSS selectors on `data-slot="1"` to `"4"` per breakpoint (percentages), set once the artwork exists (UD-10). Chips never overlap each other or leave the image. Focus: double ring (2 px white inside, 2 px Pine outside). Pressed: `scale(0.96)`. One pulse ring plays twice on load and stops; none under reduced motion. If the featured request fails, the hotspots are simply not rendered and the hero still works.
- **Entrance** (the only orchestrated load motion; CSS only, content visible if animation is unsupported): headline, support, CTAs fade in with `translateY(8px)`, 60 ms stagger, 400 ms ease-out; the image panel fades from 0 with `scale(1.02)` to 1 over 600 ms. Total under 700 ms.
- The hero image is the LCP element: `<picture>` with desktop, tablet, and mobile sources (H), `loading="eager"`, `fetchpriority="high"`, a `<link rel="preload">`, explicit `width` and `height`.

**Shop by category** (`id="categories"`). `h2` "Shop by category". Five full-width link rows separated by `--line-subtle` dividers. Row height 96 desktop, 72 mobile. Left: category name at `h2` size (desktop) or `h3` (mobile). Right: "4 products" (`small`, text-2), a 72 by 72 thumbnail (`--radius-sm`) on tablet and up (56 by 56 on mobile), and a chevron. The whole row is the link. Fine-pointer hover: background Paper over 150 ms. Focus: inset ring. Counts come from `GET /api/categories` (`productCount`, active products only).

**Featured products.** `h2` "Featured products" with a right-aligned text link "View all products". Four product cards: 4 columns on desktop, 2 by 2 on tablet, a horizontal scroll-snap row on mobile (cards 62vw wide so the next one peeks, `scroll-snap-type: x proximity`, focusable container with `aria-label="Featured products"`; tabbing between card links scrolls the row, so there is a non-swipe alternative).

**Spotlight panel.** One product chosen by constant `SPOTLIGHT_SLUG` in `public/js/config.js` (default `monitor-light-bar`), loaded with `GET /api/products/:slug`. Pine background, `--radius-lg`, padding 48 desktop and 24 mobile. Desktop: image well on the left (1:1 crop, `--radius-md`); right column has the product name as `h2`, `summary` text in `--on-dark-muted`, price (`price-lg`, `--on-dark`), the availability line, and an inverted button "View product" (Paper background, Pine text, Marigold focus ring). Mobile: image on top at 4:3, text below. If the request fails the panel is omitted.

**States.** Loading: skeleton cards of the exact card geometry, shown after a 200 ms delay and kept at least 400 ms. Category counts are absent until loaded (space reserved). Featured error: inline alert "We couldn't load featured products. Check your connection and try again." with "Try again". Category rows work without counts.

### E2. Shop `/shop`

**Purpose.** Browse, search, filter, and sort. All state lives in the URL: `?search=&category=&sort=&page=`. Typing in search updates the URL with `replaceState`; chip, sort, and page changes use `pushState`; Back and Forward restore the view.

```
Shop (h1)                                   24 products
[ search field ..........................x ]   Sort by [ Featured v ]
( All ) ( Desk mats ) ( Charging & cables ) ( Stands & risers ) ( Lighting ) ( Organizers )
Showing 6 results for "stand" in Stands & risers. Clear all
[card] [card] [card] [card]
[card] [card] [card] [card]
          < Previous   1  2  3   Next >
```

- **Title row.** `h1` is "Shop", or the category name when a category is selected. The result count at the right (`small`, text-2) sits in a polite live region ("24 products", "1 product", "No products").
- **Layout.** Desktop: search field (max 360 px) left and "Sort by" select right on one row; chips on the next row. Tablet: same two rows. Mobile: search full width, chips as a horizontal scroll row (16 px edge padding; the selected chip scrolls into view), sort select full width below the chips.
- **Search field.** `type="search"`, 48 px, magnifier icon left, clear button (44 by 44, `aria-label="Clear search"`) when text exists, visually hidden label "Search products", `id="search"`. Placeholder "Search desk mats, stands, lamps…". 300 ms debounce while typing, Enter searches immediately, Escape clears. `enterkeyhint="search"`, `autocomplete="off"`, `spellcheck="false"`. Trim input. Never block characters.
- **Sort.** A native `<select>` with a visible label "Sort by", styled to match (explicit `background-color` and `color` on the select). Options: Featured, Price: low to high, Price: high to low, Newest, Name: A to Z.
- **Category chips.** A `role="group"` labelled "Category" with six buttons using `aria-pressed`: All plus five categories. Chip component in F.
- **Active filter line** appears only when a search or category is set: "Showing 6 results for “stand” in Stands & risers." plus text-button "Clear all".
- **Grid.** Desktop 4 columns, tablet 3, mobile 2. Column gap 24 (16 on mobile), row gap 48 (32 on mobile). Changing a filter crossfades the grid (opacity, 150 ms); no layout animation.
- **Pagination.** 12 per page. A `nav` labelled "Pagination": Previous, up to 5 page numbers (current has `aria-current="page"`), Next. Each control 44 px. After a page change, scroll to the top of the results and move focus to the result-count heading.

| State | Design |
|---|---|
| Loading | 12 skeleton cards (card geometry), shown after 200 ms, held at least 400 ms. Result count reads "Loading…" |
| No results | Line illustration (magnifier over a desk mat), `h2` "No products match “standd”", body "Check the spelling or try a broader search.", button "Clear search" |
| Category empty | Same layout, `h2` "No products in this category yet", button "View all products" |
| Error | Inline error panel: "We couldn't load products. Check your connection and try again." with "Try again". Search and chips stay usable |
| Page beyond the last | Replace the URL with the last valid page and render it |

### E3. Product detail `/product?slug=...`

**Purpose.** Give enough information and confidence to add the item to the cart.

```
Shop / Desk mats / Felt desk mat, charcoal
+--------------------------------+  +------------------------------+
| main image 4:5 (r-md)          |  | Desk mats (link)             |
|                                |  | Felt desk mat, charcoal (h1) |
|                                |  | ₹1,499            (price-lg) |
| [t1][t2][t3][t4]               |  | (check) In stock             |
+--------------------------------+  | short description            |
  Details v                          | [ - 1 + ] [ Add to cart ]    |
  Specifications >                   | Demo store note              |
  Shipping >                         +------------------------------+
```

- **Desktop.** Gallery in columns 1 to 7: main image 4:5 in a `--color-well` well (`--radius-md`, `max-height: calc(100vh - 160px)`), thumbnails below as 64 by 80 buttons (`aria-label="Show image 2 of 4"`, `aria-current="true"` on the active one; hidden when there is one image). Purchase panel in columns 8 to 12, sticky at `top: header height + 24`.
- **Tablet.** Stacked: gallery full width (max 560, centred), purchase panel below.
- **Mobile.** Main image becomes a horizontal scroll-snap strip with a visible counter "1 of 3"; thumbnails remain as small buttons beneath (no reliance on swiping). Purchase panel below.
- **Breadcrumb** (`nav` labelled "Breadcrumb"): Shop / Category / Product name. The last item is plain text with `aria-current="page"`.
- **Panel order:** category link (`small`, text-2), `h1`, `price-lg`, availability line, short description (`body-lg`, max 52ch, the `summary` field), quantity and add row, helper line, demo note, accordions.
- **Availability** is icon plus text, never colour alone: "In stock" (check, success colour), "Only 3 left" (warning icon in a Marigold-soft pill, Pine text), "Sold out" (x icon, Pine on Well).
- **Quantity and add.** Stepper (F) and a lg primary "Add to cart" filling the remaining width. Range 1 to `maxPurchasableQuantity` (min of stock and 10). At the maximum the + button is disabled and helper text shows "You can add up to 10 of this item." (or "Only 3 are available."). Typing in the field is never blocked; an invalid value shows "Enter a number from 1 to 10." on blur and snaps back.
- **Sold out.** Stepper and button disabled, button label "Sold out", helper "This item is out of stock." plus text link "Browse similar products" (category).
- **After adding.** The button crossfades (150 ms) to "Added to cart" with a check icon for 1.5 s, then back. Header badge bumps. A text link appears under the button: "View cart (2 items)". A polite live region announces "Felt desk mat, charcoal added to cart. 2 items in cart." No toast here.
- **Demo note** under the row: info icon plus "Demo store: orders are saved but nothing ships."
- **Accordions** are native `<details>`: "Details" (open by default; the `description`), "Specifications" (description list of `specs`, rows separated by `--line-subtle`), "Shipping" ("A flat shipping fee is added at checkout. This is a demo store, so nothing is actually shipped."). The chevron rotates over 200 ms; height is not animated.
- **States.** Loading: skeleton (image well, three text lines, button). Not found: the E10 variant "We couldn't find that product." Error: inline error panel with "Try again". Image error: the category placeholder (H).

### E4. Cart `/cart`

**Purpose.** Review and edit the order. Works logged out.

```
Your cart (h1)                       2 items
+----------------------------------------+  +------------------------+
| [img] Felt desk mat, charcoal  ₹1,499   |  | Order summary          |
|       Desk mats                          |  | Subtotal      ₹4,497   |
|       [ - 2 + ]  Remove      ₹2,998     |  | Shipping         ₹99   |
| ---------------------------------------- |  | Total         ₹4,596   |
| [img] Aluminium laptop stand ...         |  | [ Checkout ]           |
+----------------------------------------+  | Continue shopping      |
                                              +------------------------+
```

- **Desktop.** Line items in columns 1 to 8; summary panel in columns 9 to 12 (Paper, `--line-default` border, `--radius-md`, padding 24), sticky at `top: header height + 24`. **Tablet and mobile:** summary below the items; on mobile a sticky bottom bar (Paper, `--shadow-md`, safe-area aware) shows the total and a primary "Checkout".
- **Line item.** Image 96 by 120 (mobile 80 by 100, `--radius-sm`), name as a link (`ui-strong`), category (`small`, text-3), unit price (`price-md`), quantity stepper (48 px), text-button "Remove" with a trash icon, line total right-aligned (`price-md`). On mobile the stepper and Remove move to a second row; the line total stays top-right. Rows separated by `--line-subtle`.
- **Prices are fetched live** from `POST /api/cart/validate`. The stored cart holds only IDs and quantities.
- **Remove** is immediate and shows a toast "Removed Felt desk mat, charcoal." with "Undo" (6 s). Focus moves to the next line's name, or to the `h1` if it was the last.
- **Summary rows** (tabular, right-aligned): Subtotal, Shipping ("Flat rate" with the fee), Total (`price-lg`). A `--line-subtle` divider above Total.
- **Checkout button.** lg primary, full width, "Checkout". Logged out: helper text "You'll sign in or create an account first." Below: text link "Continue shopping" and the note "Demo store: no payment is taken."
- **Issues block** (above the list when any line is not `ok`): a warning alert listing each affected item, for example "Only 1 Felt desk mat, charcoal is available. Your cart has 2." with an inline button "Set to 1", or "This item is no longer available." with "Remove". Checkout is disabled while issues remain, with `aria-describedby` pointing to the alert and the visible helper "Fix the items above to continue."
- **Price changed:** dismissible info alert "Some prices have been updated."

| State | Design |
|---|---|
| Empty | Line illustration (empty desk tray), `h1` "Your cart is empty", body "Add something from the shop and it will show up here.", primary button "Shop all products" |
| Loading | Skeleton rows of line-item geometry; summary skeleton lines. Quantities from local data show immediately |
| Validation failed | Info alert "We couldn't check current prices. Try again." with "Try again"; prices show an en dash; Checkout stays disabled |
| Corrupt storage | Treated as an empty cart and silently cleaned |

### E5. Register `/register` (guest only)

- **Desktop:** two columns. Left, columns 1 to 5: an image panel (`--radius-lg`, cropped product scene, decorative, `alt=""`). Right, columns 7 to 11: the form, max width 420. **Tablet and mobile:** form only, centred column up to 420 px; the image panel is hidden.
- `h1` "Create your account". Support line "Save your cart across visits and see your order history." Below the form: "Already have an account? Sign in". A small note: "Demo store. Use fictional details."
- Fields (labels always visible above the control):

| Field | Attributes | Hint | Error text |
|---|---|---|---|
| Full name | `text`, `autocomplete="name"` | none | "Enter your name." |
| Email | `email`, `autocomplete="email"`, `autocapitalize="none"`, `spellcheck="false"` | none | "Enter a valid email address, like name@example.com." |
| Password | `password`, `autocomplete="new-password"`, "Show"/"Hide" text button (`aria-pressed`) | "At least 8 characters." (always visible) | "Use at least 8 characters." / "Use 72 characters or fewer." |
| Confirm password | `password`, `autocomplete="new-password"` | none | "Passwords don't match." |

- **Behaviour.** Never block paste or typing. Trim name and email. Validate on blur, then live once a field has an error. On submit the button stays enabled, everything is validated, and focus moves to the first invalid field. "Confirm password" is checked in the browser only and is **never sent to the server**. Server errors: duplicate email shows under the email field "An account with this email already exists. Sign in instead." with an inline "Sign in" link; any other failure shows an error alert above the button "We couldn't create your account. Try again."
- **Submit** lg primary "Create account"; in flight "Creating account…" with a spinner, controls disabled, `aria-busy="true"`, width unchanged.
- **Success:** redirect to the validated `next` path or `/`, with the toast "Account created. You're signed in."

### E6. Login, logout, and signed-in states `/login` (guest only)

- Same split layout as Register. `h1` "Sign in".
- Fields: Email (`autocomplete="username"`), Password (`autocomplete="current-password"`, Show/Hide). Button "Sign in", in flight "Signing in…". Link "New here? Create an account". No "forgot password" link (out of scope; no dead links).
- **Errors:** wrong credentials: error alert above the button, "Email or password is incorrect. Check both and try again." Rate limited: "Too many sign-in attempts. Wait a few minutes and try again." Network: "We couldn't reach the server. Try again."
- **Contextual notices** (info alert at the top of the form): from a protected page, "Sign in to continue to checkout." or "Sign in to see your orders."; after expiry, "Your session expired. Sign in to continue."
- **Return path:** after sign-in go to `next` only if the shared `safeRedirect` function accepts it; otherwise `/`.
- **Logout:** "Sign out" appears in the account dropdown, the drawer, the footer, and the orders page. The button shows "Signing out…", then redirects to `/` with the toast "You're signed out." The cart is kept. Protected pages then redirect to `/login`.
- **Header states to design:** logged out ("Sign in" link), logged in (name button plus dropdown), session check pending (reserved width, no content).

### E7. Checkout `/checkout` (login required)

**Purpose.** Collect shipping details and place a clearly labelled demo order.

```
Checkout (h1)
+---------------------------------------+  +-------------------------+
| Contact                               |  | Order summary  Edit cart |
|   Signed in as name@example.com       |  | [img] Mat      x2 ₹2,998 |
| Shipping address                      |  | [img] Stand    x1 ₹2,499 |
|   Full name / Phone / Address 1 / 2   |  | Subtotal       ₹5,497    |
|   City        | State or region       |  | Shipping          ₹99    |
|   Postal code                         |  | Total          ₹5,596    |
| Delivery   Flat-rate shipping   ₹99   |  | [ Place demo order ]     |
| Demo order notice (info panel)        |  | No payment is taken.     |
+---------------------------------------+  +-------------------------+
```

- **Desktop:** form in columns 1 to 7, sticky summary in columns 9 to 12. **Tablet and mobile:** the summary becomes a native `<details>` at the top ("Order summary" with the total on the summary line), collapsed by default; the Place button sits at the end of the form (and nowhere else). One form on one page; no step numbers.
- **Contact:** read-only "Signed in as name@example.com".
- **Shipping fields:**

| Field | Attributes | Required | Error text |
|---|---|---|---|
| Full name | `autocomplete="name"` | Yes | "Enter the recipient's name." |
| Phone | `type="tel"`, `inputmode="tel"`, `autocomplete="tel"` | Yes | "Enter a phone number with 10 to 15 digits." |
| Address line 1 | `autocomplete="address-line1"` | Yes | "Enter a street address." |
| Address line 2 (optional) | `autocomplete="address-line2"` | No | "Use 150 characters or fewer." |
| City | `autocomplete="address-level2"` | Yes | "Enter a city." |
| State or region | `autocomplete="address-level1"` | Yes | "Enter a state or region." |
| Postal code | `autocomplete="postal-code"` | Yes | "Enter a valid postal code." |

  Placeholders are example values ending with an ellipsis (for example "221 Example Street…"). Prefill the name from the account; remember nothing else.
- **Delivery:** one read-only row "Flat-rate shipping" with the fee. No fake delivery options.
- **Demo order panel:** info panel (Well background, info icon, `--radius-md`), heading "Demo order, no payment", body "Placing this order saves it to the store's database so it appears in your order history. You won't be charged and nothing will ship." Under it: "Use fictional details only." There are no card, UPI, wallet, or payment fields anywhere.
- **Place button:** lg primary, label **"Place demo order"**. Never disabled up front. In flight: "Placing order…" with spinner, the form's controls disabled, values preserved, `aria-busy="true"`. One idempotency key per attempt (generated when the page loads or after a failed attempt is edited).
- **Failure states:**

| State | Design |
|---|---|
| Field errors | Inline per field; focus goes to the first invalid field |
| Stock conflict | Warning alert at the top: "Some items changed while you were checking out." One line per item ("Felt desk mat, charcoal: only 1 left, you have 2."), button "Review cart". Focus moves to the alert |
| Session expired | Redirect to `/login?next=/checkout` with the notice from E6; the cart is untouched |
| Server error or timeout | Error alert "We couldn't place your order. Your cart and details are still here. Try again." with "Try again" |
| Empty cart | Redirect to `/cart` |
| Loading summary | Skeleton rows in the summary panel |

- **Summary panel:** Paper, `--line-default` border, `--radius-md`. Each line: 56 by 70 thumbnail with a small quantity badge (Pine pill, Paper text), name (`small` 600, 2-line clamp), line total right-aligned. "Edit cart" text link at the top right. Totals as in the cart. Under the button: "No payment is taken."

### E8. Order confirmation and detail `/order?id=...` (owner only)

```
(check)  Order placed                (h1, focused on load)
Thanks, Priya. We've saved order DL-100001.
Nothing was charged and nothing will ship.
+----------------------------------+  +------------------------+
| Items                            |  | Shipping to            |
| [img] Felt mat   x2     ₹2,998   |  | Priya Raman            |
| [img] Stand      x1     ₹2,499   |  | 12 Example Street      |
| Subtotal                ₹5,497   |  | Status: Placed         |
| Shipping                   ₹99   |  +------------------------+
| Total                   ₹5,596   |
+----------------------------------+
[ Continue shopping ]  View all orders
```

- **Confirmation mode** (arriving from checkout, flagged by a one-time `sessionStorage` marker): a 48 px Pine circle with a check mark that draws once (SVG stroke, 400 ms ease-out; static under reduced motion). `h1` "Order placed". Focus moves to the `h1` on load and a polite live region reads "Order placed. Order DL-100001." Support line: "Thanks, {first name}. We've saved order {number}. Nothing was charged and nothing will ship." The order number is set at `h3` size on its own line.
- **Detail mode** (from history): no check mark; `h1` "Order {number}"; breadcrumb "Your orders / {number}"; the placed date; no success copy.
- **Layout.** Desktop: items panel in columns 1 to 8, shipping panel in columns 9 to 12. Tablet and mobile: stacked. Panels use Paper, `--line-default`, `--radius-md`.
- **Status chip** "Placed": Well background, Pine text, `--radius-pill`, with an icon. It is a label, not a tracker.
- **Actions:** primary "Continue shopping", text link "View all orders".
- **States:** loading skeleton; not found or not yours: the E10 variant "We couldn't find that order." (same response for both); logged out: redirect to login.

### E9. Account and order history `/orders` (login required)

```
Your orders (h1)                  Signed in as name@example.com  [Sign out]
+--------------------------------------------------------------------+
| DL-100001          Placed          14 Oct 2026                     |
| [t][t][t] 3 items                  ₹5,596      View order          |
+--------------------------------------------------------------------+
                         [ Show more orders ]
```

- `h1` "Your orders". At the right (desktop) or below (tablet and mobile): "Signed in as {email}" (`small`) and a secondary sm button "Sign out".
- **Order row:** a Paper panel (`--line-default`, `--radius-md`, padding 20), 16 px apart. Top line: order number (`h3`, link to the detail page), status chip, date (`small`, text-2, `Intl.DateTimeFormat` with `en-IN`). Bottom line: up to three 48 by 60 thumbnails (+N if more), "3 items", total (`price-md`, right), and a text link "View order". On mobile the total and link drop to their own row. The whole row is clickable through a stretched hit area on the order-number link, while "View order" stays a visible control.
- Newest first, ten per page, secondary button "Show more orders" (appends rows; focus moves to the first new row).

| State | Design |
|---|---|
| Empty | Line illustration (empty tray), `h2` "No orders yet", body "When you place an order, it will show up here.", primary "Browse products" |
| Loading | Three skeleton rows of real row geometry |
| Error | Error panel "We couldn't load your orders. Try again." with "Try again" |
| Signed out | Redirect to `/login?next=/orders` with the notice "Sign in to see your orders." |

### E10. Not found and error pages

- **404** (unknown route, product, or order): illustration, `h1` "Page not found" (or "We couldn't find that product." / "We couldn't find that order."), body "The link may be out of date.", buttons "Back to home" (primary) and "Browse products" (secondary).
- **Server error page:** `h1` "Something went wrong", body "Reload the page. If it keeps happening, try again in a few minutes.", button "Reload page".
- Offline or fetch failure inside a page is handled with the inline error panel, never a blank area.
- The Express fallback for unknown non-API routes returns an HTML page built in code that matches this layout and links the same CSS (backend contract section 2).

## F. Reusable components and their states

States listed must all be implemented where they apply. "Ring" means the focus ring from section B.

| Component | Anatomy and measurements | States |
|---|---|---|
| **Button** | Variants: primary (Pine, Paper text), secondary (transparent, 1 px Pine border, Pine text), text (Pine, underlined, offset 3 px), danger-text (error colour). Sizes md 48, lg 56, sm 40 (desktop only). Padding 0 24 (lg 0 28, sm 0 16). `--radius-sm`. Font `button` | Hover (fine pointer): primary `--color-pine-hover`, secondary Well fill, text underline 2 px. Focus-visible: ring. Active: `scale(0.97)` plus `--color-pine-press`. Disabled: Fog-dark fill `#D9DED7`, text `--color-text-3`, `cursor: not-allowed`. Loading: spinner replaces the leading icon, label changes ("Placing order…"), width locked, `aria-busy`, clicks ignored. Submit buttons are not disabled before submission |
| **Icon button** | 44 by 44, `--radius-sm`, transparent, 20 or 24 px icon, `aria-label` always present | Hover Well fill; focus ring; active `scale(0.95)`; disabled 40% opacity |
| **Field** | Label above (`ui-strong`), optional hint (`small`, text-3), control 48 px, White fill, 1 px `--border-input`, `--radius-sm`, padding 0 14, error text below with icon | Hover border `--color-pine`; focus: border Pine plus ring; filled; error: 2 px error border, icon, message, `aria-invalid="true"`, `aria-describedby`; disabled/read-only: Well fill, no ring |
| **Password field** | Field plus "Show"/"Hide" text button inside the right edge (44 px hit area, `aria-pressed`) | As Field; the toggle has its own focus ring |
| **Select** | Native `<select>`, same box as Field, CSS chevron (data-URI SVG; CSP allows `img-src data:`) | As Field |
| **Search field** | Field with a leading magnifier and trailing clear button (44 by 44) | As Field; the clear button appears only with text |
| **Chip** | Height 44, padding 0 16, `--radius-pill`, `button` font. Selected: Pine fill, Paper text. Unselected: transparent, `--line-default` border, Pine text | Hover border `--line-strong`; focus ring; active `scale(0.97)`; `aria-pressed` reflects selection |
| **Badge** | `caption` 600, padding 4 8, `--radius-xs`, always text. Low stock: Marigold-soft fill, Pine text. Sold out: Pine fill, Paper text | Static |
| **Status chip** | Icon plus label, `--radius-pill`, Well fill, Pine text | Static |
| **Product card** | One link wrapping the card (stretched pseudo-element on the name link). Image well 4:5 (`--color-well`, `--radius-md`, `overflow: hidden`), badge slot 12 px from top-left, then 12 px gap, name (`ui-strong`, 2-line clamp), category (`caption`, text-3), price (`price-md`). No border, no shadow | Hover (fine pointer): image `scale(1.04)` over 300 ms `--ease-out`, name underline. Focus-visible: ring around the whole card (offset 4). Active: card `scale(0.985)`. Sold out: Fog 40% scrim over the image and the "Sold out" badge (text stays full contrast), still a link. Loading: skeleton of identical geometry. Image error: category placeholder |
| **Skeleton** | Well fill, `--radius-xs` text lines, `--radius-md` image block, opacity pulse 1 to 0.6 over 1.4 s `ease-in-out` | Reduced motion: static fill |
| **Quantity stepper** | Minus button 48 by 48, value 56 wide (`<input type="text" inputmode="numeric">`, 16 px, centred, `aria-label="Quantity"`), plus button 48 by 48; shared 1 px `--border-input` outline, `--radius-sm` | Minus disabled at 1; plus disabled at the maximum, with helper text; hover Well fill; active `scale(0.95)` on the button; invalid input message on blur; typing never blocked; number change is instant (no animation) |
| **Cart line** | See E4 | Normal, issue (warning tint plus alert), removing (immediate), loading skeleton |
| **Summary panel** | Paper, `--line-default`, `--radius-md`, padding 24; definition-list rows; total at `price-lg` | Loading skeleton; checkout button disabled with helper when issues exist |
| **Order row** | See E9 | Default, hover (Paper to White 150 ms, fine pointer), focus ring, loading skeleton |
| **Alert (inline)** | Icon, message, optional action button, `--radius-md`, 1 px border. Error: `#FBE9E7` fill, error border, `role="alert"`. Warning: Marigold-soft fill, Pine text. Info: Well fill. Success: `#E4F2E7`, success text | Dismissible variant has a 44 by 44 close button; shown without animation (no layout shift: reserve space or insert above fold-safe) |
| **Toast** | See E0 | Entering, visible, paused (hover/focus), exiting |
| **Empty state** | 160 px line illustration, `h2` (or `h1` as the page's title), body, one primary action | Static |
| **Breadcrumb** | `small`, separator is a CSS-drawn slash, last item plain text | Link hover underline; focus ring |
| **Pagination** | 44 px controls, `--radius-sm`, current page Pine fill | Hover Well; disabled Previous/Next at the ends (with `aria-disabled`); focus ring |
| **Accordion** | Native `<details>`, summary row 56 px with chevron | Hover Paper fill; focus ring; open/closed chevron rotation 200 ms |
| **Gallery** | Main well plus thumbnails (desktop), scroll-snap strip plus counter (mobile) | Active thumbnail has a 2 px Pine outline and `aria-current`; image loading shows the well colour |
| **Hotspot** | See E1 | Default, hover (fine pointer: dot scales 1.1), focus (double ring), active (`scale(0.96)`), pulse (twice then stop) |
| **Drawer** | See E0 (`<dialog>`) | Closed, opening 300 ms, open, closing 200 ms |
| **Disclosure menu** | Button plus panel (Categories, Account) | Closed, open, focus ring, Escape handling |
| **Spinner** | 18 px (button) or 24 px ring, 2 px stroke, 800 ms linear rotation | Reduced motion: replace with the text label only |
| **Demo notice** | Announcement bar, inline note (info icon plus `small` text), and the checkout panel | Static |
| **Price** | One shared `formatMinor` | See price display rule |

## G. Desktop, tablet, and mobile behaviour

| Area | Mobile (below 640) | Tablet (640 to 1023) | Desktop (1024 and up) |
|---|---|---|---|
| Header | Drawer header, 56 px | Drawer header, 56 px | Full header, 72 px |
| Home hero | Stacked, image 4:5 | Stacked, image 4:3 | Side by side |
| Category rows | 72 px rows, 56 px thumbs | 96 px rows, 72 px thumbs | 96 px rows |
| Featured | Scroll-snap row | 2 by 2 grid | 4 columns |
| Shop grid | 2 columns | 3 columns | 4 columns |
| Filter chips | Horizontal scroll | Wrap or scroll | Single row |
| Product page | Stacked, swipe strip | Stacked, gallery max 560 | Two columns, sticky panel |
| Cart | Stacked, sticky checkout bar | Stacked | Two columns, sticky summary |
| Checkout | Collapsible summary at top | Collapsible summary at top | Two columns, sticky summary |
| Auth pages | Form only | Form only | Split with image panel |
| Orders | Stacked rows | Stacked rows | Rows with right-aligned totals |
| Footer | Brand block plus 2 columns | 2 columns | 4 columns |

**Rules.**
- No horizontal page scroll at 320, 360, 768, and 1280 px. Wide content (tables of specs, chip rows) scrolls inside its own container.
- Sticky bars and the header respect `env(safe-area-inset-*)`. `html` has `scroll-padding-top: header height + 16px` so focused elements are never hidden under sticky UI.
- Hover styles only inside `@media (hover: hover) and (pointer: fine)`. Controls use `touch-action: manipulation`.
- Form controls are at least 16 px on mobile. Fonts and spacing use `rem` so browser text scaling works. Reflow at 320 px and 200% zoom without loss of content or function.
- Images never cause layout shift: every `<img>` has `width` and `height`; wells hold the 4:5 ratio with `aspect-ratio`.
- `<meta name="theme-color" content="#EDEFEA">`; `color-scheme: light`.

## H. Asset and product-image strategy

### H.1 Inventory (minimum viable set)

| Asset | Count | Notes |
|---|---|---|
| Product main images | 21 | One per seeded product, `/images/products/<slug>-1.webp`, source 800 by 1000 (4:5) |
| Extra product views | 8 | Featured four get `-2` and `-3` |
| Hero images | 3 | Desktop 1800 by 1500 (6:5), tablet 1400 by 1050 (4:3), mobile 1000 by 1250 (4:5). Art-directed crops, not CSS crops of one file |
| Category thumbnails | 5 | `/images/categories/<slug>.webp`, 288 by 288 (shown at 72, 144 for 2x, 288 for 4x); derived from product images by default |
| Placeholders | 6 | `/images/placeholders/<category-slug>.svg` (five) plus `product.svg` |
| Empty-state illustrations | 4 | Empty cart, no results, no orders, not found |
| Auth panel image | 1 | Crop of a product scene |
| Open Graph image | 1 | 1200 by 630, home only |
| Icons | about 24 | Single set (below) |
| Fonts | 2 families | Self-hosted |

### H.2 Art direction (what makes the photography feel designed)

- One seamless backdrop for every product: Well tone (`#E2E6DF`), with a soft contact shadow under the object. Consistent camera angle (slightly above, three-quarter) and a single soft light from the upper left across the whole set.
- Product occupies 60 to 70% of the frame height, centred, with at least 12% empty margin on every side so the 4:5 crop and 1:1 spotlight crop both work.
- The hero is a top-down desk scene on a Fog-adjacent surface, with the four featured products arranged so the hotspot slots have clear space for their label chips.
- No logos, brand marks, text on products, or recognisable people. Restrained colour: products supply the colour, not the backdrop.

### H.3 Sources and licensing (must be recorded)

Allowed: images the project owner creates (photographs, 3D renders, illustrations), or images under a licence that permits this use (for example CC0 or a free-to-use stock licence). Not allowed: scraped retailer or brand images. If any image is AI-generated, that must be stated in the credits file and README, and no image may imitate a real brand's product. Every image has a row in `public/images/CREDITS.md`: file, creator, source URL (if any), licence, date added. A missing credits row is a failed checklist item (J).

### H.4 Technical requirements

| Item | Requirement |
|---|---|
| Format | WebP, quality about 80, plus an optional AVIF `<source>`. Fallback JPEG not required |
| Responsive widths | Cards: 400, 640, 800 px via `srcset` and `sizes`. Hero: the three art-directed files with `<picture>` media queries (`min-width: 1024px`, `min-width: 640px`) |
| Budgets | Card image 400 w: 40 KB or less; 800 w: 90 KB or less; hero desktop: 180 KB or less; hero tablet and mobile: 120 KB or less |
| Attributes | Every `<img>`: `width`, `height`, `alt`, `decoding="async"`. Below the fold: `loading="lazy"`. Hero and the first PDP image: `loading="eager"`, `fetchpriority="high"` |
| Naming | Lowercase, hyphenated, `<slug>-<n>.webp`; the database `url` column holds the path (`/images/...`) |
| Alt text | Describes what is visible and useful: "Charcoal felt desk mat with a laptop and notebook on it". Not the filename, not "image of". Decorative images use `alt=""` |
| Fallback | On `error`, an image swaps once to the category placeholder SVG (never loops). The seed references files that may not exist yet, so this path must work |
| Missing hero | If hero images are not ready, the hero renders the text column and a Well-colour panel with the placeholder; no broken-image icon ever shows |
| Cache | `/images/*`: `public, max-age=86400, stale-while-revalidate=604800` |

### H.5 Icons, illustrations, fonts

- **Icons:** one set only, Lucide (ISC licence), copied as inline SVG into a same-origin sprite `/icons/sprite.svg` and referenced with `<use href="/icons/sprite.svg#name">`. Stroke 1.75, 20 px inline with text, 24 px standalone. Needed: search, shopping-bag (cart), user, menu, x (close), plus, minus, trash, check, alert-circle, info, chevron-down, chevron-right, chevron-left, package, eye and eye-off (only if the password toggle uses icons). Decorative icons carry `aria-hidden="true"`; an icon alone in a button gets the button's `aria-label`.
- **Illustrations:** four single-colour line drawings (1.5 px Pine stroke, one Marigold fill accent), 160 px, `alt=""`, same visual language as the icons.
- **Fonts:** `@fontsource-variable/bricolage-grotesque` and `@fontsource-variable/geist` through npm; copy the **latin and latin-ext** WOFF2 files into `public/fonts/`; `font-display: swap`; preload the two latin files used above the fold; metric-adjusted fallback. Limit variable axes to weight (and optical size for Bricolage). Verify ₹ renders in both families (MAN-20). If it does not, UD-04 applies.
- **Favicon:** `public/favicon.svg` (the wordmark's first letter on Pine), plus a 180 by 180 PNG for Apple touch.

## I. Accessibility and keyboard interaction

**Target:** WCAG 2.2 level AA.

### I.1 General rules
1. Semantic HTML first: real `button`, `a`, `label`, `fieldset`/`legend`, `nav`, `main`, `dialog`, `details`. Buttons perform actions; links navigate.
2. One `h1` per page; heading levels never skip.
3. Visible focus on every interactive element (`outline`, never `outline: none` without a replacement). Focus ring contrast at least 3:1 against its background. Focused elements are never hidden under sticky UI.
4. Touch targets at least 44 by 44 px; never below 24 by 24 px even on desktop.
5. Contrast: body text 4.5:1, large text and UI boundaries 3:1. Use only the verified token pairs in section B. Colour is never the only signal (stock, errors, selected chip all have text or an icon).
6. Forms: visible labels, `autocomplete` tokens, correct `type`/`inputmode`, errors linked with `aria-describedby`, `aria-invalid`, focus to the first invalid field on submit, paste never blocked, no authentication step that requires remembering a cognitive test.
7. Motion: respect `prefers-reduced-motion` (section D). No auto-playing or looping motion; the hotspot pulse runs twice only. No content flashes.
8. Zoom and reflow: no `user-scalable=no`; 320 px reflow; 200% zoom works.
9. Images have meaningful `alt`; decorative images `alt=""`; icons `aria-hidden`.
10. Language `en`; page titles unique; meaningful link text ("View order DL-100001", not "click here").

### I.2 Keyboard map

| Widget | Keys and behaviour |
|---|---|
| Skip link | Tab (first stop) then Enter moves focus to `main` |
| Header links and buttons | Tab order follows visual order. Enter/Space activate |
| Categories and Account disclosure | Enter/Space toggles. Tab moves into the panel. Escape closes and returns focus to the trigger. Focus leaving the panel closes it |
| Mobile drawer (`<dialog>`) | Focus trapped inside. Escape closes. Focus returns to the menu button |
| Search field | Enter submits, Escape clears (header field: Escape collapses) |
| Chips | Tab between chips; Enter/Space toggles `aria-pressed` |
| Sort select | Native keyboard behaviour |
| Product card | One tab stop per card; Enter follows the link |
| Hotspot | Each is a tab stop in visual order; Enter follows the link |
| Gallery thumbnails | Tab between thumbnails; Enter/Space selects; the main image updates and the counter is announced |
| Quantity stepper | Tab to the input; Up/Down arrows change the value; minus/plus are buttons |
| Accordion | Enter/Space toggles (native) |
| Pagination | Tab between links; Enter follows |
| Toast action | Reachable by Tab while the toast is visible; timers pause on focus |
| Forms | Tab order follows reading order; Enter submits from a text field |

### I.3 Focus management

| Event | Focus goes to |
|---|---|
| Page navigation | Browser default (new document). Single-page updates on `/shop` after pagination: the result-count heading |
| Form submit with errors | First invalid field |
| Stock conflict on checkout | The alert |
| Order placed | The `h1` |
| Cart line removed | Next line's name, or the `h1` |
| Drawer or disclosure closed | The trigger |
| "Show more orders" | First newly added row |

### I.4 Announcements (live regions)

Cart count change, add-to-cart confirmation, result count on the shop page, toasts (`status`), form-level and conflict errors (`alert`), order placed. Use `aria-live="polite"` except for blocking errors. Do not announce on every keystroke.

### I.5 Verification methods
Automated static checks (heading, title, lang, ids; no `user-scalable=no`), Lighthouse accessibility audit, an axe-based browser check, a keyboard-only run of every page, a screen-reader spot check (record the software and version used), contrast checks of every token pair, 320 px and 200% zoom checks, and a reduced-motion check. Results go into `docs/STATUS.md`; nothing is assumed to pass.

## J. Design acceptance checklist

Every item is verified by looking at the running application, and recorded in `docs/STATUS.md`.

**Tokens and identity**
- [ ] Only the Pine, Fog, Paper, White, Well, Marigold tokens (and semantic colours) appear in the CSS; no stray hex values outside `tokens.css`.
- [ ] Fonts are Bricolage Grotesque (headings, prices) and Geist (text/UI), self-hosted, with latin-ext and a working ₹ glyph (MAN-20).
- [ ] Radius, shadow, spacing, and motion values come from tokens; there is no `transition: all`.
- [ ] None of the "do not do" items from section A appear (eyebrow caps, gradient washes, identical shadowed card rows, arrows on buttons).

**Pages and layout**
- [ ] All ten pages in E exist and match their layouts at 360, 768, and 1280 px.
- [ ] No horizontal scroll at 320, 360, 768, 1280 px.
- [ ] Header switches layout at 1024 px as specified; footer links all resolve.
- [ ] The demo notice is visible in the announcement bar, on the product page, cart, checkout, confirmation, and footer.

**Components and states**
- [ ] Every component in F shows default, hover (fine pointer), focus-visible, active, and disabled states where applicable.
- [ ] Loading, empty, error, and success states exist for home, shop, product, cart, checkout, orders, and auth.
- [ ] Skeleton delay (200 ms) and minimum display (400 ms) behave as specified.
- [ ] Prices display as whole rupees with Indian grouping everywhere, through one function.

**Interaction and motion**
- [ ] Nothing essential depends on hover.
- [ ] Only the specified motion exists; all of it stops or simplifies under reduced motion.
- [ ] Press feedback works on buttons, chips, and cards.

**Accessibility**
- [ ] Every item in section I is verified (keyboard-only run, drawer focus trap, Escape handling, focus management table, live regions).
- [ ] Contrast of every token pair is measured and recorded.
- [ ] Touch targets are at least 44 by 44 px on mobile.

**Assets**
- [ ] Every image has width, height, alt text, a credits row, and is within its budget.
- [ ] A missing image shows the placeholder, never a broken icon.
- [ ] No third-party scripts, fonts, or images are loaded.

**Scope guard**
- [ ] No dark mode, payment fields, reviews, wishlists, coupons, newsletter, or forgot-password link.

## K. Mapping of AC-1 to AC-55 to pages and components

Acceptance criteria are from the implementation brief, section 5. This table maps each to the design sections that satisfy it. Test mapping (what proves it) is in the backend addendum, section 11.

| AC | Satisfied by (design) |
|---|---|
| 1 | E2 grid, F Product card (name, image, price, category, stock status) |
| 2 | E2 Pagination (12 per page, URL page, Back) |
| 3 | E2 Search field (debounce, Enter, Escape, empty query) |
| 4 | E2 Category chips |
| 5 | E2 Sort select |
| 6 | E2 URL-state rules |
| 7 | E2 No-results state |
| 8 | E2/F Product card sold-out treatment, E3 Sold out |
| 9 | E3 |
| 10 | E3 not found, E10 |
| 11 | E3 quantity rules, F Quantity stepper |
| 12 | E3 After adding, E0 Cart link badge |
| 13 | E3 Availability line, F Badge |
| 14 | E4 (cart holds IDs and quantities only) |
| 15 | E4 persistence, E0 header badge |
| 16 | E3 add behaviour (increments existing line) |
| 17 | E4 line item controls, Remove with Undo |
| 18 | E4 Prices fetched live, Summary rows |
| 19 | E4 Issues block |
| 20 | E4 Corrupt storage state |
| 21 | E4 Empty state |
| 22 | E5 fields and rules |
| 23 | E5 duplicate-email message |
| 24 | Backend only (E5 sends the password over same-origin JSON) |
| 25 | Backend only |
| 26 | E6 error copy |
| 27 | E0 account control states |
| 28 | E6 Logout |
| 29 | E5, E6 (guest-only redirect) |
| 30 | E6 contextual notices and return path, E7, E8, E9 redirects |
| 31 | E7 (login required, empty cart redirect) |
| 32 | E7 (display only; totals come from the server response) |
| 33 | E7 shipping fields and errors |
| 34 | Backend (E7 shows the result) |
| 35 | E8 shows the snapshotted names and prices |
| 36 | E7 Stock conflict state |
| 37 | E7 Place button in-flight behaviour and idempotency key |
| 38 | E8 Confirmation mode (cart cleared by the browser after success) |
| 39 | E7 Server error state (cart and form kept) |
| 40 | E0 announcement bar, E3 demo note, E4 note, E7 Demo order panel, E8 copy |
| 41 | E9 |
| 42 | E8/E10 order not found |
| 43 | E9 Empty state |
| 44 | G, J |
| 45 | E0 Mobile drawer, I.2 |
| 46 | I.1, I.2, F |
| 47 | I.1 item 6, F Field |
| 48 | B contrast table, H.4 alt text, I.1 |
| 49 | D motion rule 10, E1 entrance, F Spinner/Skeleton |
| 50 | F states, E2/E4/E7 loading and error states |
| 51 to 55 | Not design requirements. Design relevance: AC-55 (Lighthouse) depends on H.4 budgets and G image rules |

## L. Unresolved design decisions

Each has a default that Antigravity MUST use if the owner has not answered, so no guessing is needed. Defaults are recommendations, not CodeAlpha requirements.

| ID | Decision | Default if unanswered |
|---|---|---|
| UD-01 | Final store name | "Deskline" (text wordmark; changing it is a one-line edit plus the footer and titles) |
| UD-02 | How the hero artwork is made (photograph, 3D render, illustration) | Owner-made. Until it exists, the hero shows the text column with the Well placeholder panel (H.4) |
| UD-03 | Product image sourcing | Owner-made or properly licensed (H.3). Placeholders until ready |
| UD-04 | If ₹ is missing from Bricolage or Geist | Use the latin-ext file if it has the glyph; otherwise render only the ₹ symbol in a fallback font with matched metrics. Record the outcome in `docs/STATUS.md` |
| UD-05 | Flat shipping fee | ₹99 (`SHIPPING_FLAT_MINOR=9900`) |
| UD-06 | Tax wording | No tax lines or claims; prices are shown as final amounts |
| UD-07 | India-specific address and phone rules (6-digit PIN, +91) | Generic rules as in the API contract (postal code 3 to 10 characters, phone 10 to 15 digits) |
| UD-08 | Optional enhancements: mobile sticky buy bar, "More from this category", copy-order-number button | Excluded |
| UD-09 | Public GitHub repository URL for the footer link | Hide the link until the URL exists |
| UD-10 | Hotspot slot coordinates | Set after the three hero images exist; until then render no hotspots |
| UD-11 | Logo mark | Text wordmark only |
| UD-12 | Category thumbnails: derived from product images, or dedicated art | Derived (a crop of one product per category) |
| UD-13 | Final hero headline and support text | Exactly as written in E1 |

---
*End of Deskline Design Spec Addendum.*
