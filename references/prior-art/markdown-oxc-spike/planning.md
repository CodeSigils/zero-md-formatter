# Markdown Oxc Spike Plan

> **STALE — Historical planning document (May 2026).** This spike repository was the precursor to the current
> [`agents-markdown-formatter`](https://github.com/CodeSigils/agents-markdown-formatter) skill. All research goals were
> achieved; the findings informed the production implementation.
>
> Outdated claims (paths, repo status, scripts) are marked inline. See `skills/markdown-formatter/SKILL.md` for the
> active skill.

## Purpose

Use this repo as a small, revisitable spike for testing whether Oxfmt can help with agent-authored Markdown formatting
without weakening safety guarantees.

> **[STALE]** — The spike succeeded. The current production skill replaced this repository.

## Current direction

The repo is exploring a lighter Markdown formatter or guarded Oxfmt wrapper, not a new Markdown linter.

Stable framing lives in `direction.md` (this directory).

Research findings live in `findings.md` (this directory).

## External Resources to be Aware off

<https://oxc.rs/docs/guide/usage/formatter.html> <https://deepwiki.com/oxc-project/oxc>
<https://deepwiki.com/search/can-oxc-format-markdown_fb17f280-b385-49a2-9b4f-5db626653b4e?mode=fast>
<https://api.github.com/repos/oxc-project/oxc/contents/apps/oxfmt/conformance/fixtures/edge-cases>

## Current conclusions

- Oxlint is out of scope for Markdown policy.
- Oxfmt is the candidate under test because it formats Markdown and MDX.
- Oxfmt should be treated as a formatter candidate, not a lint-rule engine.
- Do not add an active `.markdownlint.json`; Oxfmt does not read it.
- Keep `.oxfmtrc.json` formatter-only.
- Every fixture must pass a second-pass idempotence check and structural guard checks.
- Oxfmt is not a substitute for explicit table and fence safety validation.
- Structural guardrails for fence preservation and table structure were implemented in the spike's `check-fixture.js`
  (removed from prior-art; superseded by production `check-structure.js`, `check-fences.js`, `check-tables.js`, and
  `check-pipes.js`).

## Current workflow

For each fixture:

1. Add a source fixture under `fixtures/source/`.
2. Add the fixture to `test/check-fixture.test.js`.
3. Run `npm test` and watch the fixture fail before the source file exists.
4. Add the source fixture.
5. Run the fixture harness (which now includes structural guards).
6. Record stable findings in `docs/findings.md`.

## Completed fixture coverage

| Fixture                                       | Status | Finding summary                                                                  |
| :-------------------------------------------- | :----- | :------------------------------------------------------------------------------- |
| `fixtures/source/html-comment-after-list.md`  | pass   | Oxfmt was idempotent on the issue `#21314` pattern                               |
| `fixtures/source/table-escaped-pipes.md`      | pass   | Escaped pipes preserved; unescaped inline-code pipe is hazardous                 |
| `fixtures/source/table-semantic-alignment.md` | pass   | `:---`, `---:`, and `:---:` markers preserved                                    |
| `fixtures/source/fence-blank.md`              | pass   | Blank fences preserved; empty fence gains blank line                             |
| `fixtures/source/fence-nested.md`             | pass   | Nested fences preserved; tilde fence normalized to backticks                     |
| `fixtures/source/fence-language-tags.md`      | pass   | Info strings preserved; tagged code content may be formatted                     |
| `fixtures/source/safe-formatting-basics.md`   | pass   | Oxfmt left trailing spaces, heading spacing, list spacing untouched              |
| `fixtures/source/markdown-in-js-template.md`  | pass   | Oxfmt preserved structure and formatted code inside JavaScript template literals |
| `fixtures/source/task-lists.md`               | pass   | Oxfmt preserved task list checkboxes and formatting; idempotent                  |

## Next steps

> **[STALE]** — All spike goals completed. Next steps are handled by the production skill.

1. Structural guardrails implemented in production scripts (see "Current conclusions" above).
2. Benchmarking completed — the current skill uses oxfmt with structural guards.
3. Architecture documented in `skills/markdown-formatter/SKILL.md`.

## Open questions

> **[ALL RESOLVED]** — Questions answered by production experience.

- Is Oxfmt too broad for a lightweight Markdown formatter?
- Should this repo grow a tiny custom safe formatter for comparison?
- Should generated first-pass outputs become committed snapshots later, or stay ignored until the harness stabilizes?
