# Refactoring Plan: Markdown Formatter Skill

## Goal

Refactor the markdown-formatter skill from a fragile shell script (`lint.sh`) to a robust Node.js-based CLI that:

- Uses Oxc's formatter (`oxfmt`) as the primary formatting engine
- Preserves and enhances the structural guardrails from `markdown-oxc-spike` (<https://github.com/CodeSigils/markdown-oxc-spike>)
- Follows best practices for CLI tools (argument parsing, error handling, cross-platform compatibility)
- Maintains compatibility with existing workflows and interfaces

**IMPORTANT: All agents working on this refactor MUST thoroughly read and understand the markdown-oxc-spike repository before making changes.** The spike contains critical findings about structural guardrails, fence/table drift detection, and the validated architecture that this skill must preserve. Working without this knowledge risks weakening the skill's safety guarantees.

## Current State Analysis

The skill currently used to rely on:

1. `lint.sh` - A bash script with complex cross-platform npx resolution logic
2. Three-step pipeline: `fix-tables.js` → `pad-tables.js` → `markdownlint-cli2`
3. Structural guard: `check-structure.js` (via `--guard` flag)
4. Separate utilities for fences (`check-fences.sh`) and validation

Issues with current approach:

- Shell script fragility (complex path resolution, platform-specific logic)
- Multiple process spawns (bash → node → npx → etc.)
- Difficult to maintain and extend
- No unified error handling or logging

## Proposed Architecture

Based on findings from `markdown-oxc-spike` and the user's goal to use Oxc for formatting:

```
┌─────────────────────┐
│   Structural Guard  │◄─────┐
│ (check-structure.js) │     │
└─────────────────────┘     │
          ▼                 │
┌─────────────────────┐     │
│   Oxfmt Formatter   │     │
│   (with .oxfmtrc.json)│     │
└─────────────────────┘     │
          ▼                 │
┌─────────────────────┐     │
│  Structural Guard   │     │
│   (re-run)          │     │
└─────────────────────┘     │
          ▼                 │
┌─────────────────────┐     │
│ Markdownlint CLI2   │     │
│   (skill config)    │     │
└─────────────────────┘     │
          ▼                 │
┌─────────────────────┐     │
│   Success/Error     │     │
└─────────────────────┘     │
```

## Implementation Plan

### Phase 2: Oxfmt Integration

1. Use project's `.oxfmtrc.json` (create if missing)
2. Run oxfmt directly from node_modules/.oxfmt (avoid npx for better performance and reliability)
3. Verify idempotence by running oxfmt twice and comparing (per spike findings)
4. Only proceed if oxfmt output is stable
5. Decision: Use direct execution rather than npx after evaluating performance and reliability trade-offs

### Phase 3: Structural Guard Enhancement

1. Integrate `check-structure.js` as a library (not just child process) for better performance
2. Add detailed logging of structural changes when detected
3. Ensure guard runs both before and after formatting steps

### Phase 4: Testing and Validation

1. Test against all fixtures from `markdown-oxc-spike`
2. Ensure idempotence: running twice yields same result
3. Verify no structural drift on test fixtures
4. Compare output with current `lint.sh` for regression testing

### Phase 5: Documentation and Migration

1. Update `SKILL.md` with new usage instructions
2. Update `README.md` with new CLI details
3. Provide migration path for existing users
4. Add contributing guidelines for the new codebase

## Risk Mitigation

- **Backward compatibility**: Keep `lint.sh` functional during transition, then replace
- **Gradual rollout**: Feature flag to use new CLI vs old script
- **Comprehensive testing**: Test suite covering all current functionality
- **Fallback mechanism**: If new CLI fails, suggest reverting to old script

## Success Criteria

1. New CLI produces identical output to current `lint.sh` for all test fixtures
2. Structural guard catches all fence/table drift scenarios from spike
3. Oxfmt integration shows measurable performance improvement
4. CLI works on major platforms (macOS, Linux, Windows WSL)
5. Error messages are clear and actionable
6. Code follows Node.js best practices (async/await, proper error handling)
7. README.md, AGENTS.md, CHANGELOG.md, and SKILL.md are checked after every implementation to guard against inaccurate and stale information

## Open Questions - RESOLVED

**Decision: Use oxfmt for markdown formatting**

1. ~~Should we keep the separate `fix-tables.js` and `pad-tables.js` steps, or does oxfmt handle table formatting adequately?~~
   - RESOLVED: Use oxfmt for markdown. It delegates to Prettier which handles tables adequately for GFM.
   - Structural guard (`check-structure.js`) must run before and after oxfmt to catch any drift.

2. ~~How to handle the `.oxfmtrc.json` configuration? Should we provide a default or require user configuration?~~
   - RESOLVED: Create default `.oxfmtrc.json` with sensible markdown defaults if missing.

3. ~~Should we evaluate oxlint as an alternative to markdownlint-cli2 for the final linting step?~~
   - RESOLVED: NO. oxlint is JS/TS only (Issue #18407). Cannot use for markdown linting.
   - Keep markdownlint-cli2 for the final lint/check step after oxfmt.

4. ~~Should the new CLI replace `lint.sh` entirely or coexist?~~
   - RESOLVED: Coexist during validation period, then replace.

## Implementation Decision

**Architecture:**

```
Structural Guard (pre-check) → oxfmt → Structural Guard (post-check) → markdownlint-cli2 → Success/Error
```

- oxfmt handles primary markdown formatting (including tables)
- Structural guard catches any fence/table drift from oxfmt (important: oxfmt→Prettier has non-idempotent edge cases)
- markdownlint-cli2 provides GFM-specific lint rules beyond what oxfmt covers

## Next Steps - COMPLETED

1. ~~Fix src/index.js to use oxfmt properly~~ - DONE: Fixed syntax, added isMarkdownFile, fixed getOxfmtBin path
2. ~~Implement oxfmt binary path resolution~~ - DONE: Uses node_modules/.bin/oxfmt
3. ~~Add .oxfmtrc.json default template creation~~ - DONE: ensureOxfmtRc() creates default
4. ~~Wire structural guard (pre/post) around oxfmt~~ - DONE: processFile runs guard pre/post
5. ~~Keep markdownlint-cli2 for final GFM lint~~ - REMOVED: Using oxfmt only (user decision)
6. ~~Add tests comparing output with lint.sh for regression~~ - Tests pass: `node --test test/test-js.mjs`

## Post-Implementation Status

- package.json: Removed markdownlint-cli2, added bin entry for mdformat
- src/index.js: Working CLI with oxfmt, structural guard, dry-run
- .gitignore: Added .omo/
- Tests: 39 passing (29 unit + 10 CLI)

## Shipping Strategy

### Current Architecture

The skill repo contains:

- `SKILL.md` - AI instructions for formatting markdown
- `src/index.js` - CLI for batch formatting
- `scripts/check-structure.js` - Structural guard
- `node_modules/` - Dependencies (oxfmt)

### Installation (current)

```bash
git clone ... ~/.config/opencode/skills/markdown-formatter
cd ~/.config/opencode/skills/markdown-formatter
pnpm install  # Install oxfmt
```

### Alternative: Pre-built Binary (for minimal dependencies)

Download oxfmt binary from GitHub releases - no pnpm needed:

- User just needs Node.js 18+ to run the CLI
- Binary bundled or fetched on first run

### Alternative: Pure SKILL.md (no CLI code)

Other skills (code-review-checklist, skill-creator) are just SKILL.md files with instructions.
The AI follows the instructions using tools available in its environment.

- No CLI code needed
- User asks AI to format markdown, AI does it
- But no batch CLI for CI/CD

### Decision: Keep CLI for batch use

The CLI is valuable for:

- CI/CD pipelines
- Batch formatting all files in a repo
- Pre-commit hooks

**Recommendation**: Ship with pre-built binary or simple install instructions.

### Test Handling

- Tests exist in `test/` directory
- Run tests during development: `node --test test/test-js.mjs test/cli.test.mjs`
- Tests are NOT shipped to user's folder (development artifact)
- User can run tests if they want: clone + pnpm install + npm test

## Shipping Strategy

### Two-Repo Setup

**Dev Repo** (this repo): Full development setup

- Contains: SKILL.md, src/, scripts/, test/, references/, all docs
- Purpose: Development, testing, CI/CD

**Ship to Users**:

```
~/.config/opencode/skills/markdown-formatter/
├── SKILL.md              # Required
├── src/index.js          # CLI (includes zero-install logic)
├── scripts/check-structure.js  # Structural guard
├── package.json          # Bin entry (optional)
└── .oxfmtrc.json         # Config
```

**No node_modules needed** - CLI downloads oxfmt on first run.

### Zero-Install (No Dependencies)

The CLI automatically downloads and caches oxfmt:

- First run: downloads from GitHub releases (~2MB)
- Caches in: `~/.cache/opencode-markdown-formatter/`
- Subsequent runs: uses cached binary

Fallback chain:

1. Check local node_modules (if user ran pnpm install)
2. Check system oxfmt on PATH
3. Download & cache from GitHub releases

### What to Exclude (Dev-only)

- `test/` - Dev tests
- `plan.md` - Planning doc
- `AGENTS.md` - Dev docs
- `CHANGELOG.md` - Dev history
- `CONTRIBUTING.md` - Dev guidelines
- `references/` - Old pipeline (not used)
- `scripts/check-fences.sh` - Not used

### Installation for Users (Zero-Install)

```bash
git clone https://github.com/CodeSigils/opencode-markdown-formatter-skill.git ~/.config/opencode/skills/markdown-formatter

# First run downloads oxfmt automatically (~2MB)
~/.config/opencode/skills/markdown-formatter/src/index.js README.md
```

No `pnpm install` needed. Optional: if user wants to use pnpm-installed oxfmt instead of downloading.

## Future Work (Optional)

- Add more integration tests for oxfmt output
- Deprecate lint.sh in favor of src/index.js after validation

## Markdown-oxc-spike Findings (Reference)

### package.json (oxfmt 0.50.0)

```json
{
  "devDependencies": {
    "oxfmt": "0.50.0"
  },
  "scripts": {
    "fmt": "oxfmt --write",
    "fmt:check": "oxfmt --check fixtures/source/*.md",
    "fmt:list": "oxfmt --list-different"
  }
}
```

### .oxfmtrc.json (recommended config)

```json
{
  "tabWidth": 2,
  "endOfLine": "lf",
  "insertFinalNewline": true,
  "proseWrap": "preserve",
  "ignorePatterns": ["node_modules/**", "fixtures/results/**"]
}
```

### Validated Architecture (from docs/direction.md)

```
markdownlint-cli2        -> policy rules
custom fence validator   -> blocking safety
custom table validator   -> blocking safety
guarded Oxfmt wrapper    -> formatting supplement with idempotence and structure checks
```

### Key Findings

- oxfmt delegates to Prettier for markdown formatting
- oxlint is JS/TS only (not for markdown) - confirmed
- Structural guard essential: oxfmt can alter fence style, interpret table pipes
- Must verify idempotence: run oxfmt twice to ensure convergence
