# Security and CI

## Pull requests (`ci.yml`)

Every pull request runs these checks; `main` only accepts changes with green checks.

| Job | Checks |
|---|---|
| App | Prettier, ESLint, svelte-check, Vitest, production build |
| Dockerfile | Hadolint |
| Image | Image build, Trivy scan (fails on fixable HIGH/CRITICAL), smoke test of `/api/health` |
| Dependencies | Trivy scan of the repository (dependencies, misconfiguration, secrets) |
| Secrets | Gitleaks across the full history |
| CodeQL (`codeql.yml`) | Static analysis of TypeScript and the workflows, also weekly |

## Publishing (`release.yml`)

- A push to `main` produces the `edge` image; a `vX.Y.Z` tag produces `X.Y.Z`, `X.Y`, `X` and `latest`.
- Multi-arch build for amd64 and arm64, pushed to `ghcr.io/noahtrr/ev-dashboard`.
- Trivy scan of the published image.
- Keyless Cosign signature, build provenance attestation, SBOM (SPDX).
- On tags: GitHub release with the SBOM.

## Pipeline hardening

- All actions pinned by commit SHA, updated through Renovate.
- Minimal `permissions` per job, `persist-credentials: false` on checkout.
- No `pull_request_target`, no secrets in pull request runs.
- Deployment either by a timer on the server (no credentials in GitHub) or over SSH from GitHub Actions with a key that may only pass an image digest. Either way the server verifies the Cosign signature before starting an image (see [Deployment](Deployment-EN)).
- SSH credentials live in the `production` environment and are only available to the deploy job on `main`.

## Verifying an image

```sh
cosign verify ghcr.io/noahtrr/ev-dashboard:latest \
  --certificate-identity-regexp '^https://github.com/noahtrr/ev-dashboard/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/noahtrr/ev-dashboard:latest --repo noahtrr/ev-dashboard
```

## Reporting vulnerabilities

Please use [private vulnerability reporting](https://github.com/noahtrr/ev-dashboard/security/advisories/new), not a public issue.
