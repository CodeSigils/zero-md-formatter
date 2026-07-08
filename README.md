# Agents Markdown Formatter

[![GitHub Release](https://img.shields.io/github/v/release/CodeSigils/agents-markdown-formatter?display_name=tag&sort=semver)](https://github.com/CodeSigils/agents-markdown-formatter/releases/latest)
[![CI](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml)

Zero-dependency GFM and MDX formatting for AI-agent-authored Markdown, with table, pipe, and fence guards.

This repository builds a portable GitHub-Flavored Markdown (GFM) and MDX formatter skill compatible with any agentskills.io-compatible agent. The formatter is a zero-dependency Node.js module that normalizes Markdown container syntax and leaves fenced code content opaque. Guard scripts enforce table, pipe, and fence safety before formatting and can roll back writes when structure drifts.

The CLI is a standalone Node.js module — no agent platform required at runtime.

---

## Quick Start

Make the skill discoverable by your agent.

<details>
<summary><b>Hermes Agent</b></summary>

```bash
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes
```

Format a file with rollback-safe guards:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --fix --guard README.md
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
cp -r skills/markdown-formatter ~/.claude/skills/
node ~/.claude/skills/markdown-formatter/src/index.js --fix --guard README.md
```
</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
cp -r skills/markdown-formatter ~/.codex/skills/
node ~/.codex/skills/markdown-formatter/src/index.js --fix --guard README.md
```
</details>

<details>
<summary><b>Gemini CLI / .agents/ path</b></summary>

```bash
cp -r skills/markdown-formatter .agents/skills/
node .agents/skills/markdown-formatter/src/index.js --fix --guard README.md
```
</details>

<details>
<summary><b>OpenCode</b></summary>

```bash
cp -r skills/markdown-formatter .opencode/skills/
node .opencode/skills/markdown-formatter/src/index.js --fix --guard README.md
```
</details>

<details>
<summary><b>Direct (no agent — plain Node.js)</b></summary>

```bash
git clone https://github.com/CodeSigils/agents-markdown-formatter.git
node agents-markdown-formatter/skills/markdown-formatter/src/index.js --fix --guard README.md
```

No `npm install` needed — zero dependencies.
</details>

---

## Portability

The shipped skill uses only `name` and `description` frontmatter — no agent-specific fields. The CLI is standalone Node.js with zero npm dependencies, installable on any system with Node.js >=24.

| Component              | Portable?                                 |
| ---------------------- | ----------------------------------------- |
| CLI (`src/index.js`)   | ✅ Pure Node.js, no agent runtime required |
| SKILL.md               | ✅ agentskills.io base frontmatter         |
| Guard scripts (4)      | ✅ Node.js, no agent tools referenced      |
| Post-write hook config | Hermes-specific (platform feature)        |

---

## Why this exists

AI agents write a lot of Markdown: READMEs, plans, runbooks, notes, review comments, and MDX documentation. That output often has the same failure modes: trailing whitespace, missing final newlines, inconsistent indentation, fragile tables, and fenced code blocks that should not be reformatted as production source files.

This repository keeps that scope narrow. The formatter handles low-risk presentation normalization, while guard scripts handle structure and safety policy.

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

```bash
node <skill-dir>/src/index.js [options] <path...>
```

See [SKILL.md](skills/markdown-formatter/SKILL.md) for the full CLI flag reference, platform resolution table, and policy details.

## Safety policy

Reference spec for users and agents: [GitHub Flavored Markdown Spec](https://github.github.com/gfm/).

- `check-tables.js` enforces formatter-safe table column counts and pipe consistency, including unescaped pipes inside inline code spans. It is stricter than GFM body-row parsing because autonomous formatting should not guess table intent.
- `check-pipes.js` detects adjacent pipes (`||`) in table rows, which create valid empty cells per GFM. Write modes (`--fix`, `--guard`, default) repair them by inserting a space between the pipes (`| |`), preserving empty-cell semantics. Read-only modes (`--check`, `--dry-run`, `--validate`) block with a clear error.
- Empty-cell tables that remain ambiguous are preserved by skipping the full formatter pass after safety repairs.
- All CLI modes detect unclosed fences before table/pipe checks.

## Hermes auto-wiring (post-write hook)

To catch table formatting issues (like `||` double pipes) automatically after every `write_file` or `patch` call on Hermes, add this to your `config.yaml`:

```yaml
hooks:
  post_tool_call:
    - command: node ~/.hermes/skills/markdown-formatter/src/index.js --check
      matcher: write_file
```

This runs `--check` (read-only) on every written file. It blocks pipe hazards, fence errors, and formatting drift before they reach git. For auto-repair instead of blocking, use `--fix` instead of `--check`.

## Install payload

The installed skill payload contains only these files:

```text
<skill-dir>/
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

Node.js >=24. To diagnose an installed skill without modifying files:

```bash
node <skill-dir>/src/index.js --doctor
```

`--doctor` exits 0 when Node.js and required runtime payload files are ready.

## Test structure

- `test/fixtures/current/` — real-world docs that should format cleanly
- `test/fixtures/format-edge-cases/` — formatter edge cases
- `test/fixtures/pipe-safety/` — valid GFM that requires guard behavior
- `test/fixtures/violations/` — structural violations the guard must detect
- `test/unit/` — isolated component tests
- `test/integration/` — CLI and pipeline end-to-end tests

## Shipping and release

The skill follows a strict runtime allowlist:

- Shipped: only files under `skills/markdown-formatter/` needed at runtime
- Excluded: planning docs, tests, fixtures, development tooling
- Verification: `bash scripts/staged-install-verify.sh` stages and tests the exact runtime payload

Recommended release practice:

1. Keep runtime changes and version bumps in separate commits.
2. Before tagging a release, verify with:

   ```bash
   node scripts/check-consistency.js
   npm test
   npm run format:check
   bash scripts/staged-install-verify.sh
   ```

3. Push the version-bump commit to main and confirm CI is green.
4. Run `npm run release`.

## Project files

- [`skills/markdown-formatter/SKILL.md`](skills/markdown-formatter/SKILL.md) — packaged skill instructions
- [`skills/markdown-formatter/src/index.js`](skills/markdown-formatter/src/index.js) — CLI entrypoint
- [`skills/markdown-formatter/src/format-content.mjs`](skills/markdown-formatter/src/format-content.mjs) — formatter
- [`scripts/check-consistency.js`](scripts/check-consistency.js) — repository drift checks
- [`scripts/staged-install-verify.sh`](scripts/staged-install-verify.sh) — staged runtime payload verification
