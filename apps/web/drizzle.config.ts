import { defineConfig } from 'drizzle-kit';

// Only used by `pnpm db:generate`; migrations are applied by the app at startup.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './src/lib/server/db/migrations'
});
