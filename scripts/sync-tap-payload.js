#!/usr/bin/env node
/**
 * sync-tap-payload.js - Regenerate the Hermes tap-installable skill payload.
 */

"use strict";

const { chmodSync, cpSync, mkdirSync, rmSync } = require("fs");
const { dirname, join, resolve } = require("path");
const RUNTIME_PAYLOAD_FILES = require("./runtime-payload");

const ROOT = resolve(__dirname, "..");
const TAP_PAYLOAD_DIR = join(ROOT, "skills", "markdown-formatter");

rmSync(TAP_PAYLOAD_DIR, { recursive: true, force: true });
mkdirSync(TAP_PAYLOAD_DIR, { recursive: true });

for (const file of RUNTIME_PAYLOAD_FILES) {
  const source = join(ROOT, file);
  const destination = join(TAP_PAYLOAD_DIR, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  if (file === "src/index.js" || file === "scripts/check-markdown.sh") {
    chmodSync(destination, 0o755);
  }
}

process.stdout.write("skills/markdown-formatter payload synced\n");
