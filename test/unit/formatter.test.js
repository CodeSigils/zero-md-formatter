const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const {
  NODE_RUNTIME_MIN_VERSION,
  parseArgs,
  runDoctor,
  resolveInputFiles,
} = require('../../skills/markdown-formatter/src/index.js');

describe('formatter CLI helper unit tests', () => {
  function collectDoctor(options) {
    const output = [];
    const result = runDoctor({
      log: (line) => output.push(line),
      nodeVersion: `v${NODE_RUNTIME_MIN_VERSION}.0.0`,
      resolveOxfmt: () => '/tmp/oxfmt',
      runVersion: () => ({ status: 0, stdout: 'oxfmt 0.51.0\n', stderr: '' }),
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
    assert.match(output, /oxfmt: \/tmp\/oxfmt \(oxfmt 0\.51\.0\)/);
    assert.match(output, /Config: .*\.oxfmtrc\.json \(ok\)/);
    assert.match(output, /Payload: .*SKILL\.md \(ok\)/);
    assert.match(output, /Ready: yes/);
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
});
