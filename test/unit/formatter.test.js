const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const {
  NODE_RUNTIME_MIN_VERSION,
  OXFMT_MAX_VERSION,
  parseArgs,
  runDoctor,
  isSupportedOxfmtVersion,
  getOxfmtPathCandidates,
  getSpawnOptions,
  resolveInputFiles,
  repairTableColumns,
  auditTables,
  hasTableWithEmptyCells,
} = require('../../skills/markdown-formatter/src/index.js');

describe('formatter CLI helper unit tests', () => {
  function collectDoctor(options) {
    const output = [];
    const result = runDoctor({
      log: (line) => output.push(line),
      nodeVersion: `v${NODE_RUNTIME_MIN_VERSION}.0.0`,
      resolveOxfmt: () => '/tmp/oxfmt',
      runVersion: () => ({ status: 0, stdout: 'oxfmt 0.54.0\n', stderr: '' }),
      exists: () => true,
      ...options,
    });

    return { result, output: output.join('\n') };
  }

  it('uses a single exported minimum Node.js runtime version', () => {
    assert.equal(NODE_RUNTIME_MIN_VERSION, 20);
  });

  it('parses multiple positional paths with --all', () => {
    const args = parseArgs(['node', 'index.js', '--check', '--all', 'a', 'b']);

    assert.equal(args.check, true);
    assert.equal(args.all, true);
    assert.deepStrictEqual(args._, ['a', 'b']);
  });

  it('parses --doctor as a read-only diagnostic flag', () => {
    const args = parseArgs(['node', 'index.js', '--doctor']);

    assert.equal(args.doctor, true);
    assert.deepStrictEqual(args._, []);
  });

  it('reports runtime readiness from --doctor checks', () => {
    const { result, output } = collectDoctor();

    assert.equal(result, true);
    assert.match(output, new RegExp(`Node\\.js: v${NODE_RUNTIME_MIN_VERSION}\\.0\\.0 \\(ok\\)`));
    assert.match(output, /oxfmt: \/tmp\/oxfmt \(oxfmt 0\.54\.0\)/);
    assert.match(output, /Config: .*\.oxfmtrc\.json \(ok\)/);
    assert.match(output, /Payload: .*SKILL\.md \(ok\)/);
    assert.match(output, /Ready: yes/);
  });

  it('builds child-process options without shell execution', () => {
    assert.deepStrictEqual(getSpawnOptions({ timeout: 5000 }), { encoding: 'utf8', timeout: 5000 });
  });

  it('prefers Windows oxfmt shims without requiring shell execution', () => {
    const candidates = getOxfmtPathCandidates({ cwd: 'C:\\repo', skillDir: 'C:\\skill', platform: 'win32' });

    assert(candidates.includes(join('C:\\repo', 'node_modules', '.bin', 'oxfmt.cmd')));
    assert(candidates.includes(join('C:\\skill', 'node_modules', '.bin', 'oxfmt.cmd')));
    assert(candidates.every((candidate) => !candidate.includes('undefined')));
  });

  it('reports missing oxfmt from --doctor without exiting the process', () => {
    const { result, output } = collectDoctor({
      resolveOxfmt: () => null,
      runVersion: () => ({ status: 1, stdout: '', stderr: '' }),
    });

    assert.equal(result, false);
    assert.match(output, /oxfmt: missing/);
    assert.match(output, /Install oxfmt on PATH/);
    assert.match(output, /Ready: no/);
  });

  it('reports unsupported Node.js versions from --doctor checks', () => {
    const unsupportedVersion = NODE_RUNTIME_MIN_VERSION - 1;
    const { result, output } = collectDoctor({ nodeVersion: `v${unsupportedVersion}.19.0` });

    assert.equal(result, false);
    assert.match(
      output,
      new RegExp(`Node\\.js: v${unsupportedVersion}\\.19\\.0 \\(requires >=${NODE_RUNTIME_MIN_VERSION}\\)`)
    );
    assert.match(output, /Ready: no/);
  });

  it('reports oxfmt version command failures from --doctor checks', () => {
    const { result, output } = collectDoctor({
      runVersion: () => ({ status: 1, stdout: '', stderr: 'permission denied\n' }),
    });

    assert.equal(result, false);
    assert.match(output, /oxfmt: \/tmp\/oxfmt \(permission denied\) \(version check failed\)/);
    assert.match(output, /Ready: no/);
  });

  it('warns when oxfmt version exceeds tested maximum from --doctor checks', () => {
    const { result, output } = collectDoctor({
      runVersion: () => ({ status: 0, stdout: 'oxfmt 0.57.0\n', stderr: '' }),
    });

    assert.equal(result, true);
    assert.match(output, new RegExp(`Version 0.57.0 exceeds tested maximum ${OXFMT_MAX_VERSION}`));
    assert.match(output, /Ready: yes/);
  });

  it('isSupportedOxfmtVersion extracts semver from version strings', () => {
    assert.deepStrictEqual(isSupportedOxfmtVersion('oxfmt 0.54.0\n'), { version: '0.54.0', supported: true });
    assert.deepStrictEqual(isSupportedOxfmtVersion('Version: 0.54.0\n'), { version: '0.54.0', supported: true });
    assert.deepStrictEqual(isSupportedOxfmtVersion('oxfmt 0.53.0\n'), { version: '0.53.0', supported: true });
    assert.deepStrictEqual(isSupportedOxfmtVersion('oxfmt 0.57.0\n'), { version: '0.57.0', supported: false });
    assert.equal(isSupportedOxfmtVersion('not a version'), null);
  });

  it('reports missing config and payload files from --doctor checks', () => {
    const { result, output } = collectDoctor({
      exists: (file) => !file.endsWith('.oxfmtrc.json') && !file.endsWith('check-tables.js'),
    });

    assert.equal(result, false);
    assert.match(output, /Config: .*\.oxfmtrc\.json \(missing\)/);
    assert.match(output, /Payload: .*\.oxfmtrc\.json \(missing\)/);
    assert.match(output, /Payload: .*check-tables\.js \(missing\)/);
    assert.match(output, /Ready: no/);
  });

  it('requires --all for directory inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'formatter-helpers-'));
    try {
      assert.throws(() => resolveInputFiles([dir], false), /Directory input requires --all/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recursively resolves markdown files from every supplied directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'formatter-helpers-'));
    try {
      const one = join(root, 'one');
      const two = join(root, 'two');
      mkdirSync(one);
      mkdirSync(two);
      writeFileSync(join(one, 'a.md'), '# A\n');
      writeFileSync(join(two, 'b.mdx'), '# B\n');
      writeFileSync(join(two, 'ignore.txt'), 'nope\n');

      const files = resolveInputFiles([one, two], true);

      assert.equal(files.length, 2);
      assert(files.some((file) => file.endsWith('a.md')));
      assert(files.some((file) => file.endsWith('b.mdx')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('audits table rows with cell counts and pipe hazards without mutating content', () => {
    const input = [
      '| Command | Notes |',
      '| --- | --- |',
      '| `cat a | grep b` | pipeline |',
      '| value ||',
    ].join('\n');

    const report = auditTables(input, 'probe.md');

    assert.match(report, /Table audit: probe\.md/);
    assert.match(report, /line 1: table start/);
    assert.match(report, /line 3: cells=2 .*inline-code-pipe/);
    assert.match(report, /line 4: cells=2 .*adjacent-pipes/);
  });
});

describe('repairTableColumns', () => {
  it('returns original content when table is already structurally valid', () => {
    const input = [
      '| a | b | c |',
      '|---|---|---|',
      '| 1 | 2 | 3 |',
      '| 4 | 5 | 6 |',
    ].join('\n');
    assert.equal(repairTableColumns(input), input);
  });

  it('pads data rows short by one trailing column', () => {
    const input = [
      '| a | b | c |',
      '|---|---|---|',
      '| 1 | 2 |',
    ].join('\n');
    const result = repairTableColumns(input);
    const cells = result.split('\n')[2].split('|').map((c) => c.trim());
    assert.equal(cells.length, 5, 'should have 5 pipe-separated slots');
    assert.equal(cells[3], '', 'padded cell should be empty');
  });

  it('pads header row when it has fewer columns than delimiter', () => {
    const input = [
      '| a | b |',
      '|---|---|---|',
      '| 1 | 2 | 3 |',
    ].join('\n');
    const result = repairTableColumns(input);
    const cells = result.split('\n')[0].split('|').map((c) => c.trim());
    assert.equal(cells.length, 5, 'repaired header should have 3 cols');
  });

  it('pads delimiter when it has fewer columns than header', () => {
    const input = [
      '| a | b | c |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');
    const result = repairTableColumns(input);
    const delimCells = result.split('\n')[1].split('|').map((c) => c.trim());
    assert.equal(delimCells.length, 5, 'delimiter should be padded to 3 cols');
  });

  it('handles 2-col header with 3-col separator (the original malformation)', () => {
    // This is a simplified version of the exact pattern from the doom config Quick Index table
    const input = [
      '| header one | header two |',
      '| :--------- | :--------- | :----------- |',
      '| data one   | data two   |',
    ].join('\n');
    const result = repairTableColumns(input);
    const lines = result.split('\n');
    const pipeCount0 = (lines[0].match(/\|/g) || []).length;
    const pipeCount2 = (lines[2].match(/\|/g) || []).length;
    assert.equal(pipeCount0, 4, 'header should have 4 pipes for 3 cols');
    assert.equal(pipeCount2, 4, 'data row should have 4 pipes for 3 cols');
    // Verify it passes structural validation
    const { validateTables } = require('../../skills/markdown-formatter/scripts/check-tables.js');
    const errors = validateTables(result);
    assert.deepStrictEqual(errors, [], 'repaired table should have no structural violations');
  });

  it('returns original when no pipes are present', () => {
    const input = '# Hello\n\nplain text\n';
    assert.equal(repairTableColumns(input), input);
  });

  it('does not repair non-table lines with pipes (inline code, prose)', () => {
    const input = 'Use `pipe | symbol` in code.\n';
    assert.equal(repairTableColumns(input), input);
  });

  it('does not repair table-shaped text inside fenced code blocks', () => {
    const input = [
      '```text',
      '| a | b |',
      '|---|---|---|',
      '| 1 | 2 |',
      '```',
    ].join('\n');

    assert.equal(repairTableColumns(input), input);
  });

  it('pads multiple data rows in the same table', () => {
    const input = [
      '| a | b | c |',
      '|---|---|---|',
      '| 1 | 2 |',
      '| 3 | 4 |',
      '| 5 | 6 |',
    ].join('\n');
    const result = repairTableColumns(input);
    const { splitTableCells } = require('../../skills/markdown-formatter/scripts/check-tables.js');
    const lines = result.split('\n');
    for (let i = 2; i <= 4; i++) {
      const cells = splitTableCells(lines[i]);
      assert.equal(cells.length, 3, `row ${i} should have 3 cells, got ${cells.length}: "${lines[i]}"`);
    }
  });

  it('returns original when table has only header and delimiter (no data rows)', () => {
    const input = [
      '| a | b | c |',
      '|---|---|---|',
    ].join('\n');
    assert.equal(repairTableColumns(input), input);
  });

  it('repairs two adjacent tables independently', () => {
    const input = [
      '| a | b |',
      '|---|---|---|',  // short header → pad to 3
      '| 1 | 2 | 3 |',
      '',
      '| x | y | z |',
      '|---|---|---|',  // already fine
      '| 4 | 5 | 6 |',
    ].join('\n');
    const result = repairTableColumns(input);
    const lines = result.split('\n');
    const headerCells = lines[0].split('|').map((c) => c.trim());
    // header was | a | b |, padded → | a | b | |
    assert.equal(headerCells.length, 5, 'first table header should have 3 cols after repair');
    // second table untouched
    assert.equal(lines[4], input.split('\n')[4], 'second table header should be unchanged');
  });

  it('pads a data row with no leading pipe but trailing pipe', () => {
    // splitTableCells handles no-leading-pipe by starting at offset 0
    const input = [
      '| a | b | c |',
      '|---|---|---|',
      'data 1 | data 2 |',   // no leading |, missing last col
    ].join('\n');
    const result = repairTableColumns(input);
    const { splitTableCells: stc } = require('../../skills/markdown-formatter/scripts/check-tables.js');
    const cells = stc(result.split('\n')[2]);
    assert.equal(cells.length, 3, 'data row should be padded to 3 cells');
    assert.equal(cells[2], '', 'padded cell should be empty');
  });

  it('pads short data row in ||-prefixed table (needs isDelimiterLine to detect its delimiter)', () => {
    const input = [
      '# T',
      '',
      '|| A | B ||',
      '|| --- | --- ||',
      '|| 1 | 2 ||',
      '|| 3 ||',
    ].join('\n');
    const result = repairTableColumns(input);
    const lines = result.split('\n');
    // Row 5 (index 5) is the short one: "|| 3 ||" → should be padded
    const { splitTableCells: stc } = require('../../skills/markdown-formatter/scripts/check-tables.js');
    const cells = stc(lines[5]);
    assert.equal(cells.length, 4, 'short row should be padded to 4 cells');
    assert.equal(cells[2], '', 'padded cell should be empty');
  });
});

describe('repairAdjacentPipes', () => {
  const { repairAdjacentPipes } = require('../../skills/markdown-formatter/src/index.js');

  it('returns original content when no adjacent pipes are present', () => {
    const input = '# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    assert.equal(repairAdjacentPipes(input), input);
  });

  it('repairs leading adjacent pipes', () => {
    const input = '|| A | B |\n|| :- | :- |\n|| 1 | 2 |\n';
    const result = repairAdjacentPipes(input);
    assert.match(result, /\| \| A \| B \|/);
    assert.match(result, /\| \| :- \| :- \|/);
    assert.match(result, /\| \| 1 \| 2 \|/);
    assert.doesNotMatch(result, /\|\|/);
  });

  it('repairs internal adjacent pipes', () => {
    const input = '| A || B |\n| :- || :- |\n| 1 || 2 |\n';
    const result = repairAdjacentPipes(input);
    assert.match(result, /\| A \| \| B \|/);
    assert.doesNotMatch(result, /\|\|/);
  });

  it('repairs trailing adjacent pipes', () => {
    const input = '| A | B ||\n| :- | :- ||\n| 1 | 2 ||\n';
    const result = repairAdjacentPipes(input);
    assert.match(result, /\| A \| B \| \|/);
    assert.match(result, /\| :- \| :- \| \|/);
    assert.match(result, /\| 1 \| 2 \| \|/);
    assert.doesNotMatch(result, /\|\|/);
  });

  it('ignores adjacent pipes inside inline code spans', () => {
    const input = '| `a || b` | c |\n|---|---|---|\n| x | y | z |\n';
    const result = repairAdjacentPipes(input);
    // The || inside backticks should remain
    assert.match(result, /\| `a \|\| b` \| c \|/);
  });

  it('ignores content inside fenced code blocks', () => {
    const input = '# Table\n\n```text\n|| A | B ||\n```\n\nReal table:\n\n| a | b |\n|---|---|\n';
    const result = repairAdjacentPipes(input);
    // Content inside fences should stay unchanged
    assert.match(result, /\|\| A \| B \|\|/);
  });

  it('ignores escaped pipes', () => {
    const input = '| A \\|\\| B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    const result = repairAdjacentPipes(input);
    // The \\|\\| should remain as escaped pipes
    assert.match(result, /\| A \\\|\\\| B \| C \|/);
  });

  it('repairs all 3 patterns in a single table', () => {
    const input = [
      '|| Leading | Internal || Trailing ||',
      '|| ------ | -------- || -------- ||',
      '|| 1      | 2        || 3        ||',
    ].join('\n');
    const result = repairAdjacentPipes(input);
    const lines = result.split('\n');
    for (const line of lines) {
      // Every || should become | |
      assert.doesNotMatch(line, /(?<!\|)\|\|(?!\|)/, `line has unescaped adjacent pipes: "${line}"`);
    }
  });
});

describe('hasTableWithEmptyCells', () => {
  it('detects empty cells in leading-pipe tables', () => {
    const input = '# T\n\n| A | B |\n|---|---|\n|  | x |\n| y |  |\n';

    assert.equal(hasTableWithEmptyCells(input), true);
  });

  it('detects empty edge cells in no-leading-pipe tables', () => {
    const input = '# T\n\nA | B\n--- | ---\n | x\ny | \n';

    assert.equal(hasTableWithEmptyCells(input), true);
  });

  it('ignores escaped pipes and inline-code pipes when checking empty cells', () => {
    const input = '# T\n\nA | B\n--- | ---\nalpha \\| beta | `x | y`\n';

    assert.equal(hasTableWithEmptyCells(input), false);
  });

  it('detects empty cells in double-pipe prefixed tables', () => {
    const input = '# T\n\n|| A | B ||\n|| --- | --- ||\n|| 1 | 2 ||\n';

    assert.equal(hasTableWithEmptyCells(input), true);
  });
});
