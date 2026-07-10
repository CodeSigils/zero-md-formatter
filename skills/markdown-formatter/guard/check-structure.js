#!/usr/bin/env node
/**
 * check-structure.js - Structural guard for markdown formatting.
 *
 * Snapshots and verifies fence and table structure to detect drift from formatting.
 *
 * GFM spec references:
 *   - Tables: https://github.github.io/gfm/#tables-extension-  (§4.10)
 *     - Example 203: header and delimiter MUST have same column count
 *     - Example 204: data row column count tracked for drift detection
 *   - Fenced code blocks: https://github.github.io/gfm/#fenced-code-blocks-  (§4.7)
 *     - Minimum fence length of 3; closer length must >= opener length
 *     - Backtick fence info string must not contain backticks
 *     - Closing fence must have no info string
 *
 * Usage:
 *   node check-structure.js --snapshot <file>    Write structural snapshot
 *   node check-structure.js --check <file>     Compare against snapshot, exit 0 if unchanged
 *   node check-structure.js --guard <file>      Write snapshot (CLI owns pre/post workflow)
 *   node check-structure.js --verify <file>     Static structural check only (no snapshot)
 *
 * Snapshot format: <file>.structure.json
 */

"use strict";

const { readFileSync, writeFileSync, existsSync } = require("fs");
const { splitTableCells, splitTableCellsForStyle, isPotentialTableRow, isTableBodyRowForStyle, isDelimiterLine, getFenceBoundary } = require("./check-tables.js");

const VALID_MODES = ["--snapshot", "--check", "--guard", "--verify"];

/**
 * Extract all fenced code blocks from markdown content.
 *
 * Returns an array of fence objects with opener details, closer status,
 * and line positions. Unclosed fences have closer=null and closeLine
 * set to the last line of content.
 *
 * @param {string} content - Markdown file text.
 * @returns {Array<{opener: string, length: number, style: string, info: string, closer: string|null, openLine: number, closeLine: number}>}
 */
function extractFences(content) {
  const fences = [];
  const lines = content.split("\n");
  let current = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!current) {
      const opener = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
      if (opener) {
        current = {
          indent: opener[1],
          opener: opener[2],
          length: opener[2].length,
          style: opener[2][0],
          info: opener[3] || "",
          openLine: lineIdx,
        };
      }
      continue;
    }

    const closerPattern = new RegExp(`^ {0,3}${current.style}{${current.length},}\\s*$`);
    if (closerPattern.test(line)) {
      fences.push({
        opener: current.opener,
        length: current.length,
        style: current.style,
        info: current.info,
        closer: current.opener,
        openLine: current.openLine,
        closeLine: lineIdx,
      });
      current = null;
    }
  }

  if (current) {
    fences.push({
      opener: current.opener,
      length: current.length,
      style: current.style,
      info: current.info,
      closer: null,
      openLine: current.openLine,
      closeLine: lines.length - 1,
    });
  }

  return fences;
}

/**
 * Parse a single GFM table row into cells and count columns.
 *
 * @param {string} line - A table row line.
 * @param {boolean} [hasOuterPipes=true] - Whether the row uses leading/trailing |.
 * @returns {{cells: string[], colCount: number}} Parsed row data.
 */
function parseTableRow(line, hasOuterPipes = true) {
  const cells = hasOuterPipes
    ? splitTableCells(line)
    : splitTableCellsForStyle(line, false);
  return { cells, colCount: cells.length };
}

/**
 * Extract all GFM tables from markdown content.
 *
 * Returns an array of table objects, each containing parsed header,
 * delimiter, and body rows. Ignores table-shaped content inside
 * fenced code blocks.
 *
 * @param {string} content - Markdown file text.
 * @returns {Array<{header: {cells: string[], colCount: number}, delimiter: {cells: string[], colCount: number}, rows: Array<{cells: string[], colCount: number}>}>}
 */
function extractTables(content) {
  const tables = [];
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

    const hasOuterPipes = lines[i].trimStart().startsWith("|") || lines[i + 1].trimStart().startsWith("|");
    const header = parseTableRow(lines[i], hasOuterPipes);
    const delimiter = parseTableRow(lines[i + 1], hasOuterPipes);
    const rows = [];

    let j = i + 2;
    while (j < lines.length && isTableBodyRowForStyle(lines[j], hasOuterPipes)) {
      rows.push(parseTableRow(lines[j], hasOuterPipes));
      j++;
    }

    tables.push({ header, delimiter, rows });
    i = j - 1;
  }

  return tables;
}

/**
 * Build a structural snapshot of fences and tables in content.
 *
 * The snapshot is a serializable object used for drift detection:
 * comparing a pre-formatting snapshot against a post-formatting
 * snapshot detects structural changes caused by formatting.
 *
 * @param {string} content - Markdown file text.
 * @returns {{fenceCount: number, fences: Array<{length: number, style: string, info: string, hasInfo: boolean, isClosed: boolean}>, tableCount: number, tables: Array<{headerCols: number, delimiterCols: number, rowCols: number[], headerDelimiterMatch: boolean, rowsMatch: boolean}>}}
 */
