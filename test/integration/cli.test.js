const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const ROOT = resolve(__dirname, '../..');
const CLI = join(ROOT, 'skills/markdown-formatter/src/index.js');

function runCli(args, options = {}) {
  return spawnSync('node', [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
}

describe('markdown formatter CLI integration', () => {
  it('--all checks every supplied directory, not just the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-cli-'));
    try {
      const goodDir = join(dir, 'good');
      const badDir = join(dir, 'bad');
      require('node:fs').mkdirSync(goodDir);
      require('node:fs').mkdirSync(badDir);
      writeFileSync(join(goodDir, 'clean.md'), '# Clean\n\nText.\n');
      writeFileSync(join(badDir, 'dirty.md'), '# Dirty\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');

      const result = runCli(['--check', '--all', goodDir, badDir]);

      assert.notStrictEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /dirty\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--validate runs structural, fence, and table checks', () => {
    const result = runCli(['--validate', 'test/fixtures/violations/table-column-drift.md']);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /row 1 has 4 cols but header has 2|Table row/);
  });

  it('--verify is read-only and fails on unformatted files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-verify-'));
    const file = join(dir, 'dirty.md');
    try {
      const original = '# Dirty\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
      writeFileSync(file, original);

      const result = runCli(['--verify', file]);

      assert.notStrictEqual(result.status, 0);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--check --guard remains read-only and fails on unformatted files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-guard-check-'));
    const file = join(dir, 'dirty.md');
    try {
      const original = '# Dirty\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
      writeFileSync(file, original);

      const result = runCli(['--check', '--guard', file]);

      assert.notStrictEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /dirty\.md|Format issues/);
      assert.equal(readFileSync(file, 'utf8'), original);
      assert.equal(existsSync(`${file}.structure.json`), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fix --guard removes temporary structure snapshots after formatting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-guard-fix-'));
    const file = join(dir, 'dirty.md');
    try {
      writeFileSync(file, '# Dirty\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');

      const result = runCli(['--fix', '--guard', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(`${file}.structure.json`), false);
      assert.match(readFileSync(file, 'utf8'), /\| A   \| B   \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fix --guard preserves pre-existing structure snapshots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-guard-existing-'));
    const file = join(dir, 'dirty.md');
    const snapshot = `${file}.structure.json`;
    const originalSnapshot = '{"owner":"external"}\n';
    try {
      writeFileSync(file, '# Dirty\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
      writeFileSync(snapshot, originalSnapshot);

      const result = runCli(['--fix', '--guard', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(readFileSync(snapshot, 'utf8'), originalSnapshot);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fix --guard restores original content when structural drift is detected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-guard-rollback-'));
    const file = join(dir, 'table-column-drift.md');
    try {
      copyFileSync(join(ROOT, 'test/fixtures/violations/table-column-drift.md'), file);
      const original = readFileSync(file, 'utf8');

      const result = runCli(['--fix', '--guard', file]);

      assert.notStrictEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /Structural drift|Table/);
      assert.equal(readFileSync(file, 'utf8'), original);
      assert.equal(existsSync(`${file}.structure.json`), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
