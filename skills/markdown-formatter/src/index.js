#!/usr/bin/env node
/**
 * Markdown Formatter CLI
 *
 * Format markdown files using oxfmt with structural guardrails.
 *
 * Usage:
 *   node src/index.js [options] <path>
 *
 * Options:
 *   --check           Read-only check (exit 0 if clean)
 *   --fix             Apply formatting (default action)
 *   --all             Treat <path> as directory, process all .md files
 *   --guard           Structural guard: snapshot before/after formatting
 *   --verify          Static structural check (no before/after)
 *   --fences          Validate fenced code block structure
 *   --validate        Validate table column consistency
 *   --dry-run, -n     Preview changes without applying
 *   --help, -h        Show this help message
 *
 * oxfmt resolution (Phase A):
 *   1. Check local node_modules/.bin/oxfmt (development install)
 *   2. Check system PATH
 *   3. Fail with actionable install instructions
 */

"use strict";

const { spawnSync } = require("child_process");
const { readdir } = require("fs/promises");
const { readFileSync } = require("fs");
const { join, resolve, existsSync } = require("path");

const LONG_FLAGS = [
  "check",
  "fix",
  "all",
  "guard",
  "verify",
  "fences",
  "validate",
  "dry-run",
  "help",
];

const SHORT_FLAGS = {
  h: "help",
  n: "dry-run",
};

const argvOffset = 2; // Skip process.argv[0] and argv[1]

function parseArgs(argv) {
  const args = {
    _: [],
    check: false,
    fix: false,
    all: false,
    guard: false,
    verify: false,
    fences: false,
    validate: false,
    "dry-run": false,
    help: false,
  };

  for (let i = argvOffset; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const flag = arg.slice(2);
      if (LONG_FLAGS.includes(flag)) {
        args[flag] = true;
      }
    } else if (arg.startsWith("-")) {
      for (const char of arg.slice(1)) {
        if (SHORT_FLAGS[char]) {
          args[SHORT_FLAGS[char]] = true;
        }
      }
    } else {
      args._.push(arg);
    }
  }

  return args;
}

const args = parseArgs(process.argv);

if (args.help || (args._.length === 0 && !args.all)) {
  printHelp();
  process.exit(0);
}

function printHelp() {
  console.log(`
Markdown Formatter CLI - Format markdown to GFM standard

Usage:
  node src/index.js [options] <path>

Options:
  --check           Read-only check (exit 0 if clean)
  --fix             Apply formatting (default action)
  --all             Treat <path> as directory, process all .md files
  --guard           Structural guard: snapshot before/after formatting
  --verify          Static structural check (no before/after)
  --fences          Validate fenced code block structure
  --validate        Validate table column consistency
  --dry-run, -n     Preview changes without applying
  --help, -h        Show this help message

Prerequisites:
  oxfmt must be available via:
    1. Local: node_modules/.bin/oxfmt (from dev install)
    2. System: oxfmt on PATH

Examples:
  node src/index.js README.md                    # Fix single file
  node src/index.js --check README.md            # Check only
  node src/index.js --all docs/                 # Fix all .md in directory
  node src/index.js --guard README.md            # Run with structural guard
  node src/index.js --fences .                  # Validate fences only
`);
}

// oxfmt resolution (Phase A)

const SKILL_DIR = resolve(__dirname, "..");

function getOxfmtBin() {
  // 1. Check local node_modules/.bin/oxfmt (development install)
  const localOxfmt = join(SKILL_DIR, "node_modules", ".bin", "oxfmt");
  if (existsSync(localOxfmt)) {
    return localOxfmt;
  }

  // 2. Check direct node_modules path
  const directOxfmt = join(SKILL_DIR, "node_modules", "oxfmt", "bin", "oxfmt");
  if (existsSync(directOxfmt)) {
    return directOxfmt;
  }

  // 3. Try system oxfmt on PATH
  try {
    const result = spawnSync("oxfmt", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.status === 0) {
      return "oxfmt";
    }
  } catch {
    // Not on PATH
  }

  // Fail with actionable instructions
  console.error("Error: oxfmt not found.");
  console.error("");
  console.error("oxfmt must be installed. Options:");
  console.error("  1. Development: npm install (pins oxfmt in devDependencies)");
  console.error("  2. System: Download from https://github.com/oxc-project/oxc/releases");
  console.error("  3. npm: npm install -g oxfmt");
  console.error("");
  console.error("See: https://oxc.rs/docs/guide/usage/formatter.html");
  process.exit(1);
}

