/**
 * scripts/seed.js
 *
 * Seed script: upserts 5 categories and 21 products from db/seeds/catalog.js.
 *
 * Usage:
 *   node --env-file=.env scripts/seed.js              (reads DATABASE_URL_UNPOOLED)
 *   node --env-file=.env scripts/seed.js --reset-stock --yes  (also resets stock)
 *   import { runSeed } from './scripts/seed.js'       (used by test-db-reset)
 *
 * Rules (§7.4):
 *  - Reads DATABASE_URL_UNPOOLED. Refuses if host contains -pooler.
 *  - Works in one transaction.
 *  - Upserts categories by slug.
 *  - Upserts products by slug. On first insert sets stock_quantity; on re-runs
 *    does NOT overwrite stock (unless --reset-stock --yes is passed).
 *  - Replaces product_images rows for seeded products (delete + insert) in the
 *    same transaction.
 *  - Validates every product before writing (price_minor, slug, image URLs).
 *  - Never touches users, sessions, orders, order_items, or rate_limits.
 *  - Never deletes products missing from the catalog (retire via is_active=false).
 *  - Cleans up expired sessions and old rate_limit rows at the end.
 *  - Prints counts at the end.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { categories, products } from '../db/seeds/catalog.js';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Validate all catalogue entries before touching the database. */