function buildSnapshot(content) {
  const fences = extractFences(content);
  const tables = extractTables(content);
  return {
    fenceCount: fences.length,
    fences: fences.map((f) => ({ length: f.length, style: f.style, info: f.info, hasInfo: f.info.trim().length > 0, isClosed: f.closer !== null })),
    tableCount: tables.length,
    tables: tables.map((t) => ({
      headerCols: t.header.colCount,
      delimiterCols: t.delimiter.colCount,
      rowCols: t.rows.map((r) => r.colCount),
      headerDelimiterMatch: t.header.colCount === t.delimiter.colCount,
      rowsMatch: t.rows.every((r) => r.colCount === t.header.colCount),
    })),
  };
}

/**
 * Validate fence and table structure in markdown content.
 *
 * Checks for:
 * - Unclosed fences
 * - Empty language tags on fence openers
 * - Backticks in backtick fence info strings
 * - Long fences containing GFM table structure (heuristic for
 *   misattached closers)
 * - Table header/delimiter column count mismatches
 * - Table data row column count mismatches
 *
 * @param {string} content - Markdown file text.
 * @returns {string[]} Error/warning messages. Empty array if valid.
 */
function validateStructure(content) {
  const lines = content.split("\n");
  const fences = extractFences(content);
  const tables = extractTables(content);
  const errors = [];
  for (const fence of fences) {
    if (!fence.closer) errors.push(`Unclosed fence: ${fence.opener}`);
    if (fence.info.length > 0 && fence.info.trim() === "") errors.push(`Empty language tag on fence opener: ${fence.opener} `);
    if (fence.style === "`" && fence.info.includes("`")) errors.push(`Backtick fence info string contains backtick: ${fence.opener}${fence.info}`);

    // Heuristic: a closed fence that spans many lines with actual GFM table
    // structure inside may be accidental — the closer at the end may belong
    // to a different fence, and the shared getFenceBoundary tracker treats
    // the whole span as a single fence, blinding table/pipe checks.
    // Threshold: 40 lines (legitimate code examples rarely exceed this).
    if (fence.closer && fence.closeLine - fence.openLine > 40) {
      const fenceLines = lines.slice(fence.openLine, fence.closeLine + 1);
      // Check if extractTables found a table inside this fence by scanning
      // for header+delimiter pairs. If so, the fence likely swallows
      // content intended as markdown, not code.
      for (let li = 0; li < fenceLines.length - 1; li++) {
        const line = fenceLines[li];
        const nextLine = fenceLines[li + 1];
        if (line && nextLine && isPotentialTableRow(line) && isDelimiterLine(nextLine)) {
          const headerCols = splitTableCells(line).length;
          const delimiterCols = splitTableCells(nextLine).length;
          const colMismatch = headerCols !== delimiterCols
            ? ` (column mismatch: header ${headerCols} vs delimiter ${delimiterCols})`
            : "";
          errors.push(
            `Warning: fence at line ${fence.openLine + 1} spans ${fence.closeLine - fence.openLine + 1} lines ` +
            `(opener \`${fence.opener}\`) and contains GFM table structure at line ${fence.openLine + li + 1}.` +
            colMismatch + ` The closer at line ${fence.closeLine + 1} may belong to a different fence.`
          );
          break;
        }
      }
    }
  }
  for (const table of tables) {
    if (table.header.colCount !== table.delimiter.colCount) errors.push(`Table column mismatch: header ${table.header.colCount} vs delimiter ${table.delimiter.colCount}`);
    for (let i = 0; i < table.rows.length; i++) {
      if (table.rows[i].colCount !== table.header.colCount) errors.push(`Table row ${i + 1} column mismatch: row ${table.rows[i].colCount} vs header ${table.header.colCount}`);
    }
  }
  return errors;
}

/**
 * Get the path to the structural snapshot file for a given markdown file.
 *
 * @param {string} filePath - Path to the markdown file.
 * @returns {string} Snapshot file path (appends .structure.json).
 */
function getSnapshotPath(filePath) { return filePath + ".structure.json"; }

/**
 * Load a structural snapshot from disk.
 *
 * @param {string} filePath - Path to the markdown file (snapshot path derived from it).
 * @returns {object|null} Parsed snapshot object, or null if not found or invalid.
 */
