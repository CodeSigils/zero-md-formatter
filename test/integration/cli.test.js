const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const ROOT = resolve(__dirname, '../..');
const CLI = join(ROOT, 'skills/markdown-formatter/src/index.js');

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
  if (result.error) {
    result.stderr = `${result.stderr || ''}\nspawn error: ${result.error.message}\n`;
  }
  return result;
}

describe('markdown formatter CLI integration', () => {
  it('--all checks every supplied directory, not just the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-cli-'));
    try {
      const goodDir = join(dir, 'good');
      const badDir = join(dir, 'bad');
      mkdirSync(goodDir, { recursive: true });
      mkdirSync(badDir, { recursive: true });
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

  it('--fix repairs double-pipe tables (adjacent pipes converted to spaced pipes)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-double-pipe-fix-'));
    const file = join(dir, 'double-pipe.md');
    try {
      const original = '# Double pipe\n\n|| A | B ||\n|| :- | :- ||\n|| 1 | 2 ||\n';
      writeFileSync(file, original);

      const result = runCli(['--fix', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /Repaired adjacent pipes/);
      const content = readFileSync(file, 'utf8');
      // Leading || should become | |
      assert.match(content, /\| \| A \| B \| \|/);
      assert.match(content, /\| \| :- \| :- \| \|/);
      assert.match(content, /\| \| 1 \| 2 \| \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--dry-run blocks double-pipe tables (adjacent pipes are a blocking error)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-double-pipe-dry-run-'));
    const file = join(dir, 'double-pipe.md');
    try {
      const original = '# Double pipe\n\n|| A | B ||\n|| :- | :- ||\n|| 1 | 2 ||\n';
      writeFileSync(file, original);

      const result = runCli(['--dry-run', file]);

      assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /adjacent pipes/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--check blocks on adjacent pipes with clear error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-double-pipe-check-'));
    const file = join(dir, 'double-pipe.md');
    try {
      const original = '# Double pipe\n\n|| A | B ||\n|| :- | :- ||\n|| 1 | 2 ||\n';
      writeFileSync(file, original);

      const result = runCli(['--check', file]);

      assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /adjacent pipes/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--no-repair blocks write-mode pipe repairs and preserves original content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-no-repair-'));
    const file = join(dir, 'double-pipe.md');
    try {
      const original = '# Double pipe\n\n|| A | B ||\n|| :- | :- ||\n|| 1 | 2 ||\n';
      writeFileSync(file, original);

      const result = runCli(['--fix', '--no-repair', file]);

      assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /no-repair/);
      assert.match(result.stdout + result.stderr, /adjacent pipes/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--audit-tables reports row cell counts and hazards without writing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-audit-tables-'));
    const file = join(dir, 'audit.md');
    try {
      const original = [
        '# Audit',
        '',
        '| Command | Notes |',
        '| --- | --- |',
        '| `cat a | grep b` | pipeline |',
        '| value ||',
        '',
      ].join('\n');
      writeFileSync(file, original);

      const result = runCli(['--audit-tables', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Table audit: .*audit\.md/);
      assert.match(result.stdout, /line 3: table start/);
      assert.match(result.stdout, /line 5: cells=2 .*inline-code-pipe/);
      assert.match(result.stdout, /line 6: cells=2 .*adjacent-pipes/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--audit-tables catches double-pipe tables with empty outer cells', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-audit-doublepipe-'));
    const file = join(dir, 'doublepipe-audit.md');
    try {
      const original = [
        '# Double Pipe Audit',
        '',
        '|| A | B ||',
        '|| --- | --- ||',
        '|| 1 | 2 ||',
        '',
      ].join('\n');
      writeFileSync(file, original);

      const result = runCli(['--audit-tables', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Table audit/);
      assert.match(result.stdout, /line 3: table start header-cells=4 delimiter-cells=4/);
      assert.match(result.stdout, /adjacent-pipes.*empty-cell/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--help documents table audit and no-repair debugging flags', () => {
    const result = runCli(['--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--audit-tables/);
    assert.match(result.stdout, /--no-repair/);
  });

  it('--fix --dry-run does not repair-write malformed tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-fix-dry-run-'));
    const file = join(dir, 'repairable.md');
    try {
      const original = '# Repairable\n\n| A | B |\n|---|---|---|\n| 1 | 2 |\n';
      writeFileSync(file, original);

      const result = runCli(['--fix', '--dry-run', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /Would format/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it('--fix --guard with clean table removes structure snapshots after formatting', () => {
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

  it('--fix --guard with double-pipe table repairs and skips oxfmt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-guard-double-pipe-'));
    const file = join(dir, 'double-pipe.md');
    try {
      const original = '# Double pipe\n\n|| A | B ||\n|| :- | :- ||\n|| 1 | 2 ||\n';
      writeFileSync(file, original);

      const result = runCli(['--fix', '--guard', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /Repaired adjacent pipes/);
      assert.match(result.stdout + result.stderr, /empty table cells/);
      const content = readFileSync(file, 'utf8');
      // Each row should be on its own line (oxfmt didn't collapse it)
      const lines = content.trim().split('\n');
      assert.equal(lines.length, 5, 'should have 5 lines (title + blank + 3 table rows)');
      assert.doesNotMatch(content, /\|\|/, 'no adjacent pipes remain');
      assert.equal(existsSync(`${file}.structure.json`), false);
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

  it('--doctor reports readiness without requiring path inputs', () => {
    const result = runCli(['--doctor']);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Markdown Formatter Doctor/);
    assert.match(result.stdout, /Node\.js:/);
    assert.match(result.stdout, /oxfmt:/);
    assert.match(result.stdout, /Ready: yes/);
  });

  it('--doctor exits non-zero when oxfmt is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-doctor-'));
    try {
      const result = runCli(['--doctor'], {
        cwd: dir,
        env: { ...process.env, PATH: '' },
      });

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /Markdown Formatter Doctor/);
      assert.match(result.stdout, /oxfmt: missing/);
      assert.match(result.stdout, /Ready: no/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--help prints usage information and exits 0', () => {
    const result = runCli(['--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Markdown Formatter CLI/);
    assert.match(result.stdout, /--check/);
    assert.match(result.stdout, /--fix/);
    assert.match(result.stdout, /--doctor/);
  });

  it('--validate blocks on adjacent pipes', () => {
    const file = 'test/fixtures/violations/table-adjacent-pipes.md';

    const result = runCli(['--validate', file]);

    assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /adjacent pipes/);
  });

  it('--check blocks on adjacent pipes violations fixture', () => {
    const file = 'test/fixtures/violations/table-adjacent-pipes.md';

    const result = runCli(['--check', file]);

    assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /adjacent pipes/);
  });

  it('--fix blocks inline-code table pipes before oxfmt can corrupt the table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-inline-pipe-'));
    const file = join(dir, 'inline-pipe.md');
    try {
      const original = '# Inline pipe\n\n| Command | Description |\n|---|---|\n| `cat a | grep b` | pipeline |\n';
      writeFileSync(file, original);

      const result = runCli(['--fix', file]);

      assert.notStrictEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /inline code span contains unescaped pipe/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fix on a clean table succeeds (regression)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-clean-fix-'));
    const file = join(dir, 'clean.md');
    try {
      writeFileSync(file, '# Clean\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');

      const result = runCli(['--fix', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      // oxfmt normalizes column widths
      assert.match(readFileSync(file, 'utf8'), /\| A   \| B   \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fix preserves no-leading-pipe table empty edge cells by skipping oxfmt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-nolead-empty-'));
    const file = join(dir, 'empty-edge.md');
    try {
      const original = '# Empty edge cells\n\nA | B\n--- | ---\n | x\ny | \n';
      writeFileSync(file, original);

      const result = runCli(['--fix', file]);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /empty table cells/);
      assert.equal(readFileSync(file, 'utf8'), original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--fences detects fence info string violations', () => {
    const result = runCli(['--fences', 'test/fixtures/violations/fence-mismatch.md']);

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /unclosed|mismatch|empty|whitespace/i);
  });

  it('--fences allows clean fence content', () => {
    const result = runCli(['--fences', 'test/fixtures/current/kitchensink.md']);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('--validate warns and --check gates on file with unclosed fence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-unclosed-fence-'));
    const file = join(dir, 'unclosed.md');
    try {
      const content = '# Unclosed fence test\n\n```js\nconst x = 1;\n';
      writeFileSync(file, content);

      // --validate should report the unclosed fence
      const validateResult = runCli(['--validate', file]);
      assert.notStrictEqual(validateResult.status, 0);
      assert.match(validateResult.stdout + validateResult.stderr, /Unclosed fence/);

      // --fix should still format around unclosed fences (fence check is separate)
      const fixResult = runCli(['--fix', file]);
      assert.equal(fixResult.status, 0, fixResult.stdout + fixResult.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--validate warns on long fence containing GFM table structure', () => {
    const content = '```\n' + Array(42).fill('line content').join('\n') + '\n| Name | Value |\n| ---- | ----- |\n| A | B |\n```\n';
    const dir = mkdtempSync(join(tmpdir(), 'markdown-formatter-long-fence-'));
    const file = join(dir, 'long-fence.md');
    try {
      writeFileSync(file, content);

      const result = runCli(['--validate', file]);

      assert.notStrictEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /Warning: fence at line \d+ spans/);
      assert.match(result.stdout + result.stderr, /contains GFM table structure/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
