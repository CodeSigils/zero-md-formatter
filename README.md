# zero-md-formatter

[![GitHub Release](https://img.shields.io/github/v/release/CodeSigils/zero-md-formatter?display_name=tag&sort=semver)](https://github.com/CodeSigils/zero-md-formatter/releases/latest)
[![CI](https://github.com/CodeSigils/zero-md-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSigils/zero-md-formatter/actions/workflows/ci.yml)

Zero-dependency [GFM] and MDX formatter with structural guardrails — trailing
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
> Requires Node.js >=24. Zero *runtime* npm dependencies — no config file, no plugin system.

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
git clone https://github.com/CodeSigils/zero-md-formatter.git
cd zero-md-formatter
node src/index.js --fix --guard README.md
```

---

## What it does

**Formatter-owned behavior:**

- Remove trailing whitespace
- Ensure a final newline
- Normalize leading-tab indentation outside fenced code blocks
- Align [GFM] table columns when the table has no empty-cell ambiguity
- Normalize tilde fences to backtick fences, escalating the backtick count when
  nested content requires it

**Guard-owned behavior:**

- Fence closure and malformed fence info strings
- Table column counts (header vs delimiter vs data row alignment)
- Unescaped inline-code pipes in table rows
- Adjacent-pipe table hazards (`||` → `| |`)
- Pre/post structural drift detection and rollback when `--guard` is used

---

### What it doesn't do

- **No formatting config file** — no `.prettierrc`, `.markdownlintrc`, or similar. No plugin system. Zero runtime dependencies means no extension points.
- **No dialect extensions** — no Obsidian wiki-links, Mermaid, Pandoc, or frontmatter semantics.
- **No JSX/MDX validation** — formats Markdown containers only; JSX inside is passed through unchecked.

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
| `--version`       | Print version number and exit                                      |
| `--help`, `-h`    | Display help message                                               |

### File exclusion

Create `.mdfmtignore` in the project root to exclude files from `--all` and explicit path processing. One pattern per line; `#` for comments. Patterns ending with `/` match directory prefixes; `*` matches any non-`/` characters.

```
# Skip vendored docs and generated output
vendor/
docs/generated/
*.generated.md
```

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

[GFM] tables are notoriously fragile in agent-generated Markdown. This formatter
includes guard scripts that catch the most common failure modes before
formatting:

- **Adjacent pipes** (`||`) create empty cells per [GFM]. Write modes
  automatically insert a space (`| |`), preserving empty-cell semantics.
  Read-only modes block with a clear error.
- **Inline-code pipes** (`| `cmd \| opt` | title |`) look like extra columns to
  naive formatters. Guard scripts detect them and block formatting before
  corruption.
- **Column drift** — rows with mismatched column counts are detected and, in
  write mode, repaired by padding short rows or rolling back on structural
  drift.
- **Empty-cell tables** that remain ambiguous are preserved by skipping the
  full formatter pass. The delimiter row is still normalized to [GFM]-canonical
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
# Add repo as skill tap (one-time), then install
hermes skills tap add CodeSigils/zero-md-formatter
hermes skills install CodeSigils/zero-md-formatter/markdown-formatter --yes
```

Then use the formatter via npm (recommended — gives `mdfmt` binary):

```bash
npm install -g zero-md-formatter
mdfmt --fix --guard README.md
```

Or run from source (no npm install):

```bash
node src/index.js --fix --guard README.md
```

For auto-wiring on every `write_file` or `patch` call, install a small hook
wrapper:

```bash
mkdir -p "$HOME/.hermes/scripts"
curl -sSLo "$HOME/.hermes/scripts/check-markdown.sh" \
  "https://raw.githubusercontent.com/CodeSigils/zero-md-formatter/main/scripts/check-markdown.sh"
chmod +x "$HOME/.hermes/scripts/check-markdown.sh"
```

Then add the hook to `config.yaml`:

```yaml
hooks:
  post_tool_call:
    - command: ~/.hermes/scripts/check-markdown.sh
      matcher: write_file
    - command: ~/.hermes/scripts/check-markdown.sh
      matcher: patch
```

This runs `--check` (read-only) on every written Markdown file, blocking pipe
hazards, fence errors, and formatting drift before they reach git. To
auto-repair instead, edit `~/.hermes/scripts/check-markdown.sh` and change
the `--check` flag to `--fix`.
</details>

<details>
<summary><b>Codex CLI</b></summary>

For a repo-specific Codex skill, copy the tap payload into `.agents/skills`:

```bash
mkdir -p .agents/skills
cp -R skills/markdown-formatter .agents/skills/markdown-formatter
```

For a user-wide Codex skill, copy it to `$HOME/.agents/skills` instead.
Codex also works directly with the CLI:

```bash
npm install -g zero-md-formatter
mdfmt --fix --guard README.md
```
</details>

<details>
<summary><b>Claude Code / OpenCode / Gemini CLI</b></summary>

All three can run the formatter as a normal shell CLI:

```bash
npm install -g zero-md-formatter
mdfmt --fix --guard README.md
```

Or clone the source and run the bundled CLI directly:

```bash
git clone https://github.com/CodeSigils/zero-md-formatter.git
node zero-md-formatter/src/index.js --fix --guard README.md
```

For native Agent Skills support, copy the tap payload to the runtime's
documented skill directory:

```bash
# Claude Code
mkdir -p .claude/skills
cp -R skills/markdown-formatter .claude/skills/markdown-formatter

# OpenCode
mkdir -p .opencode/skills
cp -R skills/markdown-formatter .opencode/skills/markdown-formatter

# Gemini CLI
mkdir -p .gemini/skills
cp -R skills/markdown-formatter .gemini/skills/markdown-formatter
```

OpenCode and Gemini CLI also discover `.agents/skills/markdown-formatter/`.
Claude Code also supports `$HOME/.claude/skills/markdown-formatter/` for
user-wide installs.
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
  than [GFM] body-row parsing because autonomous formatting should not guess
  table intent.
- `check-pipes.js` detects adjacent pipes in table rows, which create valid
  empty cells per [GFM]. Write modes repair them by inserting a space between
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

The shipped runtime payload contains:

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

The npm tarball also includes package metadata, README.md, and LICENSE.
Repository-only files (test/, scripts/, .github/) are excluded via the `files`
field in package.json.

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

[GFM]: https://github.github.com/gfm/
