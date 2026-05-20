---
name: markdown-formatter
description: >
  Format markdown to GFM standard using oxfmt. Includes structural guard
  (fence/table drift detection). Run after creating or editing any .md file.
  Uses CLI at src/index.js or bin entry "mdformat".
license: MIT
compatibility: opencode
metadata:
  version: "1.4.0"
  argument-hint: "{filename} or --all {directory}"
  category: "devtools"
---

# Markdown Formatter

Format markdown files to enforce GitHub Flavored Markdown (GFM) rules.

This skill uses **oxfmt** (Oxc's formatter) with structural guard.

**Always apply this skill automatically** when working with any Markdown file (`.md` extension). The AI should format markdown to GFM standard without being asked.

## When to Use

- After creating a new `.md` file
- After editing an existing `.md` file
- Before committing Markdown to a repository
- When checking documentation quality

## How to Use

### Option 1: Slash Command (OpenCode)

Use the built-in slash command in OpenCode:

```
/markdown-formatter <filename>
```

For example: `/markdown-formatter README.md`

### Option 2: Load the Skill

Tell the AI to load the skill:

```
Load the markdown-formatter skill and format this file.
```

Or the AI can call: `skill({ name: "markdown-formatter" })`

### Option 3: CLI

Run the CLI directly:

```bash
src/index.js README.md
mdformat README.md
```

## CLI Usage

Run from the skill directory:

```bash
# Fix a file
src/index.js README.md
mdformat README.md

# Check only (read-only, exit 0 if clean)
src/index.js --check README.md

# Fix all .md in directory
src/index.js --all docs/

# Structural guard (detect fence/table drift)
src/index.js --guard README.md

# Structural verify (static check, no formatting)
src/index.js --verify README.md

# Dry-run (preview changes)
src/index.js --dry-run README.md
```

## Prerequisites

- Node.js 18+ (to run the CLI)
- **No install needed** - CLI downloads oxfmt automatically on first run (~2MB, cached in `~/.cache/opencode-markdown-formatter/`)

## Architecture

```
Structural Guard → oxfmt (2x) → Success/Error
```

- oxfmt handles markdown formatting (delegates to Prettier)
- Runs twice for idempotence verification
- Structural guard detects fence/table drift

## What It Does

- Table separators: converts plain separators to aligned separators.
- Table alignment: pads table cells consistently.
- Heading: converts `#Title` to `# Title`.
- List: converts `* Item` to `- Item`.

## Testing

```bash
node --test test/test-js.mjs test/cli.test.mjs
```
