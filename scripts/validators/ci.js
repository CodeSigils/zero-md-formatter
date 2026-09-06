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
    { pattern: /\n\s+lint:\s*\n/i, label: "runs a deterministic lint/package gate" },
    { pattern: /\n\s+external-contracts:\s*\n/i, label: "isolates live external URL checks" },
    { pattern: /npm\s+test\b/i, label: "runs the canonical npm test suite" },
    { pattern: /npm\s+run\s+format:check/i, label: "checks maintainer docs formatting" },
    { pattern: /staged-install-verify\.sh/i, label: "verifies staged runtime payload" },
    { pattern: /actions\/upload-artifact@/i, label: "uploads the tested npm package" },
    { pattern: /actions\/download-artifact@/i, label: "publishes the tested npm package artifact" },
    { pattern: /npm\s+publish\s+(?:\.\/)?artifacts\/\*\.tgz/i, label: "publishes the tested npm tarball" },
    { pattern: /Smoke-test the packed npm package/i, label: "smoke-tests the packed npm package" },
    { pattern: /npm\s+ci/i, label: "installs repository dependencies" },
    { pattern: /CHECK_BASE_REF/i, label: "sets CHECK_BASE_REF for release-drift checks" },
    { pattern: /fetch-depth:\s*0/i, label: "uses full git depth for diff history in precheck" },
  ];
  for (const { pattern, label } of required) {
    if (!pattern.test(ci)) {
      warnings.push(`ci.yml: missing ${label}`);
    }
  }

  // Keep network-dependent evidence checks out of the required runtime matrix.
  const testJob = ci.match(/\n\s+test:\s*\n([\s\S]*?)(?=\n\s+[a-z][\w-]*:\s*\n|\s*$)/i);
  if (testJob && /verify:urls/i.test(testJob[1])) {
    errors.push("ci.yml: live evidence URL checks must run only in external-contracts");
  }
  if (!/needs:\s*\[\s*test\s*,\s*lint\s*\]/i.test(ci)) {
    warnings.push("ci.yml: publish should require both test and lint jobs");
  }
  if (!/node-version:\s*\['24\.x',\s*'26\.x'\]/i.test(ci)) {
    warnings.push("ci.yml: test matrix should cover the declared Node >=24 floor and current 26.x runtime");
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
