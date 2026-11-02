# Deskline: Design System and Page Specifications

Design spec for CodeAlpha\_EcommerceStore (Task 1). Plain HTML, CSS, and vanilla JavaScript only. No code in this document. Written to be handed to Antigravity for implementation.

## 0. Read this first

**What I loaded.** The Vercel Web Interface Guidelines were loaded in full and are applied throughout (focus, forms, motion, images, copy). The Taste UI, UI/UX Pro, and Emil Kowalski skill files only link out to external repos. I could not load their rules, so I applied the widely documented principles behind them (restraint, short ease-out motion, transform/opacity only, press feedback, premium through spacing rather than effects) instead of quoting them. The Front-End Design skill was loaded in full and drives the anti-template rules below.

**What I changed from the brief.** The brief's suggested palette (`#F6F3EE` cream with `#C2410C` burnt orange) is exactly the cream-plus-terracotta combination that reads as a generic template. It is replaced by the Pine / Fog / Marigold palette below. Where this document and section 10 (Visual direction) of the implementation brief disagree, **this document wins**.

**Assumptions from the brief's decision table** (change them and parts of this spec change):

| Decision | Assumed |
| --- | --- |
| D1 Store name | **Deskline** is a working name. The wordmark is plain text, so renaming is a one-line change. Check the name is free before publishing |
| D7 Page architecture | Multi-page HTML, shared header/footer injected by one JS module |
| D8 Product images | Original or licensed art, self-hosted (see section H) |
| D9 Fonts | Self-hosted variable fonts (see section C) |
| D2 Currency | Undecided. All price formatting goes through one `Intl.NumberFormat` helper |

## A. Brand direction and visual principles

### Subject and audience

A store for the objects on a work desk: desk mats, stands, lamps, cables, chargers, organizers. The materials of that world are anodised metal, felt, matte plastic, braided cable, and the pool of light from a desk lamp. The audience is someone setting up or tidying the desk they work at, often on a phone, buying one to three things. The second audience is the internship reviewer, who needs every flow to be obvious in a few minutes.

### Concept: the desk, seen from above

The whole identity borrows from a tidy flat-lay: objects set on a calm surface with room around each one. That gives the layout a clear job: **products are the colour; the interface is the table they sit on.** The one bold moment is the homepage hero, a top-down desk scene whose objects are real links (“shop the desk”). Everything else stays quiet.

### Personality

Calm, exact, warm-matte. Confident without shouting. Generous space, large tightly set headlines, small precise UI text.

### Principles

1. **Product first, interface quiet.** Product images get the most area and the most contrast. UI chrome never competes with them.
2. **Spend boldness in one place.** The hero flat-lay and large display type are the memorable elements. Everything else is disciplined.
3. **Unboxed products, boxed tasks.** Product tiles have no card chrome (image well plus text). Task surfaces (cart summary, checkout summary, forms, order rows) get a bordered panel. This avoids the identical-rounded-cards look.
4. **Structure carries meaning.** A border or divider appears only where it groups or separates real content (list rows, totals). No decorative rules. No numbered markers: nothing in this store is a sequence (checkout is one page).
5. **Radius by hierarchy.** Different surfaces get different radii (tokens in section D). Nested radii are concentric: a child's radius is never larger than its parent's.
6. **Shadows only for things that float.** Static content uses tinted borders. Shadows are reserved for the sticky header on scroll, dropdowns, toasts, the mobile bar, and the drawer.
7. **Motion answers actions.** Animation confirms something the person did (press, add, open, close). The only unprompted motion is one short hero entrance and one success check.
8. **Honest by design.** The demo status is always visible. No fake urgency, no countdowns, no payment-trust badges, no invented reviews.
9. **Every state designed.** Loading, empty, error, success, disabled, and partial states exist for every data-driven surface.

### Do not do (template tells)

- All-caps or tracked-out eyebrow labels above headings
- Gradient washes, glassmorphism, glow effects
- A row of identical rounded cards, each with the same grey shadow
- Arrows appended to button text, middle-dot meta strings (`A · B · C`), spaced em-dash labels
- Monospace small labels for decoration
- Hairline “newspaper” rules everywhere, zero-radius broadsheet styling
- Trust badges for payment or security that the store cannot honestly show
- A dark-mode toggle (out of scope; the site is light only)

