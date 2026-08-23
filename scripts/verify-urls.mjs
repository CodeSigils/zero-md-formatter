#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// --update rewrites last_verified for every successfully checked URL.
const update = process.argv.includes("--update");
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
  if (update) {
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    for (const entry of manifest.urls) {
      if (entry.last_verified !== today) {
        entry.last_verified = today;
        changed = true;
      }
    }
    if (changed) {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`updated last_verified to ${today}`);
    } else {
      console.log(`last_verified already current (${today})`);
    }
  }
  console.log(`verified ${manifest.urls.length} evidence URLs`);
}
