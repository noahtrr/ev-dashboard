# Sicherheit und CI

## Pull Requests (`ci.yml`)

Jeder Pull Request durchläuft diese Prüfungen; `main` nimmt nur Änderungen mit grünen Checks an.

| Job | Prüft |
|---|---|
| App | Prettier, ESLint, svelte-check, Vitest, Produktions-Build |
| Dockerfile | Hadolint |
| Image | Image-Build, Trivy-Scan (bricht bei behebbaren HIGH/CRITICAL ab), Smoke-Test von `/api/health` |
| Dependencies | Trivy-Scan des Repositorys (Abhängigkeiten, Fehlkonfiguration, Secrets) |
| Secrets | Gitleaks über die gesamte Historie |
| CodeQL (`codeql.yml`) | Statische Analyse für TypeScript und die Workflows, zusätzlich wöchentlich |

## Veröffentlichung (`release.yml`)

- Push auf `main` erzeugt das Image `edge`, ein Tag `vX.Y.Z` erzeugt `X.Y.Z`, `X.Y`, `X` und `latest`.
- Multi-Arch-Build für amd64 und arm64, Push nach `ghcr.io/noahtrr/ev-dashboard`.
- Trivy-Scan des veröffentlichten Images.
- Keyless-Signatur mit Cosign, Build-Provenance-Attestierung, SBOM (SPDX).
- Bei Tags: GitHub Release mit SBOM.

## Härtung der Pipeline

- Alle Actions per Commit-SHA gepinnt, Aktualisierung über Renovate.
- Minimale `permissions` pro Job, `persist-credentials: false` beim Checkout.
- Kein `pull_request_target`, keine Secrets in PR-Läufen.
- Deployment entweder per Timer auf dem Server (keine Zugangsdaten in GitHub) oder per SSH aus GitHub Actions mit einem Schlüssel, der nur einen Image-Digest übergeben darf. In beiden Fällen prüft der Server die Cosign-Signatur, bevor er ein Image startet (siehe [Deployment](Deployment)).
- SSH-Zugangsdaten liegen im Environment `production` und sind nur für den Deploy-Job auf `main` verfügbar.

## Image prüfen

```sh
cosign verify ghcr.io/noahtrr/ev-dashboard:latest \
  --certificate-identity-regexp '^https://github.com/noahtrr/ev-dashboard/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/noahtrr/ev-dashboard:latest --repo noahtrr/ev-dashboard
```

## Sicherheitslücken melden

Bitte über [Private vulnerability reporting](https://github.com/noahtrr/ev-dashboard/security/advisories/new), nicht als öffentliches Issue.
