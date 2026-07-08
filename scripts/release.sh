#!/usr/bin/env bash
#
# release.sh — Tag and create a GitHub Release from git history.
#
# Preconditions (checked before doing anything):
#   1. Working tree is clean (no uncommitted changes)
#   2. Tag doesn't already exist locally or remotely
#   3. gh CLI is authenticated and can reach the remote
#   4. Release commit touches ONLY version-related files (isolated-bump rule)
#   5. HEAD is pushed to origin (CI had a chance to run)
#   6. CI is green on HEAD (or run in progress)
#
# What it does:
#   1. Creates an annotated git tag v<VERSION> from package.json version
#   2. Pushes HEAD and the annotated tag to origin/main
#   3. Creates a GitHub Release with commit subjects since the previous tag
#
# Usage:
#   bash scripts/release.sh
#
# Prerequisites:
#   - Working tree clean
#   - Versions bumped in package.json, SKILL.md, README badge
#   - Version-bump commit is isolated (no runtime changes mixed in)
#   - CI green on the commit being tagged
#   - gh authenticated (gh auth status)

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

die()   { printf '\033[0;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
warn()  { printf '\033[1;33mWARNING:\033[0m %s\n' "$*" >&2; }
info()  { printf '  %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Read version
# ---------------------------------------------------------------------------
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
PREVIOUS_TAG="$(git tag -l 'v*' --sort=-version:refname | head -1 || true)"

echo "Preparing release ${TAG} ..."
echo ""

# ---------------------------------------------------------------------------
# Precondition 0: verify SKILL.md frontmatter version matches package.json
# ---------------------------------------------------------------------------
info "Checking SKILL.md version alignment ..."
SKILL_MD_VERSION="$(grep '^version:' SKILL.md | sed 's/^version: *//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')"
if [[ -z "${SKILL_MD_VERSION}" ]]; then
  die "SKILL.md is missing a 'version:' field in its frontmatter. Add: version: ${VERSION}"
fi
if [[ "${SKILL_MD_VERSION}" != "${VERSION}" ]]; then
  die "SKILL.md version \"${SKILL_MD_VERSION}\" != package.json version \"${VERSION}\""
fi
echo "  ✓ SKILL.md version matches (${SKILL_MD_VERSION})"

# ---------------------------------------------------------------------------
# Precondition 1: clean working tree
# ---------------------------------------------------------------------------
info "Checking working tree ..."
if [[ -n "$(git status --porcelain)" ]]; then
  die "Uncommitted changes. Commit or stash them first."
fi
echo "  ✓ Clean"

# ---------------------------------------------------------------------------
# Precondition 2: tag doesn't already exist locally or remotely
# ---------------------------------------------------------------------------
info "Checking tag ${TAG} ..."
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  die "Tag ${TAG} already exists locally."
fi
if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  die "Tag ${TAG} already exists on origin."
fi
echo "  ✓ Tag available"

# ---------------------------------------------------------------------------
# Precondition 3: gh CLI is authenticated
# ---------------------------------------------------------------------------
info "Checking gh auth ..."
if ! gh auth status 2>&1 | grep -q "Logged in"; then
  die "gh CLI is not authenticated. Run 'gh auth login' first."
fi
echo "  ✓ Authenticated"

# ---------------------------------------------------------------------------
# Precondition 4: release commit is isolated (version-bump only)
# ---------------------------------------------------------------------------
info "Checking release commit isolation ..."

# Files that are allowed to change in a release commit
ALLOWED_RELEASE_FILES="^package\\.json$|^package-lock\\.json$|^README\\.md$|^SKILL\\.md$"

# Get files changed in HEAD vs its parent
PARENT_SHA="$(git rev-parse HEAD~1 2>/dev/null || true)"
if [[ -z "${PARENT_SHA}" ]]; then
  warn "No parent commit (root commit). Skipping isolation check."
else
  CHANGED_FILES="$(git diff --name-only HEAD~1 HEAD)"
  if [[ -z "${CHANGED_FILES}" ]]; then
    die "No files changed in HEAD (something is wrong)."
  fi

  VIOLATIONS=0
  while IFS= read -r file; do
    if ! echo "${file}" | grep -qE "${ALLOWED_RELEASE_FILES}"; then
      echo "  ✗ ${file} (not a version-bump file)"
      VIOLATIONS=$(( VIOLATIONS + 1 ))
    fi
  done <<< "${CHANGED_FILES}"

  if [[ "${VIOLATIONS}" -gt 0 ]]; then
    echo ""
    die "Release commit changes ${VIOLATIONS} file(s) outside the version-bump allowlist.
  Allowed: package.json, package-lock.json, README.md, SKILL.md
  Fix: 1. Commit runtime changes separately (not in the release commit)
        2. Then make a clean version-bump commit with only the files above"
  fi
  echo "  ✓ Isolated (${VIOLATIONS} violations — all clean)"
fi

# ---------------------------------------------------------------------------
# Precondition 5: HEAD is pushed to origin
# ---------------------------------------------------------------------------
info "Checking HEAD is on origin ..."
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git ls-remote origin HEAD 2>/dev/null | awk '{print $1}' || true)"
if [[ "${LOCAL_HEAD}" != "${REMOTE_HEAD}" ]]; then
  die "HEAD (${LOCAL_HEAD}) is not the same as origin/HEAD (${REMOTE_HEAD:-none}).
  Push the commit first so CI can run, then run release.sh again."
fi
echo "  ✓ Pushed (origin/HEAD matches local HEAD)"

# ---------------------------------------------------------------------------
# Precondition 6: CI is green on HEAD
# ---------------------------------------------------------------------------
if [[ -n "${SKIP_CI_CHECK:-}" ]]; then
  echo "  ⏭ SKIP_CI_CHECK is set — skipping CI precondition"
else
  info "Checking CI status for $(git rev-parse --short HEAD) ..."

  # Get the latest CI workflow run for this commit.
  # --branch HEAD is more reliable than --commit HEAD for recently-triggered runs.
  SHA="$(git rev-parse HEAD)"
  CI_RUN="$(
    gh run list \
      --branch main \
      --json databaseId,name,status,conclusion,createdAt,headSha \
      --jq '[.[] | select(.headSha == "'"${SHA}"'")][0] // empty' 2>/dev/null || true
  )"

  if [[ -z "${CI_RUN}" ]]; then
    echo "  ⏭ No CI run found for HEAD — continuing (set SKIP_CI_CHECK=1 to skip this check)"
  else
    CI_STATUS="$(echo "${CI_RUN}" | jq -r '.status // "unknown"')"
    CI_CONCLUSION="$(echo "${CI_RUN}" | jq -r '.conclusion // "unknown"')"
    CI_NAME="$(echo "${CI_RUN}" | jq -r '.name // "CI"')"
    CI_ID="$(echo "${CI_RUN}" | jq -r '.databaseId // "?"')"

    if [[ "${CI_STATUS}" == "in_progress" ]] || [[ "${CI_STATUS}" == "queued" ]] || [[ "${CI_STATUS}" == "waiting" ]]; then
      echo "  ⏳ ${CI_NAME} (run ${CI_ID}) is ${CI_STATUS} — waiting for completion ..."
      for i in $(seq 1 60); do
        sleep 10
        CI_RUN="$(
          gh run list \
            --branch main \
            --json databaseId,name,status,conclusion,createdAt,headSha \
            --jq '[.[] | select(.headSha == "'"${SHA}"'")][0] // empty' 2>/dev/null || true
        )"
        CI_STATUS="$(echo "${CI_RUN}" | jq -r '.status // "unknown"')"
        CI_CONCLUSION="$(echo "${CI_RUN}" | jq -r '.conclusion // "unknown"')"
        if [[ "${CI_STATUS}" == "completed" ]]; then
          break
        fi
        if (( i % 6 == 0 )); then
          echo "  ... still waiting (${CI_STATUS}) after $(( i * 10 ))s"
        fi
      done
    fi

    if [[ "${CI_STATUS}" != "completed" ]]; then
      die "CI did not complete within the timeout window."
    fi

    if [[ "${CI_CONCLUSION}" != "success" ]]; then
      die "CI run ${CI_ID} (${CI_NAME}) concluded as '${CI_CONCLUSION}', not 'success'."
    fi
    echo "  ✓ CI passed (${CI_NAME} run ${CI_ID})"
  fi
