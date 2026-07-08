"use strict";

/**
 * release-latest.js - Check that the GitHub Release marked as "latest"
 * matches the highest semver git tag.
 *
 * This prevents a common misconfiguration where backfilling an older release
 * (via `gh release create` without --latest=false) steals the "latest" marker
 * from the actual newest version.
 *
 * Depends on: git, gh CLI (authenticated with GITHUB_TOKEN in CI, or user
 * login locally). When gh is unavailable, the check is skipped with a warning.
 */

const { spawnSync } = require("child_process");

function validateReleaseLatest() {
  const errors = [];
  const warnings = [];

  // Get the highest semver git tag (v* tags sorted by semver descending)
  const gitResult = spawnSync(
    "git", ["tag", "-l", "v*", "--sort=-version:refname"],
    { encoding: "utf8", timeout: 10000 }
  );
  if (gitResult.error || gitResult.status !== 0 || !gitResult.stdout.trim()) {
    warnings.push("release-latest: no v* git tags found — skipping isLatest check");
    return { errors, warnings };
  }

  const highestTag = gitResult.stdout.trim().split("\n")[0];
  const highestVer = highestTag.replace(/^v/, "");

  // Query GitHub Releases via gh CLI (works in CI with GITHUB_TOKEN)
  const ghResult = spawnSync(
    "gh", ["release", "list", "-L", "10", "--json", "tagName,isLatest"],
    { encoding: "utf8", timeout: 15000 }
  );
  if (ghResult.error || ghResult.status !== 0) {
    warnings.push(
      "release-latest: gh CLI unavailable or not authenticated — skipping isLatest check"
    );
    return { errors, warnings };
  }

  let releases;
  try {
    releases = JSON.parse(ghResult.stdout.trim());
  } catch {
    warnings.push("release-latest: failed to parse gh release list output");
    return { errors, warnings };
  }

  if (!Array.isArray(releases) || releases.length === 0) {
    warnings.push("release-latest: no GitHub Releases found");
    return { errors, warnings };
  }

  const latestRelease = releases.find((r) => r.isLatest);
  if (!latestRelease) {
    errors.push(
      "release-latest: no GitHub Release is marked as 'latest'. " +
      "Run: gh release edit <highest-tag> --latest"
    );
    return { errors, warnings };
  }

  const latestReleaseTag = latestRelease.tagName.replace(/^v/, "");

  if (latestReleaseTag !== highestVer) {
    errors.push(
      `release-latest: GitHub Release "${latestRelease.tagName}" is marked as latest, ` +
      `but the highest semver tag is ${highestTag}. ` +
      `Run: gh release edit ${highestTag} --latest`
    );
  }

  return { errors, warnings };
}

module.exports = { validateReleaseLatest };
