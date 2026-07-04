# Agents Markdown Formatter

[![v1.2.0](https://img.shields.io/badge/version-1.2.0-blue.svg)](skills/markdown-formatter/SKILL.md)
[![CI](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml)

Zero-dependency GFM and MDX formatting for AI-agent-authored Markdown, with table, pipe, and fence guards.

This repository builds a Hermes-compatible GitHub-Flavored Markdown (GFM) and MDX formatter skill. The formatter is a
zero-dependency Node.js module that normalizes Markdown container syntax and leaves fenced code content opaque. Guard
scripts enforce table, pipe, and fence safety before formatting and can roll back writes when structure drifts.

## Quick start

Install for Hermes Agent:

```bash
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes
```

Format one file safely from an installed skill:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --fix --guard README.md
```

Verify a docs directory without writing changes:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --verify --all docs/
```

Check installed runtime readiness:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --doctor
```

## Why this exists

AI agents write a lot of Markdown: READMEs, plans, runbooks, notes, review comments, and MDX documentation. That output
often has the same failure modes: trailing whitespace, missing final newlines, inconsistent indentation, fragile tables,
and fenced code blocks that should not be reformatted as production source files.

This repository keeps that scope narrow. The formatter handles low-risk presentation normalization, while guard scripts
handle structure and safety policy.

## What it does

Formatter-owned behavior:

- trailing whitespace removal
- final newline insertion
- leading-tab indentation normalization outside fences
- GFM table alignment when tables have no empty-cell ambiguity
- tilde-fence to backtick-fence normalization, with backtick-count escalation when needed

Guard-owned behavior:

- fence closure and malformed fence info strings
- table column counts
- unescaped inline-code pipes in table rows
- adjacent-pipe table hazards
- pre/post structural drift detection and rollback for `--guard`

The shipped skill payload has no npm runtime dependencies.

## CLI reference

From a source checkout:

```bash
node skills/markdown-formatter/src/index.js [options] <path...>
```

Hermes is the first packaged skill target: `SKILL.md`, the install path, and shipped metadata are Hermes-compatible. The
CLI itself does not require Hermes at runtime.

| Flag              | Description                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--check`         | Check pipe safety and formatting without writing changes                                                                     |
| `--fix`           | Format files in-place after pipe-safety preflight; auto-repairs adjacent pipes and column-count mismatches; default behavior |
| `--all`           | Process directory inputs recursively; accepts multiple paths                                                                 |
| `--guard`         | Enable structural pre/post guard; rolls back on drift and cleans snapshots                                                   |
| `--verify`        | Check formatting, idempotence, and structural integrity read-only                                                            |
| `--fences`        | Validate fence structure with `check-fences.js`                                                                              |
| `--validate`      | Run structural, fence, table, and pipe validations                                                                           |
| `--doctor`        | Check Node.js and payload readiness without modifying files                                                                  |
| `--dry-run`, `-n` | Run pipe-safety preflight, then show what would change without writing                                                       |
| `--audit-tables`  | Print table row cell counts and pipe hazards without writing; use before/after agent table edits                             |
| `--no-repair`     | In write modes, report repairable table issues instead of modifying them                                                     |
| `--help`, `-h`    | Display help message                                                                                                         |

## Safety policy

Reference spec for users and agents: [GitHub Flavored Markdown Spec](https://github.github.com/gfm/).

- `check-tables.js` enforces formatter-safe table column counts and pipe consistency, including unescaped pipes inside
  inline code spans. It is stricter than GFM body-row parsing because autonomous formatting should not guess table
  intent.
- `check-pipes.js` detects adjacent pipes (`||`) in table rows, which create valid empty cells per GFM. Write modes
  (`--fix`, `--guard`, default) repair them by inserting a space between the pipes (`| |`), preserving empty-cell
  semantics. Read-only modes (`--check`, `--dry-run`, `--validate`) block with a clear error.
- Empty-cell tables that remain ambiguous, including no-leading-pipe rows with empty edge cells, are preserved by
  skipping the full formatter pass after safety repairs. The delimiter row is still normalized to
  3 dashes (`----` → `---`, `:-----` → `:---`, etc.) during spacing normalization.
- Table validation, structural table snapshots, pipe-safety checks, and automatic table repair ignore table-shaped text
  inside fenced code blocks.
- `--guard` restores the original file content if post-format structure changes.
- All CLI modes detect unclosed fences before table/pipe checks. When an unclosed fence is found, the CLI warns that
  table and pipe checks are unreliable and skips them while continuing with fence validation and formatting.

## Install payload

The installed skill payload contains only these files on the user's disk:

```text
~/.hermes/skills/markdown-formatter/
├── SKILL.md
├── src/
│   ├── format-content.mjs
│   └── index.js
└── scripts/
    ├── check-structure.js
    ├── check-fences.js
    ├── check-tables.js
    └── check-pipes.js
```

Repository-only files (`README.md`, `test/`, `package.json`, etc.) are excluded from the shipped payload.

## Prerequisites

The formatter requires Node.js >=24. For repository development:

```bash
npm ci
```

To diagnose an installed skill without modifying files:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --doctor
```

`--doctor` exits 0 when Node.js and required runtime payload files are ready.

## Test structure

- `test/fixtures/current/` — real-world docs that should format cleanly
- `test/fixtures/format-edge-cases/` — formatter edge cases retained from the Oxfmt spike
- `test/fixtures/pipe-safety/` — valid GFM that requires guard behavior
- `test/fixtures/violations/` — structural violations the guard must detect
- `test/unit/` — isolated component tests for formatter and guards
- `test/integration/` — CLI and pipeline end-to-end tests

## Shipping and release

The skill follows a strict runtime allowlist:

- Shipped: only files under `skills/markdown-formatter/` needed at runtime
- Excluded: planning docs, tests, fixtures, development tooling, and repository-only metadata
- Verification: `bash scripts/staged-install-verify.sh` stages and tests the exact runtime payload
- Dependency boundary: root `package.json` and `package-lock.json` are repository-only

Recommended release practice:

1. Keep runtime changes and version bumps in separate commits.
2. Before tagging a runtime release, verify the exact commit with:

   ```bash
   node scripts/check-consistency.js
   npm test
   npm run format:check
   bash scripts/staged-install-verify.sh
   ```

3. Push the version-bump commit to main and confirm GitHub Actions is green.
4. Run the release script:

   ```bash
   npm run release
   ```

The release script validates a clean tree, tag availability, isolated version metadata changes, pushed HEAD, and green
CI before tagging. GitHub Release notes are generated from commit subjects since the previous version tag.

## Project files

- [`skills/markdown-formatter/SKILL.md`](skills/markdown-formatter/SKILL.md) — packaged skill instructions
- [`skills/markdown-formatter/src/index.js`](skills/markdown-formatter/src/index.js) — CLI entrypoint
- [`skills/markdown-formatter/src/format-content.mjs`](skills/markdown-formatter/src/format-content.mjs) — formatter
- [`scripts/check-consistency.js`](scripts/check-consistency.js) — repository drift checks
- [`scripts/staged-install-verify.sh`](scripts/staged-install-verify.sh) — staged runtime payload verification
