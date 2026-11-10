# Deskline Self-Hosted Fonts

This directory contains the self-hosted web font assets for the Deskline e-commerce store, acquired per the font workflow in `docs/CodeAlpha_Backend_Contract_Addendum.md` §7.9.

Per specification rules (Addendum §7.9, DR-23, STAT-05, STAT-14), font packages are used only during a one-time acquisition step and MUST NOT remain in `package.json` or `package-lock.json`. Only the optimized `.woff2` files, licenses, and this manifest are retained in the repository.

---

## Bricolage Grotesque Variable

- **Source Package:** `@fontsource-variable/bricolage-grotesque`
- **Version:** `5.3.0`
- **Source URL:** `https://github.com/ateliertriay/bricolage` (Fontsource: `https://fontsource.org/fonts/bricolage-grotesque`)
- **License:** SIL Open Font License, Version 1.1
- **License File:** `OFL-bricolage-grotesque.txt`
- **Subsets Retained:** `latin`, `latin-ext`
- **Axes Retained:** `wght` (weight: 200–800)
- **Date Acquired:** `2026-11-07`

### Retained Files and Checksums

| File | Size (Bytes) | SHA-256 Checksum |
|---|---|---|
| `bricolage-grotesque-latin-wght-normal.woff2` | 41,344 | `a97804dc9fbe5fc972a08018c5eda4dab7ef2346f64c57e61419d05e6de4ea1c` |
| `bricolage-grotesque-latin-ext-wght-normal.woff2` | 18,668 | `e808f16b56f84dc7933e498cc8a41d4a5cd853adc6eef154584baa5de1008b15` |
| `OFL-bricolage-grotesque.txt` | 4,401 | `923f4ddf0fd39f9b7794ab0df7332f3d95dc43e8ad7ec2289d6d9e8491177f51` |

---

## Geist Variable

- **Source Package:** `@fontsource-variable/geist`
- **Version:** `5.3.0`
- **Source URL:** `https://github.com/vercel/geist-font` (Fontsource: `https://fontsource.org/fonts/geist`)
- **License:** SIL Open Font License, Version 1.1
- **License File:** `OFL-geist.txt`
- **Subsets Retained:** `latin`, `latin-ext`
- **Axes Retained:** `wght` (weight: 100–900)
- **Date Acquired:** `2026-11-07`

### Retained Files and Checksums

| File | Size (Bytes) | SHA-256 Checksum |
|---|---|---|
| `geist-latin-wght-normal.woff2` | 29,400 | `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1` |
| `geist-latin-ext-wght-normal.woff2` | 16,512 | `824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f` |
| `OFL-geist.txt` | 4,486 | `71609cbb5c78b5870d712eab73a31d76622635c6ed034ab5cee3b9ecbda8685f` |

---

## Glyph Verification (MAN-20)

- Indian Rupee symbol (₹, U+20B9) is supplied by the `latin-ext` subset (`U+20AD-20C0`) in both font families.
- In `public/css/fonts.css`, both `latin` and `latin-ext` subsets are defined with respective `unicode-range` rules and `font-display: swap`.

