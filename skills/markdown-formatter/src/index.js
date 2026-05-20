#!/usr/bin/env node
/**
 * Markdown Formatter CLI - Format markdown to GFM standard using oxfmt.
 *
 * Usage: node src/index.js [options] <path>
 *
 * Options:
 *   --check      Read-only check (exit 0 if clean)
 *   --fix        Apply formatting (default)
 *   --all        Process all .md files in directory
 *   --guard      Snapshot before/after formatting
 *   --verify     Static structural check
 *   --fences     Validate fenced code blocks
 *   --validate   Validate table columns
 *   --dry-run    Preview changes
 *   --help       Show this help
 *
 * Prerequisites: oxfmt on PATH or in node_modules/.bin/
 */

"use strict";

const { spawnSync } = require("child_process");
const { readdir } = require("fs/promises");
const { readFileSync, existsSync } = require("fs");
const { join, resolve } = require("path");

const SKILL_DIR = resolve(__dirname, "..");
const LONG_FLAGS = new Set(["check", "fix", "all", "guard", "verify", "fences", "validate", "dry-run", "help"]);
const SHORT_FLAGS = { h: "help", n: "dry-run" };

function parseArgs(argv) {
  const args = { _: [], check: false, fix: false, all: false, guard: false, verify: false, fences: false, validate: false, "dry-run": false, help: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") { args._.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith("--")) { if (LONG_FLAGS.has(arg.slice(2))) args[arg.slice(2)] = true; }
    else if (arg.startsWith("-")) { for (const c of arg.slice(1)) { if (SHORT_FLAGS[c]) args[SHORT_FLAGS[c]] = true; } }
    else { args._.push(arg); }
  }
  return args;
}

const args = parseArgs(process.argv);

if (args.help || (args._.length === 0 && !args.all)) {
  console.log(`
Markdown Formatter CLI

Usage: node src/index.js [options] <path>

Options:
  --check           Read-only check (exit 0 if clean)
  --fix             Apply formatting (default)
  --all             Process all .md files in directory
  --guard           Snapshot before/after formatting
  --verify          Static structural check
  --fences          Validate fenced code blocks
  --validate        Validate table columns
  --dry-run, -n     Preview changes
  --help, -h        Show this help

Prerequisites: oxfmt on PATH or in node_modules/.bin/
`);
  process.exit(0);
}

function getOxfmtBin() {
  const paths = [
    join(SKILL_DIR, "node_modules", ".bin", "oxfmt"),
    join(SKILL_DIR, "node_modules", "oxfmt", "bin", "oxfmt"),
  ];
  for (const p of paths) { if (existsSync(p)) return p; }

  try { if (spawnSync("oxfmt", ["--version"], { encoding: "utf8", timeout: 5000 }).status === 0) return "oxfmt"; }
  catch { /* not on PATH */ }

  console.error("Error: oxfmt not found.");
  console.error("Install: npm install (dev) or https://github.com/oxc-project/oxc/releases");
  process.exit(1);
}

function runOxfmt(oxfmtArgs) {
  const result = spawnSync(getOxfmtBin(), oxfmtArgs, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status;
}

function runScript(script, ...scriptArgs) {
  const scriptPath = join(SKILL_DIR, "scripts", script);
  if (!existsSync(scriptPath)) { console.error(`Error: ${script} not found`); return false; }
  const result = spawnSync("node", [scriptPath, ...scriptArgs], { encoding: "utf8" });
  if (result.status !== 0 && result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

async function findMarkdownFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!["node_modules", ".git"].includes(entry.name) && !entry.name.startsWith(".")) {
        files.push(...(await findMarkdownFiles(join(dir, entry.name))));
      }
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".markdown")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

function checkIdempotence(filePath) {
  const content1 = readFileSync(filePath, "utf8");
  if (runOxfmt(["--write", filePath]) !== 0) return false;
  const content2 = readFileSync(filePath, "utf8");
  if (runOxfmt(["--write", filePath]) !== 0) return false;
  if (content2 !== readFileSync(filePath, "utf8")) { console.error(`Idempotence check failed: ${filePath}`); return false; }
  return true;
}

async function processFile(filePath) {
  if (args.verify) return runScript("check-structure.js", "--verify", filePath) && (console.log(`Structure valid: ${filePath}`), true);
  if (args.fences) return runScript("check-fences.js", filePath) && (console.log(`Fences valid: ${filePath}`), true);
  if (args.validate) return runScript("check-tables.js", filePath) && (console.log(`Tables valid: ${filePath}`), true);

  if (args.guard) {
    if (!runScript("check-structure.js", "--snapshot", filePath)) return false;
    if (!args.check && !args["dry-run"] && runOxfmt(["--write", filePath]) !== 0) return false;
    if (!runScript("check-structure.js", "--check", filePath)) return console.error(`Structural drift: ${filePath}`), false;
    console.log(`Structure preserved: ${filePath}`);
    return true;
  }

  if (args.check) return runOxfmt(["--check", filePath]) === 0;

  if (args["dry-run"]) { if (runOxfmt(["--check", filePath]) !== 0) console.log(`Would format: ${filePath}`); return true; }

  return runOxfmt(["--write", filePath]) === 0 && checkIdempotence(filePath);
}

async function main() {
  const files = args.all ? await findMarkdownFiles(resolve(args._[0] || ".")) : args._;
  if (files.length === 0) { console.error("Error: No files to process."); process.exit(1); }

  let success = 0;
  for (const file of files) { if (await processFile(file)) { success++; } else if (args.guard || args.verify) process.exit(1); }
  if (files.length > 1) console.log(`\nProcessed ${success}/${files.length} files.`);
  if (success !== files.length) process.exit(1);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
