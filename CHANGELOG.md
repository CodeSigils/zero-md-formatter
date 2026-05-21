# Changelog

## Unreleased

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
- Clarify that `--doctor` is an unreleased runtime payload change after `v1.0.0`; a new runtime release decision is
  required before claiming published installs include it.
- Document release posture after `v1.0.0`: repository-only changes do not alter the shipped runtime payload, while
  runtime payload changes require a new release decision before published-readiness claims.

## v1.0.0

- Initial formatter-first Hermes-compatible Markdown skill.
- Support GFM and MDX files through Oxc `oxfmt`.
- Add structural guardrails for fences and GFM tables.
- Add rollback-safe `--fix --guard` behavior when post-format structural drift is detected.
- Add read-only `--check`, `--verify`, `--fences`, and `--validate` workflows.
- Keep the shipped runtime payload limited to the skill definition, CLI, runtime config, and guard scripts.
- Pin development `oxfmt` through `package.json` while keeping npm dependencies out of the installed runtime payload.
