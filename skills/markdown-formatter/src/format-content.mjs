import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  splitTableCellsForStyle,
  isPotentialTableRow,
  isTableBodyRowForStyle,
  isDelimiterLine,
  getFenceBoundary,
} = require("../guard/check-tables.js");

/**
 * Normalize all line endings to Unix-style LF (\n).
 *
 * Converts \r\n (Windows) and \r (old Mac) to \n.
 *
 * @param {string} content - File text.
 * @returns {string} Text with LF-only line endings.
 */
function normalizeLineEndings(content) {
  return content.replace(/\r\n?/g, "\n");
}

/**
 * Strip trailing whitespace from each line.
 *
 * Preserves 2+ trailing spaces (Markdown hard line break syntax) and
 * strips everything else. Blank lines with only spaces are fully cleared.
 *
 * @param {string} content - File text.
 * @returns {string} Text with trailing whitespace removed.
 */
function normalizeTrailingWhitespace(content) {
  const lines = content.split("\n");
  let currentFence = null;
  return lines.map((line) => {
    const fenceBoundary = getFenceBoundary(line, currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      return line;
    }
    if (currentFence) return line;
    return line.replace(/[ \t]+$/g, (match) => /^  +$/.test(match) ? match : "");
  }).join("\n");
}

/**
 * Ensure content ends with exactly one newline.
 *
 * @param {string} content - File text.
 * @returns {string} Text ending with a single \n.
 */
function ensureFinalNewline(content) {
  return content.endsWith("\n") ? content : `${content}\n`;
}

/**
 * Replace leading tabs with spaces outside fenced code blocks.
 *
 * Lines inside fenced code blocks are left untouched. Tab width is
 * controlled by options.indentWidth (default: 2).
 *
 * @param {string} content - File text.
 * @param {{indentWidth?: number}} [options={}] - Options. indentWidth sets spaces per tab.
 * @returns {string} Text with tabs replaced by spaces.
 */
function normalizeIndentation(content, options = {}) {
  const indentWidth = options.indentWidth || 2;
  const lines = content.split("\n");
  let currentFence = null;

  return lines.map((line) => {
    const fenceBoundary = getFenceBoundary(line, currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      return line;
    }
    if (currentFence) return line;

    return line.replace(/^\t+/, (tabs) => " ".repeat(tabs.length * indentWidth));
  }).join("\n");
}

/**
 * Extract a contiguous table block starting at a given line index.
 *
 * Returns the header, delimiter, and body rows if the start position is
 * a valid table (header + delimiter). Returns null otherwise.
 *
 * @param {string[]} lines - Content split by newline.
 * @param {number} start - Line index of the potential table header.
 * @returns {{rows: string[], end: number}|null} Table rows and the line index after the table, or null.
 */
function splitTableBlock(lines, start) {
  const header = lines[start];
  const delimiter = lines[start + 1];
  if (!delimiter || !isPotentialTableRow(header) || !isDelimiterLine(delimiter)) return null;
  const hasOuterPipes = header.trimStart().startsWith("|") || delimiter.trimStart().startsWith("|");

  const rows = [header, delimiter];
  let end = start + 2;
  while (end < lines.length && isTableBodyRowForStyle(lines[end], hasOuterPipes)) {
    rows.push(lines[end]);
    end++;
  }

  return { rows, end };
}

/**
 * Detect alignment markers in a delimiter cell.
 *
 * @param {string} cell - A delimiter cell string (e.g. ":---:", "---", ":---").
 * @returns {{left: boolean, right: boolean}} Whether left/right colons are present.
 */
function delimiterInfo(cell) {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  return { left, right };
}

/**
 * Compute the minimum column width for a delimiter cell.
 *
 * The minimum is 3 dashes plus 1 for each alignment colon (left, right).
 *
 * @param {string} cell - A delimiter cell string.
 * @returns {number} Minimum width in characters.
 */
