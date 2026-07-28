#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CASES = path.join(ROOT, "evals/codex/cases.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function containsAny(value, terms) {
  const text = String(value).toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function pathMatches(value, expected) {
  if (typeof value !== "string") return false;
  return value === expected || value.endsWith(`/${expected}`);
}

function gradeCase(testCase, result, fixture) {
  const errors = [];
  if (!result.skills_used?.includes("markdown-formatter")) {
    errors.push(`${testCase.id}: markdown-formatter not recorded in skills_used`);
  }
  if (!Array.isArray(result.commands_run) || result.commands_run.length === 0) {
    errors.push(`${testCase.id}: no formatter command recorded`);
  }
  if (!containsAny(result.commands_run?.join(" ") || "", ["--guard"])) {
    errors.push(`${testCase.id}: formatter command did not use --guard`);
  }
  const target = path.join(fixture, "docs/guide.md");
  const actual = fs.readFileSync(target, "utf8");
  const expected = testCase.expected_content ?? testCase.input;
  if (actual !== expected) {
    errors.push(`${testCase.id}: docs/guide.md content did not match expectation`);
  }
  const changed = result.changed_paths?.some((item) =>
    pathMatches(item, "docs/guide.md")
  );
  if (Boolean(changed) !== testCase.expected_changed) {
    errors.push(`${testCase.id}: changed_paths did not match expected mutation`);
  }
  if (!containsAny(result.outcome || "", testCase.outcome_terms)) {
    errors.push(`${testCase.id}: outcome did not describe the expected result`);
  }
  return errors;
}

function gradeResults(casesFile, resultsDir, fixturesDir) {
  const cases = readJson(casesFile).cases;
  const graded = cases.map((testCase) => {
    let errors;
    try {
      const result = readJson(path.join(resultsDir, `${testCase.id}-result.json`));
      errors = gradeCase(testCase, result, path.join(fixturesDir, testCase.id));
    } catch (error) {
      errors = [`${testCase.id}: unreadable result: ${error.message}`];
    }
    return { id: testCase.id, passed: errors.length === 0, errors };
  });
  return {
    passed: graded.every((item) => item.passed),
    case_count: graded.length,
    cases: graded,
  };
}

function selfTest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "zero-md-grader-"));
  const results = path.join(base, "results");
  const fixtures = path.join(base, "fixtures");
  fs.mkdirSync(results);
  for (const testCase of readJson(DEFAULT_CASES).cases) {
    const fixture = path.join(fixtures, testCase.id, "docs");
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(
      path.join(fixture, "guide.md"),
      testCase.expected_content ?? testCase.input
    );
    fs.writeFileSync(
      path.join(results, `${testCase.id}-result.json`),
      JSON.stringify({
        skills_used: ["markdown-formatter"],
        commands_run: ["node .agents/skills/markdown-formatter/src/index.js --fix --guard docs/guide.md"],
        changed_paths: testCase.expected_changed ? ["/tmp/fixture/docs/guide.md"] : [],
        outcome: testCase.outcome_terms[0],
        limitations: [],
      })
    );
  }
  const grade = gradeResults(DEFAULT_CASES, results, fixtures);
  fs.rmSync(base, { recursive: true, force: true });
  if (!grade.passed) throw new Error(JSON.stringify(grade));
  console.log(`validated grader against ${grade.case_count} cases`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const get = (name) => args[args.indexOf(name) + 1];
  const resultsDir = get("--results-dir");
  const fixturesDir = get("--fixtures-dir");
  const output = get("--output");
  if (!resultsDir || !fixturesDir) {
    throw new Error("--results-dir and --fixtures-dir are required");
  }
  const grade = gradeResults(DEFAULT_CASES, resultsDir, fixturesDir);
  const rendered = `${JSON.stringify(grade, null, 2)}\n`;
  if (output) fs.writeFileSync(output, rendered);
  else process.stdout.write(rendered);
  process.exitCode = grade.passed ? 0 : 1;
}

if (require.main === module) main();
module.exports = { gradeCase, gradeResults, pathMatches };
