# Changelog

Release notes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
categories and semantic versioning.

## [Unreleased]

Add upcoming user-visible changes here before release. Keep entries concise,
link to the relevant issue or pull request, and move them into a versioned
section when the release is cut.

## [1.5.1] - 2026-08-23

### Fixed

- Hardened fenced-code and table parsing around escaped delimiters and malformed
  inline code.
- Made guarded writes atomic and preserved file permissions.
- Published the exact CI-tested npm tarball with provenance.

### Changed

- Improved release validation, payload synchronization, and CI artifact flow.
- Expanded documentation and regression coverage for table and fence edge cases.

[Unreleased]: https://github.com/CodeSigils/zero-md-formatter/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/CodeSigils/zero-md-formatter/releases/tag/v1.5.1
