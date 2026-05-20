# Agents Markdown Formatter Instructions

This repository builds a formatter-first Markdown skill/tool for AI agents.

## Agent contract

Agents working here MUST:

1. Read `plan.md` before implementation work.
2. Treat `references/prior-art/**` as historical/reference material unless a task explicitly promotes code into the active implementation.
3. Keep the installed runtime payload separate from repository-only planning, tests, fixtures, and development tooling.
4. Build and verify the staged install artifact before claiming user-facing shipping readiness.
5. Check edited Markdown files with the repository's Oxc/Oxfmt path, not external Markdown formatters or linters.
6. Do not run doc-formatting tools over raw formatter fixtures unless the task is explicitly testing compatibility on a copy.
7. Do not use external Markdown formatters or linters as repo validation because that defeats this repository's purpose.
8. Guard against documentation drift and stale instructions whenever behavior, commands, paths, identity, configuration, validation policy, install payload, or release process changes.
9. Consult the Markdown Oxc spike before changing formatter behavior, structural guards, Oxfmt config, fixture policy, embedded formatting policy, or release safety checks.
10. Review agent guard policies at the end of implementation so shipped instructions do not contain stale transitional commands, paths, or identities.

## Active implementation target

- Runtime payload: `skills/markdown-formatter/`
- Primary CLI: `skills/markdown-formatter/src/index.js`
- Formatter: Oxfmt resolved from local development install or PATH for the first shippable pass
- Safety guard: structural pre/post checks before full formatter rewrites

## Markdown validation policy

This repository exists to build and verify an Oxc/Oxfmt-based Markdown formatter. Agents MUST NOT use unrelated external Markdown formatters or linters as repository validation because doing so can hide product gaps and defeat the purpose of the repo.

Do not use these as active validation for repository Markdown:

- `markdownlint`, `markdownlint-cli`, or `markdownlint-cli2`
- Prettier directly
- mdformat or other Markdown formatters
- editor auto-formatters
- external skill/tool wrappers that do not call this repository's Oxc/Oxfmt path

Use the repository-owned validation path instead:

1. Once implemented, use `node skills/markdown-formatter/src/index.js --check <file>`.
2. Until the wrapper exists, use Oxfmt directly only for checking repository docs: `oxfmt --check <file>`.
3. If Oxfmt is unavailable, report that Oxc/Oxfmt validation is unavailable instead of silently substituting another Markdown linter or formatter.

Exception: raw formatter fixtures under `test/fixtures/` or `references/prior-art/**` may only be formatted when the task explicitly tests formatter behavior on a copy.

## Drift and stale information guard

When changing behavior, commands, file paths, skill identity, Oxfmt configuration, validation policy, install payload, release process, or supported workflows, update every affected source of truth in the same change.

Check these files and directories for drift before reporting completion:

- `README.md`
- `AGENTS.md`
- `plan.md`
- `skills/markdown-formatter/**`
- `references/**`
- `test/**`
- staged install and release scripts, once added
- changelog or release notes, once added

Before completing a change, explicitly check for stale or mismatched references to:

- old `markdown-lint` identity used as active product wording
- `markdownlint-cli2` or `npx markdownlint` described as the active formatter
- old formatter entry points or commands
- stale paths copied from `hermes-markdown-lint-skill`
- stale paths copied from `opencode-markdown-formatter-skill`
- prior-art references accidentally described as active runtime code
- generated agent state listed as shippable
- mismatch between `.oxfmtrc.json`, docs, tests, and CLI behavior

Historical, compatibility-only, and prior-art references may remain, but they must be labeled clearly so future agents do not treat them as the active workflow.

## Markdown Oxc Spike Awareness (MANDATORY)

Agents **MUST** consult the Markdown Oxc spike before making any changes related to:
- formatter behavior
- structural guards
- Oxfmt config
- fixture policy
- embedded formatting policy
- release safety checks

Consult **both** sources:
- <https://github.com/CodeSigils/markdown-oxc-spike.git>
- `references/prior-art/markdown-oxc-spike/`

Treat the spike as prior art, not active runtime code. Use **official Oxfmt docs** as the source of truth for current CLI, configuration, and support claims. Use the spike for risk areas, fixtures, and guard requirements.

**MANDATORY — Check the spike findings before proceeding with any of the above changes:**

- idempotence requirements
- fence drift
- table column drift
- escaped pipe hazards
- semantic table alignment
- tagged fence content formatting
- embedded Markdown-in-JS/MDX behavior
- generated work/result directory handling
- Oxfmt configuration limits versus markdownlint-style policy rules

## Prior-art promotion policy

`references/prior-art/**` is historical/reference material. Do not promote code, config, commands, or docs from prior art into active implementation without reviewing and adapting them to this repository's current identity:

- active repository: `agents-markdown-formatter`
- active payload: `skills/markdown-formatter/`
- active config: `.oxfmtrc.json`
- planned active CLI: `skills/markdown-formatter/src/index.js`

## Completion checklist

Before claiming a repository behavior or documentation change is complete:

1. Read `plan.md`.
2. Check whether `AGENTS.md` still matches the change.
3. Check `README.md` when user-facing behavior changes.
4. Check `skills/markdown-formatter/SKILL.md` once it exists.
5. Check `references/rules.md` once it exists.
6. Check `.oxfmtrc.json` when formatting behavior changes.
7. Check copied spike prior art when Oxfmt behavior or guard behavior changes.
8. Run Oxc/Oxfmt validation on edited docs.
9. Run `scripts/check-consistency.js` once it exists.
10. Confirm `git status --short` has no generated agent state.

## Files that must not ship in the runtime payload

- `plan.md`
- `AGENTS.md`
- `README.md` unless docs are intentionally shipped separately
- `references/prior-art/`
- `test/`
- `node_modules/`
- lockfiles
- generated agent state such as `.omo/`, `.open-mem/`, and `.opencode/`


<!-- open-mem-context -->
## Project Activity (auto-generated by open-mem)

### ./
| ID | Type | Title | Date |
|----|------|-------|------|
| 05699a73-e29b-4e70-9347-2c9bbe4d200f | 🔄 refactor | Refactoring Hermes Markdown Lint Skill to Formatter Skill using Oxc | 2026-05-20 |
| f7632741-223d-4077-97a3-5d1a2150ff79 | 🔄 refactor | New Markdown Formatter Skill for AI Agents | 2026-05-20 |

**Key concepts:** refactoring, formatter-first, oxfmt, zero-install, structural-guardrails, dependency-management, release-allowlist, minimum-dependency, refactor

### skills/markdown-formatter/
| ID | Type | Title | Date |
|----|------|-------|------|
| cb9afd2b-6a25-4f80-9bdb-c9404008405c | 🔵 discovery | Empty directory found | 2026-05-20 |

**Key concepts:** .gitkeep

💡 *Use `mem-find` to search full details. Use `mem-create` to save important decisions.*
<!-- /open-mem-context -->
