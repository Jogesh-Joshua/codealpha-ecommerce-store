/**
 * tests/static/frontend-rules.test.js
 *
 * Automated verification of static constraints for Phase 7:
 * - STAT-01: No innerHTML, insertAdjacentHTML, document.write, eval(, new Function in public/js
 * - STAT-02: No inline <script> bodies, on*=, style= in public/*.html
 * - STAT-03: No http:// or https:// URLs in public/ (except SVG namespace & footer repo link)
 * - STAT-09: Browser storage use limited to authorized keys (SEC-35); no tokens in storage
 * - STAT-10: target="_blank" has rel="noopener noreferrer"
 * - STAT-11: HTML validity: lang, unique title, exactly one h1, viewport, unique ids, img alt/width/height
 * - STAT-12: Zero payment fields / SDKs / gateways
 * - STAT-14: Self-hosted font assets integrity and zero font dependencies in package.json
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../..');
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const JS_DIR = join(PUBLIC_DIR, 'js');
const FONTS_DIR = join(PUBLIC_DIR, 'fonts');

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = join(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    }),
  );
  return files.flat();
}

describe('Frontend Static Checks (Phase 7)', () => {
  it('STAT-01: No innerHTML, insertAdjacentHTML, document.write, eval(, or new Function in public/js', async () => {
    const files = await getFiles(JS_DIR);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'public/js must contain JavaScript files');

    const forbidden = ['innerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'];

    for (const file of jsFiles) {
      const content = await readFile(file, 'utf8');
      for (const pattern of forbidden) {
        assert.ok(
          !content.includes(pattern),
          `File ${file} contains forbidden pattern "${pattern}" (STAT-01 violation)`
        );
      }
    }
  });

  it('STAT-02: No inline <script> bodies, no on*= attributes, no style= attributes in public/*.html', async () => {
    const entries = await readdir(PUBLIC_DIR, { withFileTypes: true });
    const htmlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.html')).map(e => join(PUBLIC_DIR, e.name));

    assert.ok(htmlFiles.length > 0, 'public/ must contain HTML files');

    for (const file of htmlFiles) {
      const content = await readFile(file, 'utf8');

      // Check for inline script bodies: <script>...</script> where body has non-whitespace
      const scriptMatches = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const sm of scriptMatches) {
        const body = sm.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        assert.strictEqual(body, '', `File ${file} contains inline script body: ${body} (STAT-02 violation)`);
      }

      // Check for inline on*= event handlers
      const onHandlerMatch = content.match(/\s+on[a-z]+\s*=/i);
      assert.ok(!onHandlerMatch, `File ${file} contains inline event handler: ${onHandlerMatch?.[0]} (STAT-02 violation)`);

      // Check for inline style= attributes
      const styleAttrMatch = content.match(/\s+style\s*=/i);
      assert.ok(!styleAttrMatch, `File ${file} contains inline style attribute (STAT-02 violation)`);
    }
  });

  it('STAT-03: No http:// or https:// URLs in public/ except SVG namespace and repo link', async () => {
    const allPublicFiles = await getFiles(PUBLIC_DIR);
    const textFiles = allPublicFiles.filter(f => /\.(html|css|js)$/.test(f));

    for (const file of textFiles) {
      const content = await readFile(file, 'utf8');
      const matches = content.match(/https?:\/\/[^\s"'`<>)]+/g) || [];

      for (const m of matches) {
        const isAllowedSvg = (m === 'http://www.w3.org/2000/svg');
        const isAllowedRepo = m.includes('github.com');
        assert.ok(
          isAllowedSvg || isAllowedRepo,
          `File ${file} contains non-relative URL: ${m} (STAT-03 violation)`
        );
      }
    }
  });

  it('STAT-09: Browser storage usage in public/js is limited to authorized keys and never writes tokens', async () => {
    const files = await getFiles(JS_DIR);
    const jsFiles = files.filter(f => f.endsWith('.js'));

    for (const file of jsFiles) {
      const content = await readFile(file, 'utf8');

      // Check that no token writing occurs
      assert.ok(!/setItem\([^)]*token/i.test(content), `File ${file} writes token to storage (STAT-09 violation)`);

      // Check storage keys
      const storageKeyMatches = content.match(/(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g) || [];
      for (const m of storageKeyMatches) {
        assert.ok(
          m.includes('deskline.cart.v1') || m.includes('deskline.order.confirmed'),
          `File ${file} uses unauthorized storage key in ${m} (STAT-09 violation)`
        );
      }
    }
  });

  it('STAT-10: Every target="_blank" link has rel="noopener noreferrer"', async () => {
    const entries = await readdir(PUBLIC_DIR, { withFileTypes: true });
    const htmlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.html')).map(e => join(PUBLIC_DIR, e.name));

    for (const file of htmlFiles) {
      const content = await readFile(file, 'utf8');
      const blankLinks = content.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || [];

      for (const link of blankLinks) {
        assert.ok(
          /rel=["'][^"']*noopener[^"']*noreferrer[^"']*["']/i.test(link) ||
          /rel=["'][^"']*noreferrer[^"']*noopener[^"']*["']/i.test(link),
          `File ${file} has target="_blank" link missing rel="noopener noreferrer": ${link} (STAT-10 violation)`
        );
      }
    }
  });

  it('STAT-11: HTML validity: lang, unique title, exactly one h1, viewport, unique element ids, and img alt/width/height', async () => {
    const entries = await readdir(PUBLIC_DIR, { withFileTypes: true });
    const htmlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.html')).map(e => join(PUBLIC_DIR, e.name));
    const titles = new Set();

    for (const file of htmlFiles) {
      const content = await readFile(file, 'utf8');

      // lang attribute
      assert.ok(/<html[^>]+lang=["'][a-z]{2}["']/i.test(content), `File ${file} missing lang attribute`);

      // Title presence & uniqueness
      const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      assert.ok(titleMatch, `File ${file} missing <title> tag`);
      const titleText = titleMatch[1].trim();
      assert.ok(!titles.has(titleText), `File ${file} has duplicate title "${titleText}"`);
      titles.add(titleText);

      // Exactly one h1
      const h1Count = (content.match(/<h1\b/gi) || []).length;
      assert.strictEqual(h1Count, 1, `File ${file} must contain exactly one <h1>, found ${h1Count}`);

      // Viewport tag without user-scalable=no
      assert.ok(/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(content), `File ${file} missing viewport meta tag`);
      assert.ok(!/user-scalable\s*=\s*no/i.test(content), `File ${file} contains user-scalable=no`);

      // Unique element IDs
      const idMatches = [...content.matchAll(/\sid=["']([^"']+)["']/gi)].map(m => m[1]);
      const seenIds = new Set();
      for (const id of idMatches) {
        assert.ok(!seenIds.has(id), `File ${file} contains duplicate element ID "${id}"`);
        seenIds.add(id);
      }

      // Img tags alt, width, height
      const imgMatches = [...content.matchAll(/<img\b([^>]*?)>/gi)];
      for (const [, attrs] of imgMatches) {
        assert.ok(/alt=["'][^"']*["']/i.test(attrs), `File ${file} has <img> missing alt attribute`);
        assert.ok(/width=["'][^"']*["']/i.test(attrs), `File ${file} has <img> missing width attribute`);
        assert.ok(/height=["'][^"']*["']/i.test(attrs), `File ${file} has <img> missing height attribute`);
      }
    }
  });

  it('STAT-12: Zero payment integrations, gateways, SDKs, or card inputs; payment word restricted to demo notices', async () => {
    const scanDirs = [
      join(ROOT_DIR, 'public'),
      join(ROOT_DIR, 'src'),
      join(ROOT_DIR, 'db'),
      join(ROOT_DIR, 'scripts')
    ];

    const gatewayPatterns = [
      /\bstripe\b/i,
      /\brazorpay\b/i,
      /\bpaypal\b/i,
      /\bpayu\b/i,
      /\bcashfree\b/i,
      /\bpaytm\b/i
    ];

    const sdkUrlPatterns = [
      /checkout\.razorpay\.com/i,
      /js\.stripe\.com/i,
      /paypal\.com\/sdk/i,
      /api\.razorpay\.com/i,
      /api\.stripe\.com/i
    ];

    const cardFieldPatterns = [
      /\bcc-[a-z0-9_-]+/i,
      /card[-_ ]?number/i,
      /\bcvv\b/i,
      /\bcvc\b/i
    ];

    // Approved demo notice pattern containing "payment" (§E0, §E4, §E7)
    const allowedPaymentNotice = /(?:Demo store\.\s*Orders are saved,\s*nothing ships,\s*and no payment is taken\.|Demo order,\s*no payment|No payment is taken\.|Demo store:\s*no payment is taken\.)/i;

    for (const dir of scanDirs) {
      const files = await getFiles(dir);
      for (const file of files) {
        // Skip binary or font files
        if (/\.(woff2|png|ico|jpg|jpeg|webp)$/.test(file)) continue;

        const content = await readFile(file, 'utf8');

        // 1. Gateway names
        for (const pat of gatewayPatterns) {
          assert.ok(!pat.test(content), `File ${file} contains gateway name matching ${pat} (STAT-12 violation)`);
        }

        // 2. Payment SDK URLs
        for (const pat of sdkUrlPatterns) {
          assert.ok(!pat.test(content), `File ${file} contains payment SDK URL matching ${pat} (STAT-12 violation)`);
        }

        // 3. Card fields & cc- autocomplete tokens
        for (const pat of cardFieldPatterns) {
          assert.ok(!pat.test(content), `File ${file} contains card field or cc- token matching ${pat} (STAT-12 violation)`);
        }

        // 4. "payment" word restricted strictly to approved demo-notice strings or code comments
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\bpayment\b/i.test(line)) {
            const isComment = /^\s*(?:\/\/|\/\*|\*)/.test(line);
            const isAllowedNotice = allowedPaymentNotice.test(line) || isComment;
            assert.ok(
              isAllowedNotice,
              `File ${file}:${i + 1} contains "payment" outside approved demo notice: "${line.trim()}" (STAT-12 violation)`
            );
          }
        }
      }
    }
  });

  it('STAT-14: Font assets integrity, CSS references only /fonts/..., and zero font dependencies in package.json', async () => {
    // 1. package.json check
    const pkgRaw = await readFile(join(ROOT_DIR, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    for (const dep of allDeps) {
      assert.ok(!dep.includes('font'), `package.json contains font package "${dep}" (STAT-14 violation)`);
    }

    // 2. public/fonts/ contents
    const fontFiles = await readdir(FONTS_DIR);
    const requiredFiles = [
      'bricolage-grotesque-latin-wght-normal.woff2',
      'bricolage-grotesque-latin-ext-wght-normal.woff2',
      'OFL-bricolage-grotesque.txt',
      'geist-latin-wght-normal.woff2',
      'geist-latin-ext-wght-normal.woff2',
      'OFL-geist.txt',
      'README.md'
    ];
    for (const req of requiredFiles) {
      assert.ok(fontFiles.includes(req), `public/fonts/ missing required asset: ${req}`);
    }

    // 3. public/css/fonts.css references only /fonts/...
    const fontsCss = await readFile(join(PUBLIC_DIR, 'css/fonts.css'), 'utf8');
    const urlMatches = fontsCss.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];
    assert.ok(urlMatches.length > 0, 'fonts.css must contain font urls');
    for (const u of urlMatches) {
      if (u.includes('data:') || u.includes('local(')) continue;
      assert.ok(
        u.includes("'/fonts/") || u.includes('"/fonts/') || u.includes('/fonts/'),
        `fonts.css contains invalid font url path: ${u} (must reference /fonts/...)`
      );
    }
  });
});