function validateCatalog() {
  const errors = [];
  const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const imagePathPattern = /^\/images\//;

  for (const p of products) {
    if (!slugPattern.test(p.slug)) {
      errors.push(`Product "${p.slug}": slug does not match ^[a-z0-9]+(-[a-z0-9]+)*$`);
    }
    if (!Number.isInteger(p.price_minor) || p.price_minor <= 0 || p.price_minor % 100 !== 0) {
      errors.push(
        `Product "${p.slug}": price_minor (${p.price_minor}) must be a positive integer multiple of 100`,
      );
    }
    for (const img of p.images) {
      if (!imagePathPattern.test(img.url)) {
        errors.push(`Product "${p.slug}": image URL "${img.url}" must start with /images/`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Catalog validation failed:\n' + errors.map((e) => '  ' + e).join('\n'));
  }
}

/**
 * Run the seed against the given connection string.
 *
 * @param {string} connectionString  Direct (non-pooled) connection string.
 * @param {{ resetStock?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function runSeed(connectionString, options = {}) {
  // Safety: refuse pooler endpoints.
  let host, dbname;
  try {
    const u = new URL(connectionString);
    host = u.hostname;
    dbname = u.pathname.replace(/^\//, '') || '(default)';
  } catch {
    throw new Error('seed: invalid connection string (cannot parse URL)');
  }
  if (host.includes('-pooler')) {
    throw new Error(
      `seed: refusing to run against a pooled host (${host}). ` +
        'Use the direct (unpooled) connection string.',
    );
  }
  console.log(`seed: target ${host}/${dbname}`);

  // Validate the catalog data before connecting.
  validateCatalog();

  const { resetStock = false } = options;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    try {
      // ── 1. Upsert categories ────────────────────────────────────────────
      for (const cat of categories) {
        await client.query(
          `INSERT INTO categories (slug, name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (slug) DO UPDATE
             SET name = EXCLUDED.name,
                 sort_order = EXCLUDED.sort_order`,
          [cat.slug, cat.name, cat.sort_order],
        );
      }

      // Build a category slug → id map.
      const { rows: catRows } = await client.query('SELECT id, slug FROM categories');
      const catIdMap = new Map(catRows.map((r) => [r.slug, r.id]));

      // ── 2. Upsert products ──────────────────────────────────────────────
      for (const p of products) {
        const categoryId = catIdMap.get(p.category);
        if (!categoryId) {
          throw new Error(`seed: unknown category slug "${p.category}" for product "${p.slug}"`);
        }

        if (resetStock) {
          // Reset stock to the catalog value.
          await client.query(
            `INSERT INTO products
               (category_id, slug, name, summary, description, specs, price_minor,
                stock_quantity, is_active, featured_rank)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (slug) DO UPDATE
               SET category_id   = EXCLUDED.category_id,
                   name          = EXCLUDED.name,
                   summary       = EXCLUDED.summary,
                   description   = EXCLUDED.description,
                   specs         = EXCLUDED.specs,
                   price_minor   = EXCLUDED.price_minor,
                   stock_quantity = EXCLUDED.stock_quantity,
                   is_active     = EXCLUDED.is_active,
                   featured_rank = EXCLUDED.featured_rank`,
            [
              categoryId, p.slug, p.name, p.summary, p.description,
              JSON.stringify(p.specs), p.price_minor, p.stock_quantity,
              p.is_active, p.featured_rank,
            ],
          );
        } else {
          // Do NOT overwrite stock_quantity on re-runs.
          await client.query(
            `INSERT INTO products
               (category_id, slug, name, summary, description, specs, price_minor,
                stock_quantity, is_active, featured_rank)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (slug) DO UPDATE
               SET category_id   = EXCLUDED.category_id,
                   name          = EXCLUDED.name,
                   summary       = EXCLUDED.summary,
                   description   = EXCLUDED.description,
                   specs         = EXCLUDED.specs,
                   price_minor   = EXCLUDED.price_minor,
                   is_active     = EXCLUDED.is_active,
                   featured_rank = EXCLUDED.featured_rank`,
            [
              categoryId, p.slug, p.name, p.summary, p.description,
              JSON.stringify(p.specs), p.price_minor, p.stock_quantity,
              p.is_active, p.featured_rank,
            ],
          );
        }
      }

      // Build a product slug → id map.
      const { rows: prodRows } = await client.query('SELECT id, slug FROM products');
      const prodIdMap = new Map(prodRows.map((r) => [r.slug, r.id]));

      // ── 3. Replace product_images for seeded products ───────────────────
      const seededSlugs = products.map((p) => p.slug);
      const seededIds = seededSlugs.map((s) => prodIdMap.get(s)).filter(Boolean);

      if (seededIds.length > 0) {
        // Delete existing images for seeded products.
        await client.query(
          `DELETE FROM product_images WHERE product_id = ANY($1::int[])`,
          [seededIds],
        );
      }

      for (const p of products) {
        const productId = prodIdMap.get(p.slug);
        if (!productId) continue;
        for (const img of p.images) {
          await client.query(
            `INSERT INTO product_images (product_id, url, alt, width, height, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [productId, img.url, img.alt, img.width, img.height, img.sort_order],
          );
        }
      }

      // ── 4. Cleanup: expired sessions and old rate-limit windows ─────────
      await client.query(`DELETE FROM sessions WHERE expires_at < now() - interval '1 day'`);
      await client.query(
        `DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`,
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // ── 5. Print counts ─────────────────────────────────────────────────────
    const { rows: counts } = await client.query(`
      SELECT
        (SELECT count(*) FROM categories)                              AS categories,
        (SELECT count(*) FROM products)                                AS total_products,
        (SELECT count(*) FROM products WHERE is_active)                AS active_products,
        (SELECT count(*) FROM products WHERE is_active AND stock_quantity = 0) AS out_of_stock,
        (SELECT count(*) FROM products WHERE is_active AND stock_quantity BETWEEN 1 AND 5) AS low_stock
    `);
    const c = counts[0];
    console.log(
      `seed: done. categories=${c.categories} products=${c.total_products} ` +
        `(active=${c.active_products}, out_of_stock=${c.out_of_stock}, low_stock=${c.low_stock})`,
    );
  } finally {
    await client.end();
  }
}

// Run directly when invoked as a script.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error('seed: DATABASE_URL_UNPOOLED is not set');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const hasResetStock = args.includes('--reset-stock');
  const hasYes = args.includes('--yes');

  if (hasResetStock && !hasYes) {
    console.error('seed: --reset-stock requires --yes to confirm you want to overwrite stock quantities');
    process.exit(1);
  }

  runSeed(connectionString, { resetStock: hasResetStock && hasYes }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

