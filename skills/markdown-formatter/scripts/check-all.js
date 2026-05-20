#!/usr/bin/env node
/**
 * check-all.js - Run all structural checks and formatter validation.
 *
 * Usage: node check-all.js [paths...]
 *   Defaults: test/fixtures/
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more checks failed
 */
'use strict';

const { spawnSync } = require('child_process');
const { join, resolve, extname } = require('path');
const { readdirSync, statSync } = require('fs');

const SKILL_DIR = resolve(__dirname, '..');

function collectFiles(targets) {
  const files = [];
  for (const target of targets) {
    try {
      const stat = statSync(target);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(target, { withFileTypes: true })) {
          const full = join(target, entry.name);
          if (entry.isDirectory()) {
            files.push(...collectFiles([full]));
          } else if (['.md', '.markdown', '.mdx'].includes(extname(entry.name))) {
            files.push(full);
          }
        }
      } else if (['.md', '.markdown', '.mdx'].includes(extname(target))) {
        files.push(target);
      }
    } catch {
      // skip missing entries
    }
  }
  return files;
}

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['test/fixtures/'];
const files   = collectFiles(targets);
const unique  = [...new Set(files)];

if (unique.length === 0) {
  console.error('No .md/.mdx files found.');
  process.exit(1);
}

const scripts = [
  { name: 'check-structure', args: ['--verify'] },
  { name: 'check-fences',    args: [] },
  { name: 'check-tables',   args: [] },
];

let failed = false;

for (const { name, args } of scripts) {
  const scriptPath = join(SKILL_DIR, 'scripts', `${name}.js`);
  const cmdArgs    = [...args, ...unique];
  const result     = spawnSync('node', [scriptPath, ...cmdArgs], { encoding: 'utf8' });

  if (result.status !== 0) {
    console.error(`FAIL: ${name}.js`);
    if (result.stderr) process.stderr.write(result.stderr);
    failed = true;
  } else {
    console.log(`PASS: ${name}.js (${unique.length} files)`);
  }
}

if (failed) {
  console.error('\nOne or more structural checks failed.');
  process.exit(1);
}

console.log('\nAll structural checks passed.');
