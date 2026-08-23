#!/usr/bin/env node
/**
 * Markdown Formatter CLI - Format markdown to GFM standard with structural guards.
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
 *   --audit-tables  Print table row cell counts and pipe hazards without writing
 *   --no-repair  In write modes, report repairable table issues instead of modifying them
 *   --help       Show this help
 *
 * Prerequisites: Node.js >=24.
 */

"use strict";

const { readdirSync, statSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync, copyFileSync, mkdtempSync, rmSync } = require("fs");
const { join, resolve, relative, extname, basename } = require("path");
const { tmpdir } = require("os");

const { formatContent } = require("./format-content.mjs");
const { hasUnclosedFence, validateTables } = require('../guard/check-tables.js');
const { detectAdjacentPipes, validatePipes } = require('../guard/check-pipes.js');
const { repairTableColumns, repairAdjacentPipes, normalizeTableSpacing, tableHasEmptyCells, hasTableWithEmptyCells, auditTables } = require("./repairs.js");
const { validateFences } = require('../guard/check-fences.js');
const { buildSnapshot, validateStructure, loadSnapshot, saveSnapshot, compareSnapshots } = require('../guard/check-structure.js');

const SKILL_DIR = resolve(__dirname, "..");
const FORMATTER_MODULE = join(SKILL_DIR, "src", "format-content.mjs");
const NODE_RUNTIME_MIN_VERSION = 24;
const LONG_FLAGS = new Set(["check", "fix", "all", "guard", "verify", "fences", "validate", "doctor", "dry-run", "audit-tables", "no-repair", "help", "version"]);
const SHORT_FLAGS = { h: "help", n: "dry-run" };
const READ_ONLY_FLAGS = new Set(["check", "validate", "fences", "verify", "doctor", "help", "dry-run", "audit-tables", "version"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

/**
 * Parse CLI arguments into a structured options object.
 *
 * Recognizes --long-flag, -n (short), and positional paths.
 * Throws on unknown flags. The -- separator stops flag parsing.
 *
 * @param {string[]} argv - Process argv array (e.g. process.argv).
 * @returns {{ _: string[], check: boolean, fix: boolean, all: boolean, guard: boolean, verify: boolean, fences: boolean, validate: boolean, doctor: boolean, 'dry-run': boolean, 'audit-tables': boolean, 'no-repair': boolean, help: boolean, version: boolean }}
 */
function parseArgs(argv) {
  const args = { _: [], check: false, fix: false, all: false, guard: false, verify: false, fences: false, validate: false, doctor: false, "dry-run": false, "audit-tables": false, "no-repair": false, help: false, version: false };

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

/**
 * Print help text to stdout.
 *
 * @returns {void}
 */
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
  --audit-tables    Print table row cell counts and pipe hazards without writing
  --no-repair       In write modes, report repairable table issues instead of modifying them
  --version         Print version number and exit
  --help, -h        Show this help

File exclusion:
  Create .mdfmtignore in the current directory (one pattern per line,
  # for comments). Patterns ending with / match directories (glob
  characters allowed). * matches non-/ characters within one segment,
  ** matches across segments. Root-only anchoring: patterns without /
  match from the project root. ? and [...] are literals; no ! negation.
  node_modules/ and .git/ are always skipped.
  Used by --all and explicit paths.
`);
}

/**
 * Check if a Node.js version string meets the minimum requirement.
 *
 * @param {string} version - Node.js version string (e.g. "v24.0.0").
 * @returns {boolean} True if version >= NODE_RUNTIME_MIN_VERSION.
 */
function isSupportedNodeVersion(version) {
  const major = Number(String(version).replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= NODE_RUNTIME_MIN_VERSION;
}

/**
 * Check runtime prerequisites without modifying files.
 *
 * Verifies Node.js version, formatter module readiness, and presence
 * of all required payload files. Accepts injectable dependencies
 * for testing (log, exists, nodeVersion, checkFormatter).
 *
 * @param {{log?: function, exists?: function, nodeVersion?: string, checkFormatter?: function}} [options={}] - Injectable dependencies.
 * @returns {boolean} True if all prerequisites are met.
 */
function runDoctor(options = {}) {
  const log = options.log || ((line) => console.log(line));
  const exists = options.exists || existsSync;
  const nodeVersion = options.nodeVersion || process.version;
  const checkFormatter = options.checkFormatter || ((file) => {
    try {
      const formatter = require(file);
      return { ok: typeof formatter.formatContent === "function", error: null };
    } catch (error) {
      return { ok: false, error };
    }
  });

  const requiredFiles = [
    join(SKILL_DIR, "SKILL.md"),
    join(SKILL_DIR, "src", "index.js"),
    FORMATTER_MODULE,
    join(SKILL_DIR, "guard", "check-structure.js"),
    join(SKILL_DIR, "guard", "check-fences.js"),
    join(SKILL_DIR, "guard", "check-tables.js"),
    join(SKILL_DIR, "guard", "check-pipes.js"),
    join(SKILL_DIR, "guard", "fence-utils.js"),
  ];

  let ok = true;
  log("Markdown Formatter Doctor");
  log("");

  const nodeOk = isSupportedNodeVersion(nodeVersion);
  ok = ok && nodeOk;
  log(`Node.js: ${nodeVersion} (${nodeOk ? "ok" : `requires >=${NODE_RUNTIME_MIN_VERSION}`})`);

  const formatterCheck = checkFormatter(FORMATTER_MODULE);
  ok = ok && formatterCheck.ok;
  log(`Formatter: ${FORMATTER_MODULE} (${formatterCheck.ok ? "ok" : "missing or invalid"})`);
  if (formatterCheck.error) log(`  ${formatterCheck.error.message}`);

  for (const file of requiredFiles) {
    const present = exists(file);
    if (!present) ok = false;
    log(`Payload: ${file} (${present ? "ok" : "missing"})`);
  }

  log("");
  log(`Ready: ${ok ? "yes" : "no"}`);
  return ok;
}

/**
 * Run a guard script by name against one or more file paths.
 *
 * Dispatches to validateFences, validateTables, validatePipes, or
 * check-structure depending on the script name. Returns true if the
 * script passes for all files.
 *
 * @param {string} script - Guard script name (e.g. "check-fences.js").
 * @param {...string} scriptArgs - File paths to check.
 * @returns {boolean} True if all files pass.
 */
function runScript(script, ...scriptArgs) {
  if (!scriptArgs.length) {
    console.error(`Usage: ${script} <args...>`);
    return false;
  }

  if (script === "check-fences.js") {
    let ok = true;
    for (const filePath of scriptArgs) {
      try {
        const errors = validateFences(readFileSync(filePath, "utf8"));
        errors.forEach((error) => console.error(`${filePath}: ${error}`));
        ok = ok && errors.length === 0;
      } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
        ok = false;
      }
    }
    return ok;
  }

  if (script === "check-tables.js") {
    let ok = true;
    for (const filePath of scriptArgs) {
      try {
        const errors = validateTables(readFileSync(filePath, "utf8"));
        errors.forEach((error) => console.error(`${filePath}: ${error}`));
        ok = ok && errors.length === 0;
      } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
        ok = false;
      }
    }
    return ok;
  }

  if (script === "check-pipes.js") {
    let ok = true;
    for (const filePath of scriptArgs) {
      try {
        validatePipes(readFileSync(filePath, "utf8")).forEach((diagnostic) => console.warn(`${filePath}: ${diagnostic}`));
      } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
        ok = false;
      }
    }
    return ok;
  }

  if (script === "check-structure.js") {
    const [mode, filePath] = scriptArgs;
    if (!filePath) {
      console.error("Usage: node check-structure.js [--snapshot|--check|--guard|--verify] <file>");
      return false;
    }
    if (!["--snapshot", "--check", "--guard", "--verify"].includes(mode)) {
      console.error(`Invalid mode: ${mode}`);
      return false;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      return false;
    }

    const content = readFileSync(filePath, "utf8");
    if (mode === "--verify") {
      const errors = validateStructure(content);
      errors.forEach((error) => console.error(`Structural error: ${error}`));
      if (errors.length > 0) return false;
      console.log(`Structure valid: ${filePath}`);
      return true;
    }
    if (mode === "--snapshot") {
      const snapshotPath = saveSnapshot(filePath, buildSnapshot(content));
      console.log(`Snapshot written: ${snapshotPath}`);
      return true;
    }
    const before = loadSnapshot(filePath);
    if (!before) {
      console.error(`No snapshot found for ${filePath}. Run --snapshot first.`);
      return false;
    }
    const drift = compareSnapshots(before, buildSnapshot(content));
    drift.forEach((item) => console.error(`Structural drift: ${item}`));
    if (drift.length > 0) return false;
    console.log(`Structure preserved: ${filePath}`);
    return true;
  }

  console.error(`Error: ${script} not found`);
  return false;
}

/**
 * Check if a file path has a supported markdown extension.
 *
 * @param {string} filePath - Absolute or relative path.
 * @returns {boolean} True if extension is .md, .markdown, or .mdx.
 */
function isMarkdownFile(filePath) {
  return MARKDOWN_EXTENSIONS.has(extname(filePath));
}

/**
 * Load ignore patterns from .mdfmtignore in the given directory.
 * Returns an empty array if the file doesn't exist.
 *
 * Format: one pattern per line, # for comments, blank lines ignored.
 * Patterns ending with / match directories (prefix). ** matches any
 * characters including /; * matches non-/ characters. Everything else
 * is an exact path match. node_modules/ and .git/ are always skipped.
 *
 * @param {string} cwd Directory to look for .mdfmtignore
 * @returns {string[]} Normalized patterns
 */
function loadIgnorePatterns(cwd) {
  const ignorePath = join(cwd, ".mdfmtignore");
  if (!existsSync(ignorePath)) return [];
  const content = readFileSync(ignorePath, "utf8");
  return content.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * Match a single path segment against a glob segment.
 *
 * Supports `*` (matches any characters except `/`).
 * Literal segments must match exactly.
 *
 * @param {string} segment - Path segment to test.
 * @param {string} glob - Glob segment (may contain `*`).
 * @returns {boolean} True if the segment matches.
 */
function matchSegment(segment, glob) {
  if (!glob.includes("*")) return segment === glob;
  // Cache compiled regexes: traversal calls this per segment × pattern × file,
  // and identical globs repeat across thousands of paths.
  let re = segmentRegexCache.get(glob);
  if (!re) {
    // Convert glob to regex: * → [^/]* (matches within single segment);
    // all other regex metachars (? included) are escaped so they match literally
    re = new RegExp(
      "^" +
        glob.replace(/[.+^${}()?|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") +
        "$"
    );
    segmentRegexCache.set(glob, re);
  }
  return re.test(segment);
}

/** Compiled-segment-regex cache for matchSegment, keyed by glob string. */
const segmentRegexCache = new Map();

/**
 * Match a relative path against a single glob pattern using segment-based
 * two-pointer backtracking (same algorithm as git's wildmatch / picomatch).
 *
 * Pattern syntax:
 * - `*` matches any characters within a single path segment
 * - `**` matches zero or more path segments
 * - `/` separates path segments
 * - All other characters match literally
 *
 * @param {string} relPath - Relative path to test (e.g. "docs/foo.md").
 * @param {string} pattern - Glob pattern (e.g. "*.md", "docs/*.md").
 * @returns {boolean} True if the path matches the pattern.
 */
function globMatch(relPath, pattern) {
  const pathSegs = relPath.split("/");
  const globSegs = pattern.split("/");
  return _globMatchRecursive(pathSegs, globSegs, 0, 0, new Map());
}

/**
 * Recursive helper for globMatch. Uses two pointers walking through
 * glob segments and path segments with backtracking on `**`.
 *
 * @param {string[]} ps - Path segments.
 * @param {string[]} gs - Glob segments.
 * @param {number} pi - Current glob index.
 * @param {number} pj - Current path index.
 * @returns {boolean} Match result.
 */
function _globMatchRecursive(ps, gs, pi, pj, memo) {
  const key = `${pi}:${pj}`;
  if (memo.has(key)) return memo.get(key);
  // Both exhausted → match
  if (pi === gs.length && pj === ps.length) return true;

  // Glob exhausted but path remains → no match
  if (pi === gs.length) return false;

  // Current glob segment is **
  if (gs[pi] === "**") {
    // Try consuming zero segments (skip **) or one+ segments
    // ** at end matches everything remaining
    if (pi + 1 === gs.length) return true;
    // Try matching rest of glob against current + each subsequent path position
    for (let k = pj; k <= ps.length; k++) {
      if (_globMatchRecursive(ps, gs, pi + 1, k, memo)) { memo.set(key, true); return true; }
    }
    memo.set(key, false);
    return false;
  }

  // Path exhausted but glob remains (and it's not **) → no match
  if (pj === ps.length) return false;

  // Current glob is * or literal — match single segment
  if (matchSegment(ps[pj], gs[pi])) {
    const result = _globMatchRecursive(ps, gs, pi + 1, pj + 1, memo);
    memo.set(key, result);
    return result;
  }

  memo.set(key, false);
  return false;
}

/**
 * Check if a relative path matches any ignore pattern.
 *
 * @param {string} relPath Relative path to check
 * @param {string[]} patterns Ignore patterns
 * @returns {boolean} True if the path should be ignored
 */
function matchesIgnorePattern(relPath, patterns) {
  // Normalize Windows separators so segment matching works cross-platform
  const posixPath = relPath.replace(/\\/g, "/");
  return patterns.some((p) => {
    // Trailing slash marks a directory pattern: it matches the directory
    // itself plus everything beneath it. Glob characters are honored.
    const isDirPattern = p.endsWith("/");
    const pat = isDirPattern ? p.slice(0, -1) : p;
    if (!pat) return false;
    if (pat.includes("*")) {
      if (globMatch(posixPath, pat)) return true;
      // Directory globs must also cover every file below the matched dir
      if (isDirPattern && globMatch(posixPath, `${pat}/**`)) return true;
      return false;
    }
    // Exact match or path prefix
    if (posixPath === pat || posixPath.startsWith(pat + "/")) return true;
    return false;
  });
}


/**
 * Determine if the current args indicate a write mode (files will be modified).
 * Write modes: --fix, --guard, or default (no explicit flag). All other flags
 * are read-only. Adding a new read-only flag requires adding it to READ_ONLY_FLAGS.
 *
 * @param {object} args Parsed CLI arguments.
 * @returns {boolean} True if the operation writes to files.
 */
function isWriteMode(args) {
  return ![...READ_ONLY_FLAGS].some((flag) => args[flag]);
}

/**
 * Recursively find markdown files in a directory, filtering by ignore patterns.
 *
 * Skips node_modules and .git (always). Applies .mdfmtignore patterns on
 * dot-directories and other entries. To exclude dot-directories, add
 * patterns like .github/ to .mdfmtignore.
 *
 * @param {string} dir - Directory to search.
 * @param {string[]} [ignorePatterns=[]] - Patterns from .mdfmtignore.
 * @param {string|null} [cwd=null] - Base directory for relative path matching.
 * @returns {string[]} Sorted unique file paths.
 */
function findMarkdownFiles(dir, ignorePatterns = [], cwd = null) {
  const base = cwd || dir;
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git"].includes(entry.name)) {
        const rel = relative(base, full);
        if (!matchesIgnorePattern(rel, ignorePatterns)) {
          files.push(...findMarkdownFiles(full, ignorePatterns, base));
        }
      }
    } else if (isMarkdownFile(entry.name)) {
      const rel = relative(base, full);
      if (!matchesIgnorePattern(rel, ignorePatterns)) {
        files.push(full);
      }
    }
  }
  return files;
}

