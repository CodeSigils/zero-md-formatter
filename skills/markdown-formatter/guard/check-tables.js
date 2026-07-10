#!/usr/bin/env node
/**
 * Formatter-safety table validator for markdown-formatter skill.
 * Enforces stable table column counts while ignoring escaped pipes and pipes in inline code spans.
 *
 * GFM spec: https://github.github.io/gfm/#tables-extension-  (§4.10)
 *
 * Spec rules enforced:
 *   - Example 200: escaped pipes (\|) produce literal | in cell content
 *   - Example 203: header and delimiter MUST have same cell count; mismatch means NOT a table
 *   - Example 204: data rows may have fewer cells (empty inserted) or more (excess ignored)
 *
 * Note: This checker is stricter than GFM for formatter safety. GFM permits body
 * rows with varying cell counts; we require all rows to match the header count.
 *
 * Deliberate spec deviation: splitTableCellsForStyle treats | inside inline code
 * spans as content, not as cell delimiters. See that function for rationale.
 *
 * Usage: node check-tables.js <filePath...>
 * Exits 0 if all files are valid, 1 if violations are found.
 */

"use strict";

const fs = require("fs");
const process = require("process");

/**
 * Split a GFM table row into cells, returning cell content strings.
 *
 * Per GFM §4.10, cell splitting happens before inline span parsing, so |
 * inside inline code IS a cell delimiter. We deliberately deviate from the
 * spec here by tracking backtick parity and not splitting inside code spans.
 * This is safe because the column-count comparison this function serves is
 * a formatter-safety preflight, not a spec-compliant parser. The actual
 * inline-code pipe hazard that would corrupt formatter output is caught by
 * tableRowHasInlineCodePipe() below (see Example 200).
 *
 * @param {string} line - A table row line
 * @param {boolean} hasOuterPipes - Whether row has leading/trailing pipes
 * @returns {string[]} Cell content strings
 */
