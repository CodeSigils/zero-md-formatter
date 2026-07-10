const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const runtimePayload = require('../../scripts/runtime-payload.js');

describe('runtime payload allowlist', () => {
  it('lists the packaged runtime files in staging order', () => {
    assert.deepStrictEqual(runtimePayload, [
      'SKILL.md',
      'src/index.js',
      'src/format-content.mjs',
      'guard/check-structure.js',
      'guard/check-fences.js',
      'guard/check-tables.js',
      'guard/check-pipes.js',
    ]);
  });
});
