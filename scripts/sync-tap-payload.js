#!/usr/bin/env node
/**
 * sync-tap-payload.js - Regenerate the Hermes tap-installable skill payload.
 */

"use strict";

const { chmodSync, cpSync, mkdirSync, rmSync, renameSync, existsSync } = require("fs");
const { dirname, join, resolve } = require("path");
const RUNTIME_PAYLOAD_FILES = require("./runtime-payload");

const ROOT = resolve(__dirname, "..");
const TAP_PAYLOAD_DIR = join(ROOT, "skills", "markdown-formatter");

const tempDir = join(ROOT, "skills", `.markdown-formatter-tmp-${process.pid}`);
const backupDir = `${TAP_PAYLOAD_DIR}.backup-${process.pid}`;
rmSync(tempDir, { recursive: true, force: true });
rmSync(backupDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

for (const file of RUNTIME_PAYLOAD_FILES) {
  const source = join(ROOT, file);
  const destination = join(tempDir, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  if (file === "src/index.js" || file === "scripts/check-markdown.sh") {
    chmodSync(destination, 0o755);
  }
}

try {
  if (existsSync(TAP_PAYLOAD_DIR)) renameSync(TAP_PAYLOAD_DIR, backupDir);
  renameSync(tempDir, TAP_PAYLOAD_DIR);
  rmSync(backupDir, { recursive: true, force: true });
} catch (error) {
  rmSync(TAP_PAYLOAD_DIR, { recursive: true, force: true });
  if (existsSync(backupDir)) renameSync(backupDir, TAP_PAYLOAD_DIR);
  rmSync(tempDir, { recursive: true, force: true });
  throw error;
}

process.stdout.write("skills/markdown-formatter payload synced\n");
