---
name: markdown-formatter
description: "Format Markdown to GFM standard using oxfmt + structural guardrails"
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

## Scope

This skill formats **GitHub-Flavored Markdown (GFM)** and **MDX** (v1). Non-GFM dialects (Obsidian wiki links, Mermaid, Pandoc) are out of scope for v1.

**In scope:** GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code, strikethrough. MDX files are processed as Markdown + JSX.

**Out of scope:** Obsidian wiki links, Mermaid validation, semantic rewriting. YAML frontmatter is preserved but not parsed.

**MDX note:** Oxfmt handles MDX formatting. This skill does not validate JSX syntax or MDX imports/exports — structural guards apply GFM rules to the Markdown content only.

**`embeddedLanguageFormatting`:** Set to `"off"` in the default `.oxfmtrc` — code inside fenced blocks is left as-is, which is required for predictable MDX behavior.

## Usage

From a source checkout:

```bash
node skills/markdown-formatter/src/index.js [options] <path...>
```

From an installed payload, run the bundled `src/index.js` with Node from the installed skill directory.

### Options

- `--check`: Check if files are formatted correctly (read-only, exits with code 1 if unformatted)
- `--fix`: Format files in-place (default behavior)
- `--all`: Process directory inputs recursively; accepts multiple paths
- `--guard`: Enable structural safety checks (fence count, table alignment)
- `--verify`: Run formatter and check structural integrity without writing changes
- `--fences`: Validate fenced code block language info strings
- `--validate`: Run structural, fence, and table validations
- `--dry-run`: Show what would be changed without writing files
- `--help`: Display help message

## Prerequisites

- `node` (>=20)
- `oxfmt` (project-local binary or available in PATH)

The formatter checks for `oxfmt` in the active project and then in PATH. For installed Hermes use, make `oxfmt` available on PATH. If no binary is found, the tool exits without substituting another Markdown formatter.

## Supported File Types

- `.md`
- `.markdown`
- `.mdx`

## Agent Behavior

Agents should run the markdown formatter after creating or editing any Markdown file. For safe automated workflows:

1. Use `--check` in CI/CD pipelines to verify formatting compliance
2. Use `--fix` during development to automatically correct formatting
3. Always enable `--guard` for structural safety (fence count drift, table alignment issues)
4. Use `--verify` to check both formatting and structural integrity without modifying files

## Severity Levels

- **Blocking violations**: Structural issues detected by `--guard` (mismatched fence counts, broken tables) will cause the formatter to exit with error code 1 and prevent file writes
- **Formatting differences**: Corrected by `--fix`; reported with a non-zero exit by `--check` or `--verify`

## Examples

Check formatting without changes:

```bash
node skills/markdown-formatter/src/index.js --verify --all docs/
```

Format files with structural guards:

```bash
node skills/markdown-formatter/src/index.js --fix --guard README.md
```

Verify formatting, idempotence, and structural integrity without writes:

```bash
node skills/markdown-formatter/src/index.js --verify ch01.md ch02.md
```

Full validation workflow:

```bash
node skills/markdown-formatter/src/index.js --validate --all docs/ notes/
```

## References

- Oxfmt documentation: https://oxc.rs/docs/guide/usage/formatter.md
- Source repository and maintenance docs: https://github.com/CodeSigils/agents-markdown-formatter
