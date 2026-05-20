#!/usr/bin/env node
/**
 * check-structure.js — Structural guard for markdown formatting.
 *
 * Detects structural drift in fenced code blocks and tables after formatting.
 * Designed to be called BEFORE and AFTER the formatting pipeline to compare
 * structural state and detect unintended changes.
 *
 * This is a blocking safety check: structural drift (fence style changes,
 * column count changes, pipe reinterpretation) can break document meaning
 * and must be caught before committing.
 *
 * Usage:
 *   node scripts/check-structure.js --snapshot <file>   # Output JSON snapshot to stdout
 *   node scripts/check-structure.js --check <file> <snapshot-file>  # Compare against snapshot
 *   node scripts/check-structure.js --guard <file>      # Snapshot → run formatter → compare
 *   node scripts/check-structure.js --verify <file>     # Static check (no pre/post comparison)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// ── Fence extraction ──────────────────────────────────────────────────────────

/**
 * Extract fenced code block information from markdown content.
 * Returns array of { indent, fenceChar, fenceLength, infoString, content }.
 *
 * Based on the pattern validated in markdown-oxc-spike/scripts/check-fixture.js.
 */
function extractFenceInfo(content) {
  const fenceRegex = /^( {0,3})(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1\2\n/gmu;
  const fences = [];
  let match;

  while ((match = fenceRegex.exec(content)) !== null) {
    fences.push({
      indent: match[1],
      fenceChar: match[2][0],
      fenceLength: match[2].length,
      infoString: match[3].trim(),
      contentLength: match[4].length,
    });
  }

  return fences;
}

// ── Table extraction ──────────────────────────────────────────────────────────

/**
 * Check if a line is a table separator (delimiter) row.
 */
function isSeparatorLine(line) {
  const stripped = line.trim();
  if (!stripped.startsWith("|")) return false;
  const cells = stripped
    .split("|")
    .filter((_, i, a) => i > 0 && i < a.length - 1);
  if (cells.length === 0) return false;
  return cells.every((cell) => {
    const c = cell.trim();
    if (c === "") return true;
    const cleaned = c.replace(/:/g, "");
    return cleaned.length >= 3 && /^-{3,}$/.test(cleaned);
  });
}

/**
 * Extract table structure information from markdown content.
 * Returns { tables: [{ headerColumns, delimiterColumns, rows }] }.
 */
function extractTableInfo(content) {
  const lines = content.split("\n");
  const tables = [];
  let inTable = false;
  let tableStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pipeCount = (line.match(/\|/g) || []).length;

    if (pipeCount >= 2) {
      if (!inTable) {
        inTable = true;
        tableStart = i;
      }
    } else if (inTable) {
      // End of table — extract table info
      const tableInfo = extractSingleTable(lines, tableStart, i - 1);
      if (tableInfo) tables.push(tableInfo);
      inTable = false;
    }
  }

  // Handle table at end of file
  if (inTable) {
    const tableInfo = extractSingleTable(lines, tableStart, lines.length - 1);
    if (tableInfo) tables.push(tableInfo);
  }

  return tables;
}

/**
 * Extract structural info from a single table spanning lines[from..to].
 */
function extractSingleTable(lines, from, to) {
  const rows = [];
  let headerLine = -1;
  let delimiterLine = -1;
  let delimiterColumns = 0;

  for (let i = from; i <= to; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const pipeCount = (trimmed.match(/\|/g) || []).length;
    const isDelim = isSeparatorLine(line);

    if (isDelim && delimiterLine < 0) {
      delimiterLine = i;
      const cells = trimmed
        .split("|")
        .filter((_, idx, a) => idx > 0 && idx < a.length - 1);
      delimiterColumns = cells.length;
    } else if (headerLine < 0 && pipeCount >= 2 && !isDelim) {
      headerLine = i;
    }

    rows.push({
      lineIndex: i,
      pipeCount,
      isDelimiter: isDelim,
    });
  }

  // Find header columns from the line before the delimiter
  const headerColumns =
    headerLine >= 0
      ? (lines[headerLine].trim().match(/\|/g) || []).length - 1
      : 0;

  return {
    startLine: from,
    endLine: to,
    headerLine,
    delimiterLine,
    headerColumns: Math.max(0, headerColumns),
    delimiterColumns: Math.max(0, delimiterColumns),
    rowCount: to - from + 1,
    rows,
  };
}

// ── Comparison ────────────────────────────────────────────────────────────────

/**
 * Compare fence info between two states. Returns array of change descriptions.
 */
