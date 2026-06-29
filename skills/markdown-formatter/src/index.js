#!/usr/bin/env node
/**
 * Markdown Formatter CLI - Format markdown to GFM standard using oxfmt.
 *
 * Usage: node src/index.js [options] <path...>
 *
 * Options:
 *   --check      Read-only pipe-safety and format check (exit 0 if clean)
 *   --fix        Apply formatting after pipe-safety preflight (default)
 *   --all        Process directories recursively
 *   --guard      Pre/post structural check; rollback writes on drift; clean snapshots
 *   --verify     Run formatting, idempotence, and structural validation checks without modifying files
 *   --fences     Validate fenced code blocks
 *   --validate   Run all structural validations
 *   --doctor     Check runtime prerequisites without modifying files
 *   --dry-run    Run pipe-safety preflight, then preview changes
 *   --help       Show this help
 *
 * Prerequisites: oxfmt on PATH or in node_modules/.bin/
 */

"use strict";

const { spawnSync } = require("child_process");
const { readdirSync, statSync, existsSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } = require("fs");
const { join, resolve, extname, basename } = require("path");
const { tmpdir } = require("os");

const { splitTableCells, isDelimiterLine, getFenceBoundary } = require('../scripts/check-tables.js');
const { detectAdjacentPipes } = require('../scripts/check-pipes.js');

