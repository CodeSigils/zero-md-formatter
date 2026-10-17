# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities privately via:

- **GitHub Security Advisory**: Use the "Report a vulnerability" tab on this repository

Do not file public issues for security vulnerabilities.

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 7 days
- **Fix timeline**: Depends on severity; critical issues targeted within 30 days

## Security Practices

- **Zero dependencies** — eliminates supply-chain attack surface
- **Signed commits** — all commits SSH-signed; branch protection enforces this
- **2FA on npm** — publishing uses npm trusted publishing (OIDC) from GitHub
  Actions; no long-lived npm token is stored. This supersedes granular tokens,
  including bypass-2fa tokens, which lose direct publish capability in January
  2027.
- **Provenance** — CI publishes with npm provenance enabled over GitHub Actions
  OIDC (`id-token: write`), authenticated by the `ci.yml` trusted publisher
  configured on the npm package. No `NPM_TOKEN` secret is used.
- **Minimal runtime** — pure Node.js >=24, no native bindings
- **No install lifecycle scripts** — git hooks are installed explicitly with `npm run install-hooks`
