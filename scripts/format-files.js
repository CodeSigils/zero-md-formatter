#!/usr/bin/env node
/**
 * format-files.js — Run the markdown-formatter CLI on the authoritative file list.
 *
 * Usage: node scripts/format-files.js <flag>
 *   Examples:
 *     node scripts/format-files.js --fix        # format files in place
 *     node scripts/format-files.js --check       # check formatting (read-only)
 *     node scripts/format-files.js --verify      # verify formatting (read-only, stricter)
 *
 * Uses the file list from format-files-list.js as the single source of truth.
 */

"use strict";

const { spawnSync } = require("child_process");
const { resolve } = require("path");
const FORMAT_FILES = require("./format-files-list");

const ROOT = resolve(__dirname, "..");
const CLI = resolve(ROOT, "src/index.js");

function runFormatFiles(argv = process.argv.slice(2), options = {}) {
  const {
    spawn = spawnSync,
    nodePath = process.execPath,
    cli = CLI,
    formatFiles = FORMAT_FILES,
    cwd = ROOT,
    stderr = process.stderr,
  } = options;

  const flag = argv[0];
  if (!flag) {
    stderr.write("Usage: node scripts/format-files.js <--fix|--check|--verify>\n");
    return 2;
  }

  const result = spawn(nodePath, [cli, flag, ...formatFiles], {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) {
    stderr.write(`format-files failed to run formatter: ${result.error.message}\n`);
    return 1;
  }

  if (result.signal) {
    stderr.write(`format-files formatter process exited from signal: ${result.signal}\n`);
    return 1;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function main(argv = process.argv.slice(2)) {
  process.exitCode = runFormatFiles(argv);
}

module.exports = {
  runFormatFiles,
  main,
};

if (require.main === module) {
  main();
}
