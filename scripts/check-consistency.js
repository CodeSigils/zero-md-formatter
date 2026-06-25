#!/usr/bin/env node
/**
 * check-consistency.js - Anti-drift consistency checker for markdown-formatter.
 * Dev-only: not shipped in the runtime skill payload.
 */

"use strict";

const { readFileSync, existsSync, readdirSync } = require("fs");
const { join, resolve } = require("path");
const { spawnSync } = require("child_process");

const ROOT = resolve(__dirname, "..");

// Files listed in the "Target Repository / Skill Shape" section that should exist.
// Stale plan references are errors; missing repository-shape files are errors.

function validateCiWorkflow() {
  const ci = read(".github/workflows/ci.yml");
  if (!ci) {
    warnings.push(".github/workflows/ci.yml not found — consider adding CI");
    return;
  }
  const checks = [
    { pattern: /markdownlint/i, label: "uses markdownlint (not oxfmt)" },
    { pattern: /npx\s+markdown/i, label: "uses npx markdownlint" },
    { pattern: /npx\s+oxfmt/i, label: "uses npx oxfmt (should use pinned npm dependency or PATH)" },
    { pattern: /test\/fixtures\/violations/i, label: "includes violations/ in formatter check (will fail CI)" },
  ];
  for (const { pattern, label } of checks) {
    if (pattern.test(ci)) {
      errors.push(`ci.yml: ${label}`);
    }
  }
  const required = [
    { pattern: /oxfmt.*--version|oxfmt.*version/i, label: "verifies oxfmt version" },
    { pattern: /npm\s+test/i, label: "runs npm test (structural guards)" },
    { pattern: /test\/unit\/.*\.test\.js/i, label: "runs unit tests" },
    { pattern: /test\/integration\/.*\.test\.js/i, label: "runs integration tests" },
    { pattern: /npm\s+run\s+format:check/i, label: "checks maintainer docs formatting" },
    { pattern: /staged-install-verify\.sh/i, label: "verifies staged runtime payload" },
    { pattern: /node_modules\/\.bin\/oxfmt|npm\s+ci/i, label: "uses pinned npm oxfmt install" },
    { pattern: /CHECK_BASE_REF/i, label: "sets CHECK_BASE_REF for release-drift checks" },
    { pattern: /fetch-depth:\s*0/i, label: "uses full git depth for diff history in precheck" },
  ];
  for (const { pattern, label } of required) {
    if (!pattern.test(ci)) {
      warnings.push(`ci.yml: missing ${label}`);
    }
  }
  const nodeVersionFile = read(".node-version");
  const ciNodeVersion = nodeVersionFile ? extractNodeVersionFile(nodeVersionFile) : null;
  if (!ciNodeVersion) {
    errors.push(".node-version is missing or unreadable");
  }
  if (!/node-version-file:\s*\.node-version/.test(ci)) {
    warnings.push("ci.yml: setup-node should use node-version-file: .node-version for CI validation");
  }
}

const PLAN_EXPECTED_REPO_SHAPE = new Set([
  "AGENTS.md",
  "README.md",
  "CHANGELOG.md",
  ".node-version",
  ".oxfmtrc.json",
  ".github/workflows/ci.yml",
  "package.json",
  "scripts/check-all.js",
  "scripts/check-consistency.js",
  "scripts/release.sh",
  "scripts/staged-install-verify.sh",
  "skills/markdown-formatter/SKILL.md",
  "skills/markdown-formatter/.oxfmtrc.json",
  "skills/markdown-formatter/src/index.js",
  "skills/markdown-formatter/scripts/check-fences.js",
  "skills/markdown-formatter/scripts/check-structure.js",
  "skills/markdown-formatter/scripts/check-tables.js",
  "test/",
]);

