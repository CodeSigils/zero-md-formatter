const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractFences,
  extractTables,
  buildSnapshot,
  validateStructure,
  compareSnapshots,
} = require('../../skills/markdown-formatter/scripts/check-structure.js');

describe('check-structure.js unit tests', () => {
  // Test the helper functions directly
  describe('extractFences function', () => {
    it('should extract fences correctly', async () => {
      const content = '```js\nconsole.log("hello");\n```\n\nSome text\n\n~~~python\nprint("world")\n~~~';
      const fences = extractFences(content);
      
      assert.strictEqual(fences.length, 2);
      assert.deepStrictEqual(fences[0], {
        opener: '```',
        length: 3,
        style: '`',
        info: 'js',
        closer: '```'
      });
      assert.deepStrictEqual(fences[1], {
        opener: '~~~',
        length: 3,
        style: '~',
        info: 'python',
        closer: '~~~'
      });
    });

    it('should handle unclosed fence', async () => {
      const content = '```js\nconsole.log("hello");';
      const fences = extractFences(content);
      
      assert.strictEqual(fences.length, 1);
      assert.deepStrictEqual(fences[0], {
        opener: '```',
        length: 3,
        style: '`',
        info: 'js',
        closer: null
      });
    });

    it('should accept closing fences with independent 0-3 space indentation', async () => {
      const content = ' ```js\nconsole.log("hello");\n```\n\n```text\nhello\n   ```';
      const fences = extractFences(content);
      const errors = validateStructure(content);

      assert.strictEqual(fences.length, 2);
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(fences[0].closer, '```');
      assert.strictEqual(fences[1].closer, '```');
    });
  });

  describe('extractTables function', () => {
    it('should extract tables correctly', async () => {
      const content = '| a | b |\n|---|---|\n| 1 | 2 |\n\n| x | y | z |\n|---|---|---|\n| 3 | 4 | 5 |';
      const tables = extractTables(content);
      
      assert.strictEqual(tables.length, 2);
      assert.deepStrictEqual(tables[0].header.cells, ['a', 'b']);
      assert.strictEqual(tables[0].header.colCount, 2);
      assert.deepStrictEqual(tables[0].delimiter.cells, ['---', '---']);
      assert.strictEqual(tables[0].delimiter.colCount, 2);
      assert.deepStrictEqual(tables[0].rows[0].cells, ['1', '2']);
      assert.strictEqual(tables[0].rows[0].colCount, 2);
      
      assert.deepStrictEqual(tables[1].header.cells, ['x', 'y', 'z']);
      assert.strictEqual(tables[1].header.colCount, 3);
      assert.deepStrictEqual(tables[1].delimiter.cells, ['---', '---', '---']);
      assert.strictEqual(tables[1].delimiter.colCount, 3);
      assert.deepStrictEqual(tables[1].rows[0].cells, ['3', '4', '5']);
      assert.strictEqual(tables[1].rows[0].colCount, 3);
    });

    it('should keep header-and-delimiter-only tables structurally visible', async () => {
      const content = '| a | b |\n|---|---|\n';
      const tables = extractTables(content);
      
      assert.strictEqual(tables.length, 1);
      assert.strictEqual(tables[0].header.colCount, 2);
      assert.strictEqual(tables[0].delimiter.colCount, 2);
      assert.deepStrictEqual(tables[0].rows, []);
    });

    it('should ignore table-shaped text inside fenced code blocks', async () => {
      const content = [
        '```text',
        '| a | b |',
        '|---|---|---|',
        '| 1 | 2 | 3 |',
        '```',
      ].join('\n');
      const tables = extractTables(content);

      assert.deepStrictEqual(tables, []);
      assert.deepStrictEqual(validateStructure(content), []);
    });
  });

  describe('buildSnapshot function', () => {
    it('should build snapshot correctly', async () => {
      const content = '```js\nconsole.log("hello");\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
      const snapshot = buildSnapshot(content);
      
      assert.strictEqual(snapshot.fenceCount, 1);
      assert.strictEqual(snapshot.tableCount, 1);
      assert.deepStrictEqual(snapshot.fences[0], {
        length: 3,
        style: '`',
        info: 'js',
        hasInfo: true,
        isClosed: true
      });
      assert.deepStrictEqual(snapshot.tables[0], {
        headerCols: 2,
        delimiterCols: 2,
        rowCols: [2],
        headerDelimiterMatch: true,
        rowsMatch: true
      });
    });

    it('should handle no fences or tables', async () => {
      const content = '# Hello\n\nJust some text.';
      const snapshot = buildSnapshot(content);
      
      assert.strictEqual(snapshot.fenceCount, 0);
      assert.strictEqual(snapshot.tableCount, 0);
      assert.deepStrictEqual(snapshot.fences, []);
      assert.deepStrictEqual(snapshot.tables, []);
    });
  });

  describe('validateStructure function', () => {
    it('should return no errors for valid content', async () => {
      const content = '# Header\n\n```js\nconsole.log("hello");\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
      const errors = validateStructure(content);
      
      assert.deepStrictEqual(errors, []);
    });

    it('should detect unclosed fence', async () => {
      const content = '```js\nconsole.log("hello");';
      const errors = validateStructure(content);
      
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /^Unclosed fence: `{3}$/);
    });

    it('should detect empty language tag', async () => {
      const content = '``` \nconsole.log("hello");\n```';
      const errors = validateStructure(content);
      
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /^Empty language tag on fence opener: `{3} $/);
    });

    it('should detect backticks in backtick fence info strings', async () => {
      const content = '```js`bad\nconsole.log("hello");\n```';
      const errors = validateStructure(content);

      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /contains backtick/);
    });

    it('should detect table column mismatch', async () => {
      const content = '| a | b |\n|---|---|---|\n| 1 | 2 | 3 |';
      const errors = validateStructure(content);
      
      assert.strictEqual(errors.length, 2);
      assert.match(errors[0], /^Table column mismatch: header 2 vs delimiter 3$/);
      assert.match(errors[1], /^Table row 1 column mismatch: row 3 vs header 2$/);
    });

    it('should detect row column mismatch', async () => {
      const content = '| a | b |\n|---|---|\n| 1 | 2 | 3 |';
      const errors = validateStructure(content);
      
      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /^Table row 1 column mismatch: row 3 vs header 2$/);
    });

    it('should not validate table-shaped text after an unclosed fence opener', async () => {
      const content = '```js\nconsole.log("hello");\n\n| a | b |\n|---|---|---|\n| 1 | 2 | 3 |';
      const errors = validateStructure(content);
      
      assert.strictEqual(errors.length, 1);
      const hasUnclosedFence = errors.some(e => e.includes('Unclosed fence'));
      const hasTableMismatch = errors.some(e => e.includes('Table column mismatch') || e.includes('Table row'));
      assert.strictEqual(hasUnclosedFence, true);
      assert.strictEqual(hasTableMismatch, false);
    });
  });

  describe('compareSnapshots function', () => {
    it('should detect fence count changes', async () => {
      const before = {
        fenceCount: 1,
        fences: [{ length: 3, style: '`', info: 'js', hasInfo: true, isClosed: true }],
        tableCount: 0,
        tables: []
      };
      
      const after = {
        fenceCount: 2,
        fences: [
          { length: 3, style: '`', info: 'js', hasInfo: true, isClosed: true },
          { length: 3, style: '`', info: 'ts', hasInfo: true, isClosed: true }
        ],
        tableCount: 0,
        tables: []
      };
      
      const drift = compareSnapshots(before, after);
      assert.strictEqual(drift.length, 1);
      assert.match(drift[0], /^Fence count changed: 1 -> 2$/);
    });

    it('should detect fence info changes', async () => {
      const before = {
        fenceCount: 1,
        fences: [{ length: 3, style: '`', info: 'js', hasInfo: true, isClosed: true }],
        tableCount: 0,
        tables: []
      };
      
      const after = {
        fenceCount: 1,
        fences: [{ length: 3, style: '`', info: 'typescript', hasInfo: true, isClosed: true }],
        tableCount: 0,
        tables: []
      };
      
      const drift = compareSnapshots(before, after);
      assert.strictEqual(drift.length, 1);
      assert.match(drift[0], /^Fence\[0\] info string changed: "js" -> "typescript"/);
    });

    it('should detect table column changes', async () => {
      const before = {
        fenceCount: 0,
        fences: [],
        tableCount: 1,
        tables: [{
          headerCols: 2,
          delimiterCols: 2,
          rowCols: [2],
          headerDelimiterMatch: true,
          rowsMatch: true
        }]
      };
      
      const after = {
        fenceCount: 0,
        fences: [],
        tableCount: 1,
        tables: [{
          headerCols: 3,
          delimiterCols: 3,
          rowCols: [3],
          headerDelimiterMatch: true,
          rowsMatch: true
        }]
      };
      
      const drift = compareSnapshots(before, after);
      assert.strictEqual(drift.length, 3);
      assert.match(drift[0], /^Table\[0\] header cols changed: 2 -> 3$/);
      assert.match(drift[1], /^Table\[0\] delimiter cols changed: 2 -> 3$/);
      assert.match(drift[2], /^Table\[0\] row col counts changed: \[2\] -> \[3\]$/);
    });

    it('should return empty array when no changes', async () => {
      const before = {
        fenceCount: 1,
        fences: [{ length: 3, style: '`', info: 'js', hasInfo: true, isClosed: true }],
        tableCount: 1,
        tables: [{
          headerCols: 2,
          delimiterCols: 2,
          rowCols: [2],
          headerDelimiterMatch: true,
          rowsMatch: true
        }]
      };
      
      const after = {
        fenceCount: 1,
        fences: [{ length: 3, style: '`', info: 'js', hasInfo: true, isClosed: true }],
        tableCount: 1,
        tables: [{
          headerCols: 2,
          delimiterCols: 2,
          rowCols: [2],
          headerDelimiterMatch: true,
          rowsMatch: true
        }]
      };
      
      const drift = compareSnapshots(before, after);
      assert.deepStrictEqual(drift, []);
    });
  });
});
