/**
 * tests/static/package-check.test.js  —  STAT-05
 *
 * Verifies package.json structure without any database or network access:
 *  - Exactly the seven production dependencies (no more, no less)
 *  - No devDependencies key
 *  - No font package in dependencies
 *  - engines.node === "22.x"
 *  - type === "module"
 *  - Scripts match section 7.2 exactly:
 *      - No inline environment assignments (NODE_ENV=... node)
 *      - No POSIX-only commands (cp, rm, export, single-quote strings)
 *      - Only && for chaining (not ;  &  || etc.)
 *      - No cross-env usage
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

const APPROVED_DEPS = [
  '@vercel/functions',
  'bcryptjs',
  'cookie-parser',
  'express',
  'helmet',
  'pg',
  'zod',
];

const EXPECTED_SCRIPTS = {
  dev: 'node --env-file=.env --watch scripts/dev-server.js',
  'db:migrate': 'node --env-file=.env scripts/migrate.js',
  'db:seed': 'node --env-file=.env scripts/seed.js',
  'db:setup': 'npm run db:migrate && npm run db:seed',
  'test:db:reset': 'node --env-file=.env.test scripts/test-db-reset.js',
  'test:unit': 'node --env-file=.env.test --test --test-reporter=spec "tests/unit/**/*.test.js"',
  test: 'npm run test:db:reset && node --env-file=.env.test --test --test-concurrency=1 --test-reporter=spec "tests/**/*.test.js"',
  audit: 'npm audit --omit=dev',
};

describe('STAT-05: package.json structure', () => {
  it('has type === "module"', () => {
    assert.equal(pkg.type, 'module', '"type" must be "module"');
  });

  it('has engines.node === "22.x"', () => {
    assert.equal(pkg.engines?.node, '22.x', 'engines.node must be "22.x"');
  });

  it('has no devDependencies key', () => {
    assert.ok(
      !('devDependencies' in pkg),
      'package.json must not contain a devDependencies key',
    );
  });

  it('has exactly the seven approved production dependencies', () => {
    const actual = Object.keys(pkg.dependencies ?? {}).sort();
    const expected = [...APPROVED_DEPS].sort();
    assert.deepEqual(
      actual,
      expected,
      `Expected exactly ${expected.join(', ')} but got ${actual.join(', ')}`,
    );
  });

  it('contains no font package in dependencies', () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    const fontPkgs = deps.filter(
      (d) => d.startsWith('@fontsource') || d.startsWith('typeface-') || d.includes('font'),
    );
    assert.deepEqual(fontPkgs, [], `Font packages must not be in dependencies: ${fontPkgs}`);
  });

  it('has the dev script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.dev, EXPECTED_SCRIPTS.dev);
  });

  it('has the db:migrate script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.['db:migrate'], EXPECTED_SCRIPTS['db:migrate']);
  });

  it('has the db:seed script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.['db:seed'], EXPECTED_SCRIPTS['db:seed']);
  });

  it('has the db:setup script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.['db:setup'], EXPECTED_SCRIPTS['db:setup']);
  });

  it('has the test:db:reset script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.['test:db:reset'], EXPECTED_SCRIPTS['test:db:reset']);
  });

  it('has the test:unit script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.['test:unit'], EXPECTED_SCRIPTS['test:unit']);
  });

  it('has the test script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.test, EXPECTED_SCRIPTS.test);
  });

  it('has the audit script matching section 7.2 exactly', () => {
    assert.equal(pkg.scripts?.audit, EXPECTED_SCRIPTS.audit);
  });

  it('no script contains an inline environment assignment (VAR=value node ...)', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(
        !/[A-Z_]+=\S+ node/.test(cmd),
        `Script "${name}" has an inline env assignment: ${cmd}`,
      );
    }
  });

  it('no script uses POSIX-only commands (cp, rm, export)', () => {
    const posixCmds = /\b(cp|rm|export)\b/;
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(!posixCmds.test(cmd), `Script "${name}" uses a POSIX-only command: ${cmd}`);
    }
  });

  it('no script uses cross-env', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(!cmd.includes('cross-env'), `Script "${name}" uses cross-env: ${cmd}`);
    }
  });

  it('no script uses single-quoted strings', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(!cmd.includes("'"), `Script "${name}" contains single quotes: ${cmd}`);
    }
  });
});