/**
 * Resolve input paths to an absolute list of markdown files.
 *
 * Accepts file paths and directory paths. Directories require
 * --all (recursive flag). Applies .mdfmtignore filtering. Throws
 * on non-existent paths or missing --all for directories.
 *
 * @param {string[]} inputs - CLI positional arguments (paths).
 * @param {boolean} recursive - Whether to recurse into directories (--all).
 * @param {string[]} [ignorePatterns=[]] - Patterns from .mdfmtignore.
 * @returns {string[]} Sorted unique absolute file paths.
 */
function resolveInputFiles(inputs, recursive, ignorePatterns = []) {
  const files = [];
  for (const input of inputs.length > 0 ? inputs : ["."]) {
    const absolute = resolve(input);
    if (!existsSync(absolute)) throw new Error(`Path not found: ${input}`);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (!recursive) throw new Error(`Directory input requires --all: ${input}`);
      files.push(...findMarkdownFiles(absolute, ignorePatterns));
    } else if (isMarkdownFile(absolute)) {
      const rel = relative(process.cwd(), absolute);
      if (!matchesIgnorePattern(rel, ignorePatterns)) {
        files.push(absolute);
      }
    }
  }
  return [...new Set(files)].sort();
}

/**
 * Format markdown content using the core formatter module with default options.
 *
 * @param {string} content - Raw markdown text.
 * @returns {string} Formatted markdown text.
 */
