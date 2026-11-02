/**
 * tests/static/db-rules.test.js
 *
 * STAT-13: Database access rules.
 *
 * - No setTypeParser and no parseInt8 in src/, scripts/, or tests/helpers/.
 * - @vercel/functions is imported only in src/db/pool.js.
 * - new Pool( appears only in src/db/pool.js, scripts/, and tests/helpers/.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../..');

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    }),
  );
  return files.flat();
}

describe('STAT-13: Database access rules', () => {
  it('no setTypeParser or parseInt8 in src/, scripts/, or tests/helpers/', async () => {
    const dirs = ['src', 'scripts', 'tests/helpers'].map((d) => resolve(ROOT_DIR, d));
    const allFiles = (await Promise.all(dirs.map(getFiles))).flat().filter((f) => f.endsWith('.js'));

    assert.ok(allFiles.length > 0);

    for (const file of allFiles) {
      const content = await readFile(file, 'utf8');
      assert.ok(!content.includes('setTypeParser'), `Found setTypeParser in ${relative(ROOT_DIR, file)}`);
      assert.ok(!content.includes('parseInt8'), `Found parseInt8 in ${relative(ROOT_DIR, file)}`);
    }
  });

  it('@vercel/functions is imported only in src/db/pool.js', async () => {
    const dirs = ['src', 'scripts', 'tests/helpers'].map((d) => resolve(ROOT_DIR, d));
    const allFiles = (await Promise.all(dirs.map(getFiles))).flat().filter((f) => f.endsWith('.js'));

    for (const file of allFiles) {
      const rel = relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = await readFile(file, 'utf8');
      if (content.includes('@vercel/functions')) {
        assert.equal(
          rel,
          'src/db/pool.js',
          `@vercel/functions is only permitted to be imported in src/db/pool.js, found in ${rel}`,
        );
      }
    }
  });

  it('new Pool( appears only in src/db/pool.js, scripts/, and tests/helpers/', async () => {
    const srcDir = resolve(ROOT_DIR, 'src');
    const srcFiles = (await getFiles(srcDir)).filter((f) => f.endsWith('.js'));

    for (const file of srcFiles) {
      const rel = relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = await readFile(file, 'utf8');
      if (content.includes('new Pool(')) {
        assert.equal(
          rel,
          'src/db/pool.js',
          `new Pool( must only appear in src/db/pool.js within src/, found in ${rel}`,
        );
      }
    }
  });
});

