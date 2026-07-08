#!/usr/bin/env node
/**
 * format-files-list.js — Single source of truth for files managed by the
 * markdown-formatter CLI (format, format:check, verify scripts).
 *
 * Used by scripts/format-files.js (via require) and check-consistency.js.
 */

"use strict";

const FORMAT_FILES = [
  "README.md",
  "SECURITY.md",
  "SKILL.md",
];

module.exports = FORMAT_FILES;

// When run directly: print paths to stdout (for xargs or subshell piping)
if (require.main === module) {
  process.stdout.write(FORMAT_FILES.join("\n") + "\n");
}
