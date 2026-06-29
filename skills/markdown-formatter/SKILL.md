---
name: markdown-formatter
description: "AI-agent-safe GFM and MDX Markdown formatter powered by oxfmt with structural guards"
version: "1.0.7"
author: "CodeSigils"
license: "MIT"
compatibility: "hermes"
metadata.hermes.tags:
  - markdown
  - formatter
  - gfm
  - mdx
  - oxfmt
  - oxc
  - ai-agents
  - documentation
  - guardrails
---

## Scope

This skill formats GitHub-Flavored Markdown (GFM) and MDX (v1).

In scope: GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code,
strikethrough, and MDX files.

Out of scope: Obsidian wiki links, Mermaid validation, Pandoc dialects, semantic rewriting, YAML frontmatter semantics,
and JSX syntax validation inside MDX.

MDX note: Oxfmt formats MDX as Markdown + JSX. This skill does not validate JSX syntax or MDX imports/exports;
structural guards apply GFM rules to the Markdown content only.

## Runtime config

The CLI passes the bundled `.oxfmtrc.json` to `oxfmt` and disables nested config discovery. The bundled config wraps
prose at 120 characters and sets `embeddedLanguageFormatting` to `"off"`, so code inside fenced blocks is left as-is.

## Why this skill exists

AI agents often produce Markdown with long prose lines, inconsistent wrapping, fragile tables, and fenced examples that
should stay untouched. This skill normalizes the Markdown container while keeping structural safety explicit: prose is
bounded for stable review, embedded code remains opaque, and table/fence/pipe drift is caught by guard scripts rather
than left to formatter configuration alone.

## Usage

```bash
node <skill-dir>/src/index.js [options] <path...>
```

Where `<skill-dir>` is the repository checkout (`skills/markdown-formatter/`) or the installed Hermes payload
(`~/.hermes/skills/markdown-formatter/`).

### Options

- `--check`: Check pipe safety and formatting (read-only, exits with code 1 if unsafe or unformatted)
- `--fix`: Format files in-place after pipe-safety preflight; repairs adjacent pipes (`||`) and column-count mismatches
  automatically (default behavior)
- `--all`: Process directory inputs recursively; accepts multiple paths
- `--guard`: Enable structural pre/post checks; rolls back file content on structural drift and cleans temporary
  snapshots
- `--verify`: Run formatter and check structural integrity without writing changes
- `--fences`: Validate fenced code block language info strings
- `--validate`: Run structural, fence, table, and pipe validations
- `--doctor`: Check Node.js, Oxfmt, config, and payload readiness without modifying files
- `--dry-run`, `-n`: Run pipe-safety preflight, then show what would be changed without writing files
- `--help`, `-h`: Display help message

## Prerequisites

- `node` (>=20)
- `oxfmt` (available on PATH for installed skill, or local `node_modules/.bin/oxfmt` for development)

Run `--doctor` to verify runtime readiness (Node.js, oxfmt, config, payload).

## Fence policy

Fence validation is structural, not style-only:

- Bare language-less fences are valid and allowed.
- Whitespace-only fence info strings are invalid because they usually indicate accidental trailing whitespace.
- Language info strings that start with whitespace are invalid because the intended language tag is ambiguous.
- Backtick fence info strings containing backticks are invalid, matching GFM fenced code block rules.
- Unclosed fences are invalid.
- Post-format fence count/style drift is invalid and is rolled back by `--fix --guard`.

## Table and pipe safety policy

Table and pipe safety is enforced by guard scripts alongside the formatter:

- `check-tables.js` enforces formatter-safe table column counts and pipe consistency. It is stricter than GFM body-row
  parsing because `oxfmt` must not receive table shapes known to drift.
- `check-pipes.js` detects adjacent pipes (`||`) that create empty cells per GFM §4.10 — leading (empty first cell),
  internal (empty cell between columns), and trailing (empty trailing cell). Correctly ignores escaped pipes and inline
  code spans. Write modes (`--fix`, `--guard`, default) automatically repair `||` by inserting a space (`| |`),
  preserving empty-cell semantics while making the table oxfmt-compatible. Read-only modes (`--check`, `--dry-run`,
  `--validate`) block before invoking oxfmt.
- Empty-cell tables that remain unsafe for `oxfmt`, including no-leading-pipe rows with empty edge cells, are preserved
  by skipping the formatter pass after safety repairs.
- Table validation, structural table snapshots, pipe-safety checks, and automatic table repair ignore table-shaped text
  inside fenced code blocks.
- `--check`, `--fix`, `--dry-run`, `--guard`, and `--validate` run pipe-safety preflight before invoking oxfmt. Write
  modes repair adjacent pipes automatically; read-only modes refuse to proceed when adjacent pipes are detected.

## Supported file types

- `.md`
- `.markdown`
- `.mdx`

## Agent behavior

Agents should run the Markdown formatter after creating or editing Markdown files. For safe automated workflows:

1. Use `--check` in CI/CD pipelines to verify formatting compliance.
2. Use `--fix --guard` during development when automatic formatting should be rollback-safe.
3. Use `--verify` to check formatting, idempotence, and structural integrity without modifying files.
4. Use `--validate` when you only need structural, fence, table, and pipe checks.
5. Use `--doctor` before formatting work when installed runtime readiness is uncertain.

## Severity levels

- Blocking violations: structural issues detected by `--guard`, `--verify`, or `--validate` exit with code 1. Adjacent
  table-pipe violations also fail `--check`, `--fix`, `--dry-run`, `--guard`, and `--validate` before formatting begins.
  In write mode, `--fix --guard` restores the original file content when post-format structural drift is detected.
- Formatting differences: corrected by `--fix`; reported with a non-zero exit by `--check` or `--verify`.

## Examples

Format with rollback-safe structural guards:

```bash
node skills/markdown-formatter/src/index.js --fix --guard README.md
```

Validate structure without formatting:

```bash
node skills/markdown-formatter/src/index.js --validate --all docs/
```

Diagnose installed readiness:

```bash
node skills/markdown-formatter/src/index.js --doctor
```

## References

- Oxfmt documentation: https://oxc.rs/docs/guide/usage/formatter.md
- Source repository and maintenance docs: https://github.com/CodeSigils/agents-markdown-formatter
