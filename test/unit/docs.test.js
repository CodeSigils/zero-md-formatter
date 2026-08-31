const { it } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');

it('uses preflight wording in user-facing docs', () => {
  for (const file of ['README.md', 'SKILL.md']) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /prelight/i, `${file} should say preflight, not prelight`);
    assert.match(content, /preflight/i, `${file} should document preflight behavior`);
  }
});

it('documents guarded unclosed-fence behavior consistently', () => {
  for (const file of ['README.md', 'SKILL.md']) {
    const content = readFileSync(file, 'utf8');
    assert.match(content, /guard(?:ed|`)?.*fail[\s\S]{0,120}without modifying/i,
      `${file} should document that guarded mode fails without modifying the file`);
    assert.match(content, /unguarded write modes[\s\S]{0,80}(?:continue|still) format/i,
      `${file} should document that only unguarded write modes continue formatting`);
  }
});

it('documents the Hermes hook jq prerequisite', () => {
  for (const file of ['README.md', 'SKILL.md']) {
    const content = readFileSync(file, 'utf8');
    assert.match(content, /`jq` \(Hermes shell hook only\)/,
      `${file} should document jq as a Hermes-hook-only prerequisite`);
  }
});

it('exposes public package and skill discovery paths', () => {
  const readme = readFileSync('README.md', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  assert.match(readme, /img\.shields\.io\/npm\/v\/zero-md-formatter/,
    'README should display the npm version badge');
  assert.match(readme, /img\.shields\.io\/npm\/dw\/zero-md-formatter/,
    'README should display the npm downloads badge');
  assert.match(readme, /npx skills add CodeSigils\/zero-md-formatter --skill markdown-formatter/,
    'README should document standard skills CLI installation');

  for (const keyword of ['agent-skill', 'agentskills', 'claude-code', 'codex', 'opencode', 'gemini-cli']) {
    assert.ok(pkg.keywords.includes(keyword), `package.json should include the ${keyword} discovery keyword`);
  }
});

it('keeps CI and release safety guarantees documented and wired', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const release = readFileSync('scripts/release.sh', 'utf8');
  const releaseNotes = readFileSync('.github/release.yml', 'utf8');
  assert.match(workflow, /npm test/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.match(workflow, /actions\/download-artifact@/);
  assert.match(workflow, /npm publish \.\/artifacts\/\*\.tgz/);
  assert.match(workflow, /matrix:/);
  assert.match(release, /DRY_RUN=1/);
  assert.match(release, /--generate-notes/);
  assert.match(releaseNotes, /categories:/);
  assert.match(release, /Uncommitted changes.*before running release\.sh/);
  assert.doesNotMatch(release, /git commit -m "sync skill metadata/);
});

it('pins every GitHub Action to a full immutable commit SHA', () => {
  // Supply-chain invariant: assert the property (full 40-char SHA, no @v6/@main
  // mutable refs) not a specific value, so dependabot bumps keep CI green.
  const files = readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'));
  const refs = [];
  for (const file of files) {
    const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
    refs.push(
      ...[...workflow.matchAll(/(?:uses|with:\s*using):\s+([^\s#@]+)@([^\s#]+)/g)].map(
        (m) => [file, m[1], m[2]],
      ),
    );
  }
  assert.ok(refs.length > 0, 'workflows should reference at least one GitHub Action');

  for (const [file, name, ref] of refs) {
    assert.match(
      ref,
      /^[0-9a-f]{40}$/,
      `${file}: ${name} must be pinned to a full 40-character immutable commit SHA, got ${JSON.stringify(ref)}`,
    );
  }
});

it('documents and configures dependency freshness checks', () => {
  const dependabot = readFileSync('.github/dependabot.yml', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /interval: weekly/);
  assert.match(readme, /Dependabot checks npm metadata and pinned GitHub Actions weekly/);
});