function formatFileContent(content) {
  return formatContent(content, { indentWidth: 2 });
}

function atomicWriteFile(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, content, "utf8");
    chmodSync(tempPath, statSync(filePath).mode);
    renameSync(tempPath, filePath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch { /* preserve the original error */ }
    throw error;
  }
}

/**
 * Check formatting of a file (read-only).
 *
 * Reads the file, formats it in memory, and compares against the
 * original. Reports issues to stderr. Does not modify the file.
 *
 * @param {string} filePath - Path to a markdown file.
 * @param {{report?: boolean}} [options={}] - Options. Set report=false to suppress stderr output.
 * @returns {boolean} True if already formatted correctly.
 */
function checkFormatting(filePath, options = {}) {
  const content = readFileSync(filePath, "utf8");
  const formatted = formatFileContent(content);
  if (formatted === content) return true;
  if (options.report !== false) console.error(`Format issues: ${filePath}`);
  return false;
}

/**
 * Format a file in-place. Writes changes to disk if needed.
 *
 * @param {string} filePath - Path to a markdown file.
 * @returns {boolean} True on success (always returns true after writing).
 */
function writeFormatting(filePath) {
  const content = readFileSync(filePath, "utf8");
  const formatted = formatFileContent(content);
  if (formatted !== content) atomicWriteFile(filePath, formatted);
  return true;
}

