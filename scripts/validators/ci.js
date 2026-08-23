"use strict";

/**
 * CI workflow validator.
 * Checks ci.yml for structural anti-patterns and required steps.
 */

const { read, extractNodeVersionFile } = require("./common");

function validateCi(files) {
  const errors = [];
  const warnings = [];
  const ci = files[".github/workflows/ci.yml"];

  if (!ci) {
    warnings.push(".github/workflows/ci.yml not found — consider adding CI");
    return { errors, warnings };
  }

  // Anti-patterns that must NOT appear
  const forbids = [
    { pattern: /markdownlint/i, label: "uses markdownlint instead of this repo's formatter" },
    { pattern: /npx\s+markdown/i, label: "uses npx markdownlint" },
    { pattern: /npx\s+oxfmt/i, label: "uses npx oxfmt" },
    { pattern: /test\/fixtures\/violations/i, label: "includes violations/ in formatter check (will fail CI)" },
  ];
  for (const { pattern, label } of forbids) {
    if (pattern.test(ci)) {
      errors.push(`ci.yml: ${label}`);
    }
  }

  // Required patterns that must appear
  const required = [
    { pattern: /npm\s+test\b/i, label: "runs the canonical npm test suite" },
    { pattern: /npm\s+run\s+format:check/i, label: "checks maintainer docs formatting" },
    { pattern: /staged-install-verify\.sh/i, label: "verifies staged runtime payload" },
    { pattern: /actions\/upload-artifact@/i, label: "uploads the tested npm package" },
    { pattern: /actions\/download-artifact@/i, label: "publishes the tested npm package artifact" },
    { pattern: /npm\s+publish\s+(?:\.\/)?artifacts\/\*\.tgz/i, label: "publishes the tested npm tarball" },
    { pattern: /npm\s+ci/i, label: "installs repository dependencies" },
    { pattern: /CHECK_BASE_REF/i, label: "sets CHECK_BASE_REF for release-drift checks" },
    { pattern: /fetch-depth:\s*0/i, label: "uses full git depth for diff history in precheck" },
  ];
  for (const { pattern, label } of required) {
    if (!pattern.test(ci)) {
      warnings.push(`ci.yml: missing ${label}`);
    }
  }

  // .node-version alignment
  const nodeVersionContent = read(".node-version");
  const ciNodeVersion = nodeVersionContent
    ? extractNodeVersionFile(nodeVersionContent)
    : null;
  if (!ciNodeVersion) {
    errors.push(".node-version is missing or unreadable");
  }
  if (!/node-version-file:\s*\.node-version/.test(ci) && !/matrix:\s*[\s\S]*node-version:/i.test(ci)) {
    warnings.push("ci.yml: setup-node should use .node-version or an explicit compatibility matrix");
  }

  return { errors, warnings };
}

module.exports = { validateCi };
