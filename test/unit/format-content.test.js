const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  formatContent,
  normalizeTrailingWhitespace,
  ensureFinalNewline,
  normalizeIndentation,
  alignTables,
  normalizeFences,
} = require('../../src/format-content.mjs');

const ROOT = resolve(__dirname, '../..');

describe('format-content micro-formatter', () => {
  it('removes trailing whitespace and ensures a final newline', () => {
    assert.equal(formatContent('# Title  \n\nText\t'), '# Title  \n\nText\n');
    assert.equal(normalizeTrailingWhitespace('a  \nb\t\n'), 'a  \nb\n');
    assert.equal(ensureFinalNewline('a'), 'a\n');
  });

  it('normalizes leading tabs outside fenced code blocks', () => {
    const input = ['# T', '', '\t- item', '', '```text', '\tverbatim', '```', ''].join('\n');
    const output = normalizeIndentation(input, { indentWidth: 2 });

    assert.match(output, /^  - item/m);
    assert.match(output, /^\tverbatim/m);
  });

  it('aligns pipe tables and preserves delimiter alignment markers', () => {
    const input = [
      '| A | Long | Right | Both |',
      '|---|:-----|------:|:----:|',
      '| 1 | 2 | 3 | 4 |',
      '',
    ].join('\n');

    assert.equal(alignTables(input), [
      '| A   | Long | Right | Both  |',
      '| --- | :--- | ----: | :---: |',
      '| 1   | 2    |     3 |   4   |',
      '',
    ].join('\n'));
  });

  it('ignores escaped pipes while aligning tables', () => {
    const input = [
      '| Pattern | Meaning |',
      '|---|---|',
      '| `a \\| b` | escaped |',
      '',
    ].join('\n');

    assert.equal(alignTables(input), [
      '| Pattern  | Meaning |',
      '| -------- | ------- |',
      '| `a \\| b` | escaped |',
      '',
    ].join('\n'));
  });

  it('preserves tables with empty cells', () => {
    const input = [
      '| A | B |',
      '|---|---|',
      '|   | x |',
      '',
    ].join('\n');

    assert.equal(alignTables(input), input);
  });

  it('does not align table-shaped text inside fenced code blocks', () => {
    const input = ['```md', '| A | B |', '|---|---|', '| 1 | 2 |', '```', ''].join('\n');
    assert.equal(alignTables(input), input);
  });

  it('does not absorb immediate Markdown block boundaries with pipes into tables', () => {
    const input = [
      '| A | B |',
      '|---|---|',
      '# Heading | with | pipe',
      '- item | with | pipe',
      '> quote | with | pipe',
      '',
    ].join('\n');

    assert.equal(alignTables(input), [
      '| A   | B   |',
      '| --- | --- |',
      '# Heading | with | pipe',
      '- item | with | pipe',
      '> quote | with | pipe',
      '',
    ].join('\n'));
  });

  it('normalizes tilde fences and escalates backticks for nested content', () => {
    const input = ['~~~~md', '```text', 'inner', '```', '~~~~', ''].join('\n');

    assert.equal(normalizeFences(input), ['````md', '```text', 'inner', '```', '````', ''].join('\n'));
  });

  it('formatContent is idempotent for representative fixtures', () => {
    const fixtureDirs = [
      join(ROOT, 'test/fixtures/current'),
      join(ROOT, 'test/fixtures/format-edge-cases'),
      join(ROOT, 'test/fixtures/pipe-safety'),
    ];

    for (const dir of fixtureDirs) {
      for (const name of readdirSync(dir).filter((file) => file.endsWith('.md') || file.endsWith('.mdx'))) {
        const file = join(dir, name);
        const once = formatContent(readFileSync(file, 'utf8'));
        const twice = formatContent(once);
        assert.equal(twice, once, `${file} should be idempotent`);
      }
    }
  });

  it('formatted clean fixtures pass structural guards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'format-content-guards-'));
    try {
      const file = join(dir, 'formatted.md');
      const content = formatContent([
        '# T',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '~~~js',
        'console.log("ok");',
        '~~~',
        '',
      ].join('\n'));
      writeFileSync(file, content);

      for (const script of ['check-structure.js', 'check-tables.js', 'check-fences.js']) {
        const args = script === 'check-structure.js' ? ['--verify', file] : [file];
        const result = spawnSync(process.execPath, [join(ROOT, 'guard', script), ...args], {
          cwd: ROOT,
          encoding: 'utf8',
        });
        assert.equal(result.status, 0, `${script}: ${result.stdout}${result.stderr}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
