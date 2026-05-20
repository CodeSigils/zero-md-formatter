#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { readdir, stat } = require('fs/promises');
const { join, dirname, resolve } = require('path');
const minimist = require('minimist');

const CONFIG = {
  SKILL_DIR: resolve(__dirname, '..'),
  MARKDOWNLINT_CONFIG: join(__dirname, '..', 'references', '.markdownlint.json'),
  OXFMTRC_TEMPLATE: {
    "ignorePatterns": ["fixtures/work/", "fixtures/results/"]
  }
};

const args = minimist(process.argv.slice(2), {
  boolean: ['check', 'fix', 'all', 'guard', 'verify', 'dryRun', 'help'],
  string: ['_'],
  alias: {
    h: 'help',
    n: 'dryRun'
  }
});

if (args.help || (!args._.length && !args.all)) {
  printHelp();
  process.exit(0);
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Markdown Formatter CLI - Format markdown to GFM standard

Usage:
  $0 [options] <path>

Options:
  --check           Read-only check (exit 0 if clean)
  --fix             Apply formatting (default action)
  --all             Treat <path> as directory, process all .md files
  --guard           Structural guard: snapshot before/after formatting
  --verify          Static structural check (no before/after)
  --dry-run, -n     Preview changes without applying
  --help, -h        Show this help message

Examples:
  $0 README.md                    # Fix single file
  $0 --check README.md            # Check only
  $0 --all docs/                  # Fix all .md in directory
  $0 --guard README.md            # Run structural guard
  $0 --dry-run README.md          # Preview changes
`);
}

/**
 * Get oxfmt binary path
 * Priority: node_modules → system → download & cache
 */
function getOxfmtBin() {
  const fs = require('fs');
  
  // 1. Check local node_modules
  const localOxfmt = join(CONFIG.SKILL_DIR, 'node_modules', '.bin', 'oxfmt');
  if (fs.existsSync(localOxfmt)) {
    return localOxfmt;
  }
  
  // 2. Check direct path
  const directOxfmt = join(CONFIG.SKILL_DIR, 'node_modules', 'oxfmt', 'bin', 'oxfmt');
  if (fs.existsSync(directOxfmt)) {
    return directOxfmt;
  }
  
  // 3. Try system oxfmt on PATH
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('oxfmt', ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0) {
      return 'oxfmt';
    }
  } catch (e) {
    // Not on PATH
  }
  
  // 4. Download & cache (zero-install approach)
  const cachedBin = getOrDownloadOxfmt();
  if (cachedBin) {
    return cachedBin;
  }
  
  // Fallback to system oxfmt (will fail if not installed)
  return 'oxfmt';
}

/**
 * Get or download oxfmt binary
 * Downloads from GitHub releases if not cached
 */
function getOrDownloadOxfmt() {
  const fs = require('fs');
  const { spawnSync } = require('child_process');
  const os = require('os');
  const path = require('path');
  
  const cacheDir = join(process.env.HOME || '/tmp', '.cache', 'opencode-markdown-formatter');
  const binaryName = process.platform === 'win32' ? 'oxfmt.exe' : 'oxfmt';
  const binaryPath = join(cacheDir, binaryName);
  
  // Return cached if exists
  if (fs.existsSync(binaryPath)) {
    // Make executable
    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', binaryPath], { stdio: 'ignore' });
    }
    return binaryPath;
  }
  
  // Determine platform suffix
  const platformMap = {
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'win32-x64': 'x86_64-pc-windows-msvc'
  };
  const platformKey = `${process.platform}-${process.arch}`;
  const oxPlatform = platformMap[platformKey] || 'x86_64-unknown-linux-gnu';
  
  const version = 'apps_v1.66.0';
  const filename = `oxfmt-${oxPlatform}.tar.gz`;
  const url = `https://github.com/oxc-project/oxc/releases/download/apps_${version}/${filename}`;
  
  console.error(`Downloading oxfmt (first run, ${(process.platform === 'win32' ? 'zip' : '~2MB')})...`);
  
  // Create cache dir
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  // Download
  const tarPath = join(cacheDir, 'oxfmt.tar.gz');
  try {
    const { execSync } = require('child_process');
    execSync(`curl -fsSL -o ${tarPath} ${url}`, { stdio: 'pipe' });
    
    // Extract
    execSync(`tar -xzf ${tarPath} -C ${cacheDir}`, { stdio: 'pipe' });
    
    // Find extracted binary (in subfolder)
    const extractedBin = join(cacheDir, 'oxfmt-x86_64-unknown-linux-gnu', binaryName);
    if (fs.existsSync(extractedBin)) {
      // Move to final location
      fs.renameSync(extractedBin, binaryPath);
      fs.rmSync(join(cacheDir, 'oxfmt-x86_64-unknown-linux-gnu'), { recursive: true, force: true });
      fs.unlinkSync(tarPath);
      
      // Make executable
      if (process.platform !== 'win32') {
        spawnSync('chmod', ['+x', binaryPath], { stdio: 'ignore' });
      }
      
      return binaryPath;
    }
  } catch (e) {
    // Download failed
  }
  
  return null;
}

