# Changelog

## Unreleased

- **BREAKING: All CLI modes now BLOCK on adjacent pipes (`||`) in tables instead of passing through.**
  oxfmt cannot safely handle double-pipe GFM tables — it expands column count and corrupts the
  entire table. The previous pass-through behavior (diagnostic-only, exit 0) let oxfmt reach
  corrupted tables. Now `--check`, `--fix`, `--dry-run`, `--guard`, and `--validate` all fail
  with a clear error before oxfmt is invoked. The `--fences` mode (code fences only) is unaffected.
- Add `hasAdjacentPipes()` export to `check-pipes.js` for programmatic use.
- Add `test/fixtures/violations/table-adjacent-pipes.md` — violations fixture for || patterns.
- **BREAKING: check-pipes.js now treats `||` as valid GFM empty-cell syntax (exit 0, diagnostic-only).** Function
  renamed `detectDoublePipes` → `detectAdjacentPipes`. Diagnostic messages reframed from "phantom empty column" to
  "valid GFM empty cell".
  _This entry superseded: blocking is now done by index.js before oxfmt runs._
- Move `table-double-pipe.md` from violations/ to pipe-safety/ (renamed `table-empty-cells.md`). Not oxfmt-clean —
  tested by structural guards only, excluded from CI format check.
- Update `scripts/check-all.js`: remove `check-pipes` from expected violations for double-pipe fixture.
- Clarify that fenced code block contents are ignored by table validation, table snapshots, pipe-safety checks, and
  automatic table repair.
- Qualify the agent stale-information checklist so `references/**` is only required when that directory exists.

## v1.0.7

- Make table validation, structural snapshots, pipe-safety checks, and automatic table repair ignore table-shaped text
  inside fenced code blocks.
- Make read-only flags absolute so `--fix --dry-run` and `--check --guard` cannot repair-write files before their
  read-only handling runs.
- Restore the true pre-repair file content if guarded write-mode formatting later fails or detects structural drift.

## v1.0.6

- Tighten `check-pipes.js` so it scans all adjacent-pipe occurrences on a table row, catching structural `||` even when
  an earlier `||` appears inside inline code.
- Detect adjacent-pipe artifacts in no-leading-pipe GFM table rows when the row has enough pipe structure to be
  table-like.
- Make `scripts/release.sh` push HEAD and the annotated tag before creating the GitHub Release with `--verify-tag`.
- Align CLI help, consistency checks, staged-install shell robustness, and release documentation with current behavior.

## v1.0.5

- Run `check-pipes.js` as a preflight for `--check`, `--fix`, `--dry-run`, and `--guard` before invoking `oxfmt`. This
  refuses adjacent-pipe table artifacts before the formatter can rewrite malformed tables.
- Add CLI integration regressions proving plain `--fix`, plain `--dry-run`, and plain `--check` fail double-pipe tables
  read-only/in-place safely instead of reporting or applying a formatter rewrite.

## v1.0.4

- Add `check-pipes.js`: detects adjacent double-pipe artifacts (`||`) in GFM table rows. Leading `||` creates phantom
  empty first columns, internal `||` creates empty cells, trailing `||` creates phantom last columns. Correctly ignores
  escaped pipes and inline code spans. Wired into `--validate`, `--verify`, `--guard`, and `--doctor` checks.
- Add 8 unit tests for double-pipe detection covering leading, internal, trailing, escaped pipes, inline code, valid
  tables, and non-table lines.
- Add violation fixture `table-double-pipe.md` with all 3 patterns (4 total violation fixtures).
- Document `check-pipes.js` in README shipped-payload tree and safety policy section.
- Update `scripts/staged-install-verify.sh` allowlist to include `check-pipes.js`.

## v1.0.3

- Add `repairTableColumns` to `--fix`: auto-pads GFM table rows to match the largest column count among header,
  delimiter, and data rows. Repairs the "header has 2 columns but separator has 3" pattern (and similar) before oxfmt
  formatting. The repair is conservative — adds empty trailing cells only, never removes columns.