fi

echo ""
echo "All preconditions passed. Proceeding with release ..."
echo ""

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
# Build release body from git history
# ---------------------------------------------------------------------------
BODY_FILE="$(mktemp)"
trap 'rm -f "${BODY_FILE}"' EXIT

{
  echo "Changes in ${TAG}:"
  echo ""
  if [[ -n "${PREVIOUS_TAG}" ]]; then
    git log --no-merges --pretty='- %s' "${PREVIOUS_TAG}..HEAD"
  else
    git log --no-merges --pretty='- %s' HEAD
  fi
} > "${BODY_FILE}"

# Check we got something
if [[ ! -s "${BODY_FILE}" ]]; then
  echo "ERROR: Failed to build release body from git history for ${TAG}." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Create GitHub Release
# ---------------------------------------------------------------------------

# Determine whether this is a forward release (should be marked as latest)
# or a backfill (should NOT steal the latest marker).
# Compare the new version against the highest existing semver tag.
CURRENT_HIGHEST_TAG="$(git tag -l 'v*' --sort=-version:refname | head -1 || true)"
if [[ -n "${CURRENT_HIGHEST_TAG}" ]]; then
  CURRENT_HIGHEST_VER="${CURRENT_HIGHEST_TAG#v}"
  # Compare versions: forward release = --latest, backfill = --latest=false
  # Uses Node instead of sort -V (GNU-only) for macOS portability
  if node -e "
var v = '${VERSION}'.split('.').map(Number);
var h = '${CURRENT_HIGHEST_VER}'.split('.').map(Number);
process.exit(
  v[0] > h[0] ||
  (v[0] === h[0] && v[1] > h[1]) ||
  (v[0] === h[0] && v[1] === h[1] && v[2] >= h[2]) ? 0 : 1
);
" 2>/dev/null; then
    LATEST_FLAG="--latest"
  else
    LATEST_FLAG="--latest=false"
    warn "Backfill release: ${TAG} (${VERSION}) is older than existing tag ${CURRENT_HIGHEST_TAG}. Not marking as latest."
  fi
else
  LATEST_FLAG="--latest"
fi

echo "Creating GitHub Release ${TAG} ..."
gh release create "${TAG}" \
  --verify-tag \
  --title "${TAG}" \
  --notes-file "${BODY_FILE}" \
  ${LATEST_FLAG}

echo ""
echo "Release ${TAG} created and published."
echo "  https://github.com/CodeSigils/agents-markdown-formatter/releases/tag/${TAG}"
echo ""
echo "Verify CI is green before announcing."
