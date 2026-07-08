const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateFences } = require('../../guard/check-fences.js');

describe('check-fences.js unit tests', () => {
  it('accepts blank fences and nested shorter fences inside longer fences', () => {
    const content = '````markdown\n```text\nexample\n```\n````\n\n```\nplain output\n```\n';

    assert.deepStrictEqual(validateFences(content), []);
  });

  it('detects unclosed fences', () => {
    const errors = validateFences('```js\nconst x = 1;\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Unclosed fence/);
  });

  it('accepts closing fences with any valid independent 0-3 space indentation', () => {
    const content = ' ```js\nconst x = 1;\n```\n\n```text\nhello\n   ```\n';

    assert.deepStrictEqual(validateFences(content), []);
  });

  it('detects whitespace-only language info strings', () => {
    const errors = validateFences('``` \nconst x = 1;\n```\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /empty language tag/);
  });

  it('detects leading whitespace before language info strings', () => {
    const errors = validateFences('``` javascript\nconst x = 1;\n```\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /must not start with whitespace/);
  });

  it('detects backticks in backtick fence info strings', () => {
    const errors = validateFences('```js`bad\nconst x = 1;\n```\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /must not contain backticks/);
  });
});