// Historical lint-era artifacts that must not reappear in active implementation docs.
const HISTORICAL_LINT_ARTIFACTS = new Set([
  "lint.js",
  "mdformat.js",
  "post-write.js",
  "references/rules.md",
  "references/table-validate.js",
  "test/formatter.test.js",
  "test/structure.test.js",
  "test/cli.test.js",
]);

function findAllFiles(dir, base = "") {
  const results = [];
  try {
    for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
      const path = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(path + "/");
        results.push(...findAllFiles(dir, path));
      } else {
        results.push(path);
      }
    }
  } catch { /* ignore */ }
  return results;
}

function read(file) {
  try {
    return readFileSync(join(ROOT, file), "utf8");
  } catch {
    return null;
  }
}

function extractFrontmatterVersion(content) {
  const m = content.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m);
  return m ? m[1].trim() : null;
}

function extractBadgeVersion(content) {
  const m = content.match(/v(\d+\.\d+\.\d+(?:-[a-z0-9]+)?)/i);
  return m ? m[1] : null;
}

function findCliFlags(content) {
  const setMatch = content.match(/LONG_FLAGS\s*=\s*new\s+Set\(\s*\[([^\]]+)\]/s);
  if (!setMatch) return [];
  return setMatch[1]
    .split(",")
    .map((s) => "--" + s.trim().replace(/['"]/g, ""))
    .filter((f) => f !== "--");
}

function extractRuntimeNodeMinVersion(content) {
  const m = content.match(/NODE_RUNTIME_MIN_VERSION\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function extractNodeVersionFile(content) {
  const m = content.trim().match(/^(?:v)?(\d+)(?:\.\d+\.\d+)?$/);
  return m ? Number(m[1]) : null;
}

const ACTIVE_DRIFT_CHECK_PATTERNS = [
  "skills/markdown-formatter/SKILL.md",
  "skills/markdown-formatter/src/index.js",
  "skills/markdown-formatter/scripts/check-structure.js",
  "skills/markdown-formatter/scripts/check-fences.js",
  "skills/markdown-formatter/scripts/check-tables.js",
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
];

const KNOWN_OXFMT_KEYS = new Set([
  "tabWidth", "printWidth", "endOfLine", "insertFinalNewline",
  "proseWrap", "embeddedLanguageFormatting", "ignorePatterns",
]);

const errors = [];
const warnings = [];

const readme = read("README.md");
const skillMd = read("skills/markdown-formatter/SKILL.md");
const indexJs = read("skills/markdown-formatter/src/index.js");
const agentsMd = read("AGENTS.md");
const oxfmtrc = read(".oxfmtrc.json");
const skillOxfmtrc = read("skills/markdown-formatter/.oxfmtrc.json");
const runtimeMinNodeVersion = indexJs ? extractRuntimeNodeMinVersion(indexJs) : null;

if (!runtimeMinNodeVersion) {
  errors.push("skills/markdown-formatter/src/index.js: NODE_RUNTIME_MIN_VERSION is missing or unreadable");
}

const pkgJson = read("package.json");
if (pkgJson) {
  try {
    const pkg = JSON.parse(pkgJson);
    const devDeps = pkg.devDependencies || {};
    const pkgVersion = devDeps.oxfmt;
    if (pkgVersion) {
      const latest = "0.56.0";
      if (pkgVersion !== latest) {
        if (/^[~^*><=]/.test(pkgVersion)) {
          errors.push(`oxfmt in package.json must be pinned exactly; found "${pkgVersion}"`);
        } else {
          warnings.push(
            `oxfmt in package.json is ${pkgVersion}, latest is ${latest} — consider upgrading`
          );
        }
      }
    } else {
      warnings.push("oxfmt not found in package.json devDependencies");
    }
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

const staleChecks = [
  { pattern: /markdownlint-cli2/, reason: "old formatter tool" },
  { pattern: /npx\s+markdownlint/, reason: "old linter via npx" },
  { pattern: /format-tables\.js.*format|primary.*formatter.*format-tables/i, reason: "format-tables is not the primary formatter" },
  { pattern: /name:\s*markdown-lint/, reason: "skill name should be 'markdown-formatter'" },
];

if (readme && skillMd) {
  const badgeVer = extractBadgeVersion(readme);
  const frontVer = extractFrontmatterVersion(skillMd);
  if (badgeVer && frontVer && badgeVer !== frontVer) {
    errors.push(`README badge version "${badgeVer}" != SKILL.md frontmatter "${frontVer}"`);
  } else if (!badgeVer && frontVer) {
    warnings.push(`README: no version badge found (SKILL.md has "${frontVer}")`);
  }
} else if (skillMd && !readme) {
  warnings.push("README.md not found — skipping version badge check");
}

// package.json version must match SKILL.md frontmatter for local consistency.
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

// Staged artifact should match source for development confidence.
// This is a warning because the artifact is gitignored and regenerated
// by staged-install-verify.sh, but staleness can mislead local inspection.
const STAGED_DIR = "test/staged-artifact";
{
  const stagedIndex = read(join(STAGED_DIR, "skills/markdown-formatter/src/index.js"));
  const sourceIndex = read("skills/markdown-formatter/src/index.js");
  if (stagedIndex && sourceIndex && stagedIndex !== sourceIndex) {
    warnings.push(
      "test/staged-artifact/ is stale — run bash scripts/staged-install-verify.sh to regenerate"
    );
  }
}

if (indexJs && skillMd) {
  const flags = findCliFlags(indexJs);
  for (const flag of flags) {
    if (!skillMd.includes(flag)) {
      errors.push(`CLI flag "${flag}" in index.js not documented in SKILL.md`);
    }
  }
  for (const flag of flags) {
    if (readme && !readme.includes(flag)) {
      warnings.push(`CLI flag "${flag}" in index.js not documented in README.md`);
    }
  }
}

if (indexJs && indexJs.includes("--doctor")) {
  const doctorDocs = [
    ["README.md", readme],
    ["skills/markdown-formatter/SKILL.md", skillMd],
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

if (oxfmtrc) {
  try {
    const cfg = JSON.parse(oxfmtrc);
    for (const key of Object.keys(cfg)) {
      if (!KNOWN_OXFMT_KEYS.has(key)) {
        warnings.push(`.oxfmtrc.json contains unknown key "${key}" — verify against official oxfmt docs`);
      }
    }
  } catch (e) {
    errors.push(`.oxfmtrc.json is not valid JSON: ${e.message}`);
  }
}

if (!skillOxfmtrc) {
  errors.push("skills/markdown-formatter/.oxfmtrc.json is missing from the runtime payload");
} else if (oxfmtrc && skillOxfmtrc !== oxfmtrc) {
  errors.push("root .oxfmtrc.json and skills/markdown-formatter/.oxfmtrc.json differ");
}

for (const [file, content] of [
  ["AGENTS.md", agentsMd],
  ["README.md", readme],
  ["skills/markdown-formatter/SKILL.md", skillMd],
  ["skills/markdown-formatter/src/index.js", indexJs],
]) {
  if (!content) continue;
  if (!ACTIVE_DRIFT_CHECK_PATTERNS.some((p) => file.startsWith(p))) continue;
  for (const { pattern, reason } of staleChecks) {
    if (pattern.test(content)) {
      errors.push(`stale ref in ${file}: "${reason}"`);
    }
  }
}

const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".omo", ".open-mem", "oxfmt-spike"]);
const allFiles = findAllFiles(ROOT).filter((f) => {
  const parts = f.split("/");
  return !parts.some((p) => EXCLUDE_DIRS.has(p));
});

for (const expected of PLAN_EXPECTED_REPO_SHAPE) {
  if (expected.endsWith("/")) {
    if (!allFiles.some((f) => f.startsWith(expected))) {
      errors.push(`plan drift: expected directory "${expected}" is missing`);
    }
  } else if (!existsSync(join(ROOT, expected))) {
    errors.push(`plan drift: expected file "${expected}" is missing`);
  }
}

for (const stale of HISTORICAL_LINT_ARTIFACTS) {
  if (existsSync(join(ROOT, stale))) {
    errors.push(`historical lint artifact "${stale}" exists but should not`);
  }
}

const PAYLOAD_PREFIXES = [
  "skills/markdown-formatter/src/",
  "skills/markdown-formatter/scripts/",
];
const KNOWN_PAYLOAD_CHECKS = new Set([
  "check-fences.js", "check-structure.js", "check-tables.js", "check-pipes.js",
]);
for (const prefix of PAYLOAD_PREFIXES) {
  const unexpected = allFiles.filter((f) => {
    if (!f.startsWith(prefix)) return false;
    if (f.endsWith("/")) return false;
    const name = f.slice(prefix.length);
    return name.startsWith("check-") && !KNOWN_PAYLOAD_CHECKS.has(name);
  });
  for (const u of unexpected) {
    errors.push(`plan drift: unexpected file in skill payload: "${u}"`);
  }
}

validateCiWorkflow();

// ---------------------------------------------------------------------------
// Release-drift checks: runtime payload changes must track in CHANGELOG
// and the SKILL.md version should reflect accumulated changes.
// ---------------------------------------------------------------------------

function getChangedFilesSince(ref) {
  const result = spawnSync(
    "git", ["diff", "--name-only", ref, "HEAD"],
    { cwd: ROOT, encoding: "utf8", timeout: 10000 }
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split("\n").filter((f) => f.length > 0);
}

function getLatestTagVersion() {
  const result = spawnSync(
    "git", ["tag", "-l", "v*", "--sort=-version:refname"],
    { cwd: ROOT, encoding: "utf8", timeout: 10000 }
  );
  if (result.error || result.status !== 0 || !result.stdout.trim()) return null;
  const tag = result.stdout.trim().split("\n")[0];
  return tag.replace(/^v/, "");
}

const RUNTIME_DIRS = ["skills/markdown-formatter/"];

function isRuntimeFile(file) {
  return RUNTIME_DIRS.some((d) => file.startsWith(d));
}

const baseRef = process.env.CHECK_BASE_REF || "origin/main";
const changedFiles = getChangedFilesSince(baseRef);

if (changedFiles === null) {
  warnings.push(`release-drift: git diff against "${baseRef}" failed (no remote or shallow clone); skipping checks`);
} else {
  const runtimeChanges = changedFiles.filter(isRuntimeFile);

  // 1. CHANGELOG completeness: runtime changes must have corresponding Unreleased entries.
  if (runtimeChanges.length > 0) {
    const changelogPath = "CHANGELOG.md";
    if (!changedFiles.includes(changelogPath)) {
      errors.push(
        `release-drift: ${runtimeChanges.length} runtime file(s) changed but ${changelogPath} did not — ` +
        `add entries under "## Unreleased"`
      );
    } else {
      const changelog = read(changelogPath);
      if (changelog && !changelog.includes("## Unreleased")) {
        errors.push(
          `release-drift: ${changelogPath} changed but missing "## Unreleased" section — ` +
          `add entries before the first versioned heading`
        );
      }
    }
  }

  // 2. Version drift: if runtime files changed since the latest tag, warn when version hasn't moved.
  const latestTagVer = getLatestTagVersion();
  if (runtimeChanges.length > 0 && latestTagVer) {
    const currentVer = extractFrontmatterVersion(skillMd || "");
    if (currentVer && currentVer === latestTagVer) {
      warnings.push(
        `release-drift: ${runtimeChanges.length} runtime file(s) changed since tag v${latestTagVer} ` +
        `but SKILL.md version is still "${currentVer}" — consider a release`
      );
    }
  }
}

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
