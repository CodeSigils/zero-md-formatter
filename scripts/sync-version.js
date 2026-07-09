#!/usr/bin/env node
/**
 * sync-version.js — Sync SKILL.md frontmatter version from package.json.
 *
 * Usage: node scripts/sync-version.js
 *   Reads version from package.json, updates version field in SKILL.md
 *   frontmatter in-place. Exits 0 if already in sync, 0 if updated.
 *
 * Callers:
 *   - npm version lifecycle (runs automatically during npm version)
 *   - release.sh (catches manual bumps where SKILL.md was forgotten)
 *   - developer can run manually at any time
 */

"use strict";

const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const ROOT = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const expectedVersion = pkg.version;

const skillPath = resolve(ROOT, "SKILL.md");
const content = readFileSync(skillPath, "utf8");
const lines = content.split("\n");

let modified = false;
const resultLines = lines.map((line) => {
  if (/^version:/.test(line)) {
    const newLine = `version: ${expectedVersion}`;
    if (line !== newLine) modified = true;
    return newLine;
  }
  return line;
});

if (modified) {
  writeFileSync(skillPath, resultLines.join("\n"));
  process.stdout.write(`SKILL.md version synced to ${expectedVersion}\n`);
}

process.exit(0);
