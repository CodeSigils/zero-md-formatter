#!/usr/bin/env node
/**
 * check-consistency.js - Anti-drift consistency checker for markdown-formatter.
 * Orchestrates focused validators and runs cross-document checks.
 * Dev-only: not shipped in the runtime skill payload.
 */

"use strict";

const FORMAT_FILES = require("./format-files-list");
const RUNTIME_PAYLOAD_FILES = require("./runtime-payload");
const { read, extractFrontmatterVersion, extractBadgeVersion, hasDynamicBadge, findCliFlags, extractRuntimeNodeMinVersion } = require("./validators/common");
const { validateCi } = require("./validators/ci");
const { validateRepoShape } = require("./validators/repo-shape");
const { validateReleaseDrift } = require("./validators/release-drift");
const { validateReleaseLatest } = require("./validators/release-latest");

// ---------------------------------------------------------------------------
// Read all source files once
// ---------------------------------------------------------------------------

const files = {};
for (const f of [
  "README.md",
  ".node-version",
  "package.json",
  ".github/workflows/ci.yml",
  "SKILL.md",
  "src/index.js",
  "src/format-content.mjs",
]) {
  files[f] = read(f);
}

// ---------------------------------------------------------------------------
// Aggregate results from sub-validators
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

function add(result) {
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}

add(validateCi(files));
add(validateRepoShape());
add(validateReleaseDrift(files));
add(validateReleaseLatest());

// ---------------------------------------------------------------------------
// Cross-document consistency checks
// ---------------------------------------------------------------------------

const readme = files["README.md"];
const skillMd = files["SKILL.md"];
const indexJs = files["src/index.js"];
const formatContent = files["src/format-content.mjs"];
const pkgJson = files["package.json"];

// Node.js runtime min version
const runtimeMinNodeVersion = indexJs ? extractRuntimeNodeMinVersion(indexJs) : null;
if (!runtimeMinNodeVersion) {
  errors.push("src/index.js: NODE_RUNTIME_MIN_VERSION is missing or unreadable");
}

// package.json: engines.node
if (pkgJson) {
  try {
    const pkg = JSON.parse(pkgJson);

    // engines.node must match source
    const nodeReq = pkg.engines && pkg.engines.node;
    const runtimeMin = `>=${runtimeMinNodeVersion}`;
    if (!nodeReq) {
      errors.push("package.json engines.node is missing");
    } else if (nodeReq !== runtimeMin) {
      errors.push(`package.json engines.node is "${nodeReq}" — expected "${runtimeMin}" from NODE_RUNTIME_MIN_VERSION`);
    }
  } catch (e) {
    errors.push(`package.json is not valid JSON: ${e.message}`);
  }
}

// Stale reference checks across active docs
const staleChecks = [
  { pattern: /npx\s+markdownlint/, reason: "external markdown linter via npx" },
  { pattern: /npx\s+oxfmt|node_modules\/\.bin\/oxfmt/, reason: "external oxfmt invocation" },
  { pattern: /format-tables\.js.*format|primary.*formatter.*format-tables/i, reason: "format-tables is not the primary formatter" },
  { pattern: /name:\s*markdown-lint/, reason: "skill name should be 'markdown-formatter'" },
];

const ACTIVE_DRIFT_CHECK_PATTERNS = [
  ...FORMAT_FILES,
  "src/index.js",
  "src/format-content.mjs",
  "guard/check-structure.js",
  "guard/check-fences.js",
  "guard/check-tables.js",
  "guard/check-pipes.js",
];

for (const [file, content] of [
  ["README.md", readme],
  ["SKILL.md", skillMd],
  ["src/index.js", indexJs],
  ["src/format-content.mjs", formatContent],
]) {
  if (!content) continue;
  if (!ACTIVE_DRIFT_CHECK_PATTERNS.some((p) => file.startsWith(p))) continue;
  for (const { pattern, reason } of staleChecks) {
    if (pattern.test(content)) {
      errors.push(`stale ref in ${file}: "${reason}"`);
    }
  }
}

// Version badge alignment: README vs SKILL.md frontmatter
if (readme && skillMd) {
  if (hasDynamicBadge(readme)) {
    // Dynamic GitHub Release badge — always current, skip comparison
  } else {
    const badgeVer = extractBadgeVersion(readme);
    const frontVer = extractFrontmatterVersion(skillMd);
    if (badgeVer && frontVer && badgeVer !== frontVer) {
      errors.push(`README badge version "${badgeVer}" != SKILL.md frontmatter "${frontVer}"`);
    } else if (!badgeVer && frontVer) {
      warnings.push(`README: no version badge found (SKILL.md has "${frontVer}")`);
    }
  }
}

// package.json version vs SKILL.md frontmatter
if (pkgJson && skillMd) {
  try {
    const pkg = JSON.parse(pkgJson);
    const pkgVer = pkg.version;
    const frontVer = extractFrontmatterVersion(skillMd);
    if (pkgVer && frontVer && pkgVer !== frontVer) {
      warnings.push(`package.json version "${pkgVer}" != SKILL.md frontmatter "${frontVer}"`);
    }
  } catch { /* already handled above */ }
}

// Tap-installable skill payload staleness
const STAGED_DIR = "skills/markdown-formatter";
const { readFileSync } = require("fs");
const { join } = require("path");
const { ROOT } = require("./validators/common");

try {
  const stalePayloadFiles = RUNTIME_PAYLOAD_FILES.filter((file) => {
    const stagedContent = readFileSync(join(ROOT, STAGED_DIR, file), "utf8");
    const sourceContent = readFileSync(join(ROOT, file), "utf8");
    return stagedContent !== sourceContent;
  });
  if (stalePayloadFiles.length > 0) {
    warnings.push(
      `skills/markdown-formatter/ is stale (${stalePayloadFiles.join(", ")}) — run bash scripts/staged-install-verify.sh to regenerate`
    );
  }
} catch { /* staged dir or files may not exist — not an error */ }

// CLI flag documentation coverage
if (indexJs && skillMd) {
  const flags = findCliFlags(indexJs);
  for (const flag of flags) {
    if (!skillMd.includes(flag)) {
      errors.push(`CLI flag "${flag}" in index.js not documented in SKILL.md`);
    }
    if (readme && !readme.includes(flag)) {
      warnings.push(`CLI flag "${flag}" in index.js not documented in README.md`);
    }
  }
}

if (indexJs && indexJs.includes("--doctor")) {
  const doctorDocs = [
    ["README.md", readme],
    ["SKILL.md", skillMd],
  ];
  for (const [file, content] of doctorDocs) {
    if (!content || !content.includes("--doctor")) {
      errors.push(`CLI flag "--doctor" in index.js not documented in ${file}`);
    }
  }
  if (!/function\s+runDoctor\s*\(/.test(indexJs)) {
    errors.push('CLI flag "--doctor" is listed but runDoctor() is missing');
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error("check-consistency ERRORS:");
  for (const e of errors) console.error("  ✗", e);
}

if (warnings.length > 0) {
  console.warn("check-consistency WARNINGS:");
  for (const w of warnings) console.warn("  ⚠", w);
}

if (errors.length === 0) console.log("check-consistency: OK");

process.exit(errors.length > 0 ? 1 : 0);
