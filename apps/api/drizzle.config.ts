import { defineConfig } from 'drizzle-kit';

// Only used at development time to generate SQL migrations from src/db/schema.ts.
// Migrations are applied at runtime by src/db/migrate.ts (no drizzle-kit needed in the container).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
