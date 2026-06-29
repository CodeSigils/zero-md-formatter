#!/usr/bin/env node
/**
 * Fenced code block validator for markdown-formatter skill.
 * Validates fenced code block structure according to GFM-style fence policy.
 *
 * Usage: node check-fences.js <filePath...>
 *
 * Exits with code 0 if valid, 1 if violations found.
 */

"use strict";

const fs = require("fs");
const process = require("process");

function validateFences(content) {
  const errors = [];
  const lines = content.split("\n");
  let current = null;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineNum1Based = lineNum + 1;
    const fenceMatch = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);

    if (!fenceMatch) continue;

    const [, indent, fenceChars, infoString] = fenceMatch;
    const fenceChar = fenceChars[0];
    const fenceLength = fenceChars.length;

    if (current) {
      const closesCurrent =
        fenceChar === current.fenceChar &&
        fenceLength >= current.fenceLength &&
        infoString.trim() === "";

      if (closesCurrent) {
        current = null;
      }
      continue;
    }

    if (infoString.length > 0 && infoString.trim() === "") {
      errors.push(`Line ${lineNum1Based}: Fence opener has an empty language tag.`);
    } else if (infoString.startsWith(" ") || infoString.startsWith("\t")) {
      errors.push(`Line ${lineNum1Based}: Fence opener language tag must not start with whitespace.`);
    } else if (fenceChar === "`" && infoString.includes("`")) {
      errors.push(`Line ${lineNum1Based}: Backtick fence info string must not contain backticks.`);
    }

    current = {
      line: lineNum1Based,
      indent,
      fenceChar,
      fenceLength,
    };
  }

  if (current) {
    errors.push(
      `Line ${current.line}: Unclosed fence opened here. Expected closing fence with ${current.indent}${current.fenceChar.repeat(current.fenceLength)}`
    );
  }

  return errors;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return validateFences(content);
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error("Error: No file path provided");
    console.error("Usage: node check-fences.js <filePath...>");
    process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const filePath of argv) {
    try {
      const errors = validateFile(filePath);
      if (errors.length > 0) {
        errors.forEach((error) => console.error(`${filePath}: ${error}`));
        failed = true;
      }
    } catch (err) {
      console.error(`Error reading file ${filePath}: ${err.message}`);
      failed = true;
    }
  }

  process.exitCode = failed ? 1 : 0;
}

module.exports = {
  validateFences,
  validateFile,
  main,
};

if (require.main === module) {
  main();
}
