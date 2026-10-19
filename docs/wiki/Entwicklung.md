# Entwicklung

## Voraussetzungen

Node 22 und pnpm 10 (`corepack enable`), optional Docker.

## Befehle

```sh
pnpm install
pnpm dev        # Entwicklungsserver
pnpm lint       # Prettier + ESLint
pnpm check      # svelte-check / TypeScript
pnpm test       # Vitest
pnpm build      # Produktions-Build
pnpm --filter @ev-dashboard/web db:generate   # neue Migration nach Schemaänderung
```

Der Dev-Server legt Datenbank und erzeugte Schlüssel in `apps/web/data/` ab (`DATA_DIR`).

Image lokal bauen und starten:

```sh
docker build -f docker/Dockerfile -t ev-dashboard:dev .
docker run --rm -p 8080:8080 -e APP_URL=http://localhost:8080 -e TLS_MODE=off ev-dashboard:dev
```

## Konventionen

- Änderungen nur per Pull Request; gemergt wird nach grünen Checks.
- Code, Kommentare und Commits auf Englisch. Wiki-Seiten auf Deutsch und Englisch (`-EN` bzw. englischer Titel), im selben PR wie der Code.
- Neue Umgebungsvariablen in `apps/web/src/env.ts` deklarieren, in `.env.example` und auf den Konfigurationsseiten dokumentieren.
- Keine Secrets und keine Herstellernamen in Produkttexten.
- GitHub Actions immer per vollständigem Commit-SHA pinnen.
