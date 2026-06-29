#!/usr/bin/env node
/**
 * Formatter-safety table validator for markdown-formatter skill.
 * Enforces stable table column counts for oxfmt while ignoring escaped pipes and pipes in inline code spans.
 *
 * Note: GFM permits body rows with fewer or more cells than the header. This
 * checker is intentionally stricter for formatter safety.
 *
 * Usage: node check-tables.js <filePath...>
 * Exits 0 if all files are valid, 1 if violations are found.
 */

"use strict";

const fs = require("fs");
const process = require("process");

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

function splitTableCells(line) {
  return splitTableCellsForStyle(line, true);
}

function isPotentialTableRow(line) {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return splitTableCells(line).length > 1 || (trimmed.startsWith("|") && trimmed.endsWith("|") && pipeCount >= 2);
}

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

function isDelimiterLine(line) {
  const cells = splitTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

function getFenceBoundary(line, currentFence = null) {
  if (!currentFence) {
    const opener = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
    if (!opener) return null;
    return { style: opener[2][0], length: opener[2].length };
  }

  const closerPattern = new RegExp(`^ {0,3}${currentFence.style}{${currentFence.length},}\\s*$`);
  return closerPattern.test(line) ? false : currentFence;
}

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

    if (tableRowHasInlineCodePipe(header)) {
      errors.push(`Line ${i + 1}: inline code span contains unescaped pipe; oxfmt would split it as a table column`);
    }

    if (delimiterCols !== headerCols) {
      errors.push(`Line ${i + 2}: delimiter has ${delimiterCols} cols but header has ${headerCols}`);
    }

    let rowIndex = 1;
    for (let j = i + 2; j < lines.length && isPotentialTableRow(lines[j]); j++) {
      if (isDelimiterLine(lines[j])) break;
      const dataCols = splitTableCells(lines[j]).length;
      if (tableRowHasInlineCodePipe(lines[j])) {
        errors.push(`Line ${j + 1}: inline code span contains unescaped pipe; oxfmt would split it as a table column`);
      }
      if (dataCols !== headerCols) {
        errors.push(`Line ${j + 1}: row ${rowIndex} has ${dataCols} cols but header has ${headerCols}`);
      }
      rowIndex++;
    }
  }

  return errors;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return validateTables(content);
}

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
  tableRowHasInlineCodePipe,
  isDelimiterLine,
  getFenceBoundary,
  validateTables,
  validateFile,
  main,
};

if (require.main === module) {
  main();
}
