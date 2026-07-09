# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.4.x   | :white_check_mark: |
| < 1.4   | :x:                |

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
- **2FA on npm** — publishing requires OTP or granular token
- **Provenance** — `publishConfig.provenance: true` for CI publishes (GitHub OIDC)
- **Minimal runtime** — pure Node.js >=24, no native bindings
- **No postinstall scripts** — `prepare` only sets git hooks locally