/**
 * Check that formatting is idempotent (formatting twice produces the same
 * result). Works on a temp copy without modifying the original file.
 *
 * @param {string} filePath - Path to the original file.
 * @returns {boolean} True if formatting is idempotent.
 */
function checkIdempotenceReadOnly(filePath) {
  const dir = mkdtempSync(join(tmpdir(), "markdown-formatter-"));
  const copy = join(dir, basename(filePath));
  try {
    copyFileSync(filePath, copy);
    if (!writeFormatting(copy)) return false;
    const once = readFileSync(copy, "utf8");
    if (!writeFormatting(copy)) return false;
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

/** Preserve empty-cell tables while applying safe spacing normalization. */
function preserveEmptyCellTables(filePath, content) {
  const spaced = normalizeTableSpacing(content);
  if (spaced !== content) {
    atomicWriteFile(filePath, spaced);
    console.error(`Note: ${basename(filePath)} — normalized table spacing; formatter skipped (empty cells).`);
  } else {
    console.error(`Note: ${basename(filePath)} — skipped formatter due to empty table cells; pipe repairs applied.`);
  }
  return true;
}

/**
 * Run all structural guard validations on a file.
 *
 * When includeFencesOnly is true, only runs fence validation (for
 * --fences mode). Otherwise runs structure, fences, tables, and
 * pipes checks sequentially.
 *
 * @param {string} filePath - Path to a markdown file.
 * @param {boolean} [includeFencesOnly=false] - If true, skip table/pipe checks.
 * @returns {boolean} True if all validations pass.
 */
function runStructuralValidation(filePath, includeFencesOnly = false) {
  if (includeFencesOnly) return runScript("check-fences.js", filePath);
  return (
    runScript("check-structure.js", "--verify", filePath) &&
    runScript("check-fences.js", filePath) &&
    runScript("check-tables.js", filePath) &&
    runScript("check-pipes.js", filePath)
  );
}

/**
 * Process a single file through the full format/guard pipeline.
 *
 * The pipeline order is:
 * 1. Preflight: detect unclosed fences (blocks table/pipe reliability)
 * 2. Guard pipe safety (--audit-tables, inline-code pipe check)
 * 3. Adjacent pipe repair (write modes) or block (read-only modes)
 * 4. Table column repair (write modes)
 * 5. Guard validation (--verify, --validate, --fences, --guard, --check modes)
 * 6. Formatting (write-modes and --guard)
 * 7. Idempotence check
 *
 * Returns true if the file was processed successfully, false on error.
 *
 * @param {string} filePath - Path to a markdown file.
 * @param {{ check: boolean, fix: boolean, all: boolean, guard: boolean, verify: boolean, fences: boolean, validate: boolean, doctor: boolean, 'dry-run': boolean, 'audit-tables': boolean, 'no-repair': boolean, help: boolean, _: string[] }} args - Parsed CLI arguments.
 * @returns {boolean} True if processing succeeded.
 */
function processFile(filePath, args) {
  const writeMode = isWriteMode(args);

  // Read original content before any modifications
  const originalContent = readFileSync(filePath, "utf8");

  // Preflight: unclosed fences blind the shared getFenceBoundary state
  // machine used by check-tables.js, check-pipes.js, and
  // check-structure.js's extractTables. All three will silently skip
  // everything after the unclosed opener. Detect it early and gate
  // table/pipe checks so the user doesn't get misleading results.
  const isFenceOnly = args.fences;
  const unclosedFenceExists = !isFenceOnly && hasUnclosedFence(originalContent);

  let repairedContent = originalContent;  // tracks content after repairs, before formatting

  if (args["audit-tables"]) {
    console.log(auditTables(originalContent, filePath));
    return true;
  }

  // Step 1: Adjacent pipe repair (write modes) or block (read-only modes)
  // Exception: --fences only validates code fences, not tables.
  // Also skip when an unclosed fence blinds the shared tracker.
  if (!isFenceOnly && !unclosedFenceExists) {
    const formatterUnsafeTableErrors = validateTables(originalContent).filter((error) => error.includes("inline code span contains unescaped pipe"));
    if (formatterUnsafeTableErrors.length > 0) {
      console.error(`Error: ${basename(filePath)} — inline-code pipes in tables would cause formatter table corruption.`);
      formatterUnsafeTableErrors.forEach((error) => console.error(`  ${error}`));
      // Per GFM Example 200, | inside inline code is a cell delimiter. We block
      // here because the formatter cannot distinguish intentional | inside
      // `code` from an accidental delimiter. The author must escape as \| to
      // produce literal | inside inline code in a table cell.
      return false;
    }

    if (writeMode) {
      const adjacentPipeIssues = detectAdjacentPipes(originalContent);
      if (args["no-repair"] && adjacentPipeIssues.length > 0) {
        console.error(`Error: ${basename(filePath)} — no-repair mode found adjacent pipes (||); refusing automatic table repair.`);
        adjacentPipeIssues.forEach(i => console.error(`  Line ${i.lineIndex + 1}: ${i.detail}`));
        return false;
      }
      const repaired = repairAdjacentPipes(originalContent);
      if (repaired !== originalContent) {
        atomicWriteFile(filePath, repaired);
        repairedContent = repaired;
        console.error(`Repaired adjacent pipes in ${basename(filePath)}`);
      }
    } else {
      const issues = detectAdjacentPipes(originalContent);
      if (issues.length > 0) {
        console.error(`Error: ${basename(filePath)} — adjacent pipes (||) would cause formatter table corruption.`);
        issues.forEach(i => console.error(`  Line ${i.lineIndex + 1}: ${i.detail}`));
        return false;
      }
    }
  }

  // Step 2: Repair table column mismatches before formatting in write modes.
  // Skip when an unclosed fence blinds the table tracker.
  if (writeMode && !unclosedFenceExists) {
    const current = repairedContent;
    const repaired = repairTableColumns(current);
    if (args["no-repair"] && repaired !== current) {
      console.error(`Error: ${basename(filePath)} — no-repair mode found table column drift; refusing automatic column repair.`);
      return false;
    }
    if (repaired !== current) {
      atomicWriteFile(filePath, repaired);
      repairedContent = repaired;
    }
  }

  if (unclosedFenceExists) {
    console.error(
      `Warning: ${basename(filePath)} — unclosed fence blocks table/pipe tracking. ` +
      `Table and pipe checks are unreliable (shared fence tracker blinds ` +
      `all downstream content). Run --fences to locate the unclosed fence.`
    );
    // Still run fence validation, but skip table/pipe checks. Unguarded write
    // modes may continue formatting; guarded modes fail before writing.
    if (args.fences) return runStructuralValidation(filePath, true);
    if (args.validate) return runScript("check-structure.js", "--verify", filePath) && runScript("check-fences.js", filePath);
    if (args.verify) return runScript("check-structure.js", "--verify", filePath) && runScript("check-fences.js", filePath) && checkFormatting(filePath) && checkIdempotenceReadOnly(filePath);
    if (args["dry-run"]) {
      const fencesValid = runScript("check-structure.js", "--verify", filePath) && runScript("check-fences.js", filePath);
      if (!checkFormatting(filePath, { report: false })) console.log(`Would format: ${filePath}`);
      return fencesValid;
    }
    if (args.guard) {
      // A guard cannot establish a trustworthy before/after snapshot while a
      // fence is open. Fail before writing instead of reporting guarded success.
      return runScript("check-structure.js", "--verify", filePath) && runScript("check-fences.js", filePath);
    }
    if (args.check) return runScript("check-structure.js", "--verify", filePath) && runScript("check-fences.js", filePath) && checkFormatting(filePath);
    return writeFormatting(filePath) && checkIdempotenceReadOnly(filePath);
  }

  if (args.fences) return runStructuralValidation(filePath, true);
  if (args.validate) return runStructuralValidation(filePath);
  if (args.verify) return runStructuralValidation(filePath) && checkFormatting(filePath) && checkIdempotenceReadOnly(filePath);

  if (args.guard) {
    if (args.check) return runStructuralValidation(filePath) && checkFormatting(filePath);
    if (args["dry-run"]) {
      if (!runStructuralValidation(filePath)) return false;
      if (!checkFormatting(filePath, { report: false })) console.log(`Would format: ${filePath}`);
      return true;
    }
    // Preserve empty-cell tables; the formatter does not guess column intent.
    if (hasTableWithEmptyCells(repairedContent)) {
      return preserveEmptyCellTables(filePath, repairedContent);
    }
    const snapshotPath = `${filePath}.structure.json`;
    const hadSnapshot = existsSync(snapshotPath);
    const previousSnapshot = hadSnapshot ? readFileSync(snapshotPath, "utf8") : null;
    try {
      if (!runScript("check-structure.js", "--snapshot", filePath)) return false;
      if (!writeFormatting(filePath)) {
        atomicWriteFile(filePath, repairedContent);
        return false;
      }
      if (!runScript("check-structure.js", "--check", filePath)) {
        atomicWriteFile(filePath, repairedContent);
        return false;
      }
      return true;
    } catch (error) {
      try { atomicWriteFile(filePath, repairedContent); } catch { /* preserve the original failure */ }
      throw error;
    } finally {
      if (hadSnapshot) writeFileSync(snapshotPath, previousSnapshot);
      else rmSync(snapshotPath, { force: true });
    }
  }

  if (args.check) return checkFormatting(filePath);

  if (args["dry-run"]) {
    if (!checkFormatting(filePath, { report: false })) console.log(`Would format: ${filePath}`);
    return true;
  }

  // Preserve empty-cell tables rather than guessing author intent.
  if (writeMode && hasTableWithEmptyCells(repairedContent)) {
    return preserveEmptyCellTables(filePath, repairedContent);
  }

  return writeFormatting(filePath) && checkIdempotenceReadOnly(filePath);
}

/**
 * CLI entry point. Parses argv, resolves input files (with .mdfmtignore
 * filtering), processes each file, and returns an exit code.
 *
 * @param {string[]} [argv=process.argv] - Process argv array.
 * @returns {number} Exit code (0 = success, 1 = failure).
 */
function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.version) {
    const pkg = JSON.parse(readFileSync(join(SKILL_DIR, "package.json"), "utf8"));
    console.log(pkg.version);
    return 0;
  }
  if (args.doctor) return runDoctor() ? 0 : 1;
  if (args.help || (args._.length === 0 && !args.all)) {
    printHelp();
    return 0;
  }

  const ignorePatterns = loadIgnorePatterns(process.cwd());
  const files = resolveInputFiles(args._, args.all, ignorePatterns);
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
  parseArgs,
  runDoctor,
  findMarkdownFiles,
  resolveInputFiles,
  processFile,
  main,
  formatFileContent,
  checkFormatting,
  repairTableColumns,
  repairAdjacentPipes,
  normalizeTableSpacing,
  auditTables,
  hasTableWithEmptyCells,
  isWriteMode,
  loadIgnorePatterns,
  matchesIgnorePattern,
};
