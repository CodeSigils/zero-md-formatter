const { it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

it('uses preflight wording in user-facing docs', () => {
  for (const file of ['README.md', 'SKILL.md']) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /prelight/i, `${file} should say preflight, not prelight`);
    assert.match(content, /preflight/i, `${file} should document preflight behavior`);
  }
});