function loadSnapshot(filePath) {
  const path = getSnapshotPath(filePath);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/**
 * Save a structural snapshot to disk.
 *
 * @param {string} filePath - Path to the markdown file (snapshot path derived from it).
 * @param {object} snapshot - Snapshot object from buildSnapshot.
 * @returns {string} Path where the snapshot was written.
 */
function saveSnapshot(filePath, snapshot) {
  const path = getSnapshotPath(filePath);
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  return path;
}

/**
 * Compare two structural snapshots and report differences.
 *
 * Compares fence count, table count, individual fence properties
 * (length, style, info string), and table column counts.
 * Returns an array of human-readable drift descriptions.
 *
 * @param {{fenceCount: number, fences: Array, tableCount: number, tables: Array}} before - Pre-formatting snapshot.
 * @param {{fenceCount: number, fences: Array, tableCount: number, tables: Array}} after - Post-formatting snapshot.
 * @returns {string[]} Drift descriptions. Empty array if snapshots match.
 */
function compareSnapshots(before, after) {
  const drift = [];
  if (before.fenceCount !== after.fenceCount) drift.push(`Fence count changed: ${before.fenceCount} -> ${after.fenceCount}`);
  if (before.tableCount !== after.tableCount) drift.push(`Table count changed: ${before.tableCount} -> ${after.tableCount}`);
  for (let i = 0; i < Math.max(before.fences.length, after.fences.length); i++) {
    const b = before.fences[i], a = after.fences[i];
    if (!b || !a) continue;
    if (b.length !== a.length) drift.push(`Fence[${i}] length changed: ${b.length} -> ${a.length}`);
    if (b.style !== a.style) drift.push(`Fence[${i}] style changed: ${b.style} -> ${a.style}`);
    if (b.info !== a.info) drift.push(`Fence[${i}] info string changed: "${b.info}" -> "${a.info}"`);
    if (b.hasInfo !== a.hasInfo) drift.push(`Fence[${i}] has-info changed: ${b.hasInfo} -> ${a.hasInfo}`);
  }
  for (let i = 0; i < Math.max(before.tables.length, after.tables.length); i++) {
    const bt = before.tables[i], at = after.tables[i];
    if (!bt || !at) continue;
    if (bt.headerCols !== at.headerCols) drift.push(`Table[${i}] header cols changed: ${bt.headerCols} -> ${at.headerCols}`);
    if (bt.delimiterCols !== at.delimiterCols) drift.push(`Table[${i}] delimiter cols changed: ${bt.delimiterCols} -> ${at.delimiterCols}`);
    if (bt.headerDelimiterMatch !== at.headerDelimiterMatch) drift.push(`Table[${i}] header/delimiter alignment changed`);
    if (JSON.stringify(bt.rowCols) !== JSON.stringify(at.rowCols)) drift.push(`Table[${i}] row col counts changed: ${JSON.stringify(bt.rowCols)} -> ${JSON.stringify(at.rowCols)}`);
  }
  return drift;
}

/**
 * CLI entry point. Processes --snapshot, --check, --guard, or --verify
 * modes for a single file. Exits with code 0 on success, 1 on failure.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI arguments (mode + file path).
 * @returns {void} Exits process with code.
 */
function main(argv = process.argv.slice(2)) {
  const mode = argv[0];
  const filePath = argv[1];

  if (!filePath) {
    console.error("Usage: node check-structure.js [--snapshot|--check|--guard|--verify] <file>");
    process.exit(1);
  }

  if (!VALID_MODES.includes(mode)) {
    console.error(`Invalid mode: ${mode}`);
    process.exit(1);
  }

  if (!existsSync(filePath)) { console.error(`Error: File not found: ${filePath}`); process.exit(1); }
  let content;
  try { content = readFileSync(filePath, "utf8"); } catch (err) { console.error(`Error reading file: ${err.message}`); process.exit(1); }

  if (mode === "--verify") {
    const errors = validateStructure(content);
    if (errors.length > 0) { errors.forEach((e) => console.error(`Structural error: ${e}`)); process.exit(1); }
    console.log(`Structure valid: ${filePath}`);
    process.exit(0);
  }
  if (mode === "--snapshot") {
    const path = saveSnapshot(filePath, buildSnapshot(content));
    console.log(`Snapshot written: ${path}`);
    process.exit(0);
  }
  if (mode === "--check") {
    const before = loadSnapshot(filePath);
    if (!before) { console.error(`No snapshot found for ${filePath}. Run --snapshot first.`); process.exit(1); }
    const drift = compareSnapshots(before, buildSnapshot(content));
    if (drift.length > 0) { drift.forEach((d) => console.error(`Structural drift: ${d}`)); process.exit(1); }
    console.log(`Structure preserved: ${filePath}`);
    process.exit(0);
  }
  if (mode === "--guard") {
    const snapPath = saveSnapshot(filePath, buildSnapshot(content));
    console.log(`Snapshot: ${snapPath}`);
    process.exit(0);
  }
}

module.exports = {
  extractFences,
  extractTables,
  buildSnapshot,
  validateStructure,
  getSnapshotPath,
  loadSnapshot,
  saveSnapshot,
  compareSnapshots,
  main,
};

if (require.main === module) {
  main();
}