function minDelimiterWidth(cell) {
  const { left, right } = delimiterInfo(cell);
  return 3 + (left ? 1 : 0) + (right ? 1 : 0);
}

/**
 * Format a delimiter cell to a target width with alignment markers.
 *
 * Pads dashes to fill the width, preserving leading/trailing colons.
 *
 * @param {string} cell - A delimiter cell string.
 * @param {number} width - Target column width.
 * @returns {string} Formatted delimiter cell padded to width.
 */
function formatDelimiterCell(cell, width) {
  const { left, right } = delimiterInfo(cell);
  const markerWidth = (left ? 1 : 0) + (right ? 1 : 0);
  const dashes = "-".repeat(Math.max(3, width - markerWidth));
  return `${left ? ":" : ""}${dashes}${right ? ":" : ""}`.padEnd(width);
}

/**
 * Check if any row in a table block contains an empty cell.
 *
 * @param {string[]} rows - Table rows (header, delimiter, body).
 * @param {boolean} hasOuterPipes - Whether rows use leading/trailing pipes.
 * @returns {boolean} True if any cell is empty after trimming.
 */
function hasEmptyCells(rows, hasOuterPipes) {
  return rows.some((row) =>
    splitTableCellsForStyle(row, hasOuterPipes).some((cell) => cell.trim() === "")
  );
}

/**
 * Format a table block with aligned columns and consistent spacing.
 *
 * Computes per-column widths from content, applies alignment from the
 * delimiter row (:---, :---:, ---:), and pads cells accordingly. Preserves
 * the original pipe style (outer pipes or none). Returns rows unchanged
 * if any row has empty cells (ambiguous column intent).
 *
 * @param {string[]} rows - Table rows (header, delimiter, body).
 * @returns {string[]} Formatted rows with aligned columns.
 */
