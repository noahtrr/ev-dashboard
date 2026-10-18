# Conventions for AI assistants

- Changes go through pull requests only. Never push to `main`.
- Code, comments, commits and PR texts in English. The wiki in `docs/wiki/` has German pages and `-EN` English counterparts; keep both in sync.
- Do not use vehicle manufacturer names in product names, UI texts, README or wiki. Provider modules use neutral identifiers.
- Never commit secrets or third-party API collections.
- Stack: pnpm workspace, SvelteKit 3 (config in `vite.config.ts`), Svelte 5 runes, TypeScript. Environment variables are declared in `apps/web/src/env.ts` and read via `$app/env/private` / `$app/env/public`.
- Before opening a PR run `pnpm lint && pnpm check && pnpm test && pnpm build`.
- Pin every GitHub Action by full commit SHA with a version comment.
- Configuration is done exclusively through environment variables; document each one in `.env.example` and on the configuration wiki pages.
