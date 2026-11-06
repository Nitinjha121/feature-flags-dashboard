import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, type Db } from './client';
import { seed } from './seed';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// Entrypoint for the one-shot `migrate` container: migrate, seed, exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await runMigrations(db);
    console.log('[migrate] migrations applied');
    const seeded = await seed(db);
    console.log(seeded ? '[migrate] seed data inserted' : '[migrate] data present, seed skipped');
  } finally {
    await pool.end();
  }
}
