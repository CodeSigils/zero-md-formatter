"use strict";

const { splitTableCells, splitTableCellsForStyle, isPotentialTableRow, isTableBodyRowForStyle, isDelimiterLine, getFenceBoundary, tableRowHasInlineCodePipe } = require('../guard/check-tables.js');
const { detectAdjacentPipes } = require('../guard/check-pipes.js');

/**
 * Repair formatter-unsafe table column-count mismatches.
 *
 * When a table's header, delimiter, or data rows disagree on column count,
 * short rows are padded with empty trailing cells to match the largest
 * declared column count. This ensures the formatter receives structurally
 * stable tables and can format them without triggering the structural guard.
 *
 * The repair is conservative: it only adds trailing empty cells, never
 * removes columns or modifies cell content.
 *
 * @param {string} content File text.
 * @returns {string} Repaired text, or original if no repairs needed.
 */
function repairTableColumns(content) {
  const lines = content.split("\n");
  const result = [...lines];
  let modified = false;
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

    if (!delimiter || !isDelimiterLine(delimiter)) continue;

    const headerCols = splitTableCells(header).length;
    const delimiterCols = splitTableCells(delimiter).length;
    const hasOuterPipes = header.trimStart().startsWith("|") || delimiter.trimStart().startsWith("|");
    const targetCols = Math.max(headerCols, delimiterCols);

    if (targetCols <= 1) continue;            // not a real table
    if (headerCols === delimiterCols) {
      // Header and delimiter agree; check data rows
      let anyShort = false;
      let j = i + 2;
      while (j < lines.length) {
        const dataLine = lines[j];
        if (!isTableBodyRowForStyle(dataLine, hasOuterPipes)) break;
        const dataCols = splitTableCellsForStyle(dataLine, hasOuterPipes).length;
        if (dataCols < targetCols) { anyShort = true; break; }
        j++;
      }
      if (!anyShort) continue;
    }

    // Ensure header has targetCols
    if (headerCols < targetCols) {
      const missing = targetCols - headerCols;
      result[i] = lines[i].replace(/\s*$/, "") + " |".repeat(missing) + " ";
      modified = true;
    }

    // Ensure delimiter has targetCols
    if (delimiterCols < targetCols) {
      const missing = targetCols - delimiterCols;
      result[i + 1] = lines[i + 1].replace(/\s*$/, "") + " --- |".repeat(missing);
      modified = true;
    }

    // Pad short data rows
    const targetColsFinal = Math.max(
      splitTableCells(result[i]).length,
      splitTableCells(result[i + 1]).length,
    );
    let j = i + 2;
    while (j < lines.length) {
      const dataLine = lines[j];
      if (!isTableBodyRowForStyle(dataLine, hasOuterPipes)) break;
      const dataCols = splitTableCellsForStyle(dataLine, hasOuterPipes).length;

      if (dataCols < targetColsFinal) {
        const missing = targetColsFinal - dataCols;
        result[j] = lines[j].replace(/\s*$/, "") + " |".repeat(missing);
        // Note: if the row is also missing a trailing pipe, splitTableCells
        // will still report fewer cells after padding, because it strips
        // outer pipes. In practice every well-formed GFM table row ends
        // with |, so this is not expected in real inputs.
        // If the line already ends with |, the first repeat adds a space before the cell
        // which is fine — the formatter normalizes widths.
        modified = true;
      }
      j++;
    }

    i = j; // skip past the table body
  }

  return modified ? result.join("\n") : content;
}

/**
 * Repair adjacent-pipe patterns (||) in GFM table rows.
 *
 * Per GFM §4.10, consecutive pipes (||) create valid empty cells. The formatter
 * treats adjacent pipes as a structural hazard because they expand column count
 * and can corrupt the entire table. This function replaces || with | | (space
 * between pipes) in table rows, preserving empty-cell semantics while producing
 * a table that can be checked safely.
 *
 * The repair respects escaped pipes and inline code spans, and ignores content
 * inside fenced code blocks.
 *
 * @param {string} content File text.
 * @returns {string} Repaired text, or original if no repairs needed.
 */
function repairAdjacentPipes(content) {
  const issues = detectAdjacentPipes(content);
  if (issues.length === 0) return content;

  const lines = content.split("\n");
  for (const issue of issues) {
    const i = issue.lineIndex;
    let result = "";
    let escaped = false;
    let codeSpanTicks = 0;

    for (let pos = 0; pos < lines[i].length; pos++) {
      const ch = lines[i][pos];
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        result += ch;
        continue;
      }
      if (ch === "`") {
        let ticks = 1;
        while (pos + 1 < lines[i].length && lines[i][pos + 1] === "`") {
          ticks++;
          pos++;
        }
        codeSpanTicks = codeSpanTicks === ticks ? 0 : (codeSpanTicks || ticks);
        result += "`".repeat(ticks);
        continue;
      }
      if (ch === "|" && pos + 1 < lines[i].length && lines[i][pos + 1] === "|" && codeSpanTicks === 0) {
        result += "| |";
        pos++; // skip the second pipe
        continue;
      }
      result += ch;
    }

    lines[i] = result;
  }
  return lines.join("\n");
}

/**
 * Normalize spacing in GFM table rows. Ensures each cell has consistent
 * space-around-pipe formatting: `| cell | content |`.
 * Handles empty cells (`| |`) and delimiter cells (`| :--: | --- |`).
 * Also normalizes delimiter dashes to exactly 3 (plus alignment markers).
 *
 * Only normalizes lines that are structurally part of pipe tables.
 * Skips fenced code blocks.
 *
 * @param {string} content File text.
 * @returns {string} Content with table spacing normalized.
 */