### Voice and copy rules

- Sentence case everywhere. Plain verbs, active voice, no filler.
- One name per action across the flow: the button “Add to cart” leads to the message “Added to cart”; “Place demo order” leads to “Order placed”.
- Errors say what happened and how to fix it. They do not apologise or blame.
- Empty screens give the next step.
- Loading text ends with the ellipsis character: “Adding…”, “Placing order…”, “Signing in…”.
- Numerals for counts (“3 items”). Non-breaking space between a number and its unit.
- Typographic quotes in generated copy (“like this”).
- The word **demo** appears wherever an order is placed or shown.

## B. Colour palette

No dark theme. Set `color-scheme: light` and `<meta name="theme-color" content="#EDEFEA">`.

### Core tokens

| Token | HEX | Role |
| --- | --- | --- |
| `--color-fog` | `#EDEFEA` | Page background |
| `--color-paper` | `#F8F9F6` | Raised panels, summary, header bar when scrolled |
| `--color-white` | `#FFFFFF` | Form inputs |
| `--color-well` | `#E2E6DF` | Image wells, skeleton base, info backgrounds |
| `--color-pine` | `#14302A` | Primary text, primary button, dark sections |
| `--color-pine-hover` | `#1D4339` | Primary button hover |
| `--color-pine-press` | `#0E221D` | Primary button pressed |
| `--color-text-2` | `#4A5B56` | Secondary text |
| `--color-text-3` | `#5B6B66` | Tertiary text, captions, placeholders |
| `--color-marigold` | `#F2B632` | Accent: cart count, low-stock mark, focus ring on dark |
| `--color-marigold-soft` | `#FCEFC9` | Low-stock badge, warning panel background |

### Lines and overlays

| Token | Value | Role |
| --- | --- | --- |
| `--line-subtle` | `rgba(20,48,42,0.12)` | Dividers inside panels, list rows |
| `--line-default` | `rgba(20,48,42,0.20)` | Panel borders, chip borders, secondary button border |
| `--line-strong` | `rgba(20,48,42,0.36)` | Hover borders |
| `--border-input` | `#7C8984` | Form control borders (3.6:1 on white, meets non-text contrast) |
| `--scrim` | `rgba(20,48,42,0.48)` | Drawer backdrop |

Borders and shadows are tinted toward Pine (never neutral grey or pure black) so they sit naturally on the green-grey surfaces.

### Semantic colours (always paired with an icon and text, never colour alone)

| Token | HEX | Use |
| --- | --- | --- |
| `--color-error` | `#B3261E` | Error text, error border |
| `--color-error-bg` | `#FBE9E7` | Error alert background |
| `--color-success` | `#1E6B3A` | Success text and icon, in-stock mark |
| `--color-success-bg` | `#E4F2E7` | Success alert background |
| warning | Pine text on `--color-marigold-soft` | Low stock, price-changed notices |
| info | Pine text on `--color-well` | Neutral notices, demo notice |

### On-dark tokens (footer, spotlight panel, announcement bar)

| Token | HEX | Use |
| --- | --- | --- |
| `--on-dark` | `#EDEFEA` | Text on Pine |
| `--on-dark-muted` | `#AFC0B8` | Secondary text on Pine |
| `--line-on-dark` | `rgba(237,239,234,0.16)` | Dividers on Pine |

### Focus ring

| Context | Style |
| --- | --- |
| On Fog, Paper, White | `outline: 2px solid #14302A; outline-offset: 3px` |
| On Pine surfaces | `outline: 2px solid #F2B632; outline-offset: 3px` |
| On photographs (hotspots, card images) | Double ring: 2px White inside, 2px Pine outside |

Use real `outline` (not only `box-shadow`) so rings survive forced-colours mode. Use `:focus-visible`, never bare `:focus`.

### Contrast reference (approximate, verify with a checker and also APCA)

