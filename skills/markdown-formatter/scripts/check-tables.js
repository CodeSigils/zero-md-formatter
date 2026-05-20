#!/usr/bin/env node
/**
 * Table column validator for markdown-formatter skill.
 * Validates table column consistency.
 *
 * Usage: node check-tables.js <filePath>
 * Exits 0 if valid, 1 if violations found.
 */

"use strict";

const fs = require("fs");
const process = require("process");

function isDelimiterLine(line) {
  const stripped = line.trim();
  if (!stripped.startsWith("|")) return false;
  const cells = stripped.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
  if (cells.length === 0) return false;
  return cells.every((cell) => {
    const c = cell.trim();
    if (c === "") return true;
    const cleaned = c.replace(/:/g, "");
    return cleaned.length >= 3 && /^-{3,}$/.test(cleaned);
  });
}

function countTableColumns(line) {
  let inCodeSpan = false;
  let escaped = false;
  let count = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "`") { inCodeSpan = !inCodeSpan; continue; }
    if (!inCodeSpan && ch === "|") count++;
  }

  return count;
}

function validateTables(content) {
  const errors = [];
  const lines = content.split("\n");
  let inTable = false;
  let headerLine = -1;
  let headerCols = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pipeCount = (line.match(/\|/g) || []).length;

    if (pipeCount >= 2) {
      if (!inTable) {
        inTable = true;
        headerLine = i;
        headerCols = countTableColumns(line);
      }

      if (isDelimiterLine(line)) {
        const delimCols = countTableColumns(line);
        if (delimCols !== headerCols) {
          errors.push(`Line ${i + 1}: delimiter has ${delimCols} cols but header has ${headerCols}`);
        }
      } else if (headerLine !== i) {
        const dataCols = countTableColumns(line);
        if (dataCols !== headerCols) {
          errors.push(`Line ${i + 1}: row has ${dataCols} cols but header has ${headerCols}`);
        }
      }
    } else if (inTable) {
      inTable = false;
    }
  }

  return errors;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node check-tables.js <filePath>");
    process.exitCode = 1;
    return;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const errors = validateTables(content);
    if (errors.length > 0) {
      errors.forEach((e) => console.error(e));
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
