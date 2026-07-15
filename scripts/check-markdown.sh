#!/usr/bin/env bash
# Hermes shell hook: auto-format Markdown files with mdfmt --fix --guard on write_file/patch
#
# Ships with the skill at ~/.hermes/skills/markdown-formatter/scripts/check-markdown.sh
# Register in Hermes config.yaml hooks block, then this runs automatically.
set -eo pipefail

payload="$(cat -)"
file_path="$(echo "$payload" | jq -r '.tool_input.path // ""' 2>/dev/null)" || file_path=""

[[ -z "$file_path" || ! -f "$file_path" ]] && printf '{}\n' && exit 0

case "$file_path" in
  *.md|*.markdown|*.mdx) ;;
  *) printf '{}\n' && exit 0 ;;
esac

if command -v mdfmt &>/dev/null; then
  mdfmt --fix --guard "$file_path"
elif [[ -f "$HOME/.hermes/skills/markdown-formatter/src/index.js" ]]; then
  node "$HOME/.hermes/skills/markdown-formatter/src/index.js" --fix --guard "$file_path"
else
  echo "[check-markdown] zero-md-formatter not found — skipping check" >&2
fi

printf '{}\n'
