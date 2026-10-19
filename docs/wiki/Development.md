# Development

## Requirements

Node 24 and pnpm 10 (`corepack enable`), Docker optional.

## Commands

```sh
pnpm install
pnpm dev        # dev server
pnpm lint       # Prettier + ESLint
pnpm check      # svelte-check / TypeScript
pnpm test       # Vitest
pnpm build      # production build
pnpm --filter @ev-dashboard/web db:generate   # new migration after a schema change
```

The dev server stores its database and generated keys in `apps/web/data/` (`DATA_DIR`).

Build and run the image locally:

```sh
docker build -f docker/Dockerfile -t ev-dashboard:dev .
docker run --rm -p 8080:8080 -e APP_URL=http://localhost:8080 -e TLS_MODE=off ev-dashboard:dev
```

## Knowledge graph

`graphify-out/` holds a knowledge graph of the code and wiki, built with [graphify](https://github.com/safishamsi/graphify). Open `graphify-out/graph.html` in a browser or read `graphify-out/GRAPH_REPORT.md` for an overview of the main modules and how they connect. The graph is a snapshot; rebuild it after larger changes with `/graphify . --update` (graphify skill) or `graphify update`.

## Conventions

- Changes only through pull requests, merged after green checks.
- Code, comments and commits in English. Wiki pages in German and English, updated in the same PR as the code.
- Declare new environment variables in `apps/web/src/env.ts` and document them in `.env.example` and on the configuration pages.
- No secrets and no manufacturer names in product texts.
- Always pin GitHub Actions by full commit SHA.