function compareFenceInfo(before, after) {
  const changes = [];

  if (before.length !== after.length) {
    changes.push(
      `Fence count changed: ${before.length} → ${after.length}`,
    );
  }

  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    const bFence = before[i];
    const aFence = after[i];

    if (!bFence && aFence) {
      changes.push(`Fence ${i + 1} added: ${aFence.fenceChar}${aFence.fenceChar} (${aFence.infoString || "no lang"})`);
      continue;
    }
    if (bFence && !aFence) {
      changes.push(`Fence ${i + 1} removed: ${bFence.fenceChar}${bFence.fenceChar} (${bFence.infoString || "no lang"})`);
      continue;
    }

    if (bFence.fenceChar !== aFence.fenceChar) {
      changes.push(
        `Fence ${i + 1} style changed: ${bFence.fenceChar.repeat(Math.min(3, bFence.fenceLength))} → ${aFence.fenceChar.repeat(Math.min(3, aFence.fenceLength))} (${bFence.infoString || "no lang"})`,
      );
    }

    if (bFence.fenceLength !== aFence.fenceLength) {
      changes.push(
        `Fence ${i + 1} length changed: ${bFence.fenceLength} → ${aFence.fenceLength} (${bFence.infoString || "no lang"})`,
      );
    }
  }

  return changes;
}

/**
 * Compare table info between two states. Returns array of change descriptions.
 */
function compareTableInfo(before, after) {
  const changes = [];
  const maxTables = Math.max(before.length, after.length);

  for (let t = 0; t < maxTables; t++) {
    const bTable = before[t];
    const aTable = after[t];

    if (!bTable && aTable) {
      changes.push(`Table ${t + 1} added (${aTable.headerColumns} columns, ${aTable.rowCount} rows)`);
      continue;
    }
    if (bTable && !aTable) {
      changes.push(`Table ${t + 1} removed (was ${bTable.headerColumns} columns, ${bTable.rowCount} rows)`);
      continue;
    }

    if (bTable.headerColumns !== aTable.headerColumns) {
      changes.push(
        `Table ${t + 1} header columns changed: ${bTable.headerColumns} → ${aTable.headerColumns}`,
      );
    }

    if (bTable.delimiterColumns !== aTable.delimiterColumns) {
      changes.push(
        `Table ${t + 1} delimiter columns changed: ${bTable.delimiterColumns} → ${aTable.delimiterColumns}`,
      );
    }

    if (bTable.rowCount !== aTable.rowCount) {
      changes.push(
        `Table ${t + 1} row count changed: ${bTable.rowCount} → ${aTable.rowCount}`,
      );
    }

    // Compare pipe counts per row
    const maxRows = Math.max(bTable.rows.length, aTable.rows.length);
    for (let r = 0; r < maxRows; r++) {
      const bRow = bTable.rows[r];
      const aRow = aTable.rows[r];
      if (!bRow && aRow) {
        changes.push(`Table ${t + 1}, row ${r + 1} added (${aRow.pipeCount} pipes)`);
      } else if (bRow && !aRow) {
        changes.push(`Table ${t + 1}, row ${r + 1} removed (was ${bRow.pipeCount} pipes)`);
      } else if (bRow && aRow && bRow.pipeCount !== aRow.pipeCount) {
        changes.push(
          `Table ${t + 1}, row ${r + 1} pipe count changed: ${bRow.pipeCount} → ${aRow.pipeCount}`,
        );
      }
    }
  }

  return changes;
}

// ── Structural state ──────────────────────────────────────────────────────────

/**
 * Capture the full structural state of a markdown file.
 * Returns a serializable object for later comparison.
 */
function captureState(content) {
  return {
    fences: extractFenceInfo(content),
    tables: extractTableInfo(content),
  };
}

/**
 * Compare two structural states. Returns array of change descriptions.
 * Empty array = no structural drift.
 */
function compareStates(before, after) {
  return [
    ...compareFenceInfo(before.fences, after.fences),
    ...compareTableInfo(before.tables, after.tables),
  ];
}

/**
 * Static structural verification (no pre/post comparison).
 * Checks for: empty fence language tags, bare closers, mismatched fences.
 */
