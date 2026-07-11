#!/usr/bin/env bash
# Hermes shell hook: check Markdown files with mdfmt --check on write_file/patch
#
# Setup:
#   mkdir -p "$HOME/.hermes/scripts"
#   cp scripts/check-markdown.sh "$HOME/.hermes/scripts/"
#   chmod +x "$HOME/.hermes/scripts/check-markdown.sh"
#
# Then add to ~/.hermes/config.yaml:
#   hooks:
#     post_tool_call:
#       - command: ~/.hermes/scripts/check-markdown.sh
#         matcher: write_file
#       - command: ~/.hermes/scripts/check-markdown.sh
#         matcher: patch
set -eo pipefail

payload="$(cat -)"
file_path="$(echo "$payload" | jq -r '.tool_input.path // ""' 2>/dev/null)" || file_path=""

[[ -z "$file_path" || ! -f "$file_path" ]] && printf '{}\n' && exit 0

case "$file_path" in
  *.md|*.markdown|*.mdx) ;;
  *) printf '{}\n' && exit 0 ;;
esac

if command -v mdfmt &>/dev/null; then
  mdfmt --check "$file_path"
elif [[ -f "$HOME/.hermes/skills/markdown-formatter/src/index.js" ]]; then
  node "$HOME/.hermes/skills/markdown-formatter/src/index.js" --check "$file_path"
else
  echo "[check-markdown] zero-md-formatter not found — skipping check" >&2
fi

printf '{}\n'
