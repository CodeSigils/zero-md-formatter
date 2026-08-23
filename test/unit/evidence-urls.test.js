'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const MANIFEST_PATH = join(ROOT, 'docs', 'evidence-urls.json');

// URLs are checked over the network by scripts/verify-urls.mjs (manual or
// scheduled). This offline gate only enforces that verification happened
// recently, so stale evidence cannot rot silently in the manifest.
const MAX_AGE_DAYS = 30;

describe('evidence URL manifest', () => {
  it('stays structurally valid and freshly verified', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    assert.equal(manifest.version, 3);
    assert.ok(Array.isArray(manifest.urls), 'urls must be an array');
    assert.ok(manifest.urls.length > 0, 'manifest must list at least one URL');

    const now = Date.now();
    for (const entry of manifest.urls) {
      assert(
        entry.name && typeof entry.url === 'string' && Array.isArray(entry.expected_statuses),
        `${entry.name ?? '<unnamed>'}: entry must have name, url, and expected_statuses`
      );
      assert.match(entry.url, /^https:\/\//, `${entry.name}: url must be https`);

      const ageDays = Math.floor((now - Date.parse(entry.last_verified)) / 86400000);
      assert(
        Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= MAX_AGE_DAYS,
        `${entry.name}: last_verified (${entry.last_verified}) is missing, malformed, ` +
          `or older than ${MAX_AGE_DAYS} days. Refresh with: node scripts/verify-urls.mjs --update`
      );
    }
  });
});
