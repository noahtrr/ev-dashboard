# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) instead.
You will get an answer within a few days.

## Supported versions

Only the latest release receives security fixes.

## What the project does to stay secure

- Every image is scanned with Trivy and the build fails on fixable HIGH or CRITICAL findings.
- Code is analysed with CodeQL, the repository with Gitleaks and the Dockerfile with Hadolint.
- All GitHub Actions are pinned by commit SHA and kept current through Renovate.
- Published images are signed with Cosign (keyless) and carry build provenance and an SBOM.
- The container runs as an unprivileged user and needs no Linux capabilities.

Verify an image:

```sh
cosign verify ghcr.io/noahtrr/ev-dashboard:latest \
  --certificate-identity-regexp '^https://github.com/noahtrr/ev-dashboard/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/noahtrr/ev-dashboard:latest --repo noahtrr/ev-dashboard
```
