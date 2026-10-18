# Contributing

Thanks for your interest. A few ground rules keep the project consistent.

## Workflow

- `main` is protected. Every change goes through a pull request and is merged only after all checks are green.
- Keep pull requests focused on one topic. Code, comments and commit messages are in English.
- Documentation lives in `docs/wiki/` and is published to the GitHub wiki on merge. Update it in the same pull request as the code it describes (German and English pages).
- Never commit secrets, credentials or `.env` files.
- The project is vendor-neutral: do not use vehicle manufacturer names or logos in product names, UI texts or the README.

## Local development

Requirements: Node 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev        # start the dev server
pnpm lint       # prettier + eslint
pnpm check      # svelte-check / TypeScript
pnpm test       # vitest
pnpm build      # production build
```

Build the image locally:

```sh
docker build -f docker/Dockerfile -t ev-dashboard:dev .
docker run --rm -p 8080:8080 -e APP_URL=http://localhost:8080 -e TLS_MODE=off ev-dashboard:dev
```
