# Graph Report - ev-dashboard  (2026-10-19)

## Corpus Check
- Corpus is ~35,262 words - fits in a single context window. You may not need a graph.

## Summary
- 642 nodes · 1241 edges · 38 communities (30 shown, 8 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.88)
- Token cost: 261,785 input · 0 output

## Community Hubs (Navigation)
- Server Hooks & App Bootstrap
- Web Package Tooling Config
- CI & Release Workflows
- Telemetry Normalization
- DB Schema & Provider Types
- Provider OAuth & HTTP Client
- Account Page UI
- Vehicle Service Core
- Provider API Endpoints
- Web Dependencies
- Auth Types & i18n
- Auth Panel Component
- Credential Encryption
- Top Bar & User Menu
- Container Architecture
- Wiki Navigation
- Renovate Config
- Server Route Tests
- Auth Configuration
- Vehicle Data Polling
- Root Workspace Package
- Vehicle Connect Actions
- Vehicle Service Tests
- Security & CI Docs
- Vehicle Detail Page
- Design Philosophy
- Signed Image Deployment
- TypeScript Config
- Health Endpoint
- VehicleProvider Interface
- Environment Variables
- Auth Client
- Simple Page View
- Prettier Config

## God Nodes (most connected - your core abstractions)
1. `createVehicleService()` - 30 edges
2. `normalizeTelemetry()` - 21 edges
3. `Architecture` - 21 edges
4. `Configuration` - 19 edges
5. `EV Dashboard Wiki Home` - 18 edges
6. `Wiki Sidebar` - 17 edges
7. `getApp()` - 16 edges
8. `vitest` - 15 edges
9. `createConnectQueryProvider()` - 13 edges
10. `Deployment (EN)` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Container smoke test (/api/health + HEALTHCHECK)` --semantically_similar_to--> `ev-dashboard compose service`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → compose.yaml
- `Container smoke test (/api/health + HEALTHCHECK)` --semantically_similar_to--> `ev-dashboard-update (pull, verify, pin digest, restart)`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → deploy/README.md
- `Local development (Node 22, pnpm 10, docker build)` --semantically_similar_to--> `Container smoke test (/api/health + HEALTHCHECK)`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → .github/workflows/ci.yml
- `CI dependency and config scan job (Trivy fs)` --implements--> `Hardened supply chain (Trivy, CodeQL, Gitleaks, Hadolint, Cosign, SBOM)`  [INFERRED]
  .github/workflows/ci.yml → SECURITY.md
- `CodeQL Workflow (security-extended, JS/TS + actions)` --implements--> `Pin GitHub Actions by full commit SHA`  [INFERRED]
  .github/workflows/codeql.yml → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Supply-chain security pipeline (scan, lint, sign, attest)** — _github_workflows_ci_image_job, _github_workflows_ci_dockerfile_job, _github_workflows_ci_dependencies_job, _github_workflows_ci_secrets_job, _github_workflows_codeql_codeql_workflow, _github_workflows_release_image_job, security_hardened_supply_chain [INFERRED 0.95]
- **Signed image deployment flow (release -> SSH deploy / timer -> verified update)** — _github_workflows_release_image_job, _github_workflows_release_deploy_job, deploy_readme_ev_dashboard_deploy, deploy_readme_update_timer, deploy_readme_ev_dashboard_update, compose_ev_dashboard_service [INFERRED 0.85]
- **Contribution rules enforced across PR template, CONTRIBUTING and CLAUDE.md** — _github_pull_request_template_pr_template, contributing_contributing_guide, claude_ai_assistant_conventions, claude_vendor_neutrality, claude_bilingual_wiki [INFERRED 0.85]
- **Container runtime stack (s6 supervises init-config, app, Caddy on Wolfi)** — docs_wiki_architecture_s6_overlay, docs_wiki_architecture_init_config, docs_wiki_architecture_sveltekit_app, docs_wiki_architecture_caddy, docs_wiki_architecture_wolfi_base, docs_wiki_architecture_non_root_container [EXTRACTED 1.00]
- **Signed image supply chain and deploy flow** — docs_wiki_security_and_ci_release_yml, docs_wiki_deployment_en_cosign_verification, docs_wiki_deployment_en_ssh_deploy, docs_wiki_deployment_en_ev_dashboard_deploy, docs_wiki_deployment_en_ev_dashboard_update, docs_wiki_deployment_en_digest_pinning, docs_wiki_architecture_api_health [EXTRACTED 1.00]
- **Vehicle data ingestion pipeline** — docs_wiki_architecture_connect_query, docs_wiki_architecture_vehicleprovider_interface, docs_wiki_architecture_poller, docs_wiki_vehicle_data_vehicle_connection, docs_wiki_vehicle_data_provider_endpoints, docs_wiki_vehicle_data_normalized_values, docs_wiki_architecture_snapshot_table [INFERRED 0.85]

## Communities (38 total, 8 thin omitted)

### Community 0 - "Server Hooks & App Bootstrap"
Cohesion: 0.07
Nodes (41): handle(), init(), PUBLIC_PATHS, pickLocale(), App, client(), create(), getApp() (+33 more)

### Community 1 - "Web Package Tooling Config"
Cohesion: 0.05
Nodes (40): gitignorePath, imports, #lib, name, private, scripts, build, check (+32 more)

### Community 2 - "CI & Release Workflows"
Cohesion: 0.09
Nodes (38): Pull Request Template, CI app job (lint, typecheck, test, build), CI Workflow, CI dependency and config scan job (Trivy fs), CI Dockerfile lint job (Hadolint), CI image build, Trivy scan and smoke test job, CI secret scan job (Gitleaks), Container smoke test (/api/health + HEALTHCHECK) (+30 more)

### Community 3 - "Telemetry Normalization"
Cohesion: 0.12
Nodes (37): allParts(), countAlerts(), distanceKm(), FALSE_WORDS, field(), Finder, first(), indexKeys() (+29 more)

### Community 4 - "DB Schema & Provider Types"
Cohesion: 0.09
Nodes (27): account, providerOAuthState, session, snapshot, vehicleConnection, verification, ProviderErrorCode, RawResponses (+19 more)

### Community 5 - "Provider OAuth & HTTP Client"
Cohesion: 0.13
Nodes (25): scopeFor(), ConnectQueryOptions, createConnectQueryProvider(), get(), token(), lifetimeSeconds(), parseTokenResponse(), setup() (+17 more)

### Community 6 - "Account Page UI"
Cohesion: 0.07
Nodes (19): addPasskey(), busyConnection, confirming, connectResult, copied, { data, form }, Errors, fetchResult (+11 more)

### Community 7 - "Vehicle Service Core"
Cohesion: 0.15
Nodes (27): now, vehicleLabel(), backoffMs(), clean(), createVehicleService(), changedRaw(), completeAuthorization(), consumeState() (+19 more)

### Community 8 - "Provider API Endpoints"
Cohesion: 0.12
Nodes (19): API_ORIGIN, AUTHORIZE_URL, AUTHORIZE_URL_B2C, DATA_ENDPOINTS, DEFAULT_ENDPOINTS, Endpoints, QUERY_BASE, TOKEN_URL (+11 more)

### Community 9 - "Web Dependencies"
Cohesion: 0.08
Nodes (24): devDependencies, better-auth, @better-auth/passkey, drizzle-kit, drizzle-orm, eslint, eslint-config-prettier, @eslint/js (+16 more)

### Community 10 - "Auth Types & i18n"
Cohesion: 0.15
Nodes (12): App, Locals, LoginMethods, safeRedirect(), de, en, Locale, messages (+4 more)

### Community 11 - "Auth Panel Component"
Cohesion: 0.13
Nodes (17): authErrorMessage(), busy, creating, email, error, hasAny, hasOther, intro (+9 more)

### Community 12 - "Credential Encryption"
Cohesion: 0.18
Nodes (14): decrypt(), deriveKey(), encrypt(), key, vehicleApiCredential, CredentialError, CredentialInput, getVehicleApiCredentials() (+6 more)

### Community 13 - "Top Bar & User Menu"
Cohesion: 0.16
Nodes (9): Props, { user, t }, busy, initial, Props, signOut(), { user, t }, { data } (+1 more)

### Community 14 - "Container Architecture"
Cohesion: 0.24
Nodes (15): Architecture, Caddy reverse proxy, DB schema & drizzle-kit migrations, Drizzle ORM (sqlite-proxy), init-config oneshot service, MapLibre + OpenStreetMap, SQLite via node:sqlite, s6-overlay supervision (+7 more)

### Community 15 - "Wiki Navigation"
Cohesion: 0.27
Nodes (13): Wiki Sidebar, Architektur, Deployment (DE), Design-Philosophie, Development, pnpm workflow (dev/lint/check/test/build), Entwicklung, Fahrzeugdaten (+5 more)

### Community 16 - "Renovate Config"
Cohesion: 0.14
Nodes (13): config:recommended, docker:pinDigests, helpers:pinGitHubActionDigests, :semanticCommitsDisabled, automerge, customManagers, extends, labels (+5 more)

### Community 17 - "Server Route Tests"
Cohesion: 0.14
Nodes (9): alice, Event, state, vehicles, connection, Event, fetchedAt, state (+1 more)

### Community 18 - "Auth Configuration"
Cohesion: 0.19
Nodes (13): Better Auth, Configuration, APP_URL, AUTH_ALLOW_SIGNUP / first-account-admin rule, AUTH_PASSKEY (passkeys), AUTH_SECRET, DATA_DIR / /data volume, .env / .env.example configuration (+5 more)

### Community 19 - "Vehicle Data Polling"
Cohesion: 0.21
Nodes (12): connect-query provider module, Background poller, VehicleProvider interface, ENCRYPTION_KEY, POLL_INTERVAL_SECONDS, Vehicle Data, Per-connection error backoff (up to 6h), Needs re-authorization state (+4 more)

### Community 20 - "Root Workspace Package"
Cohesion: 0.15
Nodes (12): engines, node, license, name, packageManager, private, scripts, build (+4 more)

### Community 21 - "Vehicle Connect Actions"
Cohesion: 0.20
Nodes (8): passkey, CONNECT_QUERY_ID, callbackPath(), DEFAULT_PROVIDER_ID, deleteVehicleApiCredentials(), validateCredentials(), actions, load

### Community 22 - "Vehicle Service Tests"
Cohesion: 0.20
Nodes (11): user, VehicleService, alice, bob, connectAlice(), Event, formRequest(), key (+3 more)

### Community 23 - "Security & CI Docs"
Cohesion: 0.24
Nodes (11): /api/health endpoint, Image tags (latest, SemVer, edge), Security and CI, ci.yml pull request checks, CodeQL static analysis, Gitleaks secret scan, Pipeline hardening, release.yml publishing pipeline (+3 more)

### Community 24 - "Vehicle Detail Page"
Cohesion: 0.22
Nodes (9): format(), d, { data }, dateTime(), localeTag, num(), rows, t (+1 more)

### Community 25 - "Design Philosophy"
Cohesion: 0.18
Nodes (4): UI module cards, Design Philosophy, Geist / Geist Mono typeface, Normalized telemetry values (metric)

### Community 26 - "Signed Image Deployment"
Cohesion: 0.36
Nodes (10): Non-root container (UID 10001, no capabilities), Deployment (EN), Cosign signature verification, Digest pinning in compose.override.yaml, ev-dashboard-deploy forced command, ev-dashboard-update script, GitHub production environment, SSH deploy from GitHub Actions (push) (+2 more)

### Community 27 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, strict, types, extends, include, $app/tsconfig

### Community 28 - "Health Endpoint"
Cohesion: 0.53
Nodes (3): getHealth(), Health, GET()

### Community 31 - "Auth Client"
Cohesion: 0.50
Nodes (3): authClient, better-auth, @better-auth/passkey

## Ambiguous Edges - Review These
- `Bilingual wiki (German + -EN pages kept in sync)` → `SvelteKit HTML shell (app.html)`  [AMBIGUOUS]
  apps/web/src/app.html · relation: conceptually_related_to
- `SvelteKit HTML shell (app.html)` → `robots.txt (allow all crawling)`  [AMBIGUOUS]
  apps/web/static/robots.txt · relation: conceptually_related_to

## Knowledge Gaps
- **22 isolated node(s):** `@sveltejs/vite-plugin-svelte`, `@types/node`, `prettier`, `prettier-plugin-svelte`, `svelte` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 261 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Provider API Endpoints` to `Server Hooks & App Bootstrap`, `Web Package Tooling Config`, `DB Schema & Provider Types`, `Auth Types & i18n`, `Credential Encryption`, `Server Route Tests`, `Vehicle Service Tests`, `Health Endpoint`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `createVehicleService()` (e.g. with `completeAuthorization()` and `disconnect()`) actually correct?**
  _`createVehicleService()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@sveltejs/vite-plugin-svelte`, `@types/node`, `prettier` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Hooks & App Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.06512890094979647 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Web Dependencies` to `Web Package Tooling Config`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Bilingual wiki (German + -EN pages kept in sync)` and `SvelteKit HTML shell (app.html)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `SvelteKit HTML shell (app.html)` and `robots.txt (allow all crawling)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._