function splitTableCellsForStyle(line, hasOuterPipes = true) {
  const trimmed = line.trim();
  const cells = [];
  let cell = "";
  let escaped = false;
  let codeSpanTicks = 0;
  let start = 0;
  let end = trimmed.length;

  if (hasOuterPipes && trimmed[start] === "|") start++;
  if (hasOuterPipes && end > start && trimmed[end - 1] === "|" && trimmed[end - 2] !== "\\") end--;

  for (let i = start; i < end; i++) {
    const ch = trimmed[i];

    if (escaped) {
      cell += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      cell += ch;
      escaped = true;
      continue;
    }

    if (ch === "`") {
      let ticks = 1;
      while (i + 1 < end && trimmed[i + 1] === "`") {
        ticks++;
        i++;
      }
      cell += "`".repeat(ticks);
      codeSpanTicks = codeSpanTicks === ticks ? 0 : (codeSpanTicks || ticks);
      continue;
    }

    if (ch === "|" && codeSpanTicks === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += ch;
  }

  cells.push(cell.trim());
  return cells;
}

/**
 * Split a GFM table row into cells, assuming leading/trailing outer pipes.
 *
 * Convenience wrapper around splitTableCellsForStyle with hasOuterPipes=true.
 *
 * @param {string} line - A table row line.
 * @returns {string[]} Cell content strings.
 */
function splitTableCells(line) {
  return splitTableCellsForStyle(line, true);
}

/**
 * Quick check if a line could be a GFM table row.
 *
 * A line is a potential table row if it has more than one cell after splitting
 * (implying at least one pipe separator) or if it starts and ends with | and
 * has at least 2 pipes.
 *
 * @param {string} line - A line of markdown content.
 * @returns {boolean} True if the line resembles a table row.
 */
function isPotentialTableRow(line) {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return splitTableCells(line).length > 1 || (trimmed.startsWith("|") && trimmed.endsWith("|") && pipeCount >= 2);
}

/**
 * Check if a line starts a Markdown block boundary (heading, list, blockquote).
 *
 * Lines matching these patterns are treated as non-table boundaries even if
 * they contain pipes, preventing table absorption across block boundaries.
 *
 * @param {string} line - A line of markdown content.
 * @returns {boolean} True if the line is a markdown block boundary.
 */
function isMarkdownBlockBoundary(line) {
  const trimmed = line.trimStart();
  return /^(#{1,6}\s|[-+*]\s+|\d+[.)]\s+|>\s?)/.test(trimmed);
}

/**
 * Check if a line is a GFM table body row (not a delimiter, not a boundary).
 *
 * @param {string} line - A line of markdown content.
 * @returns {boolean} True if the line is a table data row.
 */
function isTableBodyRow(line) {
  if (!isPotentialTableRow(line) || isDelimiterLine(line)) return false;
  if (line.trimStart().startsWith("|")) return true;
  return !isMarkdownBlockBoundary(line);
}

/**
 * Check if a line is a table body row, with configurable outer-pipe style.
 *
 * @param {string} line - A line of markdown content.
 * @param {boolean} [hasOuterPipes=true] - Whether the table uses leading/trailing |.
 * @returns {boolean} True if the line is a table data row for this table style.
 */
function isTableBodyRowForStyle(line, hasOuterPipes = true) {
  if (isDelimiterLine(line)) return false;
  const potential = hasOuterPipes
    ? isPotentialTableRow(line)
    : splitTableCellsForStyle(line, hasOuterPipes).length > 1;
  if (!potential) return false;
  if (!line.trimStart().startsWith("|") && isMarkdownBlockBoundary(line)) return false;
  return true;
}

/**
 * Check if a GFM table row has an unescaped | inside an inline code span.
 *
 * Per GFM Example 200, | inside inline code IS a cell delimiter — the spec
 * requires \| to produce literal | even inside code spans. The formatter
 * follows the spec, so an unescaped | inside `` `code` `` splits the row
 * and corrupts the table. This preflight catches the case before formatting
 * runs.
 *
 * Confirmed empirically against GitHub's Markdown API
 * (api.github.com/markdown, mode=gfm): input table row
 *   `` | `cat a | grep b` | desc | ``
 * renders as two cells (`` `cat a ``, `` grep b` ``), not one.
 *
 * See also: splitTableCellsForStyle which deliberately does NOT split on
 * these pipes for column-count comparison (different purpose).
 *
 * @param {string} line - A table row line
 * @returns {boolean} True if a pipe appears inside backticks
 */
function tableRowHasInlineCodePipe(line) {
  let escaped = false;
  let codeSpanTicks = 0;
  let codeSpanHasPipe = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === "`") {
      let ticks = 1;
      while (i + 1 < line.length && line[i + 1] === "`") {
        ticks++;
        i++;
      }
      if (codeSpanTicks === ticks) {
        if (codeSpanHasPipe) return true;
        codeSpanTicks = 0;
        codeSpanHasPipe = false;
      } else if (codeSpanTicks === 0) {
        codeSpanTicks = ticks;
        codeSpanHasPipe = false;
      }
      continue;
    }

    if (ch === "|" && codeSpanTicks > 0) {
      codeSpanHasPipe = true;
    }
  }

  return false;
}

/**
 * Check if a line is a GFM table delimiter row.
 *
 * A delimiter row consists of pipe-separated cells containing only dashes
 * (with optional leading/trailing colons for alignment). Empty edge cells
 * from ||-prefixed tables are filtered out before checking.
 *
 * @param {string} line - A line of markdown content.
 * @returns {boolean} True if the line is a table delimiter row.
 */
function isDelimiterLine(line) {
  const cells = splitTableCells(line);
  if (cells.length === 0) return false;
  // Filter out empty leading/trailing cells from ||-prefixed tables.
  // A delimiter row like || --- | --- || splits to ["", "---", "---", ""].
  // The empty cells are structural (empty first/last cells from || prefix/suffix),
  // not delimiter content — they should not cause the check to fail.
  const nonEmptyCells = cells.filter((cell) => cell.trim() !== "");
  if (nonEmptyCells.length === 0) return false;
  return nonEmptyCells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

/**
 * Fence state machine transition for the shared getFenceBoundary tracker.
 *
 * When called with no current fence (null), attempts to match an opener.
 * When called with a current fence, attempts to match a closer.
 *
 * Return values:
 * - null: no fence boundary detected (line is not a fence when outside,
 *   or line is not a closer when inside)
 * - {style, length}: entered a new fence (opener found)
 * - false: exited the current fence (closer found)
 *
 * @param {string} line - A line of markdown content.
 * @param {object|null} currentFence - Current fence state ({style, length}) or null.
 * @returns {object|null|false} New fence state, null for no match, or false if closed.
 */
function getFenceBoundary(line, currentFence = null) {
  if (!currentFence) {
    const opener = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
    if (!opener) return null;
    return { style: opener[2][0], length: opener[2].length };
  }

  const closerPattern = new RegExp(`^ {0,3}${currentFence.style}{${currentFence.length},}\\s*$`);
  return closerPattern.test(line) ? false : currentFence;
}

/**
 * Process content line-by-line with the shared getFenceBoundary state machine
 * and report whether any fence is still open at EOF.
 *
 * Callers (CLI, check-pipes.js, check-structure.js) use this to determine
 * whether table/pipe checks are reliable: an unclosed fence blinds the shared
 * tracker, causing all subsequent lines to be treated as inside a code block.
 *
 * @param {string} content - File text
 * @returns {boolean} True if a fence opener was found without a matching closer
 */
function hasUnclosedFence(content) {
  const lines = content.split("\n");
  let currentFence = null;
  for (let i = 0; i < lines.length; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
    }
  }
  return currentFence !== null;
}