function verifyStructure(content) {
  const issues = [];
  const lines = content.split("\n");
  let inFence = false;
  let openerCount = 0;
  let openerLine = 0;
  let openerChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);

    if (!fenceMatch) continue;

    const count = fenceMatch[2].length;
    const char = fenceMatch[2][0];
    const lang = fenceMatch[3].trim();

    if (!inFence) {
      // Opening fence
      inFence = true;
      openerCount = count;
      openerLine = i + 1;
      openerChar = char;

      if (!lang) {
        issues.push({
          line: i + 1,
          type: "empty_opener",
          message: `Fence opener has no language tag: \`${fenceMatch[2]}\``,
        });
      }
    } else {
      // Closing fence
      inFence = false;

      if (lang) {
        issues.push({
          line: i + 1,
          type: "bad_closer",
          message: `Fence closer has unexpected content: "${lang}"`,
        });
      }

      if (char !== openerChar) {
        issues.push({
          line: i + 1,
          type: "style_mismatch",
          message: `Fence closer character differs from opener: "${char}" vs "${openerChar}"`,
        });
      }

      if (count !== openerCount) {
        issues.push({
          line: i + 1,
          type: "count_mismatch",
          message: `Fence closer length (${count}) differs from opener (${openerCount}) at line ${openerLine}`,
        });
      }
    }
  }

  if (inFence) {
    issues.push({
      line: lines.length,
      type: "unclosed_fence",
      message: `Unclosed fence starting at line ${openerLine} (${openerChar}${openerChar}${openerChar})`,
    });
  }

  return issues;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.error("Usage:");
  console.error("  node scripts/check-structure.js --snapshot <file>");
  console.error("  node scripts/check-structure.js --check <file> <snapshot-file>");
  console.error("  node scripts/check-structure.js --guard <file>");
  console.error("  node scripts/check-structure.js --verify <file>");
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) usage();

  const mode = args[0];

  if (mode === "--snapshot") {
    const file = args[1];
    if (!file) usage();

    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }

    const content = fs.readFileSync(file, "utf8");
    const state = captureState(content);
    process.stdout.write(JSON.stringify(state, null, 2) + "\n");
    process.exit(0);
  }

  if (mode === "--check") {
    const file = args[1];
    const snapshotFile = args[2];
    if (!file || !snapshotFile) usage();

    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    if (!fs.existsSync(snapshotFile)) {
      console.error(`Snapshot not found: ${snapshotFile}`);
      process.exit(1);
    }

    const content = fs.readFileSync(file, "utf8");
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    const current = captureState(content);
    const changes = compareStates(snapshot, current);

    if (changes.length > 0) {
      console.error(`Structural drift detected in ${path.basename(file)}:`);
      for (const change of changes) {
        console.error(`  - ${change}`);
      }
      console.error("");
      console.error("This may indicate formatting changed document structure.");
      console.error("Review the changes before committing.");
      process.exit(1);
    }

    console.log(`Structure preserved: ${path.basename(file)}`);
    process.exit(0);
  }

  if (mode === "--guard") {
    const file = args[1];
    if (!file) usage();

    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }

    // Step 1: Pre-formatting snapshot
    const preContent = fs.readFileSync(file, "utf8");
    const preState = captureState(preContent);

    // Step 2: Run the formatting pipeline
    const scriptDir = path.join(__dirname, "..");
    const fixTables = path.join(scriptDir, "references", "fix-tables.js");
    const padTables = path.join(scriptDir, "references", "pad-tables.js");
    const config = path.join(scriptDir, "references", ".markdownlint.json");

    const fixResult = spawnSync(process.execPath, [fixTables, file], {
      cwd: scriptDir,
      encoding: "utf8",
    });

    const padResult = spawnSync(process.execPath, [padTables, file], {
      cwd: scriptDir,
      encoding: "utf8",
    });

    // Step 3: Run markdownlint-cli2 via npx
    const npxResult = spawnSync(
      "npx",
      [
        "markdownlint-cli2@0.22.1",
        "--config",
        config,
        file,
        "--fix",
      ],
      {
        cwd: scriptDir,
        encoding: "utf8",
      },
    );

    // Check if any formatting step failed - if so, skip comparison
    if (fixResult.status !== 0 || padResult.status !== 0 || npxResult.status !== 0) {
      console.error("Formatting pipeline failed, skipping structural comparison.");
      process.exit(1);
    }

    // Step 4: Post-formatting snapshot
    const postContent = fs.readFileSync(file, "utf8");
    const postState = captureState(postContent);

    // Step 5: Compare
    const changes = compareStates(preState, postState);

    if (changes.length > 0) {
      console.error(`Structural drift detected in ${path.basename(file)}:`);
      for (const change of changes) {
        console.error(`  - ${change}`);
      }
      process.exit(1);
    }

    console.log(`Structure preserved: ${path.basename(file)}`);
    process.exit(0);
  }

  if (mode === "--verify") {
    const file = args[1];
    if (!file) usage();

    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }

    const content = fs.readFileSync(file, "utf8");
    const issues = verifyStructure(content);

    if (issues.length > 0) {
      console.error(`Structure issues in ${path.basename(file)}:`);
      for (const issue of issues) {
        console.error(`  Line ${issue.line}: ${issue.message}`);
      }
      process.exit(1);
    }

    console.log(`Structure valid: ${path.basename(file)}`);
    process.exit(0);
  }

  usage();
}

if (require.main === module) {
  main();
}

module.exports = {
  extractFenceInfo,
  extractTableInfo,
  compareFenceInfo,
  compareTableInfo,
  captureState,
  compareStates,
  verifyStructure,
};
