const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitTableCells,
  splitTableCellsForStyle,
  isDelimiterLine,
  validateTables,
} = require('../../skills/markdown-formatter/scripts/check-tables.js');

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
    const content = '| Name | Value |\n| ---- | ----- |\n| A | alpha \\| beta |\n| B | `x | y` |\n';

    assert.deepStrictEqual(validateTables(content), []);
  });

  it('detects row column drift', () => {
    const errors = validateTables('| Name | Value |\n| ---- | ----- |\n| A | B | C |\n');

    assert.equal(errors.length, 1);
    assert.match(errors[0], /row 1 has 3 cols but header has 2/);
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
});
