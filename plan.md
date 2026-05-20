# Refactoring Plan: Hermes Markdown Formatter Skill

## Goal

Refactor `hermes-markdown-lint-skill` into a **Hermes Markdown Formatter Skill**. This is no longer only an Oxc integration under the old lint-skill identity: the shipped skill should be renamed, documented, and validated as a formatter-first skill powered by **Oxc's `oxfmt`** plus structural guardrails.

The new formatter replaces the `markdownlint-cli2` + `format-tables.js` formatting pipeline while preserving Hermes-specific patterns: metadata, post-write hooks, agent governance, safety checks, consistency checks, and a zero-install user experience.

**Scope:** `/home/sand/projects/hermes-markdown-lint-skill/`

**Decision:** The target implementation should move to a clean repository named `agents-markdown-formatter`. The existing `hermes-markdown-lint-skill` repository should remain as reference/history unless an explicit compatibility update is needed for existing users.

**Important:** All agents working on this refactor MUST read the existing `plan.md` in the opencode-markdown-formatter-skill repo (`/home/sand/projects/opencode-markdown-formatter-skill/plan.md`) and consult the public spike repo (<https://github.com/CodeSigils/markdown-oxc-spike>) before making changes. The `markdown-oxc-spike` findings about official Oxfmt behavior, structural guardrails, fence/table drift detection, embedded formatting, and idempotence verification apply equally here.

**Lesson learned:** Renaming this repository in place would carry too much identity and compatibility debt: stale `markdown-lint` paths, inherited markdownlint assumptions, old install examples, and repo-local implementation files that should not be installed to users. A fresh repo lets the runtime allowlist, formatter-first identity, staged install verification, and final agent guard policy review be designed in from the first commit.

---

## External Resources to be Aware off

<https://github.com/CodeSigils/markdown-oxc-spike>
<https://oxc.rs/docs/guide/usage/formatter.md>
<https://oxc.rs/docs/guide/usage/formatter/cli.md>
<https://oxc.rs/docs/guide/usage/formatter/config-file-reference.md>
<https://oxc.rs/docs/guide/usage/formatter/embedded-formatting.md>
<https://oxc.rs/docs/guide/usage/formatter/unsupported-features.md>
<https://deepwiki.com/oxc-project/oxc>
<https://deepwiki.com/oxc-project/oxc/8-code-formatting>
<https://deepwiki.com/oxc-project/oxc/8.1-formatter-architecture>
<https://deepwiki.com/oxc-project/oxc/10.2-oxfmt-cli>
<https://deepwiki.com/oxc-project/oxc/12.2-conformance-testing>
<https://api.github.com/repos/oxc-project/oxc/contents/apps/oxfmt/conformance/fixtures/edge-cases>

**Source-of-truth rule:** use official Oxfmt docs for current CLI/config/support claims. Use DeepWiki for architecture and source-file orientation only when it conflicts with official docs.

## Current State Analysis

### Hermes Repo Structure

```
hermes-markdown-lint-skill/
├── AGENTS.md                         # Formal agent behavioral contract
├── lint.js                           # Root dev wrapper → skills/markdown-lint/lint.js
├── README.md                         # Full documentation + changelog
├── scripts/
│   └── check-consistency.js          # Config/docs anti-drift checker
├── skills/
│   └── markdown-lint/                # Current skill payload; target: markdown-formatter
│       ├── SKILL.md                  # Hermes skill definition (compact hot path)
│       ├── lint.js                   # Canonical pipeline entry point
│       ├── scripts/
│       │   ├── check-fences.js       # Fenced code block validator
│       │   └── post-write.js         # Auto-lint hook (Hermes hook system)
│       └── references/
│           ├── format-tables.js      # Single-pass table formatter (~381 lines)
│           ├── rules.md              # Full markdownlint rule table
│           └── .markdownlint.json    # Lint rules config (50 lines)
└── test/
    ├── format-tables.test.js         # Unit tests (254 lines, 19 tests)
    ├── kitchensink.md                # Test fixture
    └── hermes-intro.md               # Test fixture
```

### Current Pipeline

```
format-tables.js (custom Node.js) → markdownlint-cli2 (via npx) → Success/Error
```

### Current Architecture Features

- **Zero npm dependencies** — no `package.json`, no `node_modules/`, no install step
- **Hermes-specific metadata** in SKILL.md frontmatter (`version`, `author`, `metadata.hermes`)
- **Post-write hook** (`post-write.js`) — optional Hermes hook system integration
- **Consistency checker** — validates rules/config/docs stay in sync across 4 files
- **Agent governance** through AGENTS.md with severity levels (BLOCKING/WARNING/INFO)
- **Fence-aware table formatting** — `format-tables.js` respects fenced code block boundaries
- **CJK/emoji width awareness** — `stringWidth()` handles wide characters in table padding
- **No bash scripts** — pure Node.js, cross-platform

### Known Issues

- `markdownlint-cli2` via `npx` has first-run latency (download time)
- Two separate tools for formatting (tables + lint) means two passes
- Custom table formatter overlaps with what oxfmt/Prettier can format, but table safety validation still needs explicit guards
- `npx` adds a runtime dependency on npm registry availability
- No structural drift detection (no `check-structure.js` equivalent)
- Oxfmt with `proseWrap: "preserve"` is conservative and may not fix markdownlint-style spacing issues such as trailing spaces or missing blank lines around blocks
- Oxfmt can format code inside tagged fences and embedded Markdown-in-JS/MDX contexts, so blast radius must be explicit and guarded

---

## Target Architecture

### Target Repository / Skill Shape

The final repository should present itself as a formatter skill even if some migration wrappers remain:

```
hermes-markdown-lint-skill/            # Repo may be renamed later
├── AGENTS.md                          # Formatter governance for agents
├── lint.js                            # Temporary/backward-compatible wrapper
├── mdformat.js                        # Optional root formatter wrapper
├── README.md                          # Markdown Formatter Skill docs
├── scripts/
│   └── check-consistency.js           # Formatter/docs anti-drift checker
├── skills/
│   └── markdown-formatter/            # Target skill payload
│       ├── SKILL.md                   # Hermes skill definition
│       ├── src/
│       │   └── index.js               # Canonical formatter CLI
│       ├── scripts/
│       │   ├── check-fences.js        # Fenced code block validator
│       │   ├── check-structure.js     # Structural drift guard
│       │   └── post-write.js          # Hermes hook integration
│       ├── references/
│       │   ├── table-validate.js      # Validate-only table guard if retained
│       │   └── rules.md               # Formatter behavior docs
│       └── .oxfmtrc.json              # Oxfmt config
└── test/
    ├── formatter.test.js
    ├── structure.test.js
    └── cli.test.js
```

### Formatting Pipeline

```
┌─────────────────────────────┐
│   Structural Guard (pre)    │
│ (new: fence/table snapshot) │
└─────────────────────────────┘
            ▼
┌─────────────────────────────┐
│    oxfmt Formatter          │
│ (canonical formatting pass) │
└─────────────────────────────┘
            ▼
┌─────────────────────────────┐
│  Structural Guard (post)    │
│ (verify no drift introduced)│
└─────────────────────────────┘
            ▼
┌─────────────────────────────┐
│   Final Validations:        │
│   - --guard / --verify      │
│   - --fences (check-fences) │
│   - --validate (table cols) │
│   - --check  (oxfmt check)  │
└─────────────────────────────┘
```

### Key Changes

1. **Rename the skill payload** from `skills/markdown-lint/` to `skills/markdown-formatter/`.
2. **Rename the skill metadata** from `name: markdown-lint` to `name: markdown-formatter`.
3. **Introduce a formatter CLI** at `skills/markdown-formatter/src/index.js` and optionally expose root wrappers (`lint.js` for compatibility, `mdformat.js` for the new identity).
4. **Replace** `markdownlint-cli2` via `npx` with `oxfmt` as the primary formatter.
5. **Keep** `check-fences.js` because oxfmt does not validate fence structure.
6. **Keep** `check-consistency.js` because formatter docs/config drift is still a release blocker.
7. **Keep** `post-write.js` because Hermes hook integration remains part of the value proposition.
8. **Add** structural guard (`check-structure.js`) adapted from the opencode formatter skill.
9. **Simplify or replace** `format-tables.js` with validate-only table-column checking; oxfmt owns table formatting.
10. **Remove** `.markdownlint.json` from the shipped formatter path; replace it with `.oxfmtrc.json`.
11. **Update** `SKILL.md`, `AGENTS.md`, `README.md`, `references/rules.md`, CI, and tests to describe a formatter skill.

---

### Best Path: Start in `agents-markdown-formatter`

Implement in a new repository at `/home/sand/projects/agents-markdown-formatter` instead of continuing the migration in place.

1. Commit any reference updates in this repo first so the decision is recoverable.
2. Create a clean git repository named `agents-markdown-formatter`.
3. Copy only useful planning and prior-art inputs:
   - this `plan.md`
   - fixture ideas from `markdown-oxc-spike`
   - structural guard prior art from `opencode-markdown-formatter-skill`
   - representative current fixtures from this repo
4. Do not copy generated agent state, `node_modules`, lockfiles, old `markdown-lint` runtime code, or current markdownlint config as active implementation.
5. Start the new repo with the final product shape: `skills/markdown-formatter/`, runtime allowlist, staged install verification, and structural guard tests.
6. Keep this repo as historical/reference material. Add only compatibility or redirect notes here if existing users need them later.

## Implementation Plan

### Execution Sequencing Rules

- Commit this plan before implementation begins so the migration target is reviewable and recoverable.
- Implement in `/home/sand/projects/agents-markdown-formatter`; treat this repository as historical/reference material after the clean repo is created.
- Treat Phase 1 and the Phase 7 release allowlist as coupled. The first implementation slice must create the new skill boundary and prove what would be installed before deeper behavior changes.
- Do not start by deleting the old `markdown-lint` payload in this repo. In the new repo, avoid introducing it as active runtime code at all; copy old files only as explicit prior-art references when useful.
- Build the structural guard before full Oxfmt integration so formatter output is evaluated against safety invariants from the start.
- Keep cached binary download out of the first implementation pass. The first shippable pass resolves `oxfmt` from local development installs or PATH and fails with actionable setup instructions.
- Make one concern per commit: boundary/packaging, guard, formatter integration, docs/consistency, final policy review.

### Phase 1: Rename, Migration Boundary, and Install Payload Boundary

- [ ] Create/rename target payload path: `skills/markdown-formatter/`.
- [ ] Move `SKILL.md`, scripts, and references into the formatter payload.
- [ ] Update frontmatter to `name: markdown-formatter` and formatter-first description.
- [ ] Keep a root `lint.js` compatibility wrapper only if needed for current CI/migration.
- [ ] Add or document the new canonical command: `node skills/markdown-formatter/src/index.js <path>` or `mdformat <path>`.
- [ ] Add a first-pass install allowlist or staging script/check before moving behavior, so implementation can verify the installed payload independently from the repository checkout.
- [ ] Decide whether the old `skills/markdown-lint/` path remains as a thin compatibility shim or is removed in one breaking change; do not remove it until the new path and compatibility decision are tested.

### Phase 2: Spike / Evaluation

- [ ] Treat the spike repo (<https://github.com/CodeSigils/markdown-oxc-spike>) as prior art; do not repeat fixture work unless this repo needs Hermes-specific coverage.
- [ ] Verify current official Oxfmt docs still list Markdown and MDX support before changing formatter behavior.
- [ ] Test oxfmt on `test/kitchensink.md` and `test/hermes-intro.md` — compare output against structural invariants, not old markdownlint formatting expectations.
- [ ] Do NOT assume `.oxfmtrc.json` covers all current `.markdownlint.json` rules; document markdownlint-style policy gaps explicitly.
- [ ] Check oxfmt idempotence: run twice, verify convergence.
- [ ] Decide whether `embeddedLanguageFormatting` should be `"auto"` or `"off"` for the first safe Hermes release.
- [ ] Decide: keep `format-tables.js` as fallback for validate-only mode?

### Phase 3: Structural Guard Safety Net

- [ ] Port `check-structure.js` from the opencode-markdown-formatter skill, but validate behavior against the spike repo before copying assumptions.
- [ ] Integrate pre/post guard into the formatter pipeline before Oxfmt is allowed to rewrite files:
  - Pre-snapshot: record fence counts, fence delimiter styles, fence info strings, table column counts, and optionally fenced-code content hashes
  - Post-verify: compare after formatting, report drift, and fail on policy violations
- [ ] Add explicit fixtures from the spike/Oxc edge cases: nested fences in lists, tilde-to-backtick normalization, tagged fence content formatting, escaped table pipes, and Markdown-in-JS with escaped backticks/multibyte text.
- [ ] Add `--guard` flag to the CLI and test it against fixtures before full formatter integration.

### Phase 4: oxfmt Integration

- [ ] Add `.oxfmtrc.json` with Hermes-appropriate defaults:

  ```json
  {
    "tabWidth": 2,
    "printWidth": 100,
    "endOfLine": "lf",
    "insertFinalNewline": true,
    "proseWrap": "preserve",
    "embeddedLanguageFormatting": "off"
  }
  ```

- [ ] Add `skills/markdown-formatter/src/index.js` to call oxfmt instead of `format-tables.js` + `npx markdownlint-cli2`.
- [ ] Implement staged oxfmt binary resolution for the first shippable pass:
  1. Check local `node_modules/.bin/oxfmt` when a development install exists
  2. Check system PATH
  3. Fail with actionable install/setup instructions
  4. Defer cached download support until the CLI, guard, install artifact, and tests are proven stable
- [ ] Keep `validate` and `fences` subcommands working
- [ ] Ensure formatter flags work: `--check`, `--fix` default, `--all`, `--guard`, `--verify`, `--fences`, `--validate`, `--dry-run`.
- [ ] Run oxfmt twice or otherwise verify idempotence before reporting success.

### Phase 5: Anti-Drift & Consistency (Critical)

- [ ] Update `check-consistency.js` to validate oxfmt config and docs:
  - `.oxfmtrc.json` matches documented rules in `AGENTS.md` and `references/rules.md`
  - README badge version matches SKILL.md frontmatter version
  - No stale shipped references to markdownlint-cli2, `npx markdownlint`, `markdown-lint` identity, or old primary formatter paths
  - Rule tables in AGENTS.md, rules.md, and README are synchronized
- [ ] Add stale-text detection for old pipeline artifacts (`markdownlint-cli2`, `npx markdownlint`, `format-tables.js` as formatter, `markdown-lint` as skill identity)
- [ ] Remove `.markdownlint.json` or clearly mark as deprecated

### Phase 6: Documentation & Metadata Updates

- [ ] Update `SKILL.md`:
  - Frontmatter: update `name` to `markdown-formatter`; keep `version`, `author`, `license`, `metadata.hermes`
  - Replace `lint.js` commands with `src/index.js`, `mdformat`, or a documented compatibility wrapper
  - Update required commands section
  - Update references section
- [ ] Update `AGENTS.md`:
  - Replace rule table with oxfmt-relevant formatting rules
  - Update agent contract to reference oxfmt
  - Update severity levels for oxfmt-related failures
- [ ] Update `README.md`:
  - Change "What It Does" section to oxfmt
  - Update CLI reference
  - Update CI/pre-commit commands
  - Add changelog entry for oxfmt version
  - Remove stale content (markdownlint references, npx commands)
- [ ] Update `references/rules.md`:
  - Replace markdownlint rules with oxfmt formatting rules
  - Document oxfmt limitations and edge cases
- [ ] Update CI workflow (`.github/workflows/ci.yml`):
  - Replace `node lint.js --check .` with `node lint.js --guard --all .`
  - Keep consistency check, fence validation, table validation
  - Add structural guard step

### Phase 7: Shipping Strategy

- [ ] Define a release allowlist for the installed skill payload. Ship only runtime files under `skills/markdown-formatter/` that are needed by Hermes at use time: `SKILL.md`, formatter CLI source, guard scripts, hook script, runtime references, and Oxfmt config.
- [ ] Keep repository-only planning, tests, fixtures, and development utilities out of the installed user payload: `plan.md`, `AGENTS.md`, `README.md`, `test/`, CI files, dev-only `scripts/`, `package.json`, lockfiles, `node_modules/`, coverage, and generated local state.
- [ ] Add a packaging/install verification task that builds or stages the exact install artifact into a temp directory and lists the files that would be shipped before release.
- [ ] Document the zero-dependency runtime contract: pure Node.js wrappers plus an externally resolved `oxfmt` binary; no bundled test dependencies, planning files, npm dev dependencies, or generated agent state in the installed skill.
- [ ] Document the developer-only dependency boundary separately so maintainers may use local test tooling without accidentally promoting those dependencies into the skill payload.
- [ ] Update `.gitignore` only for generated local state; do not use ignore rules as a substitute for an explicit release allowlist.
- [ ] Create migration guide for existing users.

### Phase 8: Testing

- [ ] Run all existing tests: `node test/format-tables.test.js`
- [ ] Add structural guard tests
- [ ] Test oxfmt idempotence on all fixtures
- [ ] Verify `format-tables.js` and oxfmt produce same table output
- [ ] Test all CLI flags (--check, --all, --fences, --validate, --dry-run, --guard)
- [ ] Run staged install artifact verification from Phase 7; tests must execute against the staged skill, not only the repository checkout
- [ ] Run `check-consistency.js` — must pass after all changes

### Phase 9: Final Agent Guard Policy Review

- [ ] Review every agent-facing policy surface after implementation is complete: repository `AGENTS.md`, shipped `SKILL.md`, `references/rules.md`, README agent sections, hook examples, CI docs, and migration notes.
- [ ] Confirm guard policies describe the final formatter behavior, not transitional implementation details.
- [ ] Remove or explicitly label compatibility-only references to `markdown-lint`, `markdownlint-cli2`, `npx`, `.markdownlint.json`, `format-tables.js` as formatter, and old command paths.
- [ ] Confirm agent instructions do not tell agents to run dev-only checks from the installed user payload.
- [ ] Confirm shipped agent instructions mention only files and commands that actually exist in the installed allowlist.
- [ ] Run stale-text searches and `node scripts/check-consistency.js` after the final policy review.

---

## Shipping Strategy

### Hermes vs OpenCode — Key Difference

The hermes skill targets **Hermes Agent** users, not OpenCode. The shipping constraints are different:

| Concern        | Hermes Formatter Skill                                                  | OpenCode Formatter Reference                     |
| :------------- | :---------------------------------------------------------------------- | :----------------------------------------------- |
| Install method | `hermes skills install`                                                 | `git clone`                                      |
| Hook system    | `~/.hermes/config.yaml post_tool_call`                                  | N/A                                              |
| Metadata       | `name: markdown-formatter`, `version`, `author`, `metadata.hermes.tags` | `name`, `description`, `compatibility: opencode` |
| Dependencies   | Zero npm deps in shipped payload                                        | Optional package/bin workflow                    |
| Entry point    | `src/index.js` / `mdformat`; optional `lint.js` compatibility wrapper   | `src/index.js` or `mdformat` bin                 |

### Shipped Files

Ship from an explicit runtime allowlist, not from the whole repository. The installed user payload should contain only files that Hermes needs to load or execute the skill:

```
~/.hermes/skills/markdown-formatter/
├── SKILL.md                        # Skill definition (Hermes-compatible frontmatter)
├── src/
│   └── index.js                    # Canonical formatter CLI
├── lint.js                         # Optional compatibility wrapper only
├── scripts/
│   ├── check-fences.js             # Fenced code block validator
│   ├── check-structure.js          # Structural guard (NEW)
│   └── post-write.js               # Hermes hook (unchanged)
└── references/
    ├── table-validate.js           # Validate-only table guard, if retained
    ├── rules.md                    # Updated rule table
    └── .oxfmtrc.json               # Oxfmt config (NEW, replaces .markdownlint.json)
```

Before release, stage that allowlist into a temporary directory and review the file list. The release should fail if the staged install artifact contains planning docs, tests, fixtures, dev dependencies, generated local state, or repository-only governance files.

### Dev-Only Files (not shipped)

- `plan.md` — implementation planning only
- `AGENTS.md` — repository governance only; user-facing agent guard policy belongs in shipped `SKILL.md` and `references/rules.md`
- `README.md` — repository docs; if the installer can ship docs separately, keep them outside the runtime skill payload
- `test/` and fixtures — development validation only
- `.github/`, CI configs, coverage, and temporary reports — repository automation only
- `scripts/check-consistency.js` — release/development consistency check, not runtime formatter behavior
- `package.json`, lockfiles, and `node_modules/` — allowed only for local development if introduced; never required by the installed skill
- `.omo/`, `.open-mem/`, session logs, caches, and other generated agent/tool state — never shipped

### Install Artifact Verification

Add a release check that stages the exact install payload and verifies it before publishing:

1. Create an empty temp directory such as `/tmp/markdown-formatter-skill-install/`.
2. Copy only the allowlisted runtime files into `markdown-formatter/`.
3. Print the staged file list with sizes so reviewers can see exactly what users receive.
4. Fail if any dev-only path appears: `plan.md`, `AGENTS.md`, `README.md`, `test/`, `.github/`, `node_modules/`, package lockfiles, generated local state, or coverage artifacts.
5. Run the formatter CLI from the staged directory, not the repository checkout.
6. Run `--fences`, `--validate`, `--guard`, and `--check` against representative fixtures copied outside the staged skill payload.
7. Verify the staged skill still works with no repository root, no test directory, and no npm install.

### Zero-Dependency Approach

Use a staged zero-npm-dependency approach. Do not make auto-download part of the first implementation milestone.

Phase A resolution:

1. Check local `node_modules/.bin/oxfmt` for development/testing checkouts.
2. Check system PATH for `oxfmt`.
3. Fail with actionable instructions that name the supported install options.

Phase B, only after CLI/guard/tests pass:

1. Add cached binary resolution under `~/.cache/hermes-markdown-formatter/`.
2. Download via HTTPS with redirects, platform mapping, temp-file extraction, and no shell interpolation.
3. Add checksum/signature verification if Oxfmt publishes suitable artifacts.

**No npm package dependencies in the shipped skill payload.** A development `package.json` may exist outside the shipped skill only if it is clearly marked dev-only.

### Minimum Dependencies Policy

- **Zero npm dependencies** — the skill must remain pure Node.js
- `oxfmt` binary is resolved locally or from PATH first; dynamic fetch is a later hardening phase, not the first implementation
- No `npx` calls (replacing current markdownlint-cli2 approach)
- Keep pure Node.js scripts for supporting validations (fences, structure)

---

## Anti-Drift Safeguards

### What Must Stay Synchronized

| File Pair                       | What to Check                           |
| :------------------------------ | :-------------------------------------- |
| SKILL.md ↔ references/rules.md  | Formatter behavior matches config       |
| AGENTS.md ↔ references/rules.md | Formatter rules and safety checks align |
| README.md ↔ SKILL.md            | Version badge matches frontmatter       |
| .oxfmtrc.json ↔ rules.md        | Config matches documented rules         |
| CI workflow ↔ README            | Commands match documentation            |
| CLI flags ↔ README              | All flags documented, none stale        |

### Check-Consistency.js Updates

The existing `check-consistency.js` must be enhanced to:

1. Validate `.oxfmtrc.json` instead of `.markdownlint.json`
2. Check for stale shipped references to `markdownlint-cli2`, `npx markdownlint-cli2`, `format-tables.js` as formatter, and `markdown-lint` as primary skill identity
3. Validate oxfmt config keys match documented behavior
4. Check that structural guard is referenced where appropriate

### Stale Content Guards

After EVERY implementation phase, run:

1. Search for `markdownlint-cli2` in shipped files — flag as stale unless in migration notes
2. Search for `npx markdownlint` in shipped files — flag as stale unless in migration notes
3. Search for `format-tables` in shipped files — verify it is not the primary formatter
4. Search for `markdown-lint` in shipped metadata/docs — verify it is compatibility-only or historical
5. `node scripts/check-consistency.js` — must exit 0
6. Verify README version badge matches SKILL.md version
7. Verify all CLI flags are documented

---

## Risk Mitigation

| Risk                                                  | Mitigation                                                                                                                    |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| oxfmt produces different output than current pipeline | Keep `format-tables.js` as fallback/validate mode; regression test on all fixtures and compare structural invariants          |
| oxfmt has gaps vs markdownlint rules                  | Official docs list Markdown/MDX support, but markdownlint-specific policy rules may not be covered — document gaps explicitly |
| Structural drift from oxfmt                           | Pre/post structural guard catches fence/table drift and optional fenced-code content drift                                    |
| Embedded formatting changes code fences unexpectedly  | Make `embeddedLanguageFormatting` an explicit config/product decision; default to `"off"` for conservative first release      |
| Hermes hook system incompatibility                    | `post-write.js` is a shell hook, not affected by formatter change                                                             |
| Users with existing `markdown-lint` installs          | Provide migration note and optional compatibility wrapper                                                                     |
| Users with existing `.markdownlint.json` configs      | Formatter ignores it; docs explain `.oxfmtrc.json` replacement                                                                |
| Missing oxfmt binary                                  | Fail with actionable install/setup instructions in Phase A; add cached download only after wrapper behavior is proven         |

---

## Success Criteria

1. [ ] Formatter CLI tests pass (`node --test ...` or repository equivalent)
2. [ ] Legacy table validation tests still pass if table validation remains
3. [ ] `node skills/markdown-formatter/src/index.js --check test/kitchensink.md` — exits 0
4. [ ] `node skills/markdown-formatter/src/index.js --check test/hermes-intro.md` — exits 0
5. [ ] `node skills/markdown-formatter/src/index.js --fences .` — exits 0
6. [ ] `node skills/markdown-formatter/src/index.js --validate .` — exits 0
7. [ ] `node scripts/check-consistency.js` — exits 0
8. [ ] oxfmt idempotent: running formatter twice on same file produces same output
9. [ ] Staged install artifact contains only allowlisted runtime files and excludes planning, tests, dev dependencies, generated local state, and repository-only governance files
10. [ ] Staged install artifact works without the repository root, test directory, `node_modules/`, or npm install
11. [ ] No stale references to `markdownlint-cli2` or `npx markdownlint` in any shipped file
12. [ ] No stale `markdown-lint` identity remains except explicit migration/compatibility text
13. [ ] Final agent guard policy review completed across AGENTS.md, SKILL.md, references/rules.md, README agent sections, hook examples, CI docs, and migration notes
14. [ ] Version badge in README matches SKILL.md version
15. [ ] All CLI flags documented in README and AGENTS.md
16. [ ] Structural guard detects fence style changes (tilde→backtick) in test fixture
17. [ ] Structural guard detects table column count changes in test fixture
18. [ ] Structural guard detects or intentionally permits tagged fenced-code content changes according to the documented `embeddedLanguageFormatting` policy
19. [ ] Plan/docs cite <https://github.com/CodeSigils/markdown-oxc-spike> as the current Markdown/Oxfmt evidence base

---

## TODOs

- [ ] **Phase 1**: Rename skill identity and define migration boundary
- [ ] **Phase 2**: Reuse spike findings and evaluate Hermes-specific oxfmt coverage against current pipeline
- [ ] **Phase 3**: Port and test structural guard before full formatter rewrites
- [ ] **Phase 4**: Integrate oxfmt into formatter CLI with local/PATH binary resolution only
- [ ] **Phase 5**: Update consistency checker for formatter identity and oxfmt
- [ ] **Phase 6**: Update all docs (SKILL.md, AGENTS.md, README.md, rules.md)
- [ ] **Phase 7**: Define release allowlist, minimum-dependency shipping strategy, and install artifact verification
- [ ] **Phase 8**: Run all tests and verify staged install artifact behavior
- [ ] **Phase 9**: Review final agent guard policies for stale instructions before release

---

## Final Verification Wave

- [ ] **F1 — Consistency Check**: `node scripts/check-consistency.js` exits 0
- [ ] **F2 — All Tests Pass**: `node test/format-tables.test.js` — all tests pass
- [ ] **F3 — Pipeline Check**: formatter CLI `--check` exits 0 on all fixtures
- [ ] **F4 — Install Artifact Audit**: Staged install payload contains only allowlisted runtime files and excludes planning, tests, dev dependencies, generated local state, and repository-only governance files
- [ ] **F5 — Anti-Drift Audit**: No stale references to markdownlint-cli2, npx, format-tables (as primary formatter), or markdown-lint (as primary identity) in shipped files
- [ ] **F6 — Agent Guard Policy Review**: AGENTS.md, SKILL.md, references/rules.md, README agent sections, hook examples, CI docs, and migration notes match final behavior and contain no stale transitional instructions
- [ ] **F7 — Evidence Link Check**: AGENTS.md, README.md, and rules/reference docs point formatter maintainers to <https://github.com/CodeSigils/markdown-oxc-spike>
