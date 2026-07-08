const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitTableCells,
  splitTableCellsForStyle,
  isDelimiterLine,
  validateTables,
  hasUnclosedFence,
} = require('../../guard/check-tables.js');

describe('check-tables.js unit tests', () => {
  it('ignores escaped pipes and pipes inside inline code spans', () => {
    const cells = splitTableCells('| escaped | alpha \\| beta | `x | y` |');

    assert.deepStrictEqual(cells, ['escaped', 'alpha \\| beta', '`x | y`']);
  });

  it('preserves empty edge cells when outer pipes are not part of the table style', () => {
    assert.deepStrictEqual(splitTableCellsForStyle(' | value', false), ['', 'value']);
    assert.deepStrictEqual(splitTableCellsForStyle('value | ', false), ['value', '']);
  });

  it('detects delimiter lines', () => {
    assert.equal(isDelimiterLine('| :--- | ---: | :---: |'), true);
    assert.equal(isDelimiterLine('| name | value |'), false);
  });

  it('accepts valid tables with escaped pipe content', () => {
    const content = '| Name | Value |\n| ---- | ----- |\n| A | alpha \\| beta |\n| B | `x \\| y` |\n';

    assert.deepStrictEqual(validateTables(content), []);
  });

  it('detects row column drift', () => {
    const errors = validateTables('| Name | Value |\n| ---- | ----- |\n| A | B | C |\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /row 1 has 3 cols but header has 2/);
  });

  it('accepts representative GFM table forms but reports formatter-safety row variance', () => {
    assert.deepStrictEqual(validateTables('| foo | bar |\n| --- | --- |\n| baz | bim |\n'), []);
    assert.deepStrictEqual(validateTables('foo | bar\n--- | ---\nbaz | bim\n'), []);

    const variance = validateTables('| abc | def |\n| --- | --- |\n| bar |\n| bar | baz | boo |\n');

    assert.equal(variance.length, 2);
    assert.match(variance[0], /row 1 has 1 cols but header has 2/);
    assert.match(variance[1], /row 2 has 3 cols but header has 2/);
  });

  it('stops table validation at blank lines and block boundaries', () => {
    const content = [
      '| Name | Value |',
      '| ---- | ----- |',
      '| A | B |',
      '',
      '| not | part | of | first | table |',
      '# Heading | with pipe',
    ].join('\n');

    assert.deepStrictEqual(validateTables(content), []);
  });

  it('stops table validation before immediate Markdown block boundaries with pipes', () => {
    for (const boundary of [
      '# Heading | with | pipe',
      '- item | with | pipe',
      '> quote | with | pipe',
    ]) {
      const content = [
        '| Name | Value |',
        '| ---- | ----- |',
        '| A | B |',
        boundary,
      ].join('\n');

      assert.deepStrictEqual(validateTables(content), [], boundary);
    }
  });

  it('detects literal fence markers inside table cells as column drift risk', () => {
    const errors = validateTables('| Example | Notes |\n| --- | --- |\n| ```bash | do not put fence markers in table cells |\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /row 1 has 1 cols but header has 2/);
  });

  it('detects inline-code pipes in table rows before formatter can split them', () => {
    const errors = validateTables('| Command | Description |\n| --- | --- |\n| `cat a | grep b` | pipeline |\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /inline code span contains unescaped pipe/);
  });

  it('ignores table-shaped text inside fenced code blocks', () => {
    const content = [
      '```text',
      '| Name | Value |',
      '| ---- | ----- | ----- |',
      '| A | B | C |',
      '```',
    ].join('\n');

    assert.deepStrictEqual(validateTables(content), []);
  });

  it('hasUnclosedFence detects unclosed fence at EOF', () => {
    assert.equal(hasUnclosedFence('```js\nconst x = 1;\n'), true);
    assert.equal(hasUnclosedFence('````markdown\n```text\nnested\n```\n'), true);
  });

  it('hasUnclosedFence returns false when all fences are closed', () => {
    assert.equal(hasUnclosedFence('```js\nconst x = 1;\n```\n'), false);
    assert.equal(hasUnclosedFence(''), false);
    assert.equal(hasUnclosedFence('# No code blocks here'), false);
  });
});
