"use strict";

function parseFenceLine(line) {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
  if (!match) return null;
  return { indent: match[1], marker: match[2], style: match[2][0], length: match[2].length, info: match[3] };
}

function isFenceCloser(line, fence) {
  const parsed = parseFenceLine(line);
  const style = fence.style || fence.fenceChar;
  const length = fence.length || fence.fenceLength;
  return Boolean(parsed && parsed.style === style && parsed.length >= length && parsed.info.trim() === "");
}

module.exports = { parseFenceLine, isFenceCloser };