function formatTableRows(rows) {
  const hasLeadingPipe = rows[0].trimStart().startsWith("|") || rows[1].trimStart().startsWith("|");
  const hasTrailingPipe = rows[0].trimEnd().endsWith("|") || rows[1].trimEnd().endsWith("|");
  const hasOuterPipes = hasLeadingPipe || hasTrailingPipe;

  if (hasEmptyCells(rows, hasOuterPipes)) return rows;

  const parsedRows = rows.map((row) => splitTableCellsForStyle(row, hasOuterPipes));
  const columnCount = Math.max(...parsedRows.map((cells) => cells.length));
  const widths = Array.from({ length: columnCount }, (_, index) => {
    let width = minDelimiterWidth(parsedRows[1][index] || "---");
    for (const [rowIndex, cells] of parsedRows.entries()) {
      if (rowIndex === 1) continue;
      width = Math.max(width, (cells[index] || "").trim().length);
    }
    return width;
  });

  // Determine per-column alignment from delimiter row
  const alignments = parsedRows[1].map((delimCell) => {
    const { left, right } = delimiterInfo(delimCell);
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  return parsedRows.map((cells, rowIndex) => {
    const formattedCells = widths.map((width, index) => {
      const cell = cells[index] || "";
      if (rowIndex === 1) return formatDelimiterCell(cell, width);
      const trimmed = cell.trim();
      if (!trimmed) return " ".repeat(width);
      const align = alignments[index] || "left";
      if (align === "right") return trimmed.padStart(width);
      if (align === "center") {
        const leftPad = Math.floor((width - trimmed.length) / 2);
        const rightPad = width - trimmed.length - leftPad;
        return " ".repeat(leftPad) + trimmed + " ".repeat(rightPad);
      }
      return trimmed.padEnd(width);
    });

    const joined = formattedCells.map((cell) => ` ${cell} `).join("|");
    if (hasLeadingPipe && hasTrailingPipe) return `|${joined}|`;
    if (hasLeadingPipe) return `|${joined}`;
    if (hasTrailingPipe) return `${joined}|`;
    return joined;
  });
}

/**
 * Align all GFM tables in content with consistent column widths.
 *
 * Scans for table blocks (skipping fenced code blocks), formats each
 * with aligned columns via formatTableRows, and replaces in-place.
 *
 * @param {string} content - File text.
 * @returns {string} Text with tables aligned.
 */
function alignTables(content) {
  const lines = content.split("\n");
  const result = [...lines];
  let currentFence = null;

  for (let i = 0; i < lines.length - 1; i++) {
    const fenceBoundary = getFenceBoundary(lines[i], currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    const block = splitTableBlock(lines, i);
    if (!block) continue;

    const formattedRows = formatTableRows(block.rows);
    for (let offset = 0; offset < formattedRows.length; offset++) {
      result[i + offset] = formattedRows[offset];
    }
    i = block.end - 1;
  }

  return result.join("\n");
}

/**
 * Find the longest consecutive backtick run across all lines.
 *
 * Used to determine the minimum fence length that won't conflict
 * with backticks in the fenced content.
 *
 * @param {string[]} lines - Lines of content (typically inside a fence).
 * @returns {number} Length of the longest backtick run.
 */
function maxBacktickRun(lines) {
  let max = 0;
  for (const line of lines) {
    for (const match of line.matchAll(/`+/g)) {
      max = Math.max(max, match[0].length);
    }
  }
  return max;
}

/**
 * Convert tilde fences to backtick fences and normalize fence lengths.
 *
 * For each tilde fence pair (opener/closer), replaces with backtick fences
 * sized to exceed the longest backtick run inside the block (minimum 3).
 * Preserves indentation and info string from the original opener.
 *
 * @param {string} content - File text.
 * @returns {string} Text with all fences using backtick style.
 */
function normalizeFences(content) {
  const lines = content.split("\n");
  const result = [...lines];

  for (let i = 0; i < lines.length; i++) {
    // Backtick fences are preserved verbatim. Skip the entire block so
    // literal ~~~ runs inside them are never mistaken for fence openers
    // and converted (which would corrupt the surrounding structure).
    const btOpener = lines[i].match(/^( {0,3})(`{3,})[^\n]*$/);
    if (btOpener) {
      const btLength = btOpener[2].length;
      let j = i + 1;
      while (j < lines.length) {
        const btCloser = lines[j].match(/^( {0,3})`{3,}\s*$/);
        if (btCloser && lines[j].trim().length >= btLength) break;
        j++;
      }
      // Unclosed fence: consume the rest of the document untouched
      // (write modes reject unclosed fences during preflight anyway).
      i = j;
      continue;
    }

    const opener = lines[i].match(/^( {0,3})~{3,}([^\n]*)$/);
    if (!opener) continue;

    const indent = opener[1];
    const info = opener[2];
    const tildeLength = lines[i].slice(indent.length).match(/^~+/)[0].length;
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const closer = lines[j].match(/^( {0,3})~{3,}\s*$/);
      if (closer && lines[j].trim().length >= tildeLength) {
        close = j;
        break;
      }
    }
    if (close === -1) continue;

    const contentLines = lines.slice(i + 1, close);
    const fenceLength = Math.max(tildeLength, maxBacktickRun(contentLines) + 1, 3);
    const marker = "`".repeat(fenceLength);
    result[i] = `${indent}${marker}${info}`;
    result[close] = `${indent}${marker}`;
    i = close;
  }

  return result.join("\n");
}

export function formatContent(content, options = {}) {
  let formatted = normalizeLineEndings(content);
  formatted = normalizeTrailingWhitespace(formatted);
  formatted = normalizeIndentation(formatted, options);
  formatted = alignTables(formatted);
  formatted = normalizeFences(formatted);
  formatted = ensureFinalNewline(formatted);
  return formatted;
}

export {
  normalizeTrailingWhitespace,
  ensureFinalNewline,
  normalizeIndentation,
  alignTables,
  normalizeFences,
};
