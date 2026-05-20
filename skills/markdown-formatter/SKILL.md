---
name: markdown-formatter
description: "Format markdown to GFM standard using oxfmt + structural guardrails"
version: "1.0.0"
author: "CodeSigils"
license: "MIT"
compatibility: "hermes"
metadata.hermes.tags:
  - formatter
  - markdown
  - oxfmt
  - gfm
---

## Usage

```bash
node skills/markdown-formatter/src/index.js [options] <path>
```

### Options

- `--check`: Check if files are formatted correctly (read-only, exits with code 1 if unformatted)
- `--fix`: Format files in-place (default behavior)
- `--all`: Process all files (including those ignored by git)
- `--guard`: Enable structural safety checks (fence count, table alignment)
- `--verify`: Run formatter and check structural integrity without writing changes
- `--fences`: Validate fenced code block language info strings
- `--validate`: Full validation (implies --guard and --fences)
- `--dry-run`: Show what would be changed without writing files
- `--help`: Display help message

## Prerequisites

- `node` (v14+)
- `oxfmt` (either in project's `node_modules/.bin/` or available in PATH)

The formatter first attempts to use a locally installed `oxfmt` (from `node_modules/.bin/`), then falls back to a globally available `oxfmt` in PATH. If neither is found, the tool will exit with an error.

## Supported File Types

- `.md`
- `.markdown`

## Agent Behavior

Agents should run the markdown formatter after creating or editing any Markdown file. For safe automated workflows:

1. Use `--check` in CI/CD pipelines to verify formatting compliance
2. Use `--fix` during development to automatically correct formatting
3. Always enable `--guard` for structural safety (fence count drift, table alignment issues)
4. Use `--verify` to check both formatting and structural integrity without modifying files

## Severity Levels

- **Blocking violations**: Structural issues detected by `--guard` (mismatched fence counts, broken tables) will cause the formatter to exit with error code 1 and prevent file writes
- **Informational suggestions**: Pure formatting inconsistencies (whitespace, trailing spaces, list indentation) are reported but do not block execution when using `--fix`

## Examples

Check formatting without changes:
```bash
node skills/markdown-formatter/src/index.js --check docs/
```

Format files with structural guards:
```bash
node skills/markdown-formatter/src/index.js --fix --guard README.md
```

Validate structural integrity only:
```bash
node skills/markdown-formatter/src/index.js --verify --fences ch01.md ch02.md
```

Full validation workflow:
```bash
node skills/markdown-formatter/src/index.js --validate --all
```

## References

- Oxfmt documentation: https://oxc.rs/docs/guide/usage/formatter.md
- Spike findings: See `references/prior-art/` for implementation research
- Agent coordination: Refer to `AGENTS.md` for markdown validation policy