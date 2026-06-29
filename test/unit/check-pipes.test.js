const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectAdjacentPipes, validatePipes } = require(
  "../../skills/markdown-formatter/scripts/check-pipes.js",
);

describe("check-pipes.js unit tests", () => {
  it("detects leading adjacent pipes (empty first cell)", () => {
    const issues = detectAdjacentPipes("|| Name | Age |\n|| ---- | --- |\n|| A | 1 |\n");
    assert.equal(issues.length, 3);
    assert.match(issues[0].detail, /Leading adjacent pipes/);
  });

  it("detects internal adjacent pipes (empty cell between columns)", () => {
    const issues = detectAdjacentPipes("| Name || Age |");
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent pipes between columns/);
  });

  it("detects trailing adjacent pipes (empty trailing cell)", () => {
    const issues = detectAdjacentPipes("| Name | Age ||");
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Trailing adjacent pipes/);
  });

  it("ignores escaped pipes that look like adjacent pipes", () => {
    const issues = detectAdjacentPipes("| escaped | alpha \\\\| beta |");
    assert.equal(issues.length, 0);
  });

  it("ignores adjacent pipes inside inline code spans", () => {
    const issues = detectAdjacentPipes("| code | `x || y` |");
    assert.equal(issues.length, 0);
  });

  it("ignores adjacent pipes inside fenced code blocks", () => {
    const issues = detectAdjacentPipes([
      "```text",
      "|| not | a | table ||",
      "```",
    ].join("\n"));

    assert.equal(issues.length, 0);
  });

  it("detects structural adjacent pipes after ignored inline-code patterns", () => {
    const issues = detectAdjacentPipes("| code | `x || y` || real | value |");

    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent pipes between columns/);
  });

  it("detects adjacent pipes in GFM table rows without leading pipes", () => {
    const issues = detectAdjacentPipes("a || b | c");

    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent pipes between columns/);
  });

  it("detects adjacent pipes in no-leading-pipe headers with delimiter context", () => {
    const issues = detectAdjacentPipes("a || b\n--- | --- | ---\n1 | 2 | 3\n");

    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent pipes between columns/);
  });

  it("passes valid tables without adjacent pipes", () => {
    const issues = detectAdjacentPipes(
      "| Name | Age | City |\n| ---- | --- | ---- |\n| A | 1 | NYC |\n",
    );
    assert.equal(issues.length, 0);
  });

  it("ignores non-table lines with adjacent pipes (not a pipe table)", () => {
    const issues = detectAdjacentPipes("some || text here");
    assert.equal(issues.length, 0);
  });

  it("validatePipes returns formatted diagnostic messages", () => {
    const errors = validatePipes("|| Name |\n|| ---- |\n");
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Line 1/);
    assert.match(errors[0], /Leading adjacent pipes/);
  });

  it("hasAdjacentPipes returns true when adjacent pipes are present", () => {
    const { hasAdjacentPipes } = require(
      "../../skills/markdown-formatter/scripts/check-pipes.js",
    );
    assert.equal(hasAdjacentPipes("|| Name | Age |\n|| ---- | --- |\n|| A | 1 |\n"), true);
  });

  it("hasAdjacentPipes returns false for clean tables", () => {
    const { hasAdjacentPipes } = require(
      "../../skills/markdown-formatter/scripts/check-pipes.js",
    );
    assert.equal(hasAdjacentPipes("| Name | Age |\n| ---- | --- |\n| A | 1 |\n"), false);
  });

  it("hasAdjacentPipes returns false for non-table content", () => {
    const { hasAdjacentPipes } = require(
      "../../skills/markdown-formatter/scripts/check-pipes.js",
    );
    assert.equal(hasAdjacentPipes("# Hello\n\nJust some text.\n"), false);
  });
});
