#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CASES = path.join(ROOT, "evals/codex/cases.json");
const SCHEMA = path.join(ROOT, "evals/codex/result.schema.json");
const GRADER = path.join(ROOT, "scripts/grade-codex-regression.js");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function prepareFixture(root, testCase, options = {}) {
  if (fs.existsSync(root)) throw new Error(`fixture already exists: ${root}`);
  fs.mkdirSync(path.join(root, ".agents/skills"), { recursive: true });
  fs.cpSync(
    path.join(ROOT, "skills/markdown-formatter"),
    path.join(root, ".agents/skills/markdown-formatter"),
    { recursive: true }
  );
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs/guide.md"), testCase.input);
  if (options.withGit === false) return;
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "Codex Eval"],
    ["config", "user.email", "codex-eval@example.invalid"],
    ["config", "commit.gpgsign", "false"],
    ["add", "."],
    ["commit", "-m", "test: create formatter fixture"],
  ]) {
    const result = run("git", args, { cwd: root });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
}

function codexArgs(fixture, prompt, output, model) {
  const args = [
    "exec", "--json", "--ephemeral", "--ignore-user-config", "--ignore-rules",
    "--sandbox", "workspace-write", "--cd", fixture,
    "--output-schema", SCHEMA, "--output-last-message", output,
  ];
  if (model) args.push("--model", model);
  args.push(prompt);
  return args;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function selfTest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "zero-md-runner-"));
  for (const testCase of readJson(CASES).cases) {
    const fixture = path.join(base, testCase.id);
    prepareFixture(fixture, testCase, { withGit: false });
    const args = codexArgs(fixture, testCase.prompt, path.join(base, "result.json"));
    if (!args.includes("--output-schema") || args.at(-1) !== testCase.prompt) {
      throw new Error("invalid Codex command");
    }
  }
  if (optionValue(["--fixture-dir", "/tmp/fixtures"], "--model") !== undefined) {
    throw new Error("absent optional arguments must remain undefined");
  }
  fs.rmSync(base, { recursive: true, force: true });
  readJson(SCHEMA);
  console.log(`validated runner fixtures for ${readJson(CASES).cases.length} cases`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const outputDir = path.resolve(
    optionValue(args, "--output-dir") || "artifacts/codex"
  );
  const fixturesDir = path.resolve(
    optionValue(args, "--fixture-dir") ||
      fs.mkdtempSync(path.join(os.tmpdir(), "zero-md-codex-"))
  );
  const model = optionValue(args, "--model");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(fixturesDir, { recursive: true });
  const summary = {
    started_at: new Date().toISOString(),
    repository_commit: run("git", ["rev-parse", "HEAD"], { cwd: ROOT }).stdout.trim(),
    codex_version: run("codex", ["--version"], { cwd: ROOT }).stdout.trim(),
    requested_model: model || null,
    cases: [],
  };
  for (const testCase of readJson(CASES).cases) {
    const fixture = path.join(fixturesDir, testCase.id);
    prepareFixture(fixture, testCase);
    const transcript = path.join(outputDir, `${testCase.id}-transcript.jsonl`);
    const stderrFile = path.join(outputDir, `${testCase.id}-stderr.log`);
    const resultFile = path.join(outputDir, `${testCase.id}-result.json`);
    const started = Date.now();
    const result = run("codex", codexArgs(fixture, testCase.prompt, resultFile, model), {
      cwd: ROOT,
    });
    fs.writeFileSync(transcript, result.stdout);
    fs.writeFileSync(stderrFile, result.stderr);
    summary.cases.push({
      id: testCase.id,
      status: result.status === 0 ? "completed" : "failed",
      duration_seconds: (Date.now() - started) / 1000,
      result: resultFile,
      transcript,
      stderr: stderrFile,
    });
  }
  summary.ended_at = new Date().toISOString();
  fs.writeFileSync(
    path.join(outputDir, "run-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  if (summary.cases.some((item) => item.status !== "completed")) {
    process.exitCode = 1;
    return;
  }
  const grade = run(process.execPath, [
    GRADER, "--results-dir", outputDir, "--fixtures-dir", fixturesDir,
    "--output", path.join(outputDir, "grade.json"),
  ], { cwd: ROOT });
  process.stdout.write(grade.stdout);
  process.stderr.write(grade.stderr);
  process.exitCode = grade.status;
}

if (require.main === module) main();
