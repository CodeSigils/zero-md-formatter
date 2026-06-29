# Agents Markdown Formatter

[![v1.0.7](https://img.shields.io/badge/version-1.0.7-blue.svg)](skills/markdown-formatter/SKILL.md)
[![CI](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeSigils/agents-markdown-formatter/actions/workflows/ci.yml)

Deterministic Markdown formatting for AI-agent-authored docs.

This repository builds a Hermes-compatible GitHub-Flavored Markdown (GFM) and MDX formatter skill powered by Oxc's
`oxfmt`. It formats the Markdown container, keeps fenced code untouched, and adds structural guards so tables and fences
do not silently drift. The CLI is plain Node.js and can also be used outside Hermes.

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
often has the same failure modes: very long prose lines, inconsistent list and blockquote wrapping, fragile tables, and
fenced code blocks that should not be reformatted as if they were production source files. Generic Markdown formatting
tools can either leave too much drift in place or expand their blast radius into embedded examples.

This repository cures that specific problem by making Markdown normalization deterministic while keeping structural
safety explicit. It formats the Markdown container, bounds AI-generated prose to readable lines, treats embedded code as
opaque payload, and uses repository-owned guards to detect table and fence drift before a formatter can silently damage
document structure.

## Why not just use another Markdown tool?

| Tool/use case  | Fit                                                                                 |
| :------------- | :---------------------------------------------------------------------------------- |
| Prettier       | Great general formatter; broader embedded-language behavior than this repo needs    |
| markdownlint   | Great style checker; not formatter-first and does not run this repository's guards  |
| `oxfmt` direct | Fast canonical formatter; no repository-specific rollback or structural guard layer |
| This repo      | Agent-safe GFM/MDX formatting with opaque fenced code and rollback-safe guards      |

## What it does

The Markdown Formatter Skill formats Markdown files with `oxfmt` and adds optional structural guardrails for GFM fences
and tables.

Core behavior:

- `oxfmt` performs the canonical formatting pass.
- `--guard` snapshots structure before formatting, checks it after formatting, and restores the original file if
  structural drift is detected.
- `--verify` checks structure, formatting, and idempotence without modifying files.
- `--validate` checks structure, fences, tables, and pipes without formatting.
- `--check`, `--fix`, `--dry-run`, and `--guard` refuse adjacent-pipe table artifacts before invoking `oxfmt`.
- `--doctor` checks runtime prerequisites and payload completeness without modifying files.
- The shipped skill payload has no npm runtime dependencies.

Scope:

- In scope: GFM tables, fenced code blocks, task lists, headings, lists, blockquotes, links, autolinks, inline code,
  strikethrough, and MDX files.
- Out of scope: Obsidian wiki links, Mermaid validation, Pandoc dialects, semantic rewriting, and JSX syntax validation
  inside MDX.

## Formatting philosophy

The formatter intentionally normalizes Markdown prose while treating embedded code as opaque payload. The shipped Oxfmt
config uses `printWidth: 120` and `proseWrap: "always"` so long agent-generated paragraphs become stable, bounded output
instead of remaining as uncontrolled single-line prose. With `proseWrap: "always"`, adjacent paragraph content —
including indented list continuations without a blank-line separator — is reflowed onto the parent line. This is
expected bounded-wrap behavior, not a structural change.

The same config sets `embeddedLanguageFormatting: "off"`. Fenced code blocks, examples, partial snippets, pseudocode,
and MDX embedded regions are often intentionally incomplete or language-mixed. Reformatting them would turn this tool
from a Markdown formatter into a multi-language formatter orchestrator, increasing failure modes and review noise.

The intended workflow is to absorb normalization churn once, then keep future diffs small and predictable with
`--check`, `--verify`, and CI.

## Table and fence safety policy

Table and fence safety is enforced by repository-owned structural guards, not by `.oxfmtrc.json`. Oxfmt performs the
canonical Markdown formatting pass, while the local guard scripts verify that table and fence structure survived
formatting:

- `check-tables.js` enforces formatter-safe table column counts and pipe consistency. It is stricter than GFM body-row
  parsing because `oxfmt` must not receive table shapes known to drift.
- `check-fences.js` validates fence closure and accidental malformed info strings.
- `check-structure.js` snapshots fences and tables before formatting, then compares them afterward.
- `check-pipes.js` detects adjacent pipes (`||`) in table rows, which create valid empty cells per GFM §4.10. Since
  `oxfmt` cannot safely format `||` tables, write modes (`--fix`, `--guard`, default) automatically repair them by
  inserting a space between the pipes (`| |`), preserving the empty-cell semantics. Read-only modes (`--check`,
  `--dry-run`, `--validate`) still block with a clear error before `oxfmt` is invoked.
- Empty-cell tables that remain unsafe for `oxfmt`, including no-leading-pipe rows with empty edge cells, are preserved
  by skipping the formatter pass after safety repairs.
- Table validation, structural table snapshots, pipe-safety checks, and automatic table repair ignore table-shaped text
  inside fenced code blocks.
- `--check`, `--fix`, `--dry-run`, `--guard`, and `--validate` run pipe-safety preflight before `oxfmt`. Write modes
  repair adjacent pipes automatically; read-only modes refuse to proceed when adjacent pipes are detected.
- `--guard` restores the original file content if post-format structure changes.

Fence policy is intentionally structural, not style-only. See the [shipped SKILL.md](skills/markdown-formatter/SKILL.md)
for the complete policy (bare fences, hidden whitespace tags, GFM backtick info-string rules, closure, post-format
drift).

This keeps handling conservative: validate strongly, avoid semantic rewriting, and do not pretend the formatter
configuration can express table- or fence-safety semantics it does not control.

## Architecture: formatter as a commodity

The guard scripts (`--verify`, `--guard`, `--check`, `--doctor`) are formatter-agnostic. The formatter (oxfmt) is a
swappable component wrapped by the guard layer. If oxfmt became unmaintained, swapping it for Prettier's Markdown
formatter is a `package.json` line change — the guard layer, structural checks, idempotence verification, and rollback
logic keep working unchanged.

## CLI reference

From a source checkout:

```bash
node skills/markdown-formatter/src/index.js [options] <path...>
```

Hermes is the first packaged skill target: `SKILL.md`, the install path, and shipped metadata are Hermes-compatible. The
CLI itself does not require Hermes at runtime.

### Available flags

| Flag              | Description                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--check`         | Check pipe safety and formatting without writing changes                                                                     |
| `--fix`           | Format files in-place after pipe-safety preflight; auto-repairs adjacent pipes and column-count mismatches; default behavior |
| `--all`           | Process directory inputs recursively; accepts multiple paths                                                                 |
| `--guard`         | Enable structural pre/post guard; rolls back on drift and cleans snapshots                                                   |
| `--verify`        | Check formatting, idempotence, and structural integrity read-only                                                            |
| `--fences`        | Validate fence structure with `check-fences.js`                                                                              |
| `--validate`      | Run structural, fence, table, and pipe validations                                                                           |
| `--doctor`        | Check Node.js, Oxfmt, config, and payload readiness without modifying files                                                  |
| `--dry-run`, `-n` | Run pipe-safety preflight, then show what would change without writing                                                       |
| `--help`, `-h`    | Display help message                                                                                                         |

## Install instructions

For Hermes Agent users:

```bash
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes
```

If Hermes blocks installation because the community-source security scanner flags the runtime wrapper for manual review,
inspect the warnings and install with `--force` only if they match the reviewed source:

```bash
hermes skills inspect CodeSigils/agents-markdown-formatter/markdown-formatter
hermes skills install CodeSigils/agents-markdown-formatter/markdown-formatter --yes --force
```

The installed skill payload contains only these files on the user's disk:

```text
~/.hermes/skills/markdown-formatter/
├── SKILL.md                    # Hermes skill definition, metadata, usage, scope, and examples
├── .oxfmtrc.json               # Runtime Oxfmt config used by src/index.js
├── src/
│   └── index.js                # Canonical formatter CLI and Oxfmt orchestration entrypoint
└── scripts/
    ├── check-structure.js      # Structural snapshot, validation, and pre/post drift comparison
    ├── check-fences.js         # Fenced code block validator for info strings and closure rules
    ├── check-tables.js         # Formatter-safety table column-count validator
    └── check-pipes.js          # Adjacent-pipe (empty cell) diagnostic for GFM tables
```

Repository-only files (`AGENTS.md`, `README.md`, `test/`, `package.json`, etc.) are excluded from the shipped payload.

## Prerequisites

The formatter requires Node.js >=20 and an `oxfmt` binary available in one of these locations:

1. Local development: `node_modules/.bin/oxfmt` after `npm ci` (`oxfmt.cmd`/`oxfmt.exe` are also checked on Windows)
2. System PATH: `oxfmt` available as an executable on PATH

For an installed Hermes skill, put `oxfmt` on PATH:

```bash
npm install -g oxfmt
oxfmt --version
```

For repository development, use the pinned devDependency:

```bash
npm ci
```

To diagnose an installed skill without modifying files:

```bash
node ~/.hermes/skills/markdown-formatter/src/index.js --doctor
```

`--doctor` exits 0 when Node.js, `oxfmt`, bundled config, and required runtime payload files are ready. It exits 1 with
actionable guidance when a required runtime piece is missing.

Runtime config (`printWidth: 120`, `embeddedLanguageFormatting: off`) is documented in the
[shipped SKILL.md](skills/markdown-formatter/SKILL.md).

## Test structure

Reference fixtures and test organization:

- `test/fixtures/current/` — Real-world docs that should format cleanly
- `test/fixtures/oxfmt-spike/` — Oxfmt edge cases for fence behavior and table alignment
- `test/fixtures/violations/` — Structural violations the guard must detect
- `test/unit/` — Isolated component tests for structure, fences, tables, and CLI helpers
- `test/integration/` — CLI and pipeline end-to-end tests

## Shipping and allowlist

The skill follows a strict runtime allowlist:

- Shipped: only files under `skills/markdown-formatter/` needed at runtime
- Excluded: planning docs, tests, fixtures, development tooling, and governance files
- Verification: `bash scripts/staged-install-verify.sh` stages and tests the exact runtime payload
- Dependency boundary: root `package.json` and `package-lock.json` are repository-only

## Release posture

`v1.0.7` is the current runtime release. `main` may contain maintenance commits after that tag for CI, checks, or
repository documentation, but those changes should not be treated as a runtime release unless files under
`skills/markdown-formatter/` change and the staged payload is verified again.

Recommended release practice:

1. Do not force-move a published tag.
2. Keep runtime changes and repository-only maintenance clearly separated.
3. Before tagging a runtime release, verify the exact commit with:

   ```bash
   node scripts/check-consistency.js
   npm test
   npm run test:unit
   npm run test:integration
   bash scripts/staged-install-verify.sh
   npm run format:check
   ```

4. Confirm GitHub Actions is green on the commit being tagged.
5. Run the release script (requires `gh` CLI authenticated):

   ```bash
   npm run release
   ```

   The script reads the version from `package.json`, validates preconditions (clean tree, CHANGELOG section exists, tag
   is new locally and remotely, `gh` authenticated), creates an annotated tag, pushes HEAD and the tag to origin, then
   publishes the GitHub Release with the matching CHANGELOG section as body. If the release must be aborted after
   tagging, run `git tag -d vX.Y.Z` locally and delete the remote tag before fixing.

6. Verify CI passes for the tag push.
7. Avoid expanding scope during release cleanup; use follow-up issues for new Markdown dialects, embedded-code
   formatting, or broader configuration systems.

## Agent contract

Agent behavior and constraints are defined in:

- [`AGENTS.md`](AGENTS.md) — Repository governance and agent workflow policies
- [`skills/markdown-formatter/SKILL.md`](skills/markdown-formatter/SKILL.md) — Hermes-compatible packaged skill
  definition

Agents working on this repository must consult `AGENTS.md` before implementation work and use this repository's
Oxc/Oxfmt validation path for edited Markdown files.
