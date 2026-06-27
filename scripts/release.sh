#!/bin/bash
#
# release.sh — Tag and create a GitHub Release from CHANGELOG.md.
#
# Preconditions (checked before doing anything):
#   1. Working tree is clean (no uncommitted changes)
#   2. Tag doesn't already exist locally
#   3. CHANGELOG.md has a "## v<VERSION>" section (already moved from Unreleased)
#   4. gh CLI is authenticated and can reach the remote
#
# What it does:
#   1. Creates an annotated git tag v<VERSION> from package.json version
#   2. Pushes HEAD and the annotated tag to origin/main
#   3. Creates a GitHub Release with the corresponding CHANGELOG section as body
#
# Usage:
#   bash scripts/release.sh
#
# Prerequisites:
#   - Working tree clean
#   - CHANGELOG.md updated (entries moved from ## Unreleased to ## v<VERSION>)
#   - Versions bumped in package.json, SKILL.md, README badge
#   - gh authenticated (gh auth status)

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ---------------------------------------------------------------------------
# Read version
# ---------------------------------------------------------------------------
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

echo "Preparing release ${TAG} ..."

# ---------------------------------------------------------------------------
# Precondition 1: clean working tree
# ---------------------------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Uncommitted changes. Commit or stash them first." >&2
  git status --short >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Precondition 2: tag doesn't already exist locally or remotely
# ---------------------------------------------------------------------------
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "ERROR: Tag ${TAG} already exists locally." >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "ERROR: Tag ${TAG} already exists on origin." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Precondition 3: CHANGELOG has a versioned section (not still under Unreleased)
# ---------------------------------------------------------------------------
if ! grep -q "^## ${TAG}$" CHANGELOG.md; then
  echo "ERROR: CHANGELOG.md has no '## ${TAG}' section." >&2
  echo "  Move entries from '## Unreleased' to '## ${TAG}' first." >&2
  exit 1
fi

# Verify Unreleased is empty (optional — warn only)
UNRELEASED_LINE="$(grep -n "^## Unreleased" CHANGELOG.md | head -1 | cut -d: -f1 || true)"
NEXT_SECTION_LINE="$(grep -n "^## " CHANGELOG.md | awk -F: "\$1 > ${UNRELEASED_LINE:-0}" | head -1 | cut -d: -f1 || true)"
if [[ -n "${UNRELEASED_LINE}" && -n "${NEXT_SECTION_LINE}" ]]; then
  GAP=$(( NEXT_SECTION_LINE - UNRELEASED_LINE ))
  if [[ "${GAP}" -gt 2 ]]; then
    echo "WARNING: '## Unreleased' section has entries that will not be in this release." >&2
  fi
fi

# ---------------------------------------------------------------------------
# Precondition 4: gh CLI is authenticated
# ---------------------------------------------------------------------------
if ! gh auth status 2>&1 | grep -q "Logged in"; then
  echo "ERROR: gh CLI is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Create annotated tag
# ---------------------------------------------------------------------------
echo "Creating annotated tag ${TAG} ..."
git tag -a "${TAG}" -m "${TAG}"

# ---------------------------------------------------------------------------
# Push commit and tag before creating the GitHub Release.
# gh release create does not publish local annotated tags; with --verify-tag it
# intentionally aborts unless the tag already exists on the remote.
# ---------------------------------------------------------------------------
echo "Pushing HEAD to origin/main ..."
git push origin HEAD:main

echo "Pushing tag ${TAG} ..."
git push origin "${TAG}"

# ---------------------------------------------------------------------------
# Extract CHANGELOG body for this version
# ---------------------------------------------------------------------------
BODY_FILE="$(mktemp)"
trap 'rm -f "${BODY_FILE}"' EXIT

awk "/^## ${TAG}$/{flag=1; next} /^## /{flag=0} flag" CHANGELOG.md > "${BODY_FILE}"

# Check we got something
if [[ ! -s "${BODY_FILE}" ]]; then
  echo "ERROR: Failed to extract release body from CHANGELOG.md for ${TAG}." >&2
  echo "  Make sure the section '## ${TAG}' has content before the next '## ' heading." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Create GitHub Release
# ---------------------------------------------------------------------------
echo "Creating GitHub Release ${TAG} ..."
gh release create "${TAG}" \
  --verify-tag \
  --title "${TAG}" \
  --notes-file "${BODY_FILE}"

echo ""
echo "Release ${TAG} created and published."
echo "  https://github.com/CodeSigils/agents-markdown-formatter/releases/tag/${TAG}"
echo ""
echo "Verify CI is green before announcing."
