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

This skill formats GitHub-Flavored Markdown (GFM) and MDX (v1).

In scope: GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code, strikethrough, and MDX files.

Out of scope: Obsidian wiki links, Mermaid validation, Pandoc dialects, semantic rewriting, YAML frontmatter semantics, and JSX syntax validation inside MDX.

MDX note: Oxfmt formats MDX as Markdown + JSX. This skill does not validate JSX syntax or MDX imports/exports; structural guards apply GFM rules to the Markdown content only.

Runtime config: the CLI passes the bundled `.oxfmtrc.json` to `oxfmt` and disables nested config discovery. The bundled config sets `embeddedLanguageFormatting` to `"off"`, so code inside fenced blocks is left as-is.

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
- `--guard`: Enable structural pre/post checks; rolls back file content on structural drift and cleans temporary snapshots
- `--verify`: Run formatter and check structural integrity without writing changes
- `--fences`: Validate fenced code block language info strings
- `--validate`: Run structural, fence, and table validations
- `--dry-run`: Show what would be changed without writing files
- `--help`: Display help message

## Prerequisites

- `node` (>=20)
- `oxfmt` (project-local binary or available in PATH)

The formatter checks for `oxfmt` in the active project and then in PATH. For installed Hermes use, make `oxfmt` available on PATH. If no binary is found, the tool exits without substituting another Markdown formatter.

## Supported file types

- `.md`
- `.markdown`
- `.mdx`

## Agent behavior

Agents should run the Markdown formatter after creating or editing Markdown files. For safe automated workflows:

1. Use `--check` in CI/CD pipelines to verify formatting compliance.
2. Use `--fix --guard` during development when automatic formatting should be rollback-safe.
3. Use `--verify` to check formatting, idempotence, and structural integrity without modifying files.
4. Use `--validate` when you only need structural, fence, and table checks.

## Severity levels

- Blocking violations: structural issues detected by `--guard`, `--verify`, or `--validate` exit with code 1. In write mode, `--fix --guard` restores the original file content when post-format structural drift is detected.
- Formatting differences: corrected by `--fix`; reported with a non-zero exit by `--check` or `--verify`.

## Examples

Check formatting without changes:

```bash
node skills/markdown-formatter/src/index.js --verify --all docs/
```

Format files with rollback-safe structural guards:

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