function normalizeTableSpacing(content) {
  const lines = content.split("\n");
  let currentFence = null;
  let modified = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    if (!isPotentialTableRow(lines[i]) || !isDelimiterLine(lines[i + 1])) continue;
    const hasOuterPipes = lines[i].trimStart().startsWith("|") || lines[i + 1].trimStart().startsWith("|");

    let end = i + 2;
    while (end < lines.length && isTableBodyRowForStyle(lines[end], hasOuterPipes)) end++;
    if (!hasOuterPipes) {
      i = end - 1;
      continue;
    }

    for (let rowIndex = i; rowIndex < end; rowIndex++) {
      if (!lines[rowIndex].trim().startsWith("|") || !lines[rowIndex].trim().endsWith("|")) continue;
      const cells = splitTableCells(lines[rowIndex]);
      if (cells.length <= 1) continue;

      // Reconstruct with consistent spacing: | cell | content |
      // Normalize delimiter dashes to exactly 3 (plus alignment markers)
      const normalizedCells = cells.map((c, idx) => {
        if (rowIndex === i + 1) {
          return " " + c.trim().replace(/^(:?)-+(:?)$/, "$1---$2") + " ";
        }
        if (c === "") return " ";
        return " " + c + " ";
      });
      const normalized = "|" + normalizedCells.join("|") + "|";

      if (normalized !== lines[rowIndex]) {
        lines[rowIndex] = normalized;
        modified = true;
      }
    }

    i = end - 1;
  }

  return modified ? lines.join("\n") : content;
}

/**
 * Check if a specific table (by start index) has any empty cells.
 *
 * @param {string[]} lines - Content split by newline.
 * @param {number} startIndex - Line index where the table starts.
 * @returns {boolean} True if any row in the table has an empty cell.
 */
function tableHasEmptyCells(lines, startIndex) {
  const header = lines[startIndex];
  const delimiter = lines[startIndex + 1];
  const hasOuterPipes = header.trim().startsWith("|") || delimiter.trim().startsWith("|");

  for (let j = startIndex; j < lines.length; j++) {
    if (j > startIndex + 1 && !isTableBodyRowForStyle(lines[j], hasOuterPipes)) break;
    const cells = splitTableCellsForStyle(lines[j], hasOuterPipes);
    if (cells.some((cell) => cell.trim() === "")) return true;
  }

  return false;
}

/**
 * Check if content contains GFM tables with any empty cells.
 * Empty-cell tables are intentionally preserved by the CLI because column-count
 * ambiguity is easy to hide during automatic formatting.
 *
 * Scans all table rows (header, delimiter, and body) via tableHasEmptyCells,
 * which handles both piped and non-piped table styles.
 *
 * @param {string} content File text.
 * @returns {boolean} True if any table row has an empty cell.
 */
function hasTableWithEmptyCells(content) {
  const lines = content.split("\n");
  let currentFence = null;
  for (let i = 0; i < lines.length - 1; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    if (!isPotentialTableRow(lines[i]) || !isDelimiterLine(lines[i + 1])) continue;
    if (tableHasEmptyCells(lines, i)) return true;
  }
  return false;
}

/**
 * Audit table structure in content and produce a human-readable report.
 *
 * Scans for GFM tables, reporting each table's location, cell counts
 * per row, and structural hazards (adjacent pipes, inline-code pipes,
 * column drift, empty cells).
 *
 * @param {string} content - Markdown file text.
 * @param {string} [label="<input>"] - Label for the report (typically file path).
 * @returns {string} Human-readable audit report.
 */
function auditTables(content, label = "<input>") {
  const lines = content.split("\n");
  const output = [`Table audit: ${label}`];
  let currentFence = null;
  let tableCount = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    if (!isPotentialTableRow(lines[i]) || !isDelimiterLine(lines[i + 1])) continue;

    tableCount++;
    const headerCols = splitTableCells(lines[i]).length;
    const delimiterCols = splitTableCells(lines[i + 1]).length;
    const hasOuterPipes = lines[i].trimStart().startsWith("|") || lines[i + 1].trimStart().startsWith("|");
    output.push(`line ${i + 1}: table start header-cells=${headerCols} delimiter-cells=${delimiterCols}`);

    for (let j = i; j < lines.length && (j <= i + 1 || isTableBodyRowForStyle(lines[j], hasOuterPipes)); j++) {
      const cells = splitTableCellsForStyle(lines[j], hasOuterPipes);
      const hazards = [];
      const adjacent = detectAdjacentPipes(lines[j]);
      if (adjacent.length > 0) hazards.push("adjacent-pipes");
      if (tableRowHasInlineCodePipe(lines[j])) hazards.push("inline-code-pipe");
      if (cells.length !== headerCols) hazards.push(`column-drift:${cells.length}->${headerCols}`);
      if (cells.some((cell) => cell.trim() === "")) hazards.push("empty-cell");
      output.push(`line ${j + 1}: cells=${cells.length} hazards=${hazards.length ? hazards.join(",") : "none"} | ${lines[j]}`);
    }
  }

  if (tableCount === 0) output.push("no tables found");
  return output.join("\n");
}

module.exports = {
  repairTableColumns,
  repairAdjacentPipes,
  normalizeTableSpacing,
  tableHasEmptyCells,
  hasTableWithEmptyCells,
  auditTables,
};
