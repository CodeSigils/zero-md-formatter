const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runFormatFiles } = require("../../scripts/format-files.js");

function captureStderr() {
  let output = "";
  return {
    stream: {
      write(chunk) {
        output += String(chunk);
      },
    },
    get output() {
      return output;
    },
  };
}

describe("format-files.js", () => {
  it("returns usage status when no formatter mode is supplied", () => {
    const stderr = captureStderr();

    const status = runFormatFiles([], { stderr: stderr.stream });

    assert.equal(status, 2);
    assert.match(stderr.output, /Usage:/);
  });

  it("passes the mode and authoritative file list to the formatter CLI", () => {
    let call;
    const status = runFormatFiles(["--check"], {
      nodePath: "node-bin",
      cli: "formatter-cli",
      cwd: "repo-root",
      formatFiles: ["README.md", "SKILL.md"],
      spawn(command, args, options) {
        call = { command, args, options };
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.deepStrictEqual(call, {
      command: "node-bin",
      args: ["formatter-cli", "--check", "README.md", "SKILL.md"],
      options: {
        cwd: "repo-root",
        encoding: "utf8",
        stdio: "inherit",
      },
    });
  });

  it("returns the formatter exit status", () => {
    const status = runFormatFiles(["--verify"], {
      spawn() {
        return { status: 7 };
      },
    });

    assert.equal(status, 7);
  });

  it("returns nonzero and reports spawn errors instead of treating null status as success", () => {
    const stderr = captureStderr();

    const status = runFormatFiles(["--check"], {
      stderr: stderr.stream,
      spawn() {
        return { status: null, error: new Error("spawn failed") };
      },
    });

    assert.equal(status, 1);
    assert.match(stderr.output, /spawn failed/);
  });

  it("returns nonzero when the formatter exits from a signal", () => {
    const stderr = captureStderr();

    const status = runFormatFiles(["--check"], {
      stderr: stderr.stream,
      spawn() {
        return { status: null, signal: "SIGTERM" };
      },
    });

    assert.equal(status, 1);
    assert.match(stderr.output, /SIGTERM/);
  });
});