function runOxfmt(oxfmtArgs, options = {}) {
  const bin = getOxfmtBin();
  const result = spawnSync(bin, oxfmtArgs, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// File discovery

async function findMarkdownFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip common non-source directories
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function isMarkdownFile(filename) {
  return filename.endsWith(".md") || filename.endsWith(".markdown");
}

// Structural guard

function runStructuralGuard(filePath, mode) {
  const scriptPath = join(SKILL_DIR, "scripts", "check-structure.js");

  if (!existsSync(scriptPath)) {
    console.error(`Error: check-structure.js not found at ${scriptPath}`);
    return false;
  }

  const result = spawnSync("node", [scriptPath, `--${mode}`, filePath], {
    encoding: "utf8",
  });

  if (result.status !== 0 && result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status === 0;
}

// Fence validation

function runFenceValidation(dirOrFile) {
  const scriptPath = join(SKILL_DIR, "scripts", "check-fences.js");

  if (!existsSync(scriptPath)) {
    console.error(`Error: check-fences.js not found at ${scriptPath}`);
    return false;
  }

  const result = spawnSync("node", [scriptPath, dirOrFile], {
    encoding: "utf8",
  });

  if (result.status !== 0 && result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status === 0;
}

// Table validation

function runTableValidation(dirOrFile) {
  const scriptPath = join(SKILL_DIR, "scripts", "check-tables.js");

  if (!existsSync(scriptPath)) {
    console.error(`Error: check-tables.js not found at ${scriptPath}`);
    return false;
  }

  const result = spawnSync("node", [scriptPath, dirOrFile], {
    encoding: "utf8",
  });

  if (result.status !== 0 && result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status === 0;
}

// Idempotence check

function checkIdempotence(filePath) {
  const content1 = readFileSync(filePath, "utf8");

  // Run first pass
  const result1 = runOxfmt(["--write", filePath]);
  if (result1.status !== 0) {
    return false;
  }

  const content2 = readFileSync(filePath, "utf8");

  // Run second pass
  const result2 = runOxfmt(["--write", filePath]);
  if (result2.status !== 0) {
    return false;
  }

  const content3 = readFileSync(filePath, "utf8");

  if (content2 !== content3) {
    console.error(`Idempotence check failed: ${filePath}`);
    return false;
  }

  return true;
}

// File processing

async function processFile(filePath) {
  // Static structural verification
  if (args.verify) {
    if (!runStructuralGuard(filePath, "verify")) {
      return false;
    }
    console.log(`Structure valid: ${filePath}`);
    return true;
  }

  // Fence validation only
  if (args.fences) {
    if (!runFenceValidation(filePath)) {
      return false;
    }
    console.log(`Fences valid: ${filePath}`);
    return true;
  }

  // Table validation only
  if (args.validate) {
    if (!runTableValidation(filePath)) {
      return false;
    }
    console.log(`Tables valid: ${filePath}`);
    return true;
  }

  // Guard mode: pre-snapshot → format → post-verify
  if (args.guard) {
    // Pre-formatting snapshot
    if (!runStructuralGuard(filePath, "snapshot")) {
      return false;
    }

    // Apply formatting
    if (!args.check && !args["dry-run"]) {
      const result = runOxfmt(["--write", filePath]);
      if (result.status !== 0) {
        return false;
      }
    }

    // Post-formatting verification
    if (!runStructuralGuard(filePath, "check")) {
      console.error(`Structural drift detected: ${filePath}`);
      return false;
    }

    console.log(`Structure preserved: ${filePath}`);
    return true;
  }

  // Check mode (read-only)
  if (args.check) {
    const result = runOxfmt(["--check", filePath]);
    return result.status === 0;
  }

  // Dry-run mode
  if (args["dry-run"]) {
    const result = runOxfmt(["--check", filePath]);
    if (result.status !== 0) {
      console.log(`Would format: ${filePath}`);
    }
    return true;
  }

  // Default: fix mode with idempotence verification
  const result1 = runOxfmt(["--write", filePath]);
  if (result1.status !== 0) {
    return false;
  }

  // Verify idempotence
  if (!checkIdempotence(filePath)) {
    console.error(`Format failed (non-idempotent): ${filePath}`);
    return false;
  }

  return true;
}

// Main

async function main() {
  let files = [];

  if (args.all) {
    const dir = args._[0] || ".";
    files = await findMarkdownFiles(resolve(dir));
  } else {
    files = args._;
  }

  if (files.length === 0) {
    console.error("Error: No files to process.");
    process.exit(1);
  }

  let successCount = 0;
  let hasFailure = false;

  for (const file of files) {
    const success = await processFile(file);
    if (success) {
      successCount++;
    } else {
      hasFailure = true;
      if (args.guard || args.verify) {
        process.exit(1);
      }
    }
  }

  // Summary
  if (files.length > 1) {
    console.log(`\nProcessed ${successCount}/${files.length} files.`);
  }

  if (successCount !== files.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
