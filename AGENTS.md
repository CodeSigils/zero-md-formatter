# Agents Markdown Formatter Instructions

This repository builds a formatter-first Markdown skill/tool for AI agents.

## Agent contract

Agents working here MUST:

1. Read `plan.md` before implementation work.
2. Treat `references/prior-art/**` as historical/reference material unless a task explicitly promotes code into the active implementation.
3. Keep the installed runtime payload separate from repository-only planning, tests, fixtures, and development tooling.
4. Build and verify the staged install artifact before claiming user-facing shipping readiness.
5. Run Markdown validation after editing repository docs and plans.
6. Do not run doc-formatting tools over raw formatter fixtures unless the task is explicitly testing compatibility on a copy.
7. Review agent guard policies at the end of implementation so shipped instructions do not contain stale transitional commands, paths, or identities.

## Active implementation target

- Runtime payload: `skills/markdown-formatter/`
- Primary CLI: `skills/markdown-formatter/src/index.js`
- Formatter: Oxfmt resolved from local development install or PATH for the first shippable pass
- Safety guard: structural pre/post checks before full formatter rewrites

## Files that must not ship in the runtime payload

- `plan.md`
- `AGENTS.md`
- `README.md` unless docs are intentionally shipped separately
- `references/prior-art/`
- `test/`
- `node_modules/`
- lockfiles
- generated agent state such as `.omo/`, `.open-mem/`, and `.opencode/`