/**
 * Validate GFM table structure for formatter safety.
 *
 * Enforces these GFM rules:
 *   - Example 203: header and delimiter MUST have same column count
 *   - Example 204: data rows are expected to match header (formatter-safety strict variant)
 *   - Example 200: escaped pipes and inline-code pipes are flagged as formatter hazards
 *
 * Also runs inline-code pipe preflight for rows that would be split by the formatter.
 *
 * @param {string} content - File text
 * @returns {string[]} Error messages (empty = valid)
 */
function validateTables(content) {
  const errors = [];
  const lines = content.split("\n");
  let currentFence = null;

  for (let i = 0; i < lines.length - 1; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    const header = lines[i];
    const delimiter = lines[i + 1];

    if (!isPotentialTableRow(header) || !isDelimiterLine(delimiter)) continue;

    const headerCols = splitTableCells(header).length;
    const delimiterCols = splitTableCells(delimiter).length;
    const hasOuterPipes = header.trimStart().startsWith("|") || delimiter.trimStart().startsWith("|");

    if (tableRowHasInlineCodePipe(header)) {
      errors.push(`Line ${i + 1}: inline code span contains unescaped pipe; formatter would split it as a table column`);
    }

    if (delimiterCols !== headerCols) {
      errors.push(`Line ${i + 2}: delimiter has ${delimiterCols} cols but header has ${headerCols}`);
    }

    let rowIndex = 1;
    for (let j = i + 2; j < lines.length && isTableBodyRowForStyle(lines[j], hasOuterPipes); j++) {
      const dataCols = splitTableCellsForStyle(lines[j], hasOuterPipes).length;
      if (tableRowHasInlineCodePipe(lines[j])) {
        errors.push(`Line ${j + 1}: inline code span contains unescaped pipe; formatter would split it as a table column`);
      }
      if (dataCols !== headerCols) {
        errors.push(`Line ${j + 1}: row ${rowIndex} has ${dataCols} cols but header has ${headerCols}`);
      }
      rowIndex++;
    }
  }

  return errors;
}

/**
 * Validate tables in a file by path.
 *
 * @param {string} filePath - Path to a markdown file.
 * @returns {string[]} Error messages from validateTables.
 */
function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return validateTables(content);
}

/**
 * CLI entry point. Processes file paths from argv and exits with
 * code 0 if all files are valid, 1 if any violations found or files
 * cannot be read.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI arguments (file paths).
 * @returns {void} Sets process.exitCode.
 */
function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error("Usage: node check-tables.js <filePath...>");
    process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const filePath of argv) {
    try {
      const errors = validateFile(filePath);
      if (errors.length > 0) {
        errors.forEach((e) => console.error(`${filePath}: ${e}`));
        failed = true;
      }
    } catch (err) {
      console.error(`Error reading file ${filePath}: ${err.message}`);
      failed = true;
    }
  }

  process.exitCode = failed ? 1 : 0;
}

module.exports = {
  splitTableCells,
  splitTableCellsForStyle,
  isPotentialTableRow,
  isMarkdownBlockBoundary,
  isTableBodyRow,
  isTableBodyRowForStyle,
  isDelimiterLine,
  getFenceBoundary,
  hasUnclosedFence,
  tableRowHasInlineCodePipe,
  validateTables,
  validateFile,
  main,
};

if (require.main === module) {
  main();
}