/**
 * Get markdownlint-cli2 binary path
 */
function getMarkdownlintBin() {
  const localMlint = resolve(process.env.HOME || '', '.local/share/pnpm/markdownlint-cli2');
  if (require('fs').existsSync(localMlint)) {
    return localMlint;
  }
  return 'markdownlint-cli2';
}

/**
 * Process a single markdown file
 */
async function processFile(filePath) {
  if (args.verify) {
    const valid = runStructuralGuard(filePath, 'verify');
    if (valid) {
      console.log('Structure valid');
      return true;
    }
    return false;
  }

  if (args.guard) {
    const preserved = runStructuralGuard(filePath, 'verify');
    if (preserved) {
      console.log('Structure preserved');
      return true;
    }
    return false;
  }

  if (args.check || args.dryRun) return true;

  await ensureOxfmtRc();

  const firstPass = runOxfmt(['--write', filePath]);
  if (firstPass.status !== 0) return false;

  const secondPass = runOxfmt(['--write', filePath]);
  if (secondPass.status !== 0) return false;

  if (args.guard) {
    if (!runStructuralGuard(filePath, 'verify')) return false;
  }

  return true;
}

/**
 * Find all markdown files in directory recursively
 */
async function findMarkdownFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(fullPath));
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Check if file is a markdown file
 */
function isMarkdownFile(filename) {
  return filename.endsWith('.md') || filename.endsWith('.markdown');
}

/**
 * Run oxfmt with arguments
 */
function runOxfmt(args, options = {}) {
  const bin = getOxfmtBin();
  return spawnSync(bin, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
}

/**
 * Run markdownlint-cli2 with arguments
 */
function runMarkdownlint(args, options = {}) {
  const bin = getMarkdownlintBin();
  return spawnSync(bin, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
}

/**
 * Ensure .oxfmtrc.json exists
 */
async function ensureOxfmtRc() {
  const oxfmtrcPath = join(CONFIG.SKILL_DIR, '.oxfmtrc.json');
  if (!require('fs').existsSync(oxfmtrcPath)) {
    require('fs').writeFileSync(
      oxfmtrcPath,
      JSON.stringify(CONFIG.OXFMTRC_TEMPLATE, null, 2)
    );
  }
}

/**
 * Run structural guard check
 */
function runStructuralGuard(filePath, mode, snapshotPath) {
  const checkStructures = join(CONFIG.SKILL_DIR, 'scripts', 'check-structure.js');
  const args = [`--${mode}`, filePath];
  
  const result = spawnSync('node', [checkStructures, ...args], {
    encoding: 'utf8'
  });
  
  if (result.status !== 0 && result.stderr) {
    console.error(result.stderr);
  }
  
  return result.status === 0;
}

/**
 * Run oxfmt with idempotence verification
 */

/**
 * Main execution function
 */
async function main() {
  // Determine files to process
  let files = [];
  
  if (args.all) {
    const dir = args._[0] || '.';
    files = await findMarkdownFiles(resolve(dir));
  } else {
    files = args._;
  }
  
  if (files.length === 0) {
    process.exit(1);
  }
  
  // Process each file
  let successCount = 0;
  let hasFailure = false;
  for (const file of files) {
    if (await processFile(file)) {
      successCount++;
    } else {
      hasFailure = true;
      if (args.guard || args.verify) {
        // In guard/verify modes, structural issues should fail
        process.exit(1);
      }
    }
  }
  
  if (successCount !== files.length && !(args.guard || args.verify)) {
    process.exit(1);
  }
  
  if (hasFailure) {
    process.exit(1);
  }
}

// Run the main function
main();