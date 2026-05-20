#!/bin/bash

# staged-install-verify.sh - Verify staged runtime allowlist for markdown-formatter skill

set -euo pipefail

# Define source and staging directories
SOURCE_DIR="${PWD}"
STAGE_DIR="${SOURCE_DIR}/test/staged-artifact"

# Define the exact runtime allowlist (what should be copied)
RUNTIME_ALLOWLIST=(
    "skills/markdown-formatter/SKILL.md"
    "skills/markdown-formatter/src/index.js"
    "skills/markdown-formatter/scripts/check-structure.js"
    "skills/markdown-formatter/scripts/check-fences.js"
    "skills/markdown-formatter/scripts/check-tables.js"
)

# Define dev-only paths that MUST NOT appear in staged payload
DEV_ONLY_PATHS=(
    "plan.md"
    "AGENTS.md"
    "README.md"
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
find "$STAGE_DIR" -type f | sort | while read file; do
    rel_path="${file#$STAGE_DIR/}"
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

# Test the staged skill works from /tmp
echo ""
echo "Testing staged skill from ${STAGE_DIR}:"
echo "======================================"
cd "${STAGE_DIR}"

# Make the index.js executable
chmod +x skills/markdown-formatter/src/index.js

# Run help command and capture output
if ./skills/markdown-formatter/src/index.js --help > /dev/null 2>&1; then
    echo "✓ Staged index.js --help executed successfully"
else
    echo "❌ FAILED: Could not execute staged index.js --help"
    exit 1
fi

echo ""
echo "STAGED INSTALL VERIFICATION PASSED"
echo "=================================="
exit 0