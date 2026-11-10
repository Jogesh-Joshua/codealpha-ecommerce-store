/**
 * tests/api/products.test.js
 *
 * API-04 to API-20, API-64, SECT-09: Products endpoints tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startTestServer } from '../helpers/server.js';
import { assertSafeTestDatabase, getTestClient, resetTestDb } from '../helpers/db.js';
import { loadTestConfig } from '../helpers/config.js';

const { Pool } = pg;

assertSafeTestDatabase();

describe('Products API (API-04 to API-20, API-64, SECT-09)', () => {
  let testEnv;
  let pool;
  let client;

  before(async () => {
    client = await getTestClient();
    await resetTestDb(client);

    const config = loadTestConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    testEnv = await startTestServer({ config, pool });
  });

  after(async () => {
    await testEnv.close();
    await pool.end();
    await client.end();
  });

  // ---------------------------------------------------------------------------
  // API-04: Default listing
  // ---------------------------------------------------------------------------
  it('API-04: default GET /api/products returns 12 items, total 20, 2 pages, featured sort', async () => {
    const res = await testEnv.request('/api/products');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.items.length, 12);
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.limit, 12);
    assert.equal(data.pagination.total, 20);
    assert.equal(data.pagination.totalPages, 2);
    assert.equal(data.query.sort, 'featured');
    assert.equal(data.query.search, null);
    assert.equal(data.query.category, null);

    // Featured items (ranks 1 to 4) must appear first
    const expectedTopFeatured = [
      'felt-desk-mat-charcoal',
      'aluminium-laptop-stand',
      'led-desk-lamp-dimmable',
      'walnut-desk-tray',
    ];
    const actualFirstFour = data.items.slice(0, 4).map((p) => p.slug);
    assert.deepEqual(actualFirstFour, expectedTopFeatured);
  });

  // ---------------------------------------------------------------------------
  // API-05: Page 2 non-overlapping
  // ---------------------------------------------------------------------------
  it('API-05: page=2 returns remaining 8 products without overlap', async () => {
    const page1Res = await testEnv.request('/api/products?page=1');
    const page1Data = await page1Res.json();
    const page1Slugs = new Set(page1Data.items.map((p) => p.slug));

    const page2Res = await testEnv.request('/api/products?page=2');
    assert.equal(page2Res.status, 200);

    const page2Data = await page2Res.json();
    assert.equal(page2Data.items.length, 8);
    assert.equal(page2Data.pagination.page, 2);

    for (const item of page2Data.items) {
      assert.ok(
        !page1Slugs.has(item.slug),
        `Product "${item.slug}" overlaps between page 1 and page 2`,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // API-06: Limit bounds
  // ---------------------------------------------------------------------------
  it('API-06: limit=1 and limit=48 work; limit=0, 49, abc return 400 VALIDATION_ERROR', async () => {
    // Valid limits
    const res1 = await testEnv.request('/api/products?limit=1');
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.items.length, 1);
    assert.equal(data1.pagination.limit, 1);
    assert.equal(data1.pagination.totalPages, 20);

    const res48 = await testEnv.request('/api/products?limit=48');
    assert.equal(res48.status, 200);
    const data48 = await res48.json();
    assert.equal(data48.items.length, 20);
    assert.equal(data48.pagination.limit, 48);
    assert.equal(data48.pagination.totalPages, 1);

    // Invalid limits
    for (const badLimit of ['0', '49', 'abc', '-5', '1.5']) {
      const resBad = await testEnv.request(`/api/products?limit=${badLimit}`);
      assert.equal(resBad.status, 400);
      const body = await resBad.json();
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.fields.limit);
      assert.ok(body.error.requestId);
    }
  });

  // ---------------------------------------------------------------------------
  // API-07: Case-insensitive search on name
  // ---------------------------------------------------------------------------
  it('API-07: search matches product names case-insensitively (e.g. STAND)', async () => {
    const res = await testEnv.request('/api/products?search=STAND');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(data.items.length > 0);

    // Verify products with "stand" in their name are matched by uppercase "STAND"
    const slugs = data.items.map((p) => p.slug);
    assert.ok(slugs.includes('aluminium-laptop-stand'), 'Should match aluminium-laptop-stand');
    assert.ok(slugs.includes('adjustable-phone-stand'), 'Should match adjustable-phone-stand');
  });

  // ---------------------------------------------------------------------------
  // API-08: Search matches summary and description
  // ---------------------------------------------------------------------------
  it('API-08: search matches words appearing only in summary or description', async () => {
    // "deadening" appears only in summary/description of felt-desk-mat-charcoal
    const res = await testEnv.request('/api/products?search=deadening');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].slug, 'felt-desk-mat-charcoal');
  });

  // ---------------------------------------------------------------------------
  // API-09: Wildcard escaping
  // ---------------------------------------------------------------------------
  it('API-09: search of % or _ matches nothing unless literally present in catalog', async () => {
    const resPercent = await testEnv.request('/api/products?search=%');
    assert.equal(resPercent.status, 200);
    const dataPercent = await resPercent.json();
    assert.equal(dataPercent.items.length, 0);

    const resUnderscore = await testEnv.request('/api/products?search=_');
    assert.equal(resUnderscore.status, 200);
    const dataUnderscore = await resUnderscore.json();
    assert.equal(dataUnderscore.items.length, 0);

    const resBackslash = await testEnv.request('/api/products?search=\\');
    assert.equal(resBackslash.status, 200);
    const dataBackslash = await resBackslash.json();
    assert.equal(dataBackslash.items.length, 0);
  });

  // ---------------------------------------------------------------------------
  // API-10 & SECT-09: SQL injection resilience
  // ---------------------------------------------------------------------------
  it('API-10 & SECT-09: SQL injection strings in query parameters cause no errors or schema corruption', async () => {
    const maliciousSearches = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "1; SELECT pg_sleep(1); --",
      "' UNION SELECT null, null, null, null, null --",
    ];

    for (const injection of maliciousSearches) {
      const res = await testEnv.request(`/api/products?search=${encodeURIComponent(injection)}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.items.length, 0);
    }

    // Verify database tables still exist
    const checkUsers = await client.query('SELECT COUNT(*) FROM users');
    assert.ok(checkUsers.rows.length > 0);
  });

  // ---------------------------------------------------------------------------
  // API-11: Category filtering
  // ---------------------------------------------------------------------------
  it('API-11: category=lighting filters properly; unknown returns empty; malformed returns 400', async () => {
    // Valid existing category
    const resLighting = await testEnv.request('/api/products?category=lighting');
    assert.equal(resLighting.status, 200);
    const dataLighting = await resLighting.json();
    assert.equal(dataLighting.items.length, 4);
    assert.equal(dataLighting.pagination.total, 4);
    for (const item of dataLighting.items) {
      assert.equal(item.category.slug, 'lighting');
    }

    // Well-formed unknown category returns 200 with empty items
    const resUnknown = await testEnv.request('/api/products?category=unknown-category-slug');
    assert.equal(resUnknown.status, 200);
    const dataUnknown = await resUnknown.json();
    assert.equal(dataUnknown.items.length, 0);
    assert.equal(dataUnknown.pagination.total, 0);

    // Malformed category returns 400 VALIDATION_ERROR
    const resMalformed = await testEnv.request('/api/products?category=Invalid_Category!');
    assert.equal(resMalformed.status, 400);
    const bodyMalformed = await resMalformed.json();
    assert.equal(bodyMalformed.error.code, 'VALIDATION_ERROR');
    assert.ok(bodyMalformed.error.fields.category);
  });

  // ---------------------------------------------------------------------------
  // API-12: Sort orders and tie-breaker
  // ---------------------------------------------------------------------------
  it('API-12: all five sort orders return documented sequences with stable id tie-breaker', async () => {
    // 1. price_asc: prices must be non-decreasing, compared as integers
    const resPriceAsc = await testEnv.request('/api/products?sort=price_asc&limit=48');
    assert.equal(resPriceAsc.status, 200);
    const dataPriceAsc = await resPriceAsc.json();
    for (let i = 1; i < dataPriceAsc.items.length; i++) {
      const prev = dataPriceAsc.items[i - 1];
      const curr = dataPriceAsc.items[i];
      assert.ok(
        prev.priceMinor <= curr.priceMinor,
        `price_asc violation: ${prev.priceMinor} > ${curr.priceMinor}`,
      );
      if (prev.priceMinor === curr.priceMinor) {
        assert.ok(prev.id < curr.id, `price_asc tie-breaker violation: id ${prev.id} >= ${curr.id}`);
      }
    }

    // 2. price_desc: prices must be non-increasing
    const resPriceDesc = await testEnv.request('/api/products?sort=price_desc&limit=48');
    assert.equal(resPriceDesc.status, 200);
    const dataPriceDesc = await resPriceDesc.json();
    for (let i = 1; i < dataPriceDesc.items.length; i++) {
      const prev = dataPriceDesc.items[i - 1];
      const curr = dataPriceDesc.items[i];
      assert.ok(
        prev.priceMinor >= curr.priceMinor,
        `price_desc violation: ${prev.priceMinor} < ${curr.priceMinor}`,
      );
      if (prev.priceMinor === curr.priceMinor) {
        assert.ok(prev.id < curr.id, `price_desc tie-breaker violation: id ${prev.id} >= ${curr.id}`);
      }
    }

    // 3. name_asc: lower(name) alphabetical order
    const resNameAsc = await testEnv.request('/api/products?sort=name_asc&limit=48');
    assert.equal(resNameAsc.status, 200);
    const dataNameAsc = await resNameAsc.json();
    for (let i = 1; i < dataNameAsc.items.length; i++) {
      const prev = dataNameAsc.items[i - 1].name.toLowerCase();
      const curr = dataNameAsc.items[i].name.toLowerCase();
      assert.ok(
        prev.localeCompare(curr) <= 0,
        `name_asc violation: "${prev}" > "${curr}"`,
      );
    }

    // 4. newest: created_at descending
    const resNewest = await testEnv.request('/api/products?sort=newest&limit=48');
    assert.equal(resNewest.status, 200);
    const dataNewest = await resNewest.json();
    assert.equal(dataNewest.items.length, 20);

    // 5. featured: ranks 1 to 4 first, then remainder by id
    const resFeatured = await testEnv.request('/api/products?sort=featured&limit=48');
    assert.equal(resFeatured.status, 200);
    const dataFeatured = await resFeatured.json();
    assert.equal(dataFeatured.items[0].slug, 'felt-desk-mat-charcoal');
    assert.equal(dataFeatured.items[1].slug, 'aluminium-laptop-stand');
    assert.equal(dataFeatured.items[2].slug, 'led-desk-lamp-dimmable');
    assert.equal(dataFeatured.items[3].slug, 'walnut-desk-tray');
  });

  // ---------------------------------------------------------------------------
  // API-13: Invalid sort & repeated parameters
  // ---------------------------------------------------------------------------
  it('API-13: invalid sort and repeated parameters return 400 VALIDATION_ERROR', async () => {
    const resInvalidSort = await testEnv.request('/api/products?sort=invalid_sort');
    assert.equal(resInvalidSort.status, 400);
    const bodySort = await resInvalidSort.json();
    assert.equal(bodySort.error.code, 'VALIDATION_ERROR');
    assert.ok(bodySort.error.fields.sort);

    const resRepeated = await testEnv.request('/api/products?sort=featured&sort=newest');
    assert.equal(resRepeated.status, 400);
    const bodyRepeated = await resRepeated.json();
    assert.equal(bodyRepeated.error.code, 'VALIDATION_ERROR');
    assert.ok(bodyRepeated.error.fields.sort);
  });

  // ---------------------------------------------------------------------------
  // API-14: Inactive product omitted
  // ---------------------------------------------------------------------------
  it('API-14: inactive product never appears in lists or counts', async () => {
    const res = await testEnv.request('/api/products?limit=48');
    const data = await res.json();

    const inactiveItem = data.items.find((p) => p.slug === 'archived-basic-mouse-pad');
    assert.equal(inactiveItem, undefined);
    assert.equal(data.pagination.total, 20);
  });

  // ---------------------------------------------------------------------------
  // API-15: Stock status and quantity rules
  // ---------------------------------------------------------------------------
  it('API-15: stockStatus calculation rules and stock leak protection', async () => {
    const res = await testEnv.request('/api/products?limit=48');
    const data = await res.json();

    // 1. Out of stock: wireless-charging-desk-mat (stock = 0)
    const oos = data.items.find((p) => p.slug === 'wireless-charging-desk-mat');
    assert.ok(oos);
    assert.equal(oos.stockStatus, 'out_of_stock');
    assert.equal(oos.lowStockRemaining, null);
    assert.equal(oos.maxPurchasableQuantity, 0);

    // 2. Low stock: felt-desk-mat-moss (stock = 3)
    const low = data.items.find((p) => p.slug === 'felt-desk-mat-moss');
    assert.ok(low);
    assert.equal(low.stockStatus, 'low_stock');
    assert.equal(low.lowStockRemaining, 3);
    assert.equal(low.maxPurchasableQuantity, 3);

    // 3. In stock: felt-desk-mat-charcoal (stock = 40)
    const inStock = data.items.find((p) => p.slug === 'felt-desk-mat-charcoal');
    assert.ok(inStock);
    assert.equal(inStock.stockStatus, 'in_stock');
    assert.equal(inStock.lowStockRemaining, null);
    assert.equal(inStock.maxPurchasableQuantity, 10); // capped at min(stock, 10)

    // Verify exact stock > 5 is NEVER leaked in any field
    for (const item of data.items) {
      assert.equal(item.stock_quantity, undefined);
      assert.equal(item.stock, undefined);
      if (item.stockStatus === 'in_stock') {
        assert.equal(item.lowStockRemaining, null);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // API-16: Public DTO fields only
  // ---------------------------------------------------------------------------
  it('API-16: ProductSummary contains only documented public fields', async () => {
    const res = await testEnv.request('/api/products');
    const data = await res.json();

    const allowedSummaryFields = new Set([
      'id',
      'slug',
      'name',
      'summary',
      'priceMinor',
      'currency',
      'category',
      'image',
      'stockStatus',
      'maxPurchasableQuantity',
      'lowStockRemaining',
    ]);

    for (const item of data.items) {
      for (const k of Object.keys(item)) {
        assert.ok(
          allowedSummaryFields.has(k),
          `ProductSummary DTO contains forbidden field "${k}"`,
        );
      }
      assert.equal(item.category_id, undefined);
      assert.equal(item.is_active, undefined);
      assert.equal(item.featured_rank, undefined);
      assert.equal(item.created_at, undefined);
      assert.equal(item.updated_at, undefined);
    }
  });

  // ---------------------------------------------------------------------------
  // API-17: Beyond-last-page behavior
  // ---------------------------------------------------------------------------
  it('API-17: requesting page beyond the last returns 200 with empty items and requested page', async () => {
    const res = await testEnv.request('/api/products?page=3');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.deepEqual(data.items, []);
    assert.equal(data.pagination.page, 3);
    assert.equal(data.pagination.limit, 12);
    assert.equal(data.pagination.total, 20);
    assert.equal(data.pagination.totalPages, 2);
  });

  // ---------------------------------------------------------------------------
  // API-18: Caching headers
  // ---------------------------------------------------------------------------
  it('API-18: Cache-Control is public, s-maxage=30, stale-while-revalidate=60', async () => {
    const resList = await testEnv.request('/api/products');
    assert.equal(
      resList.headers.get('cache-control'),
      'public, s-maxage=30, stale-while-revalidate=60',
    );

    const resDetail = await testEnv.request('/api/products/felt-desk-mat-charcoal');
    assert.equal(
      resDetail.headers.get('cache-control'),
      'public, s-maxage=30, stale-while-revalidate=60',
    );
  });

  // ---------------------------------------------------------------------------
  // API-19: Product detail endpoint
  // ---------------------------------------------------------------------------
  it('API-19: GET /api/products/:slug returns ProductDetail with specs and ordered images', async () => {
    const res = await testEnv.request('/api/products/felt-desk-mat-charcoal');
    assert.equal(res.status, 200);

    const data = await res.json();
    const p = data.product;
    assert.ok(p);

    assert.equal(p.slug, 'felt-desk-mat-charcoal');
    assert.equal(p.name, 'Felt desk mat, charcoal');
    assert.ok(typeof p.description === 'string' && p.description.length > 0);
    assert.equal(p.priceMinor, 149900);
    assert.equal(p.currency, 'INR');
    assert.deepEqual(p.category, { slug: 'desk-mats', name: 'Desk mats' });

    // Specs array
    assert.ok(Array.isArray(p.specs));
    assert.ok(p.specs.length >= 3);
    for (const spec of p.specs) {
      assert.ok(typeof spec.label === 'string');
      assert.ok(typeof spec.value === 'string');
    }

    // Ordered images
    assert.ok(Array.isArray(p.images));
    assert.equal(p.images.length, 3);
    assert.equal(p.images[0].url, '/images/products/felt-desk-mat-charcoal-1.webp');
    assert.equal(p.images[1].url, '/images/products/felt-desk-mat-charcoal-2.webp');
    assert.equal(p.images[2].url, '/images/products/felt-desk-mat-charcoal-3.webp');

    // First image equals p.image
    assert.deepEqual(p.image, p.images[0]);

    // ISO 8601 createdAt
    assert.ok(p.createdAt);
    assert.ok(!isNaN(Date.parse(p.createdAt)));

    // No internal columns
    assert.equal(p.category_id, undefined);
    assert.equal(p.is_active, undefined);
    assert.equal(p.featured_rank, undefined);
    assert.equal(p.stock_quantity, undefined);
    assert.equal(p.updated_at, undefined);
  });

  // ---------------------------------------------------------------------------
  // API-20: Unknown, malformed and inactive product slugs return 404
  // ---------------------------------------------------------------------------
  it('API-20: unknown slug, malformed slug, and inactive slug return 404 PRODUCT_NOT_FOUND', async () => {
    // 1. Unknown slug
    const resUnknown = await testEnv.request('/api/products/non-existent-product-slug');
    assert.equal(resUnknown.status, 404);
    const bodyUnknown = await resUnknown.json();
    assert.equal(bodyUnknown.error.code, 'PRODUCT_NOT_FOUND');
    assert.ok(bodyUnknown.error.requestId);

    // 2. Malformed slug (uppercase, underscores, special characters)
    const resMalformed = await testEnv.request('/api/products/Invalid_Slug!');
    assert.equal(resMalformed.status, 404);
    const bodyMalformed = await resMalformed.json();
    assert.equal(bodyMalformed.error.code, 'PRODUCT_NOT_FOUND');
    assert.ok(bodyMalformed.error.requestId);

    // 3. Inactive product slug (archived-basic-mouse-pad)
    const resInactive = await testEnv.request('/api/products/archived-basic-mouse-pad');
    assert.equal(resInactive.status, 404);
    const bodyInactive = await resInactive.json();
    assert.equal(bodyInactive.error.code, 'PRODUCT_NOT_FOUND');
    assert.ok(bodyInactive.error.requestId);
  });

  // ---------------------------------------------------------------------------
  // API-64: Numeric types serialization check
  // ---------------------------------------------------------------------------
  it('API-64: all money and count fields are JSON safe integers, none are strings', async () => {
    const res = await testEnv.request('/api/products?limit=48');
    const data = await res.json();

    assert.equal(typeof data.pagination.page, 'number');
    assert.ok(Number.isSafeInteger(data.pagination.page));

    assert.equal(typeof data.pagination.limit, 'number');
    assert.ok(Number.isSafeInteger(data.pagination.limit));

    assert.equal(typeof data.pagination.total, 'number');
    assert.ok(Number.isSafeInteger(data.pagination.total));

    assert.equal(typeof data.pagination.totalPages, 'number');
    assert.ok(Number.isSafeInteger(data.pagination.totalPages));

    for (const item of data.items) {
      assert.equal(typeof item.id, 'number');
      assert.ok(Number.isSafeInteger(item.id));

      assert.equal(typeof item.priceMinor, 'number');
      assert.ok(Number.isSafeInteger(item.priceMinor));
      assert.ok(item.priceMinor > 0);

      assert.equal(typeof item.maxPurchasableQuantity, 'number');
      assert.ok(Number.isSafeInteger(item.maxPurchasableQuantity));
      assert.ok(item.maxPurchasableQuantity >= 0);

      if (item.lowStockRemaining !== null) {
        assert.equal(typeof item.lowStockRemaining, 'number');
        assert.ok(Number.isSafeInteger(item.lowStockRemaining));
        assert.ok(item.lowStockRemaining >= 1 && item.lowStockRemaining <= 5);
      }

      if (item.image) {
        assert.equal(typeof item.image.width, 'number');
        assert.ok(Number.isSafeInteger(item.image.width));
        assert.equal(typeof item.image.height, 'number');
        assert.ok(Number.isSafeInteger(item.image.height));
      }
    }
  });
});

