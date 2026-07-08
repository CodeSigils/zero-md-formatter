---
name: markdown-formatter
description: "Zero-dependency GFM and MDX formatter with table, pipe, and fence guards for AI-agent-authored Markdown"
version: 1.3.0
---

## Scope

This skill formats GitHub-Flavored Markdown (GFM) and MDX (v1).

In scope: GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code,
strikethrough, and MDX files.

Out of scope: Obsidian wiki links, Mermaid validation, Pandoc dialects, semantic rewriting, YAML frontmatter semantics,
and JSX syntax validation inside MDX.

MDX note: this skill formats Markdown container syntax and does not validate JSX syntax or MDX imports/exports.
Structural guards apply GFM rules to the Markdown content only.

## Runtime behavior

The CLI uses the bundled `src/format-content.mjs` formatter. It has no npm runtime dependencies and does not discover
external formatter configuration.

Formatter-owned behavior:

- Remove trailing whitespace.
- Ensure a final newline.
- Normalize leading tabs outside fenced code blocks.
- Align GFM table columns when the table has no empty-cell ambiguity.
- Normalize tilde fences to backtick fences, escalating the backtick count when nested content requires it.

Guard-owned behavior:

- Fence closure and malformed fence info strings.
- Table column counts.
- Unescaped inline-code pipes in table rows.
- Adjacent-pipe table hazards.
- Pre/post structural drift detection and rollback for `--guard`.

## Usage

```bash
node <skill-dir>/src/index.js [options] <path...>
```

Where `<skill-dir>` resolves to your agent's skill directory per platform:

| Platform                | Skill directory                        | Install command                                                                 |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Hermes Agent            | `~/.hermes/skills/markdown-formatter/` | `hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter` |
| Claude Code             | `.claude/skills/markdown-formatter/`   | `cp -r skills/markdown-formatter .claude/skills/`                               |
| Codex CLI               | `~/.codex/skills/markdown-formatter/`  | `cp -r skills/markdown-formatter ~/.codex/skills/`                              |
| Gemini CLI / `.agents/` | `.agents/skills/markdown-formatter/`   | `cp -r skills/markdown-formatter .agents/skills/`                               |
| OpenCode                | `.opencode/skills/markdown-formatter/` | `cp -r skills/markdown-formatter .opencode/skills/`                             |
| Source checkout         | `skills/markdown-formatter/` (in repo) | `git clone`                                                                     |

The CLI is a standalone Node.js module — it has no runtime dependencies and does not require any agent platform to function. Install it wherever Node.js >=24 is available and point `<skill-dir>` at the directory containing `src/index.js`.

### Options

- `--check`: Check pipe safety and formatting (read-only, exits with code 1 if unsafe or unformatted)
- `--fix`: Format files in-place after pipe-safety preflight; repairs adjacent pipes (`||`) and column-count mismatches
  automatically (default behavior)
- `--all`: Process directory inputs recursively; accepts multiple paths
- `--guard`: Enable structural pre/post checks; rolls back file content on structural drift and cleans temporary
  snapshots
- `--verify`: Run formatting, idempotence, and structural integrity checks without writing changes
- `--fences`: Validate fenced code block language info strings
- `--validate`: Run structural, fence, table, and pipe validations
- `--doctor`: Check Node.js and payload readiness without modifying files
- `--dry-run`, `-n`: Run pipe-safety preflight, then show what would be changed without writing files
- `--audit-tables`: Print table row cell counts and pipe hazards without writing; use before/after agent table edits
- `--no-repair`: In write modes, report repairable table issues instead of modifying them
- `--help`, `-h`: Display help message

## Prerequisites

- `node` (>=24)

Run `--doctor` to verify runtime readiness.

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

- `check-tables.js` enforces formatter-safe table column counts and pipe consistency, including unescaped pipes inside
  inline code spans that would be split as table delimiters. It is stricter than GFM body-row parsing because
  autonomous formatting should not guess table intent.
- `check-pipes.js` detects adjacent pipes (`||`) that create empty cells per GFM: leading, internal, and trailing.
  Write modes (`--fix`, `--guard`, default) automatically repair `||` by inserting a space (`| |`), preserving
  empty-cell semantics. Read-only modes (`--check`, `--dry-run`, `--validate`) block before formatting.
- Empty-cell tables that remain ambiguous, including no-leading-pipe rows with empty edge cells, are preserved by
  skipping the full formatter pass after safety repairs. The delimiter row is still normalized to
  3 dashes (`----` → `---`, `:-----` → `:---`, etc.) during spacing normalization.
- Table validation, structural table snapshots, pipe-safety checks, and automatic table repair ignore table-shaped text
  inside fenced code blocks.
- `--check`, `--fix`, `--dry-run`, `--guard`, and `--validate` run pipe-safety preflight before formatting. Write modes
  repair adjacent pipes automatically; read-only modes refuse to proceed when adjacent pipes are detected.
- **Unclosed-fence preflight gate.** All CLI modes detect unclosed fences via `hasUnclosedFence()` before running
  table/pipe checks. When an unclosed fence is found, the CLI warns that table and pipe checks are unreliable and skips
  them while continuing with fence validation and formatting. Run `--fences` to locate the unclosed fence opener.
- **Long-fence heuristic.** `check-structure.js` flags closed fences that span >40 lines and contain GFM table structure
  (header + delimiter pair). Such fences may have a closer belonging to a different opener, blinding table/pipe checks
  across the affected content.

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
  table-pipe violations and unescaped inline-code pipes in table rows also fail `--check`, `--fix`, `--dry-run`,
  `--guard`, and `--validate` before formatting begins. In write mode, `--fix --guard` restores the original file
  content when post-format structural drift is detected.
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

- Source repository and maintenance docs: https://github.com/CodeSigils/agents-markdown-formatter
