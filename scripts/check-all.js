#!/usr/bin/env node
/**
 * check-all.js - Run structural checks against valid fixtures and ensure violation fixtures fail.
 *
 * Usage: node check-all.js [paths...]
 *   Defaults: test/fixtures/current test/fixtures/format-edge-cases test/fixtures/pipe-safety test/fixtures/violations
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more checks failed
 */
'use strict';

const { spawnSync } = require('child_process');
const { join, resolve, extname, relative } = require('path');
const { readdirSync, statSync, existsSync } = require('fs');

const ROOT = resolve(__dirname, '..');
const SKILL_DIR = resolve(ROOT, '.');
const DEFAULT_TARGETS = [
  'test/fixtures/current',
  'test/fixtures/format-edge-cases',
  'test/fixtures/pipe-safety',
  'test/fixtures/violations',
];
const VALID_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const CHECKS = [
  { name: 'check-structure', args: ['--verify'] },
  { name: 'check-fences', args: [] },
  { name: 'check-tables', args: [] },
  { name: 'check-pipes', args: [] },
];
const EXPECTED_VIOLATION_CHECKS = new Map([
  ['test/fixtures/violations/fence-mismatch.md', ['check-structure', 'check-fences']],
  ['test/fixtures/violations/fence-untitled.md', ['check-fences']],
  ['test/fixtures/violations/table-column-count.md', ['check-structure', 'check-tables']],
  ['test/fixtures/violations/table-column-drift.md', ['check-structure', 'check-tables']],
  ['test/fixtures/violations/table-no-leading-pipe.md', ['check-structure', 'check-tables']],
  ['test/fixtures/violations/table-adjacent-pipes.md', ['check-structure', 'check-tables']],
  ['test/fixtures/violations/table-inline-code-pipe.md', ['check-tables']],
  ['test/fixtures/violations/delimiter-adjacent-pipes.md', ['check-structure', 'check-tables']],
]);

function collectFiles(targets) {
  const files = [];
  for (const target of targets) {
    const absolute = resolve(ROOT, target);
    if (!existsSync(absolute)) continue;
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const full = join(absolute, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectFiles([full]));
        } else if (VALID_EXTENSIONS.has(extname(entry.name))) {
          files.push(full);
        }
      }
    } else if (VALID_EXTENSIONS.has(extname(absolute)) && !absolute.endsWith('.structure.json')) {
      files.push(absolute);
    }
  }
  return [...new Set(files)].sort();
}

function runCheck(check, file) {
  const scriptPath = join(SKILL_DIR, 'guard', `${check.name}.js`);
  const result = spawnSync(process.execPath, [scriptPath, ...check.args, file], { encoding: 'utf8' });
  if (result.error) {
    return {
      ok: false,
      stdout: result.stdout || '',
      stderr: `Failed to run ${check.name}.js: ${result.error.message}\n${result.stderr || ''}`,
    };
  }
  if (result.signal) {
    return {
      ok: false,
      stdout: result.stdout || '',
      stderr: `${check.name}.js exited from signal: ${result.signal}\n${result.stderr || ''}`,
    };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function isViolationFixture(file) {
  return relative(ROOT, file).split('/').includes('violations');
}

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;
const files = collectFiles(targets);

if (files.length === 0) {
  console.error('No .md/.mdx files found.');
  process.exit(1);
}

let failed = false;
let validCount = 0;
let violationCount = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const results = CHECKS.map((check) => ({ check, ...runCheck(check, file) }));

  if (isViolationFixture(file)) {
    violationCount++;
    const expectedChecks = EXPECTED_VIOLATION_CHECKS.get(rel);
    if (!expectedChecks) {
      console.error(`FAIL: violation fixture has no expected check mapping: ${rel}`);
      failed = true;
      continue;
    }
    const missingFailures = expectedChecks.filter((checkName) => {
      const result = results.find((r) => r.check.name === checkName);
      return !result || result.ok;
    });
    if (missingFailures.length > 0) {
      console.error(`FAIL: violation fixture did not fail expected checks: ${rel} (${missingFailures.join(', ')})`);
      for (const result of results) {
        if (!result.ok && result.stderr) process.stderr.write(result.stderr);
      }
      failed = true;
    } else {
      console.log(`PASS: violation detected: ${rel}`);
    }
    continue;
  }

  validCount++;
  for (const result of results) {
    if (!result.ok) {
      console.error(`FAIL: ${result.check.name}.js ${rel}`);
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      failed = true;
    }
  }
  if (results.every((result) => result.ok)) {
    console.log(`PASS: ${rel}`);
  }
}

if (failed) {
  console.error('\nOne or more structural checks failed.');
  process.exit(1);
}

console.log(`\nAll structural checks passed (${validCount} valid, ${violationCount} expected violations).`);
