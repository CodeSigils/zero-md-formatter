# Agents Markdown Formatter

Formatter-first Markdown skill/tooling for AI agents.

This repository starts clean from the `hermes-markdown-lint-skill` migration plan instead of renaming the old lint-focused repository in place. The goal is a minimum-dependency Markdown formatter powered by Oxfmt plus structural guardrails for fences, tables, and embedded-code blast radius.

## Current status

Planning and prior-art bootstrap only. Implementation should start with the runtime allowlist/staged install check, then the structural guard, then Oxfmt integration.

## Prior art copied into this repo

- `plan.md` — active implementation plan.
- `references/prior-art/opencode-markdown-formatter-skill/` — prior structural guard and CLI ideas. Reference only; do not treat as active runtime code.
- `references/prior-art/markdown-oxc-spike/` — Oxfmt findings and fixture harness. Reference only.
- `test/fixtures/` — representative raw formatter fixtures copied from the spike and current lint skill repo.

## Dependency policy

The shipped skill payload must have no npm runtime dependencies. Development tooling may exist in the repository only when clearly marked dev-only and excluded from the staged install artifact.

## Implementation entry point

Follow `plan.md`. The first implementation commit should establish:

1. `skills/markdown-formatter/` as the runtime payload boundary.
2. A release allowlist or staged install verification script.
3. No active legacy `markdown-lint` runtime path.
