#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const ROOT = resolve(".");
const DOCUMENTS = ["README.md", "SECURITY.md", "SKILL.md", "docs"];
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

function markdownFiles(path) {
  const absolute = resolve(ROOT, path);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => markdownFiles(resolve(path, entry.name)))
    .filter((file) => MARKDOWN_EXTENSIONS.has(extname(file).toLowerCase()));
}

function localTargets(content) {
  const targets = [];
  let fenceMarker = null;
  for (const line of content.split(/\r?\n/)) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      fenceMarker = fenceMarker ? null : fence[1][0];
      continue;
    }
    if (fenceMarker) continue;
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].trim();
      const target = raw.startsWith("<") ? raw.slice(1, raw.indexOf(">")) : raw.split(/\s+/, 1)[0];
      const path = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      if (path && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(path)) targets.push(path);
    }
  }
  return targets;
}

const errors = [];
for (const document of DOCUMENTS) {
  for (const file of markdownFiles(document)) {
    const relative = file.slice(ROOT.length + 1);
    for (const target of localTargets(readFileSync(file, "utf8"))) {
      if (!existsSync(resolve(dirname(file), target))) {
        errors.push(`${relative}: missing link target "${target}"`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("check-links: all local relative Markdown links resolve");
}

export { localTargets };
