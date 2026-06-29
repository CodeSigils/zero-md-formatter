#!/usr/bin/env node
/**
 * check-pipes.js - Detect adjacent-pipe patterns (empty cells) in GFM tables.
 *
 * Per GFM §4.10 (https://github.github.com/gfm/#tables-extension-), consecutive
 * pipes (||) create valid empty cells. This checker reports occurrences as
 * neutral diagnostics — they are not structural errors.
 *
 * The checker distinguishes empty cells from:
 *   - Escaped pipes (\|\|) — these are literal pipe characters
 *   - Inline code spans containing `||` — these are not structural issues
 *   - Fenced code blocks — skipped entirely
 *
 * Usage: node check-pipes.js <filePath...>
 * Exits 0 always (diagnostics only). Exits 1 on file read errors.
 */

"use strict";

const fs = require("fs");
const process = require("process");
const { getFenceBoundary } = require("./check-tables.js");

/**
 * Detect adjacent-pipe patterns (empty cells) in GFM table rows.
 * Reports leading, internal, and trailing patterns.
 *
 * @param {string} content File text.
 * @returns {Array<{lineIndex: number, line: string, detail: string}>} Issues found.
 */
function detectAdjacentPipes(content) {
  const lines = content.split("\n");
  const issues = [];
  let currentFence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceBoundary = getFenceBoundary(line, currentFence);
    if (fenceBoundary !== null) {
      currentFence = fenceBoundary || null;
      continue;
    }
    if (currentFence) continue;

    if (!line.includes("||")) continue;

    // Must look like a pipe table row. Leading-pipe rows need at least one
    // separator pair; no-leading-pipe GFM rows need more pipe structure so
    // prose like "some || text" is not treated as a table.
    const trimmed = line.trim();
    const pipeCount = (line.match(/\|/g) || []).length;
    const tableLike = trimmed.startsWith("|") ? pipeCount >= 2 : pipeCount >= 3;
    if (!tableLike) continue;

    let escaped = false;
    let codeSpanTicks = 0;
    let adjPos = -1;
    for (let pos = 0; pos < line.length - 1; pos++) {
      const ch = line[pos];

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
        while (pos + 1 < line.length && line[pos + 1] === "`") {
          ticks++;
          pos++;
        }
        codeSpanTicks = codeSpanTicks === ticks ? 0 : (codeSpanTicks || ticks);
        continue;
      }

      if (ch === "|" && line[pos + 1] === "|" && codeSpanTicks === 0) {
        adjPos = pos;
        break;
      }
    }
    if (adjPos === -1) continue;

    issues.push({
      lineIndex: i,
      line,
      detail:
        trimmed.startsWith("||")
          ? "Leading adjacent pipes (creates empty first cell — valid GFM)"
          : trimmed.endsWith("||")
            ? "Trailing adjacent pipes (creates empty trailing cell — valid GFM)"
            : "Adjacent pipes between columns (creates empty cell — valid GFM)",
    });
  }

  return issues;
}

/**
 * Quick boolean check: does the content contain any adjacent-pipe pattern
 * that would cause oxfmt to misparse the table?
 *
 * @param {string} content File text.
 * @returns {boolean}
 */
function hasAdjacentPipes(content) {
  return detectAdjacentPipes(content).length > 0;
}

/**
 * Validate a single file for adjacent-pipe patterns.
 *
 * @param {string} content File text.
 * @returns {Array<string>} Human-readable diagnostic messages.
 */
function validatePipes(content) {
  const issues = detectAdjacentPipes(content);
  return issues.map(
    (issue) => `Line ${issue.lineIndex + 1}: ${issue.detail}`,
  );
}

/**
 * Validate a file by path.
 *
 * @param {string} filePath Path to markdown file.
 * @returns {Array<string>} Human-readable diagnostic messages.
 */
function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return validatePipes(content);
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error("Usage: node check-pipes.js <filePath...>");
    process.exitCode = 1;
    return;
  }

  for (const filePath of argv) {
    try {
      const diagnostics = validateFile(filePath);
      if (diagnostics.length > 0) {
        diagnostics.forEach((e) => console.warn(`${filePath}: ${e}`));
      }
    } catch (err) {
      console.error(`Error reading file ${filePath}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  detectAdjacentPipes,
  hasAdjacentPipes,
  validatePipes,
  validateFile,
  main,
};

if (require.main === module) {
  main();
}
