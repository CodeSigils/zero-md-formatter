const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { detectDoublePipes, validatePipes } = require(
  "../../skills/markdown-formatter/scripts/check-pipes.js",
);

describe("check-pipes.js unit tests", () => {
  it("detects leading double pipe (phantom first column)", () => {
    const issues = detectDoublePipes("|| Name | Age |\n|| ---- | --- |\n|| A | 1 |\n");
    assert.equal(issues.length, 3);
    assert.match(issues[0].detail, /Leading double pipe/);
  });

  it("detects internal adjacent double pipe", () => {
    const issues = detectDoublePipes("| Name || Age |");
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent double pipe/);
  });

  it("detects trailing double pipe", () => {
    const issues = detectDoublePipes("| Name | Age ||");
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Trailing double pipe/);
  });

  it("ignores escaped pipes that look like double pipes", () => {
    const issues = detectDoublePipes("| escaped | alpha \\\\| beta |");
    assert.equal(issues.length, 0);
  });

  it("ignores double pipes inside inline code spans", () => {
    const issues = detectDoublePipes("| code | `x || y` |");
    assert.equal(issues.length, 0);
  });

  it("detects structural double pipes after ignored inline-code double pipes", () => {
    const issues = detectDoublePipes("| code | `x || y` || real | value |");

    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent double pipe/);
  });

  it("detects double pipes in GFM table rows without leading pipes", () => {
    const issues = detectDoublePipes("a || b | c");

    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /Adjacent double pipe/);
  });

  it("passes valid tables without double pipes", () => {
    const issues = detectDoublePipes(
      "| Name | Age | City |\n| ---- | --- | ---- |\n| A | 1 | NYC |\n",
    );
    assert.equal(issues.length, 0);
  });

  it("ignores non-table lines with double pipes (not a pipe table)", () => {
    const issues = detectDoublePipes("some || text here");
    assert.equal(issues.length, 0);
  });

  it("validatePipes returns formatted error messages", () => {
    const errors = validatePipes("|| Name |\n|| ---- |\n");
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Line 1/);
    assert.match(errors[0], /Leading double pipe/);
  });
});
