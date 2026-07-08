# zero-md-formatter

[![GitHub Release](https://img.shields.io/github/v/release/CodeSigils/agents-markdown-formatter?display_name=tag&sort=semver)](https://github.com/CodeSigils/agents-markdown-formatter/releases/latest)
[![CI](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml)

Zero-dependency GFM and MDX formatter with structural guardrails — trailing
whitespace removal, table alignment, fence normalization, pipe-safety checks,
column-count enforcement, and drift detection.

Designed for AI-agent workflows but works anywhere Node.js >=24 runs.

```
npm install -g zero-md-formatter
mdfmt --fix README.md
```

The CLI and formatter module have zero npm runtime dependencies. Installable on
any system with Node.js >=24.

---

## Quick start

### Install from npm

```bash
npm install -g zero-md-formatter
mdfmt --fix README.md
```

### Use via npx (no install)

```bash
npx zero-md-formatter --fix README.md
```

### Use programmatically

```js
import { formatContent } from 'zero-md-formatter';

const result = formatContent(rawMarkdown);
console.log(result);
```

### Run from source

```bash
git clone https://github.com/CodeSigils/agents-markdown-formatter.git
cd agents-markdown-formatter
node src/index.js --fix --guard README.md
```

---

## What it does

**Formatter-owned behavior:**

- Remove trailing whitespace
- Ensure a final newline
- Normalize leading-tab indentation outside fenced code blocks
- Align GFM table columns when the table has no empty-cell ambiguity
- Normalize tilde fences to backtick fences, escalating the backtick count when
  nested content requires it

**Guard-owned behavior:**

- Fence closure and malformed fence info strings
- Table column counts (header vs delimiter vs data row alignment)
- Unescaped inline-code pipes in table rows
- Adjacent-pipe table hazards (`||` → `| |`)
- Pre/post structural drift detection and rollback when `--guard` is used

---

## CLI reference

```bash
mdfmt [options] <path...>
```

| Flag              | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `--check`         | Read-only pipe-safety and format check (exit 0 if clean)           |
| `--fix`           | Format files in-place after pipe-safety preflight (default)        |
| `--all`           | Process directories recursively                                    |
| `--guard`         | Pre/post structural check; rollback on drift; clean snapshots      |
| `--verify`        | Run formatting, idempotence, and structural checks without writing |
| `--fences`        | Validate fenced code block info strings                            |
| `--validate`      | Run all structural validations                                     |
| `--doctor`        | Check runtime prerequisites without modifying files                |
| `--dry-run`, `-n` | Run pipe-safety preflight, preview changes without writing         |
| `--audit-tables`  | Print table row cell counts and pipe hazards without writing       |
| `--no-repair`     | Report repairable table issues instead of modifying them           |
| `--help`, `-h`    | Display help message                                               |

### Examples

```bash
# Check formatting (read-only, CI-safe)
mdfmt --check README.md

# Format with rollback-safe structural guards
mdfmt --fix --guard docs/

# Validate structure across a directory
mdfmt --validate --all docs/

# Diagnose installed readiness
mdfmt --doctor
```

---

## Table and pipe safety

GFM tables are notoriously fragile in agent-generated Markdown. This formatter
includes guard scripts that catch the most common failure modes before
formatting:

- **Adjacent pipes** (`||`) create empty cells per GFM. Write modes
  automatically insert a space (`| |`), preserving empty-cell semantics.
  Read-only modes block with a clear error.
- **Inline-code pipes** (`| `cmd \| opt` | title |`) look like extra columns to
  naive formatters. Guard scripts detect them and block formatting before
  corruption.
- **Column drift** — rows with mismatched column counts are detected and, in
  write mode, repaired by padding short rows or rolling back on structural
  drift.
- **Empty-cell tables** that remain ambiguous are preserved by skipping the
  full formatter pass. The delimiter row is still normalized to GFM-canonical
  width.
- **Unclosed-fence preflight** — all modes detect unclosed fences before
  running table/pipe checks, skipping unreliable validation when fences are
  open.

Table-shaped content inside fenced code blocks is always left untouched.

---

## Agent skill usage

The formatter ships as a standard agentskills-compatible skill via
[`SKILL.md`](SKILL.md). It works with any agent that supports
agentskills.io-formatted skills.

### Install as a skill

<details>
<summary><b>Hermes Agent</b></summary>

```bash
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes
mdfmt --fix --guard README.md
```

For auto-wiring on every `write_file` or `patch` call, add to `config.yaml`:

```yaml
hooks:
  post_tool_call:
    - command: mdfmt --check
      matcher: write_file
```

This runs `--check` (read-only) on every written file, blocking pipe hazards,
fence errors, and formatting drift before they reach git. Use `--fix` instead
of `--check` for auto-repair.
</details>

<details>
<summary><b>Claude Code / Codex CLI / OpenCode / Gemini CLI</b></summary>

```bash
# Clone the repo or copy the skill directory
git clone https://github.com/CodeSigils/agents-markdown-formatter.git
# Point at the source directory
node agents-markdown-formatter/src/index.js --fix --guard README.md
```

Or install via npm globally and use the `mdfmt` binary directly.
</details>

### Portability

| Component              | Portable?                               |
| ---------------------- | --------------------------------------- |
| CLI (`src/index.js`)   | Pure Node.js, no agent runtime required |
| SKILL.md               | agentskills.io base frontmatter         |
| Guard scripts (4)      | Node.js, no agent tools referenced      |
| Post-write hook config | Hermes-specific (platform feature)      |

---

## Safety policy

Reference spec: [GitHub Flavored Markdown Spec](https://github.github.com/gfm/).

- `check-tables.js` enforces formatter-safe table column counts and pipe
  consistency, including unescaped pipes inside inline code spans. Stricter
  than GFM body-row parsing because autonomous formatting should not guess
  table intent.
- `check-pipes.js` detects adjacent pipes in table rows, which create valid
  empty cells per GFM. Write modes repair them by inserting a space between
  the pipes. Read-only modes block with a clear error.
- All CLI modes run pipe-safety preflight checks before table operations. When
  unclosed fences are detected, the CLI warns that table and pipe checks are
  unreliable and skips them while continuing with fence validation and
  formatting.
- Write-mode `--guard` runs structural snapshots before and after formatting.
  If post-format structure doesn't match the pre-format snapshot, the original
  content is restored.

---

## Supported file types

- `.md`
- `.markdown`
- `.mdx`

---

## Prerequisites

- Node.js >=24

Run `mdfmt --doctor` to verify runtime readiness.

---

## Install payload

The shipped package contains only:

```
zero-md-formatter/
  SKILL.md
  src/index.js
  src/format-content.mjs
  guard/check-structure.js
  guard/check-fences.js
  guard/check-tables.js
  guard/check-pipes.js
```

Repository-only files (test/, scripts/, .github/) are excluded from the npm
tarball via the `files` field in package.json.

---

## Project files

- [`SKILL.md`](SKILL.md) — packaged skill instructions
- [`src/index.js`](src/index.js) — CLI entrypoint
- [`src/format-content.mjs`](src/format-content.mjs) — formatter module
- [`scripts/check-consistency.js`](scripts/check-consistency.js) — repository
  drift checks

---

## License

MIT