- Add 11 unit tests covering structural valid, short data rows, short header, short delimiter, the original
  2-col/3-col-separator malformation, pipe-free content, inline-code pipes, multi-row tables, header+delimiter-only
  tables, adjacent independent tables, and data rows without a leading pipe.
- Refactor `isWriteMode` from inline inversion of read-only flags to a named function backed by a `READ_ONLY_FLAGS` set.
  Adding a new read-only flag now requires only one addition to the set.
- Document the no-trailing-pipe edge case in `repairTableColumns` as a comment.
- Fix `package-lock.json` devDependency entry for oxfmt from caret (`^0.56.0`) to exact (`0.56.0`), matching
  `package.json`.
- Bump oxfmt from 0.54.0 to 0.56.0. Cross-config validation confirms all 9 spike fixtures remain idempotent; 8 of 9 are
  byte-identical to source under the production config. Update tested-maximum in `--doctor` to 0.56.0.
- Harden formatter child process spawning: add `getSpawnOptions()` helper for consistent encoding, timeout, and
  environment handling. Refactor `getOxfmtExecutableNames()` and `getOxfmtPathCandidates()` to accept platform/cwd
  options for testability.
- Add `OXFMT_MAX_VERSION`, `semverCompare()`, and `isSupportedOxfmtVersion()` to `--doctor`: warns when the installed
  oxfmt binary exceeds the spike-tested maximum. Document "formatter as a commodity" architecture in README.
- Add "Fence policy" section to SKILL.md documenting structural validation rules: bare language-less fences are valid,
  whitespace-only and leading-whitespace info strings are invalid, unclosed fences are invalid, post-format fence drift
  triggers rollback.
- Fix tab-only fence info string detection in `check-structure.js` (`fence.info.includes(" ")` →
  `fence.info.length > 0`) so that fences like ` ```\t ` are properly flagged as invalid, matching `check-fences.js`
  behavior.
- Add `--help` integration test; clean up `mkdirSync` import in `cli.test.js`.
- Remove fragile `relative()` path round-trip in `check-all.js` subdirectory recursion.

## v1.0.2

- Add README explanation for the problem this repository cures: unstable AI-authored Markdown, uncontrolled prose
  wrapping, fragile tables, and embedded code that should remain untouched.
- Document the formatting philosophy: normalize Markdown prose, keep embedded content opaque, and enforce consistency
  through check-mode workflows.
- Document table safety as repository-owned structural guard behavior rather than `.oxfmtrc.json` configuration.
- Add a CI status badge to the README.
- Rework the README opening for discoverability with a quick start and comparison against adjacent Markdown tools.
- Sharpen package metadata with agent-safe Markdown formatter keywords.
- Update packaged skill description and tags for Hermes-side discovery.
- Update GitHub repository description and topics for search discovery.
- Run CI from `.node-version` while keeping the documented runtime requirement at Node.js >=20.
- Clarify anti-drift checks so runtime Node compatibility, package `engines.node`, and CI validation runtime are tracked
  separately.
- Document that routine CI LTS bumps update only `.node-version`; installed runtime-minimum changes remain deliberate
  compatibility changes.
- Add read-only `--doctor` diagnostics for Node.js, Oxfmt, bundled config, and runtime payload readiness.
- Correct release badge and packaged skill version metadata after the superseded `v1.0.1` tag was cut with stale
  `v1.0.0` version metadata.
- Document release posture after `v1.0.0`: repository-only changes do not alter the shipped runtime payload, while
  runtime payload changes require a new release decision before published-readiness claims.

## v1.0.1

- Superseded by `v1.0.2`; this tag included the `--doctor` runtime changes but retained stale `v1.0.0` release metadata.

## v1.0.0

- Initial formatter-first Hermes-compatible Markdown skill.
- Support GFM and MDX files through Oxc `oxfmt`.
- Add structural guardrails for fences and GFM tables.
- Add rollback-safe `--fix --guard` behavior when post-format structural drift is detected.
- Add read-only `--check`, `--verify`, `--fences`, and `--validate` workflows.
- Keep the shipped runtime payload limited to the skill definition, CLI, runtime config, and guard scripts.
- Pin development `oxfmt` through `package.json` while keeping npm dependencies out of the installed runtime payload.