| Pair | Ratio |
| --- | --- |
| Pine on Fog | 12.2:1 |
| Paper text on Pine (primary button) | 13:1 |
| Text-2 on Fog | 6.2:1 |
| Text-3 on Fog | 4.9:1 |
| Text-3 on Paper | 5.3:1 |
| On-dark muted on Pine | 7.4:1 |
| Pine on Marigold | 7.7:1 |
| Error on Paper | 6.2:1 |
| Success on Paper | 6.1:1 |
| Input border on White | 3.6:1 |

Rules: Marigold is **never** used for text or icons on light backgrounds (about 1.6:1). Text-3 is the lightest text allowed. Disabled controls are exempt from contrast but must stay legible.

### Usage proportions

Fog and Paper make up most of every screen. Pine appears as text, the primary button, and the dark sections (announcement bar, spotlight, footer). Marigold covers well under 5% of any screen. Product imagery supplies the rest of the colour.

## C. Typography

### Families

| Role | Family | Why |
| --- | --- | --- |
| Display | **Bricolage Grotesque** (variable) | A grotesque with slightly quirky ink traps and optical sizing. Gives headlines and prices a crafted, non-default feel without being loud |
| Text and UI | **Geist** (variable) | Neutral, precise, highly legible at small sizes. Clearly different in character from the display face |

Both are open-licensed. Install the variable packages through npm (`@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/geist`), copy only the **latin** WOFF2 files into `public/fonts/`, and self-host. Verify during implementation that tabular figures work in the chosen weights; if Geist's tabular numerals are unsuitable, set only the totals column in Geist Mono.

**Loading rules:** `font-display: swap`; preload the two latin WOFF2 files used above the fold; define a metric-adjusted system fallback (`size-adjust`, `ascent-override`) to limit layout shift; limit variable axes to weight (and optical size for Bricolage).

### Scale (fluid between 360 px and 1280 px wide)

| Style | Face and weight | Mobile (size/line) | Desktop (size/line) | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `display-xl` | Bricolage 600 | 44/46 | 76/76 | -0.035em | Home hero headline only |
| `h1` | Bricolage 600 | 34/38 | 52/54 | -0.03em | Page titles |
| `h2` | Bricolage 600 | 26/30 | 38/42 | -0.025em | Section titles |
| `h3` | Bricolage 600 | 20/25 | 26/31 | -0.015em | Panel titles, order numbers |
| `body-lg` | Geist 400 | 17/26 | 18/28 | 0 | Hero support text, PDP intro |
| `body` | Geist 400 | 16/24 | 16/24 | 0 | Default text |
| `ui-strong` | Geist 600 | 16/22 | 16/22 | 0 | Product names, field labels |
| `small` | Geist 400 | 14/20 | 14/20 | 0 | Helper text, meta |
| `caption` | Geist 400 | 13/18 | 13/18 | 0.005em | Captions, badges |
| `button` | Geist 600 | 15/20 | 15/20 | 0.005em | All buttons |
| `price-lg` | Bricolage 600, tabular | 26/30 | 30/34 | -0.02em | PDP price, order total |
| `price-md` | Geist 600, tabular | 17/24 | 17/24 | 0 | Cards, cart lines |

### Rules

- Body size never drops below 16 px; **all form controls are at least 16 px on mobile** (prevents iOS zoom-on-focus).
- Headings use `text-wrap: balance`; paragraphs use `text-wrap: pretty`.
- Measure: body copy max `62ch`; hero headline max about `11ch` per line.
- Weights in use: 400, 600 (Geist) and 600 (Bricolage). Do not add more.
- Prices, quantities, totals, and order numbers use `font-variant-numeric: tabular-nums`.
- No all-caps, no letter-spaced labels, no italic or colour accent on a single headline word.
- Underline is reserved for links in running text and text-style buttons (underline-offset 3px, thickness 1px; 2px on hover).

## D. Tokens: spacing, layout, radius, shadow, motion

### Spacing (4 px base)

`--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-12` 48, `-16` 64, `-20` 80, `-24` 96, `-32` 128.

| Use | Mobile | Desktop |
| --- | --- | --- |
| Gap between major home sections | 64 | 112 |
| Gap between a section title and its content | 24 | 40 |
| Product grid column gap | 16 | 24 |
| Product grid row gap | 32 | 48 |
| Panel inner padding | 16 | 24 |
| Form field vertical gap | 20 | 20 |

