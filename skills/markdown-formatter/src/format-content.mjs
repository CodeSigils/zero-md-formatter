import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  splitTableCellsForStyle,
  isPotentialTableRow,
  isDelimiterLine,
  getFenceBoundary,
} = require("../scripts/check-tables.js");

function normalizeLineEndings(content) {
  return content.replace(/\r\n?/g, "\n");
}

function normalizeTrailingWhitespace(content) {
  return content
    .split("\n")
    .map((line) =>
      line.replace(/[ \t]+$/g, (match) => {
        // Preserve 2+ trailing spaces (Markdown hard line break), strip everything else
        return /^  +$/.test(match) ? match : "";
      })
    )
    .join("\n");
}

function ensureFinalNewline(content) {
  return content.endsWith("\n") ? content : `${content}\n`;
}

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

function splitTableBlock(lines, start) {
  const header = lines[start];
  const delimiter = lines[start + 1];
  if (!delimiter || !isPotentialTableRow(header) || !isDelimiterLine(delimiter)) return null;

  const rows = [header, delimiter];
  let end = start + 2;
  while (end < lines.length && isPotentialTableRow(lines[end]) && !isDelimiterLine(lines[end])) {
    rows.push(lines[end]);
    end++;
  }

  return { rows, end };
}

function delimiterInfo(cell) {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  return { left, right };
}

function minDelimiterWidth(cell) {
  const { left, right } = delimiterInfo(cell);
  return 3 + (left ? 1 : 0) + (right ? 1 : 0);
}

function formatDelimiterCell(cell, width) {
  const { left, right } = delimiterInfo(cell);
  const markerWidth = (left ? 1 : 0) + (right ? 1 : 0);
  const dashes = "-".repeat(Math.max(3, width - markerWidth));
  return `${left ? ":" : ""}${dashes}${right ? ":" : ""}`.padEnd(width);
}

function hasEmptyCells(rows, hasOuterPipes) {
  return rows.some((row) =>
    splitTableCellsForStyle(row, hasOuterPipes).some((cell) => cell.trim() === "")
  );
}

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

function maxBacktickRun(lines) {
  let max = 0;
  for (const line of lines) {
    for (const match of line.matchAll(/`+/g)) {
      max = Math.max(max, match[0].length);
    }
  }
  return max;
}

function normalizeFences(content) {
  const lines = content.split("\n");
  const result = [...lines];

  for (let i = 0; i < lines.length; i++) {
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
