/**
 * tests/static/code-rules.test.js
 *
 * STAT-08: express.static is never used in src/.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../src');

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

describe('STAT-08: no express.static in src/', () => {
  it('express.static does not appear in any file in src/', async () => {
    const files = await getFiles(SRC_DIR);
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    assert.ok(jsFiles.length > 0, 'src/ must contain JavaScript files');

    for (const file of jsFiles) {
      const content = await readFile(file, 'utf8');
      assert.ok(
        !content.includes('express.static'),
        `File ${file} contains express.static, which is forbidden in src/`,
      );
    }
  });
});

