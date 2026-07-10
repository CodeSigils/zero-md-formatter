#!/usr/bin/env node
"use strict";

const RUNTIME_PAYLOAD_FILES = [
  "SKILL.md",
  "src/index.js",
  "src/format-content.mjs",
  "guard/check-structure.js",
  "guard/check-fences.js",
  "guard/check-tables.js",
  "guard/check-pipes.js",
];

module.exports = RUNTIME_PAYLOAD_FILES;

if (require.main === module) {
  process.stdout.write(RUNTIME_PAYLOAD_FILES.join("\n") + "\n");
}
