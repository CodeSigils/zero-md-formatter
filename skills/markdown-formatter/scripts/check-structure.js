#!/usr/bin/env node
/**
 * check-structure.js - Structural guard for markdown formatting.
 *
 * Snapshots and verifies fence and table structure to detect drift from formatting.
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
const { splitTableCells, isPotentialTableRow, isDelimiterLine, getFenceBoundary } = require("./check-tables.js");

const VALID_MODES = ["--snapshot", "--check", "--guard", "--verify"];

function extractFences(content) {
  const fences = [];
  const lines = content.split("\n");
  let current = null;

  for (const line of lines) {
    if (!current) {
      const opener = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
      if (opener) {
        current = {
          indent: opener[1],
          opener: opener[2],
          length: opener[2].length,
          style: opener[2][0],
          info: opener[3] || "",
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
    });
  }

  return fences;
}

function parseTableRow(line) {
  const cells = splitTableCells(line);
  return { cells, colCount: cells.length };
}

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

    const header = parseTableRow(lines[i]);
    const delimiter = parseTableRow(lines[i + 1]);
    const rows = [];

    let j = i + 2;
    while (j < lines.length && isPotentialTableRow(lines[j]) && !isDelimiterLine(lines[j])) {
      rows.push(parseTableRow(lines[j]));
      j++;
    }

    tables.push({ header, delimiter, rows });
    i = j - 1;
  }

  return tables;
}

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

function validateStructure(content) {
  const fences = extractFences(content);
  const tables = extractTables(content);
  const errors = [];
  for (const fence of fences) {
    if (!fence.closer) errors.push(`Unclosed fence: ${fence.opener}`);
    if (fence.info.length > 0 && fence.info.trim() === "") errors.push(`Empty language tag on fence opener: ${fence.opener} `);
    if (fence.style === "`" && fence.info.includes("`")) errors.push(`Backtick fence info string contains backtick: ${fence.opener}${fence.info}`);
  }
  for (const table of tables) {
    if (table.header.colCount !== table.delimiter.colCount) errors.push(`Table column mismatch: header ${table.header.colCount} vs delimiter ${table.delimiter.colCount}`);
    for (let i = 0; i < table.rows.length; i++) {
      if (table.rows[i].colCount !== table.header.colCount) errors.push(`Table row ${i + 1} column mismatch: row ${table.rows[i].colCount} vs header ${table.header.colCount}`);
    }
  }
  return errors;
}

function getSnapshotPath(filePath) { return filePath + ".structure.json"; }

function loadSnapshot(filePath) {
  const path = getSnapshotPath(filePath);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function saveSnapshot(filePath, snapshot) {
  const path = getSnapshotPath(filePath);
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  return path;
}

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
