#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("docs/evidence-urls.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== 3 || !Array.isArray(manifest.urls)) {
  throw new Error("docs/evidence-urls.json must be a version-3 URL manifest");
}

const failures = [];
for (const entry of manifest.urls) {
  if (!entry.name || !entry.url || !Array.isArray(entry.expected_statuses)) {
    failures.push(`${entry.name ?? "<unnamed>"}: invalid manifest entry`);
    continue;
  }
  try {
    const response = await fetch(entry.url, { method: "GET", redirect: "follow" });
    if (!entry.expected_statuses.includes(response.status)) {
      failures.push(`${entry.name}: HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(`${entry.name}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`verified ${manifest.urls.length} evidence URLs`);
}
