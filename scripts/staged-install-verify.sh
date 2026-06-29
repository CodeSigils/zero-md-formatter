#!/bin/bash

# staged-install-verify.sh - Verify staged runtime allowlist for markdown-formatter skill

set -euo pipefail

# Define source and staging directories
SOURCE_DIR="${PWD}"
STAGE_DIR="${SOURCE_DIR}/staged-install"

# Define the exact runtime allowlist (what should be copied)
RUNTIME_ALLOWLIST=(
    "skills/markdown-formatter/SKILL.md"
    "skills/markdown-formatter/.oxfmtrc.json"
    "skills/markdown-formatter/src/index.js"
    "skills/markdown-formatter/scripts/check-structure.js"
    "skills/markdown-formatter/scripts/check-fences.js"
    "skills/markdown-formatter/scripts/check-tables.js"
    "skills/markdown-formatter/scripts/check-pipes.js"
)

# Define dev-only paths that MUST NOT appear in staged payload
DEV_ONLY_PATHS=(
    "AGENTS.md"
    "README.md"
    "scripts/"
    "test/"
    ".github/"
    "node_modules/"
    "package.json"
    "package-lock.json"
    ".omo/"
    ".open-mem/"
    "references/"
)

# Clean and create staging directory
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo "Staging runtime allowlist..."
echo "============================"

# Copy each item in the allowlist
for item in "${RUNTIME_ALLOWLIST[@]}"; do
    src_path="$SOURCE_DIR/$item"
    dest_path="$STAGE_DIR/$item"
    
    # Create parent directories if needed
    mkdir -p "$(dirname "$dest_path")"
    
    # Copy the file/directory
    if [[ -d "$src_path" ]]; then
        cp -r "$src_path" "$dest_path"
    else
        cp "$src_path" "$dest_path"
    fi
    
    echo "✓ Copied: $item"
done

echo ""
echo "Staged file list with sizes:"
echo "============================"
# Find all files in staging directory and show sizes
find "$STAGE_DIR" -type f | sort | while IFS= read -r file; do
    rel_path="${file#"$STAGE_DIR"/}"
    size=$(du -h "$file" | cut -f1)
    printf "%-8s %s\n" "$size" "$rel_path"
done

echo ""
echo "Checking for dev-only paths in staged output:"
echo "============================================"
VIOLATION_FOUND=false

# Check each dev-only path pattern
for pattern in "${DEV_ONLY_PATHS[@]}"; do
    # Handle directory patterns (ending with /)
    if [[ "$pattern" == */ ]]; then
        # Remove trailing slash for directory check
        dir_pattern="${pattern%/}"
        if [[ -d "$STAGE_DIR/$dir_pattern" ]]; then
            echo "❌ VIOLATION: Found dev-only directory: $dir_pattern"
            VIOLATION_FOUND=true
        fi
    else
        # Check for specific files
        if [[ -e "$STAGE_DIR/$pattern" ]]; then
            echo "❌ VIOLATION: Found dev-only file: $pattern"
            VIOLATION_FOUND=true
        fi
    fi
done

# Also check for any .git files (should not be copied)
if [[ -d "$STAGE_DIR/.git" ]]; then
    echo "❌ VIOLATION: Found .git directory in staged output"
    VIOLATION_FOUND=true
fi

if [[ "$VIOLATION_FOUND" == true ]]; then
    echo ""
    echo "STAGED INSTALL VERIFICATION FAILED"
    echo "Dev-only files found in staged payload. Aborting."
    exit 1
fi

echo ""
echo "✓ No dev-only paths found in staged output"

# Test the staged skill works from an isolated staged directory.
echo ""
echo "Testing staged skill from ${STAGE_DIR}:"
echo "======================================"
cd "${STAGE_DIR}"

# Make the index.js executable and expose the repository-pinned oxfmt as the
# external formatter binary. The staged skill itself must not contain node_modules.
chmod +x skills/markdown-formatter/src/index.js
export PATH="${SOURCE_DIR}/node_modules/.bin:${PATH}"

FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT
VALID_FIXTURE="${FIXTURE_DIR}/valid.md"
GUARD_FIXTURE="${FIXTURE_DIR}/guard.md"
DOUBLE_PIPE_FIXTURE="${FIXTURE_DIR}/double-pipe.md"
cat > "$VALID_FIXTURE" <<'EOF'
# Staged Fixture

| A   | B   |
| --- | --- |
| 1   | 2   |

```js
console.log("ok");
```
EOF
cp "$VALID_FIXTURE" "$GUARD_FIXTURE"
cat > "$DOUBLE_PIPE_FIXTURE" <<'EOF'
# Double Pipe Fixture

|| A | B ||
|| --- | --- ||
|| 1 | 2 ||
EOF

if ./skills/markdown-formatter/src/index.js --help > /dev/null 2>&1; then
    echo "✓ Staged index.js --help executed successfully"
else
    echo "❌ FAILED: Could not execute staged index.js --help"
    exit 1
fi

if ./skills/markdown-formatter/src/index.js --doctor; then
    echo "✓ Staged --doctor succeeded"
else
    echo "❌ FAILED: Staged --doctor failed"
    exit 1
fi

if ./skills/markdown-formatter/src/index.js --fences "$VALID_FIXTURE"; then
    echo "✓ Staged --fences succeeded"
else
    echo "❌ FAILED: Staged --fences failed"
    exit 1
fi

if ./skills/markdown-formatter/src/index.js --validate "$VALID_FIXTURE"; then
    echo "✓ Staged --validate succeeded"
else
    echo "❌ FAILED: Staged --validate failed"
    exit 1
fi

if ./skills/markdown-formatter/src/index.js --check "$VALID_FIXTURE"; then
    echo "✓ Staged --check succeeded"
else
    echo "❌ FAILED: Staged --check failed"
    exit 1
fi

if ! ./skills/markdown-formatter/src/index.js --fix "$DOUBLE_PIPE_FIXTURE" > "$FIXTURE_DIR/double-pipe.out" 2>&1; then
    echo "✓ Staged --fix correctly blocked adjacent table pipes (blocking error)"
else
    echo "❌ FAILED: Staged --fix should block adjacent table pipes (would cause oxfmt corruption)"
    exit 1
fi
if ! grep -qi -e "adjacent pipes" "$FIXTURE_DIR/double-pipe.out"; then
    echo "❌ FAILED: Staged --fix blocked but did not report adjacent pipe error"
    exit 1
fi

if ./skills/markdown-formatter/src/index.js --guard "$GUARD_FIXTURE"; then
    echo "✓ Staged --guard succeeded"
else
    echo "❌ FAILED: Staged --guard failed"
    exit 1
fi

if [[ -e "${GUARD_FIXTURE}.structure.json" ]]; then
    echo "❌ FAILED: Staged --guard left a temporary structure snapshot"
    exit 1
else
    echo "✓ Staged --guard cleaned temporary structure snapshot"
fi

DRIFT_FIXTURE="$FIXTURE_DIR/drift.md"
cat > "$DRIFT_FIXTURE" <<'EOF'
# Drift Fixture

| Name  | Age  |
| ----- | ---- |
| Dave  | 35 | Chicago | Denver |
| Erin  | 22 |
EOF
ORIGINAL_DRIFT_CONTENT="$(cat "$DRIFT_FIXTURE")"
if ./skills/markdown-formatter/src/index.js --fix --guard "$DRIFT_FIXTURE" > "$FIXTURE_DIR/drift.out" 2>&1; then
    echo "❌ FAILED: Staged --guard unexpectedly accepted structural drift fixture"
    cat "$FIXTURE_DIR/drift.out"
    exit 1
fi
if [[ "$(cat "$DRIFT_FIXTURE")" != "$ORIGINAL_DRIFT_CONTENT" ]]; then
    echo "❌ FAILED: Staged --guard did not restore original content after drift"
    exit 1
fi
if [[ -e "${DRIFT_FIXTURE}.structure.json" ]]; then
    echo "❌ FAILED: Staged --guard left a temporary drift snapshot"
    exit 1
fi
echo "✓ Staged --guard restores content and cleans snapshot on structural drift"

echo ""
echo "STAGED INSTALL VERIFICATION PASSED"
echo "=================================="
exit 0