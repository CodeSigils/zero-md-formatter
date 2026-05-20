#!/usr/bin/env node
/**
 * Fenced code block validator for markdown-formatter skill.
 * Validates fenced code block structure according to GFM specification.
 *
 * Usage: node check-fences.js <filePath>
 *
 * Exits with code 0 if valid, 1 if violations found.
 */

"use strict";

const fs = require("fs");
const process = require("process");

/**
 * Validates fenced code blocks in markdown content.
 * @param {string} content - Markdown content to validate
 * @returns {Array<string>} - Array of error messages (empty if valid)
 */
function validateFences(content) {
  const errors = [];
  const lines = content.split('\n');
  
  // State tracking for fence validation
  let fenceStack = []; // Stack of open fences: [{line, indent, fenceChar, fenceLength, infoString}]
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineNum1Based = lineNum + 1;
    
    // Check for fence pattern: 0-3 spaces, then 3+ backticks or tildes, then optional info string
    const fenceMatch = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
    
    if (fenceMatch) {
      const [, indent, fenceChars, infoString] = fenceMatch;
      const fenceChar = fenceChars[0]; // First character (` or ~)
      const fenceLength = fenceChars.length;
      
      // Check if this is a closing fence (matches top of stack)
      if (fenceStack.length > 0) {
        const top = fenceStack[fenceStack.length - 1];
        
        // Check if it matches the opening fence
        if (
          indent === top.indent &&
          fenceChar === top.fenceChar &&
          fenceLength === top.fenceLength
        ) {
          // This is a closing fence
          
          // Check for extra content after closing fence on same line
          const expectedClosing = `${indent}${fenceChars}`;
          if (line !== expectedClosing) {
            errors.push(
              `Line ${lineNum1Based}: Extra content after closing fence. Expected only '${expectedClosing}' but got '${line}'`
            );
          }
          
          // Pop the matching opening fence
          fenceStack.pop();
          continue; // Skip further processing for this line
        }
      }
      
      // This is an opening fence (or a mismatched closing fence)
      
      if (infoString.trim() === '') {
        console.error(
          `Warning: Line ${lineNum1Based}: Fence opener has no language tag.`
        );
      }
      
      // Push to stack
      fenceStack.push({
        line: lineNum1Based,
        indent,
        fenceChar,
        fenceLength,
        infoString
      });
    }
  }
  
  // Check for unclosed fences
  if (fenceStack.length > 0) {
    for (const fence of fenceStack) {
      errors.push(
        `Line ${fence.line}: Unclosed fence opened here. Expected closing fence with ${fence.indent}${fence.fenceChar.repeat(fence.fenceLength)}`
      );
    }
  }
  
  return errors;
}

/**
 * Main validation function.
 */
function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error("Error: No file path provided");
    console.error("Usage: node check-fences.js <filePath>");
    process.exitCode = 1;
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const errors = validateFences(content);
    
    if (errors.length > 0) {
      errors.forEach(error => console.error(error));
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (err) {
    console.error(`Error reading file ${filePath}: ${err.message}`);
    process.exitCode = 1;
  }
}

main();