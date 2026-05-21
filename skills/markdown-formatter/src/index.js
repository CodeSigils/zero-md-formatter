#!/usr/bin/env node
/**
 * Markdown Formatter CLI - Format markdown to GFM standard using oxfmt.
 *
 * Usage: node src/index.js [options] <path...>
 *
 * Options:
 *   --check      Read-only format check (exit 0 if clean)
 *   --fix        Apply formatting (default)
 *   --all        Process directories recursively
 *   --guard      Pre/post structural check; rollback writes on drift; clean snapshots
 *   --verify     Run formatting, idempotence, and structural validation checks without modifying files
 *   --fences     Validate fenced code blocks
 *   --validate   Run all structural validations
 *   --doctor     Check runtime prerequisites without modifying files
 *   --dry-run    Preview changes
 *   --help       Show this help
 *
 * Prerequisites: oxfmt on PATH or in node_modules/.bin/
 */

"use strict";

const { spawnSync } = require("child_process");
const { readdirSync, statSync, existsSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } = require("fs");
const { join, resolve, extname, basename } = require("path");
const { tmpdir } = require("os");

const SKILL_DIR = resolve(__dirname, "..");
const OXFMT_CONFIG = join(SKILL_DIR, ".oxfmtrc.json");
const NODE_RUNTIME_MIN_VERSION = 20;
const LONG_FLAGS = new Set(["check", "fix", "all", "guard", "verify", "fences", "validate", "doctor", "dry-run", "help"]);
const SHORT_FLAGS = { h: "help", n: "dry-run" };
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
  --check           Read-only format check (exit 0 if clean)
  --fix             Apply formatting (default)
  --all             Process directories recursively
  --guard           Pre/post structural check; rollback writes on drift; clean snapshots
  --verify          Run formatting, idempotence, and structural validation checks without modifying files
  --fences          Validate fenced code blocks
  --validate        Run all structural validations
  --doctor          Check runtime prerequisites without modifying files
  --dry-run, -n     Preview changes
  --help, -h        Show this help

Prerequisites: oxfmt on PATH or in node_modules/.bin/
`);
}

function resolveOxfmtBin() {
  const paths = [
    join(process.cwd(), "node_modules", ".bin", "oxfmt"),
    join(process.cwd(), "node_modules", "oxfmt", "bin", "oxfmt"),
    join(SKILL_DIR, "node_modules", ".bin", "oxfmt"),
    join(SKILL_DIR, "node_modules", "oxfmt", "bin", "oxfmt"),
  ];
  for (const p of paths) { if (existsSync(p)) return p; }

  try { if (spawnSync("oxfmt", ["--version"], { encoding: "utf8", timeout: 5000 }).status === 0) return "oxfmt"; }
  catch { /* not on PATH */ }

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

function runDoctor(options = {}) {
  const log = options.log || ((line) => console.log(line));
  const exists = options.exists || existsSync;
  const nodeVersion = options.nodeVersion || process.version;
  const resolveOxfmt = options.resolveOxfmt || resolveOxfmtBin;
  const runVersion = options.runVersion || ((bin) => spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 5000, shell: process.platform === "win32" }));

  const requiredFiles = [
    join(SKILL_DIR, "SKILL.md"),
    OXFMT_CONFIG,
    join(SKILL_DIR, "src", "index.js"),
    join(SKILL_DIR, "scripts", "check-structure.js"),
    join(SKILL_DIR, "scripts", "check-fences.js"),
    join(SKILL_DIR, "scripts", "check-tables.js"),
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
  const result = spawnSync(getOxfmtBin(), [...configArgs, ...oxfmtArgs], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function runScript(script, ...scriptArgs) {
  const scriptPath = join(SKILL_DIR, "scripts", script);
  if (!existsSync(scriptPath)) { console.error(`Error: ${script} not found`); return false; }
  const result = spawnSync("node", [scriptPath, ...scriptArgs], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function isMarkdownFile(filePath) {
  return MARKDOWN_EXTENSIONS.has(extname(filePath));
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
    runScript("check-tables.js", filePath)
  );
}

function processFile(filePath, args) {
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
    const originalContent = readFileSync(filePath, "utf8");
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
  parseArgs,
  resolveOxfmtBin,
  runDoctor,
  findMarkdownFiles,
  resolveInputFiles,
  processFile,
  main,
};