### Layout

| Token | Value |
| --- | --- |
| Breakpoints (min-width) | 640 (tablet), 1024 (desktop), 1440 (wide) |
| `--container-max` | 1280 px content, centred. Hero image may bleed to 1440 |
| Gutters | 16 px below 640, 24 px from 640, 40 px from 1024 |
| Grid | 4 columns mobile, 8 tablet, 12 desktop |
| Header height | 56 px mobile, 72 px desktop |
| Announcement bar | 36 px (may wrap to 2 lines on mobile) |
| `scroll-padding-top` | header height + 16 px, so sticky UI never covers a focused element |

### Control sizes

| Control | Height |
| --- | --- |
| Button md (default) | 48 px |
| Button lg (primary CTAs) | 56 px |
| Button sm (desktop-only, never the only path on touch) | 40 px |
| Input, select | 48 px |
| Icon button | 44 × 44 px |
| Chip | 44 px |
| Quantity stepper | 48 px tall, buttons 48 × 48 |

Any visual target smaller than 24 px gets its hit area expanded to at least 24 px; on touch, minimum 44 px.

### Radius (by hierarchy, not one value everywhere)

| Token | Value | Use |
| --- | --- | --- |
| `--radius-xs` | 4 px | Badges, skeleton text lines |
| `--radius-sm` | 8 px | Buttons, inputs, selects, small thumbnails |
| `--radius-md` | 14 px | Image wells, panels, alerts, order rows |
| `--radius-lg` | 24 px | Hero image panel, spotlight panel, drawer edge, auth image panel |
| `--radius-pill` | 999 px | Chips, cart count badge |

### Shadows (layered, tinted, floating layers only)

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-xs` | `0 1px 0 rgba(20,48,42,.04), 0 1px 2px rgba(20,48,42,.06)` | Header after scroll |
| `--shadow-sm` | `0 1px 2px rgba(20,48,42,.06), 0 4px 10px -2px rgba(20,48,42,.08)` | Dropdowns, toasts, hotspot labels |
| `--shadow-md` | `0 2px 4px rgba(20,48,42,.05), 0 12px 28px -6px rgba(20,48,42,.14)` | Mobile sticky bars |
| `--shadow-lg` | `0 4px 8px rgba(20,48,42,.06), 0 24px 56px -12px rgba(20,48,42,.22)` | Drawer |

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-press` | 100 ms | Button and card press |
| `--dur-fast` | 150 ms | Colour, border, small fades |
| `--dur-base` | 200 ms | Dropdowns, chips, accordions |
| `--dur-slow` | 300 ms | Drawer, image hover zoom |
| `--dur-hero` | 600 ms | Hero entrance, once |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entering, hover, most transitions |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Things moving across the screen |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0.0, 1)` | Drawer slide |

**Motion rules**

1. Animate only `transform` and `opacity`, plus explicit `color`, `background-color`, `border-color` for state changes. **Never `transition: all`.**
2. Use CSS transitions for anything interactive (they reverse cleanly mid-flight). Keyframes only for one-shots (hero entrance, success check, skeleton).
3. Exits are faster than entrances (about 70% of the entering duration).
4. Things appear from where they came from: dropdowns scale from 0.96 at the trigger corner; the drawer slides from the left edge. Never animate from `scale(0)`.
5. Press feedback: buttons `scale(0.97)`, product cards `scale(0.985)`, over `--dur-press`.
6. Hover effects live inside `@media (hover: hover) and (pointer: fine)` so touch never gets stuck hover states. Nothing essential depends on hover.
7. Keyboard focus changes are instant (no transition on the outline).
8. No animation on high-frequency interactions: typing in search, changing a quantity number, filter chips (the grid does a 150 ms opacity crossfade at most).
9. No scroll-triggered reveals on sections.
10. **Reduced motion:** under `prefers-reduced-motion: reduce`, remove transforms and the hero entrance, drop the hotspot pulse, show skeletons as a static fill, draw the success check instantly, and limit any remaining fade to 100 ms or less.

### Z-index

Header 40, dropdown 50, drawer and its backdrop 60, toast region 70.