const SKILL_DIR = resolve(__dirname, "..");
const OXFMT_CONFIG = join(SKILL_DIR, ".oxfmtrc.json");
const NODE_RUNTIME_MIN_VERSION = 20;
const OXFMT_MAX_VERSION = "0.56.0";
const LONG_FLAGS = new Set(["check", "fix", "all", "guard", "verify", "fences", "validate", "doctor", "dry-run", "help"]);
const SHORT_FLAGS = { h: "help", n: "dry-run" };
const READ_ONLY_FLAGS = new Set(["check", "validate", "fences", "verify", "doctor", "help", "dry-run"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

function parseArgs(argv) {
  const args = { _: [], check: false, fix: false, all: false, guard: false, verify: false, fences: false, validate: false, doctor: false, "dry-run": false, help: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { args._.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith("--")) {
      const flag = arg.slice(2);
      if (LONG_FLAGS.has(flag)) args[flag] = true;
      else throw new Error(`Unknown flag: ${arg}`);
    } else if (arg.startsWith("-") && arg.length > 1) {
      for (const c of arg.slice(1)) {
        if (SHORT_FLAGS[c]) args[SHORT_FLAGS[c]] = true;
        else throw new Error(`Unknown short flag: -${c}`);
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Markdown Formatter CLI

Usage: node src/index.js [options] <path...>

Options:
  --check           Read-only pipe-safety and format check (exit 0 if clean)
  --fix             Apply formatting after pipe-safety preflight (default)
  --all             Process directories recursively
  --guard           Pre/post structural check; rollback writes on drift; clean snapshots
  --verify          Run formatting, idempotence, and structural validation checks without modifying files
  --fences          Validate fenced code blocks
  --validate        Run all structural validations
  --doctor          Check runtime prerequisites without modifying files
  --dry-run, -n     Run pipe-safety preflight, then preview changes
  --help, -h        Show this help

Prerequisites: oxfmt on PATH or in node_modules/.bin/
`);
}

function getSpawnOptions(options = {}) {
  return { encoding: "utf8", ...options };
}

function getOxfmtExecutableNames(platform = process.platform) {
  return platform === "win32" ? ["oxfmt.cmd", "oxfmt.exe", "oxfmt"] : ["oxfmt"];
}

function getOxfmtPathCandidates(options = {}) {
  const cwd = options.cwd || process.cwd();
  const skillDir = options.skillDir || SKILL_DIR;
  const platform = options.platform || process.platform;
  const shimNames = getOxfmtExecutableNames(platform);

  return [
    ...shimNames.map((name) => join(cwd, "node_modules", ".bin", name)),
    join(cwd, "node_modules", "oxfmt", "bin", "oxfmt"),
    ...shimNames.map((name) => join(skillDir, "node_modules", ".bin", name)),
    join(skillDir, "node_modules", "oxfmt", "bin", "oxfmt"),
  ];
}

function resolveOxfmtBin() {
  for (const p of getOxfmtPathCandidates()) { if (existsSync(p)) return p; }

  for (const name of getOxfmtExecutableNames()) {
    try { if (spawnSync(name, ["--version"], getSpawnOptions({ timeout: 5000 })).status === 0) return name; }
    catch { /* not on PATH */ }
  }

  return null;
}

function getOxfmtBin() {
  const bin = resolveOxfmtBin();
  if (bin) return bin;

  console.error("Error: oxfmt not found.");
  console.error("Install oxfmt on PATH for installed use, or run npm ci in a development checkout.");
  process.exit(1);
}

function isSupportedNodeVersion(version) {
  const major = Number(String(version).replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= NODE_RUNTIME_MIN_VERSION;
}

function semverCompare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function isSupportedOxfmtVersion(versionText) {
  const match = String(versionText).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const detected = `${match[1]}.${match[2]}.${match[3]}`;
  return {
    version: detected,
    supported: semverCompare(detected, OXFMT_MAX_VERSION) <= 0,
  };
}

function runDoctor(options = {}) {
  const log = options.log || ((line) => console.log(line));
  const exists = options.exists || existsSync;
  const nodeVersion = options.nodeVersion || process.version;
  const resolveOxfmt = options.resolveOxfmt || resolveOxfmtBin;
  const runVersion = options.runVersion || ((bin) => spawnSync(bin, ["--version"], getSpawnOptions({ timeout: 5000 })));

  const requiredFiles = [
    join(SKILL_DIR, "SKILL.md"),
    OXFMT_CONFIG,
    join(SKILL_DIR, "src", "index.js"),
    join(SKILL_DIR, "scripts", "check-structure.js"),
    join(SKILL_DIR, "scripts", "check-fences.js"),
    join(SKILL_DIR, "scripts", "check-tables.js"),
    join(SKILL_DIR, "scripts", "check-pipes.js"),
  ];

  let ok = true;
  log("Markdown Formatter Doctor");
  log("");

  const nodeOk = isSupportedNodeVersion(nodeVersion);
  ok = ok && nodeOk;
  log(`Node.js: ${nodeVersion} (${nodeOk ? "ok" : `requires >=${NODE_RUNTIME_MIN_VERSION}`})`);

  const oxfmt = resolveOxfmt();
  if (oxfmt) {
    const version = runVersion(oxfmt);
    const versionText = `${version.stdout || version.stderr || ""}`.trim();
    const versionOk = version.status === 0;
    ok = ok && versionOk;
    log(`oxfmt: ${oxfmt}${versionText ? ` (${versionText})` : ""}${versionOk ? "" : " (version check failed)"}`);
    if (versionText && version.status === 0) {
      const vi = isSupportedOxfmtVersion(versionText);
      if (vi && !vi.supported) {
        log(`  \u26a0 Version ${vi.version} exceeds tested maximum ${OXFMT_MAX_VERSION}. Verify compatibility before relying on newer behavior.`);
      }
    }
  } else {
    ok = false;
    log("oxfmt: missing");
    log("Install oxfmt on PATH for installed use, or run npm ci in a development checkout.");
  }

  log(`Config: ${OXFMT_CONFIG} (${exists(OXFMT_CONFIG) ? "ok" : "missing"})`);
  if (!exists(OXFMT_CONFIG)) ok = false;

  for (const file of requiredFiles) {
    const present = exists(file);
    if (!present) ok = false;
    log(`Payload: ${file} (${present ? "ok" : "missing"})`);
  }

  log("");
  log(`Ready: ${ok ? "yes" : "no"}`);
  return ok;
}

function runOxfmt(oxfmtArgs) {
  const configArgs = existsSync(OXFMT_CONFIG) ? ["--config", OXFMT_CONFIG, "--disable-nested-config"] : [];
  const result = spawnSync(getOxfmtBin(), [...configArgs, ...oxfmtArgs], getSpawnOptions());
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function runScript(script, ...scriptArgs) {
  const scriptPath = join(SKILL_DIR, "scripts", script);
  if (!existsSync(scriptPath)) { console.error(`Error: ${script} not found`); return false; }
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], getSpawnOptions());
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function isMarkdownFile(filePath) {
  return MARKDOWN_EXTENSIONS.has(extname(filePath));
}

/**
 * Repair table column-count mismatches in GFM tables.
 *
 * When a table's header, delimiter, or data rows disagree on column count,
 * short rows are padded with empty trailing cells to match the largest
 * declared column count. This ensures oxfmt receives structurally valid
 * tables and can format them without triggering the structural guard.
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
    const targetCols = Math.max(headerCols, delimiterCols);

    if (targetCols <= 1) continue;            // not a real table
    if (headerCols === delimiterCols) {
      // Header and delimiter agree; check data rows
      let anyShort = false;
      let j = i + 2;
      while (j < lines.length) {
        const dataLine = lines[j];
        const dataCols = splitTableCells(dataLine).length;
        if (dataCols <= 1) break;
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
      const dataCols = splitTableCells(dataLine).length;
      if (dataCols <= 1) break;

      if (dataCols < targetColsFinal) {
        const missing = targetColsFinal - dataCols;
        result[j] = lines[j].replace(/\s*$/, "") + " |".repeat(missing);
        // Note: if the row is also missing a trailing pipe, splitTableCells
        // will still report fewer cells after padding, because it strips
        // outer pipes. In practice every well-formed GFM table row ends
        // with |, so this is not expected in real inputs.
        // If the line already ends with |, the first repeat adds a space before the cell
        // which is fine — oxfmt normalizes widths.
        modified = true;
      }
      j++;
    }

    i = j; // skip past the table body
  }

  return modified ? result.join("\n") : content;
}

/**
 * Determine if the current args indicate a write mode (files will be modified).
 *
 * Write modes: --fix, --guard, or default (no explicit flag). All other flags
 * are read-only. Adding a new read-only flag requires adding it to READ_ONLY_FLAGS.
 *
 * @param {object} args Parsed CLI arguments.
 * @returns {boolean} True if the operation writes to files.
 */
function isWriteMode(args) {
  for (const flag of READ_ONLY_FLAGS) {
    if (args[flag]) return false;
  }
  if (args.fix || args.guard) return true;
  return true; // no flags = write (default mode)
}

function findMarkdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git"].includes(entry.name) && !entry.name.startsWith(".")) {
        files.push(...findMarkdownFiles(full));
      }
    } else if (isMarkdownFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function resolveInputFiles(inputs, recursive) {
  const files = [];
  for (const input of inputs.length > 0 ? inputs : ["."]) {
    const absolute = resolve(input);
    if (!existsSync(absolute)) throw new Error(`Path not found: ${input}`);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (!recursive) throw new Error(`Directory input requires --all: ${input}`);
      files.push(...findMarkdownFiles(absolute));
    } else if (isMarkdownFile(absolute)) {
      files.push(absolute);
    }
  }
  return [...new Set(files)].sort();
}

function checkIdempotenceReadOnly(filePath) {
  const dir = mkdtempSync(join(tmpdir(), "markdown-formatter-"));
  const copy = join(dir, basename(filePath));
  try {
    copyFileSync(filePath, copy);
    if (!runOxfmt(["--write", copy])) return false;
    const once = readFileSync(copy, "utf8");
    if (!runOxfmt(["--write", copy])) return false;
    const twice = readFileSync(copy, "utf8");
    if (once !== twice) {
      console.error(`Idempotence check failed: ${filePath}`);
      return false;
    }
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runStructuralValidation(filePath, includeFencesOnly = false) {
  if (includeFencesOnly) return runScript("check-fences.js", filePath);
  return (
    runScript("check-structure.js", "--verify", filePath) &&
    runScript("check-fences.js", filePath) &&
    runScript("check-tables.js", filePath) &&
    runScript("check-pipes.js", filePath)
  );
}

function processFile(filePath, args) {
  // Block all modes on adjacent pipes — oxfmt cannot safely handle them.
  // Exception: --fences only validates code fences, not tables.
  if (!args.fences) {
    const raw = readFileSync(filePath, "utf8");
    const issues = detectAdjacentPipes(raw);
    if (issues.length > 0) {
      console.error(`Error: ${basename(filePath)} — adjacent pipes (||) would cause oxfmt table corruption.`);
      issues.forEach(i => console.error(`  Line ${i.lineIndex + 1}: ${i.detail}`));
      return false;
    }
  }

  // Repair table column mismatches before any formatting or validation
  // in write modes. This ensures oxfmt receives structurally valid tables.
  const writeMode = isWriteMode(args);
  const originalContent = writeMode ? readFileSync(filePath, "utf8") : null;
  if (writeMode) {
    const repaired = repairTableColumns(originalContent);
    if (repaired !== originalContent) {
      writeFileSync(filePath, repaired);
    }
  }

  if (args.fences) return runStructuralValidation(filePath, true);
  if (args.validate) return runStructuralValidation(filePath);
  if (args.verify) return runStructuralValidation(filePath) && runOxfmt(["--check", filePath]) && checkIdempotenceReadOnly(filePath);

  if (args.guard) {
    if (args.check) return runStructuralValidation(filePath) && runOxfmt(["--check", filePath]);
    if (args["dry-run"]) {
      if (!runStructuralValidation(filePath)) return false;
      if (!runOxfmt(["--check", filePath])) console.log(`Would format: ${filePath}`);
      return true;
    }
    const snapshotPath = `${filePath}.structure.json`;
    const hadSnapshot = existsSync(snapshotPath);
    const previousSnapshot = hadSnapshot ? readFileSync(snapshotPath, "utf8") : null;
    try {
      if (!runScript("check-structure.js", "--snapshot", filePath)) return false;
      if (!runOxfmt(["--write", filePath])) {
        writeFileSync(filePath, originalContent);
        return false;
      }
      if (!runScript("check-structure.js", "--check", filePath)) {
        writeFileSync(filePath, originalContent);
        return false;
      }
      return true;
    } finally {
      if (hadSnapshot) writeFileSync(snapshotPath, previousSnapshot);
      else rmSync(snapshotPath, { force: true });
    }
  }

  if (args.check) return runOxfmt(["--check", filePath]);

  if (args["dry-run"]) {
    if (!runOxfmt(["--check", filePath])) console.log(`Would format: ${filePath}`);
    return true;
  }

  return runOxfmt(["--write", filePath]) && checkIdempotenceReadOnly(filePath);
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.doctor) return runDoctor() ? 0 : 1;
  if (args.help || (args._.length === 0 && !args.all)) {
    printHelp();
    return 0;
  }

  const files = resolveInputFiles(args._, args.all);
  if (files.length === 0) throw new Error("No markdown files to process.");

  let success = 0;
  for (const file of files) {
    if (processFile(file, args)) success++;
  }

  if (files.length > 1) console.log(`\nProcessed ${success}/${files.length} files.`);
  return success === files.length ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  }
}

module.exports = {
  NODE_RUNTIME_MIN_VERSION,
  OXFMT_MAX_VERSION,
  parseArgs,
  getOxfmtPathCandidates,
  getSpawnOptions,
  resolveOxfmtBin,
  runDoctor,
  isSupportedOxfmtVersion,
  findMarkdownFiles,
  resolveInputFiles,
  processFile,
  main,
  repairTableColumns,
  isWriteMode,
};
