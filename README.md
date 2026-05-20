# Agents Markdown Formatter

[![v1.0.0](https://img.shields.io/badge/version-1.0.0-blue.svg)](skills/markdown-formatter/SKILL.md)

Formatter-first **GitHub-Flavored Markdown (GFM) and MDX** skill for AI agents.

This repository builds a GFM+MDX formatter skill for AI agents powered by Oxc's `oxfmt` with structural guardrails for fences, tables, and embedded-code blast radius. The v1 scope is explicit GFM + MDX; non-GFM dialects (Obsidian, Mermaid, Pandoc) are out of scope.

## What It Does

The **Markdown Formatter Skill** formats Markdown files to GitHub Flavored Markdown (GFM) standard using `oxfmt` as the canonical formatter, preceded and followed by structural guard checks that prevent fence/table drift and validate embedded formatting boundaries.

Unlike lint-focused tools, this skill focuses on _formatting_ with safety guarantees:

- Structural pre/post guards detect fence/table drift introduced by formatting
- Oxfmt performs the canonical formatting pass
- Final validations check fences, table columns, guard integrity, and idempotence
- Zero npm runtime dependencies in the shipped skill payload

## CLI Reference

The formatter CLI is accessed via:

```bash
node skills/markdown-formatter/src/index.js [options] <path...>
```

### Available Flags

| Flag         | Description                                                       |
| ------------ | ----------------------------------------------------------------- |
| `--check`    | Check formatting without writing changes (exits 1 if unformatted) |
| `--fix`      | Format files in-place (default behavior)                          |
| `--all`      | Process directory inputs recursively; accepts multiple paths      |
| `--guard`    | Enable structural guard (fence/table drift detection)             |
| `--verify`   | Check formatting, idempotence, and structural integrity read-only |
| `--fences`   | Validate fence structure with `check-fences.js`                   |
| `--validate` | Run structural, fence, and table validations                      |
| `--dry-run`  | Show what would be changed without writing files                  |
| `--help`     | Display help message                                              |

## Prerequisites

The skill requires an `oxfmt` binary available in one of these locations:

1. **Local development**: `node_modules/.bin/oxfmt` (when development dependencies installed)
2. **System PATH**: `oxfmt` available globally in shell
3. **Installation failure**: Clear instructions to install oxfmt via:

   ```bash
   # Via Cargo (Rust)
   cargo install oxfmt

   # Via npm (development only)
   npm install -D oxfmt
   ```

The shipped skill payload contains **zero npm runtime dependencies** and relies on an externally provided `oxfmt` binary.

### Phase A Resolution (First Shippable Pass)

The formatter CLI resolves `oxfmt` in this order:

1. Check `./node_modules/.bin/oxfmt` (for development checkouts)
2. Check `oxfmt` in system PATH
3. Fail with actionable setup instructions if not found

No `npx`, no binary download, no fallback to external formatters in the first implementation.

## Test Structure

Reference fixtures and test organization:

- `test/fixtures/current/` — Real-world docs that should format cleanly
- `test/fixtures/oxfmt-spike/` — Oxfmt edge cases (fence behavior, table alignment)
- `test/fixtures/violations/` — Structural violations the guard must detect
- `test/unit/` — Isolated component tests for structure, fences, tables, and CLI helpers
- `test/integration/` — CLI and pipeline end-to-end tests

## Phase Status

| Phase | Objective                                        | Status      |
| ----- | ------------------------------------------------ | ----------- |
| 1     | Rename skill identity, define migration boundary | ✅ Complete |
| 2     | Spike evaluation and Oxfmt behavior verification | ✅ Complete |
| 3     | Structural guard safety net implementation       | ✅ Complete |
| 4     | Oxfmt integration with CLI flags                 | ✅ Complete |
| 5     | Anti-drift and consistency checks                | ✅ Complete |
| 6     | Documentation and metadata updates               | ✅ Complete |
| 7     | Shipping strategy and release allowlist          | ✅ Complete |
| 8     | Test suite implementation and validation         | ✅ Complete |
| 9     | Final agent guard policy review                  | ✅ Complete |

## Install Instructions

For Hermes Agent users:

```bash
hermes skills install markdown-formatter
```

The installed skill payload contains only:

- `SKILL.md` — Skill definition with Hermes-compatible frontmatter
- `src/index.js` — Canonical formatter CLI
- `scripts/check-structure.js` — Structural snapshot and drift guard
- `scripts/check-fences.js` — Fence validator
- `scripts/check-tables.js` — Table column validator

Repository-only files (`plan.md`, `AGENTS.md`, `README.md`, `test/`, `package.json`, etc.) are excluded from the shipped payload.

## Shipping & Allowlist

The skill follows a strict runtime allowlist:

- **Shipped**: Only files under `skills/markdown-formatter/` needed at runtime
- **Excluded**: Planning docs, tests, fixtures, development tooling, governance files
- **Verification**: Staged install audit confirms zero dev-only paths in payload
- **Dependency Boundary**: Root `package.json` (with pinned `oxfmt` devDependency) is repository-only

## Agent Contract

Agent behavior and constraints are defined in:

- [`AGENTS.md`](AGENTS.md) — Repository governance and agent workflow policies
- [`skills/markdown-formatter/SKILL.md`] — Hermes-specific skill definition (shipped)

Agents working on this repository must consult `AGENTS.md` before implementation work and follow the formatter-first identity guidelines.
