# Agents Markdown Formatter

[![v1.0.0](https://img.shields.io/badge/version-1.0.0-blue.svg)](skills/markdown-formatter/SKILL.md)

Formatter-first GitHub-Flavored Markdown (GFM) and MDX skill for AI agents.

This repository builds a Hermes-compatible Markdown formatter skill powered by Oxc's `oxfmt`. The CLI is plain Node.js and can also be used outside Hermes.

## What it does

The Markdown Formatter Skill formats Markdown files with `oxfmt` and adds optional structural guardrails for GFM fences and tables.

Core behavior:

- `oxfmt` performs the canonical formatting pass.
- `--guard` snapshots structure before formatting, checks it after formatting, and restores the original file if structural drift is detected.
- `--verify` checks structure, formatting, and idempotence without modifying files.
- `--validate` checks structure, fences, and table columns without formatting.
- The shipped skill payload has no npm runtime dependencies.

Scope:

- In scope: GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code, strikethrough, and MDX files.
- Out of scope: Obsidian wiki links, Mermaid validation, Pandoc dialects, semantic rewriting, and JSX syntax validation inside MDX.

## CLI reference

From a source checkout:

```bash
node skills/markdown-formatter/src/index.js [options] <path...>
```

Hermes is the first packaged skill target: `SKILL.md`, the install path, and shipped metadata are Hermes-compatible. The CLI itself does not require Hermes at runtime.

### Available flags

| Flag         | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `--check`    | Check formatting without writing changes; exits 1 if unformatted           |
| `--fix`      | Format files in-place; default behavior                                    |
| `--all`      | Process directory inputs recursively; accepts multiple paths               |
| `--guard`    | Enable structural pre/post guard; rolls back on drift and cleans snapshots |
| `--verify`   | Check formatting, idempotence, and structural integrity read-only          |
| `--fences`   | Validate fence structure with `check-fences.js`                            |
| `--validate` | Run structural, fence, and table validations                               |
| `--dry-run`  | Show what would be changed without writing files                           |
| `--help`     | Display help message                                                       |

## Prerequisites

The formatter requires Node.js >=20 and an `oxfmt` binary available in one of these locations:

1. Local development: `node_modules/.bin/oxfmt` after `npm ci`
2. System PATH: `oxfmt` available globally in the shell

For an installed Hermes skill, put `oxfmt` on PATH:

```bash
npm install -g oxfmt
oxfmt --version
```

For repository development, use the pinned devDependency:

```bash
npm ci
```

The formatter passes the bundled runtime config at `skills/markdown-formatter/.oxfmtrc.json` to `oxfmt` and disables nested config discovery for predictable installed behavior.

## Test structure

Reference fixtures and test organization:

- `test/fixtures/current/` — Real-world docs that should format cleanly
- `test/fixtures/oxfmt-spike/` — Oxfmt edge cases for fence behavior and table alignment
- `test/fixtures/violations/` — Structural violations the guard must detect
- `test/unit/` — Isolated component tests for structure, fences, tables, and CLI helpers
- `test/integration/` — CLI and pipeline end-to-end tests

## Install instructions

For Hermes Agent users:

```bash
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes
```

If Hermes blocks installation because the community-source security scanner flags the runtime wrapper for manual review, inspect the warnings and install with `--force` only if they match the reviewed source:

```bash
hermes skills inspect CodeSigils/agents-markdown-formatter/markdown-formatter
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes --force
```

The installed skill payload contains only:

- `SKILL.md` — Skill definition with Hermes-compatible frontmatter
- `.oxfmtrc.json` — Runtime Oxfmt config used by the CLI
- `src/index.js` — Canonical formatter CLI
- `scripts/check-structure.js` — Structural snapshot and drift guard
- `scripts/check-fences.js` — Fence validator
- `scripts/check-tables.js` — Table column validator

Repository-only files (`plan.md`, `AGENTS.md`, `README.md`, `test/`, `package.json`, etc.) are excluded from the shipped payload.

## Shipping and allowlist

The skill follows a strict runtime allowlist:

- Shipped: only files under `skills/markdown-formatter/` needed at runtime
- Excluded: planning docs, tests, fixtures, development tooling, and governance files
- Verification: `bash scripts/staged-install-verify.sh` stages and tests the exact runtime payload
- Dependency boundary: root `package.json` and `package-lock.json` are repository-only

## Agent contract

Agent behavior and constraints are defined in:

- [`AGENTS.md`](AGENTS.md) — Repository governance and agent workflow policies
- [`skills/markdown-formatter/SKILL.md`](skills/markdown-formatter/SKILL.md) — Hermes-compatible packaged skill definition

Agents working on this repository must consult `AGENTS.md` and `plan.md` before implementation work and use this repository's Oxc/Oxfmt validation path for edited Markdown files.
