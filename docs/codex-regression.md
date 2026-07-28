# Codex behavioral regression

The deterministic formatter tests prove CLI behavior. This optional harness
checks whether an agent actually follows the shipped skill in two representative
workflows:

1. use `--fix --guard` to format a dirty GFM table; and
2. preserve a file when an unescaped inline-code pipe triggers the safety gate.

Normal CI runs only the fixture and grader self-tests:

```bash
npm run test:behavior
```

Run the live evaluation deliberately with an authenticated Codex CLI:

```bash
node scripts/run-codex-regression.js \
  --fixture-dir /tmp/zero-md-fixtures \
  --output-dir artifacts/codex
```

Use fresh fixture and output directories. Preserve both passing and failing
artifacts; do not rerun one case selectively and report only the passing sample.
The live runner records the repository revision, Codex version, case duration,
structured result, transcript, and stderr. The deterministic grader verifies
both the structured report and final fixture contents.
